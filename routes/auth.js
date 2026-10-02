const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const {
  createUser,
  getUser,
  getUserByEmail,
  updateUserDailyHoursLimit,
  updateUserName,
  createPasswordResetToken,
  getActivePasswordResetToken,
  consumePasswordResetToken,
  updateUserPassword,
} = require('../supabase');
const { signToken, requireAuth, asyncHandler } = require('../middleware');

const router = express.Router();

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isDemo: u.is_demo,
    dailyHoursLimit: u.daily_hours_limit,
    createdAt: u.created_at,
  };
}

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { name = '', email = '', password = '' } = req.body || {};
  const nameT = String(name).trim();
  const emailT = String(email).trim().toLowerCase();
  if (nameT.length < 2) {
    return res.status(422).json({ error: 'validation', message: 'Ingresá un nombre de al menos 2 caracteres.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailT)) {
    return res.status(422).json({ error: 'validation', message: 'Ingresá un correo electrónico válido.' });
  }
  if (password.length < 6) {
    return res.status(422).json({ error: 'validation', message: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  if (await getUserByEmail(emailT)) {
    return res.status(409).json({ error: 'email_taken', message: 'Ya existe una cuenta con ese correo. Probá iniciar sesión.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const user = await createUser({ name: nameT, email: emailT, passwordHash: hash });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const user = await getUserByEmail(String(email).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(422).json({ error: 'validation', message: 'Ingresa un correo electrónico válido.' });
  }

  const user = await getUserByEmail(email);
  if (!user) return res.json({ message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.' });

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await createPasswordResetToken({ userId: user.id, tokenHash, expiresAt });
  const resetUrl = `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}/restablecer?token=${encodeURIComponent(token)}`;

  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [email],
        subject: 'Restablece tu contraseña de MIVO',
        html: `<p>Recibimos una solicitud para restablecer tu contraseña de MIVO.</p><p><a href="${resetUrl}">Crear una contraseña nueva</a></p><p>El enlace vence en 30 minutos. Si no solicitaste este cambio, ignora este correo.</p>`,
      }),
    });
    if (!response.ok) {
      const error = new Error('No pudimos enviar el correo en este momento. Inténtalo más tarde.');
      error.status = 502;
      throw error;
    }
    return res.json({ message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.' });
  }

  if (process.env.NODE_ENV !== 'production' && process.env.RESET_EMAIL_MODE !== 'disabled') {
    console.info(`[MIVO] Enlace local para restablecer contraseña: ${resetUrl}`);
    return res.json({
      message: 'En desarrollo, el enlace de restablecimiento aparece en la terminal del backend.',
      developmentResetUrl: resetUrl,
    });
  }

  const error = new Error('El envío de correo no está configurado en el servidor.');
  error.status = 503;
  throw error;
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (password.length < 6) {
    return res.status(422).json({ error: 'validation', message: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) {
    return res.status(422).json({ error: 'invalid_reset_token', message: 'El enlace no es válido o venció. Solicita otro.' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = await getActivePasswordResetToken(tokenHash);
  if (!reset) {
    return res.status(422).json({ error: 'invalid_reset_token', message: 'El enlace no es válido o venció. Solicita otro.' });
  }
  const consumed = await consumePasswordResetToken(tokenHash);
  if (!consumed) {
    return res.status(422).json({ error: 'invalid_reset_token', message: 'El enlace ya se usó o venció. Solicita otro.' });
  }
  await updateUserPassword(reset.user_id, bcrypt.hashSync(password, 10));
  res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
}));

// GET /api/auth/me
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.userId);
  if (!user) return res.status(401).json({ error: 'auth_required', message: 'Sesión no válida.' });
  res.json({ user: publicUser(user) });
}));

// PATCH /api/auth/me — actualizar límite diario por defecto (6h/día)
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const { dailyHoursLimit, name } = req.body || {};
  if (name !== undefined) {
    const cleanName = String(name).trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(422).json({ error: 'validation', message: 'El nombre debe tener entre 2 y 80 caracteres.' });
    }
    const user = await updateUserName(req.userId, cleanName);
    if (!user) return res.status(401).json({ error: 'auth_required', message: 'Sesión no válida.' });
    return res.json({ user: publicUser(user) });
  }
  const limit = Number(dailyHoursLimit);
  if (!Number.isFinite(limit) || limit <= 0 || limit > 24) {
    return res.status(422).json({ error: 'validation', message: 'El límite diario debe ser mayor a 0 y menor a 24 horas.' });
  }
  const user = await updateUserDailyHoursLimit(req.userId, limit);
  if (!user) return res.status(401).json({ error: 'auth_required', message: 'Sesi\u00f3n no v\u00e1lida.' });
  res.json({ user: publicUser(user) });
}));

module.exports = router;
