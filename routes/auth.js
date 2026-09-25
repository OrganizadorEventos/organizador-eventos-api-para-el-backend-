const express = require('express');
const bcrypt = require('bcryptjs');
const {
  createUser,
  getUser,
  getUserByEmail,
  updateUserDailyHoursLimit,
  createSupabaseDemoData,
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

// POST /api/auth/demo — usuario demo para Sprint 0-1 (acelerar MVP). Queda disponible
// como atajo de pruebas; desde el Sprint 2 los datos siempre pertenecen al usuario logueado.
router.post('/demo', asyncHandler(async (req, res) => {
  const email = 'demo@organizador.app';
  let user = await getUserByEmail(email);
  if (!user) {
    try {
      user = await createUser({
        name: 'Usuario Demo',
        email,
        passwordHash: bcrypt.hashSync('demo123456', 10),
        isDemo: true,
      });
    } catch (error) {
      // A simultaneous first Demo request may have inserted the unique email already.
      if (error.code !== '23505') throw error;
      user = await getUserByEmail(email);
      if (!user) throw error;
    }
  }

  await createSupabaseDemoData(user.id);
  res.json({ token: signToken(user), user: publicUser(user) });
}));

// GET /api/auth/me
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUser(req.userId);
  if (!user) return res.status(401).json({ error: 'auth_required', message: 'Sesión no válida.' });
  res.json({ user: publicUser(user) });
}));

// PATCH /api/auth/me — actualizar límite diario por defecto (6h/día)
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const { dailyHoursLimit } = req.body || {};
  const limit = Number(dailyHoursLimit);
  if (!Number.isFinite(limit) || limit <= 0 || limit > 24) {
    return res.status(422).json({ error: 'validation', message: 'El límite diario debe ser mayor a 0 y menor a 24 horas.' });
  }
  const user = await updateUserDailyHoursLimit(req.userId, limit);
  if (!user) return res.status(401).json({ error: 'auth_required', message: 'Sesi\u00f3n no v\u00e1lida.' });
  res.json({ user: publicUser(user) });
}));

module.exports = router;
