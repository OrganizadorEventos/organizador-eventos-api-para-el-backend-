const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-organizador-events';

const EXPIRES_IN = '7d';

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: EXPIRES_IN });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'auth_required', message: 'Debes iniciar sesión para continuar.' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = Number(payload.sub);
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_token', message: 'Tu sesión expiró. Volvé a iniciar sesión.' });
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFound(req, res) {
  res.status(404).json({ error: 'not_found', message: 'Recurso no encontrado.' });
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const message = err.expose !== false ? (err.message || 'Error interno del servidor.') : 'Error interno del servidor.';
  res.status(status).json({ error: err.code || 'error', message });
}

module.exports = { JWT_SECRET, signToken, requireAuth, asyncHandler, notFound, errorHandler };