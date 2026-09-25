require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const todayRoutes = require('./routes/today');
const compatibilityRoutes = require('./routes/compat');
const supabaseData = require('./supabase');
const { notFound, errorHandler } = require('./middleware');

const app = express();
app.locals.supabaseConfigured = supabaseData.isSupabaseConfigured();
app.locals.supabaseClient = app.locals.supabaseConfigured
  ? supabaseData.getSupabaseClient()
  : null;

app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*' }));
app.use(express.json());

// Health check (para Render / monitores)
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use('/api', compatibilityRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/today', todayRoutes);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
