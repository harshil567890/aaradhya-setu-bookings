import { sampleBookings } from './seed.js';

export async function ensureDatabase(db, { seed = false } = {}) {
  const bookings = db.collection('bookings');
  await bookings.createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { date: -1, id: -1 } },
    { key: { status: 1, date: -1, id: -1 } },
    { key: { puja: 1, date: -1, id: -1 } },
    { key: { amount: 1, id: 1 } },
    { key: { devotee: 1, id: 1 } },
  ]);

  if (seed) {
    // The unique equality key and insert-only fields let multiple instances seed
    // together and preserve decisions an administrator has already saved.
    const writes = sampleBookings().map(({ id, ...fields }) => ({
      updateOne: { filter: { id }, update: { $setOnInsert: fields }, upsert: true },
    }));
    await bookings.bulkWrite(writes, { ordered: false });
  }
}
