const express = require('express');
const eventRoutes = require('./events');
const authRoutes = require('./auth');
const todayRoutes = require('./today');
const { requireAuth } = require('../middleware');

const router = express.Router();

function pathWithQuery(req, pathname) {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  req.url = `${pathname}${query}`;
}

function remapJsonResponse(res, transform) {
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(transform(body));
}

// Adapt Spanish reference URLs to the existing event handlers and task model.
router.use('/eventos', (req, res, next) => {
  const pathname = req.path;
  let match;

  if (req.method === 'POST' && /^\/plan-inicial\/?$/.test(pathname)) {
    pathWithQuery(req, '/');
    return eventRoutes(req, res, next);
  }

  match = pathname.match(/^\/(\d+)\/progreso\/?$/);
  if (req.method === 'GET' && match) {
    remapJsonResponse(res, (body) => ({
      eventId: body?.event?.id,
      progress: body?.event?.progress,
      doneHours: body?.event?.doneHours,
      totalHours: body?.event?.totalHours,
    }));
    pathWithQuery(req, `/${match[1]}`);
    return eventRoutes(req, res, next);
  }

  match = pathname.match(/^\/(\d+)\/subtareas\/?$/);
  if (match && req.method === 'GET') {
    remapJsonResponse(res, (body) => ({
      eventId: body?.event?.id,
      subtareas: body?.event?.tasks || [],
    }));
    pathWithQuery(req, `/${match[1]}`);
    return eventRoutes(req, res, next);
  }
  if (match && req.method === 'POST') {
    pathWithQuery(req, `/${match[1]}/tasks`);
    return eventRoutes(req, res, next);
  }

  match = pathname.match(/^\/(\d+)\/subtareas\/(\d+)\/?$/);
  if (match && ['PATCH', 'DELETE'].includes(req.method)) {
    pathWithQuery(req, `/${match[1]}/tasks/${match[2]}`);
    return eventRoutes(req, res, next);
  }

  if (/^\/\d+\/?$/.test(pathname) && ['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    pathWithQuery(req, pathname.replace(/\/$/, ''));
    return eventRoutes(req, res, next);
  }

  return next();
});

// Short authentication URLs delegate to the existing registration and login routes.
router.use('/login', (req, res, next) => {
  if (req.method !== 'POST') return next();
  pathWithQuery(req, '/login');
  return authRoutes(req, res, next);
});
router.use('/registro', (req, res, next) => {
  if (req.method !== 'POST') return next();
  pathWithQuery(req, '/register');
  return authRoutes(req, res, next);
});

// User-scoped limit aliases reuse /api/auth/me and its existing validation/update logic.
router.all('/usuarios/:userId/limite', (req, res, next) => {
  if (!['GET', 'PUT'].includes(req.method)) return next();

  return requireAuth(req, res, (authError) => {
    if (authError) return next(authError);
    if (Number(req.params.userId) !== req.userId) {
      return res.status(404).json({ error: 'not_found', message: 'Usuario no encontrado.' });
    }

    if (req.method === 'PUT') req.method = 'PATCH';
    pathWithQuery(req, '/me');
    return authRoutes(req, res, next);
  });
});

// The reference calls this view "hoy"; its implementation remains the existing today router.
router.use('/hoy', (req, res, next) => {
  if (req.method !== 'GET') return next();
  pathWithQuery(req, '/');
  return todayRoutes(req, res, next);
});

module.exports = router;
