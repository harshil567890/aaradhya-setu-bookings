import { createHash } from 'node:crypto';

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function createBooking(req, res, db) {
  const { bookings, scope } = res.locals;
  const body = req.body || {};
  const key = req.get('Idempotency-Key') || '';
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(key)) {
    return res.status(400).json({ error: 'A valid submission key is required.' });
  }
  const fields = {};
  for (const name of ['devotee', 'email', 'phone', 'puja', 'temple']) {
    const value = body[name];
    if (typeof value !== 'string' || !value.trim() || value.length > 120 || /\p{Cc}/u.test(value)) {
      return res.status(400).json({ error: 'Enter a valid ' + name + ' (up to 120 characters).' });
    }
    fields[name] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
      !/^\+?[\d ()-]+$/.test(fields.phone) || !/^\d{7,15}$/.test(fields.phone.replace(/\D/g, ''))) {
    return res.status(400).json({ error: 'Check the email address and phone number.' });
  }
  if (!validDate(body.date) || typeof body.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) {
    return res.status(400).json({ error: 'Enter a valid ceremony date and time.' });
  }
  if (!Number.isSafeInteger(body.amount) || body.amount < 0 || body.amount > 10000000) {
    return res.status(400).json({ error: 'Enter a whole rupee amount from 0 to 1,00,00,000.' });
  }
  Object.assign(fields, { date: body.date, time: body.time, amount: body.amount });
  const id = 'AS-' + createHash('sha256').update(key).digest('hex').slice(0, 16).toUpperCase();
  const identity = { ...scope, id };
  async function replay() {
    const existing = await bookings.findOne(identity);
    if (!existing) return false;
    if (Object.keys(fields).some(name => existing[name] !== fields[name])) {
      res.status(409).json({ error: 'This submission has already been used for another booking.' });
    } else res.json({ id });
    return true;
  }
  if (await replay()) return;
  if (scope.workspace) {
    // Reserve one of 20 distinct submission keys atomically. Retries reuse their reservation.
    const reservation = await db.collection('sessions').updateOne({
      _id: req.session._id,
      $or: [{ submissionKeys: key }, { 'submissionKeys.19': { $exists: false } }],
    }, { $addToSet: { submissionKeys: key } });
    if (!reservation.matchedCount) {
      return res.status(429).json({ error: 'This reviewer workspace has reached its booking limit.' });
    }
  }
  const booking = { ...identity, ...fields, status: 'Pending', version: 1 };
  if (scope.workspace) booking.expiresAt = req.session.expiresAt;
  try { await bookings.insertOne(booking); }
  catch (error) { if (error.code === 11000 && await replay()) return; throw error; }
  res.status(201).json({ id });
}
