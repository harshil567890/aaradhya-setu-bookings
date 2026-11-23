import express from 'express';
import helmet from 'helmet';
import { MongoClient } from 'mongodb';
import { ensureDatabase } from './database.js';
import { createBookingsRouter } from './bookings.js';
import { installSessions, prepareSessions } from './auth.js';

export function configuration({ localDemo = false } = {}) {
  const env = process.env;
  const name = env.ADMIN_NAME?.trim() || 'Booking Admin';
  const host = localDemo ? '127.0.0.1' : (env.HOST || '127.0.0.1');
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(host);
  const password = env.ADMIN_PASSWORD;
  const secret = localDemo ? 'local-fixture-workspace-only' : env.SESSION_SECRET;
  if (!localDemo && (!(password?.length >= 12) || !(secret?.length >= 32))) {
    throw new Error('Configure ADMIN_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters).');
  }
  const secure = !localDemo && env.COOKIE_SECURE !== 'false';
  if (!secure && (!loopback || env.VERCEL === '1')) throw new Error('HTTP cookies require a loopback listener.');
  const uri = localDemo ? 'mongodb://127.0.0.1:27017' : env.MONGODB_URI || env.MONGODB_URL;
  if (!uri) throw new Error('Configure MONGODB_URI for the application database.');
  const dbName = localDemo ? 'aaradhya_setu_local_demo' : env.MONGODB_DB || 'aaradhya_setu_bookings';
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  return { name, host, port, password, secret, uri, dbName, secure, localDemo,
    seed: localDemo || env.SEED_DEMO === 'true', reviewDemo: env.REVIEW_DEMO === 'true' };
}

export async function createApp(settings, { development = false } = {}) {
  const client = new MongoClient(settings.uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 6000 });
  try {
    await client.connect();
    const db = client.db(settings.dbName);
    await Promise.all([ensureDatabase(db, { seed: settings.seed }), prepareSessions(db)]);
    const app = express();
    app.disable('x-powered-by');
    app.use(helmet({
      contentSecurityPolicy: development ? false : { directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'], fontSrc: ["'self'"], connectSrc: ["'self'"],
        frameAncestors: ["'none'"], objectSrc: ["'none'"], upgradeInsecureRequests: settings.secure ? [] : null,
      } },
      strictTransportSecurity: settings.secure,
    }));
    app.use('/api', (req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      if (settings.localDemo && !['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) {
        return res.status(403).json({ error: 'The local demo is available on loopback only.' });
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.get('origin');
        const expected = process.env.PUBLIC_ORIGIN || ((settings.secure ? 'https://' : 'http://') + req.get('host'));
        if ((origin && origin !== expected) || req.get('sec-fetch-site') === 'cross-site') {
          return res.status(403).json({ error: 'Open the dashboard to make this change.' });
        }
        if (['POST', 'PATCH'].includes(req.method) && !req.is('application/json')) {
          return res.status(415).json({ error: 'Send an application/json request.' });
        }
      }
      next();
    });
    app.use('/api', express.json({ limit: '8kb' }));
    app.get('/api/health', async (_req, res) => {
      try { await db.command({ ping: 1 }); res.json({ status: 'ok' }); }
      catch { res.status(503).json({ status: 'unavailable' }); }
    });
    installSessions(app, db, settings);
    app.use('/api/bookings', createBookingsRouter(db));
    app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
    app.use((error, _req, res, next) => {
      if (res.headersSent) return next(error);
      if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
      if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
      console.error('Request failed', error.name, error.code || '');
      res.status(500).json({ error: 'Could not complete the request. Please try again.' });
    });
    return { app, client };
  } catch (error) {
    await client.close();
    throw error;
  }
}
