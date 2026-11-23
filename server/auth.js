import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sampleBookings } from './seed.js';

const cookieName = 'puja_session';
const duration = 8 * 60 * 60 * 1000;
const attemptWindow = 15 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest();

export async function prepareSessions(db) {
  await Promise.all([
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('attempts').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('reviewBookings').createIndex({ workspace: 1, id: 1 }, { unique: true }),
    db.collection('reviewBookings').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export function installSessions(app, db, settings) {
  const sessions = db.collection('sessions');
  const digest = value => createHmac('sha256', settings.secret).update(value).digest('hex');
  const options = { httpOnly: true, secure: settings.secure, sameSite: 'strict', path: '/' };
  const sessionId = req => {
    const match = (req.headers.cookie || '').match(/(?:^|;\s*)puja_session=([a-f0-9]{64})(?:;|$)/);
    return match ? digest(match[1]) : null;
  };
  const details = session => ({
    authenticated: Boolean(session), user: session?.user ?? null,
    demoAvailable: settings.reviewDemo || settings.localDemo, localDemo: settings.localDemo,
  });

  app.use('/api', async (req, res, next) => {
    const id = sessionId(req);
    req.session = id ? await sessions.findOne({ _id: id, expiresAt: { $gt: new Date() } }) : null;
    next();
  });

  app.get('/api/session', (req, res) => res.json(details(req.session)));
  app.post('/api/session', async (req, res) => {
    const demo = req.body?.demo === true;
    if (demo && !settings.reviewDemo && !settings.localDemo) {
      return res.status(403).json({ error: 'Demo access is unavailable.' });
    }
    if (demo && req.session) return res.json(details(req.session));

    // Fixed windows live in MongoDB so separate app instances share one limit.
    const ip = (process.env.VERCEL === '1' && req.headers['x-vercel-forwarded-for']) || req.socket.remoteAddress || '';
    const window = Math.floor(Date.now() / attemptWindow);
    const bucket = digest(JSON.stringify([String(ip), demo ? 'demo' : 'signin', window]));
    const attempts = await db.collection('attempts').findOneAndUpdate({ _id: bucket }, {
      $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 2) * attemptWindow) },
    }, { upsert: true, returnDocument: 'after' });
    if (attempts.count > (demo ? 30 : 20)) {
      res.set('Retry-After', String(Math.ceil(((window + 1) * attemptWindow - Date.now()) / 1000)));
      return res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
    }
    if (!demo && (typeof req.body?.password !== 'string' || !settings.password ||
        !timingSafeEqual(hash(req.body.password), hash(settings.password)))) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + duration);
    const isolated = demo && !settings.localDemo;
    const session = {
      _id: digest(token), user: isolated ? 'Demo reviewer' : settings.name,
      workspace: isolated ? randomBytes(16).toString('hex') : null, expiresAt,
    };
    if (isolated) {
      const rows = sampleBookings().map(row => ({ ...row, workspace: session.workspace, expiresAt }));
      await db.collection('reviewBookings').insertMany(rows);
    }
    await sessions.insertOne(session);
    if (req.session) await sessions.deleteOne({ _id: req.session._id });
    res.cookie(cookieName, token, { ...options, maxAge: duration });
    res.json(details(session));
  });
  app.delete('/api/session', async (req, res) => {
    if (req.session) await sessions.deleteOne({ _id: req.session._id });
    res.clearCookie(cookieName, options).sendStatus(204);
  });
  app.use('/api/bookings', (req, res, next) => {
    if (!req.session) return res.status(401).json({ error: 'Sign in to view bookings.' });
    next();
  });
}
