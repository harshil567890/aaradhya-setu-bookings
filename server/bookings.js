import { Router } from 'express';

const statusKeys = new Map([
  ['Pending', 'pending'],
  ['Confirmed', 'confirmed'],
  ['In Progress', 'inProgress'],
  ['Completed', 'completed'],
]);
const sortFields = ['date', 'amount', 'devotee', 'id'];
const queryFields = ['q', 'status', 'puja', 'sort', 'order', 'page', 'pageSize'];
const projection = {
  _id: 0, id: 1, devotee: 1, email: 1, phone: 1, puja: 1, temple: 1,
  date: 1, time: 1, amount: 1, status: 1, version: 1,
};

class QueryError extends Error {}

function readPageNumber(value, fallback, maximum, name) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(number) || number > maximum) {
    throw new QueryError(`${name} must be a positive whole number up to ${maximum}.`);
  }
  return number;
}

function parseQuery(query) {
  for (const [key, value] of Object.entries(query)) {
    // Hosting rewrites can add route metadata alongside the public parameters.
    if (!queryFields.includes(key)) continue;
    if (typeof value !== 'string') {
      throw new QueryError('Each supported query parameter may appear once.');
    }
    if (value.length > 120 || /\p{Cc}/u.test(value)) {
      throw new QueryError('Query values must contain at most 120 printable characters.');
    }
  }
  const { sort = 'date', order = 'desc' } = query;
  if (!sortFields.includes(sort) || !['asc', 'desc'].includes(order)) {
    throw new QueryError('Specify a supported sort field and order.');
  }
  const filter = {};
  if (query.status) {
    if (!statusKeys.has(query.status)) throw new QueryError('Unknown booking status.');
    filter.status = query.status;
  }
  if (query.puja?.trim()) filter.puja = query.puja.trim();

  const search = query.q?.trim();
  if (search) {
    const literal = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = { $regex: literal, $options: 'i' };
    filter.$or = ['id', 'devotee', 'puja', 'temple', 'date', 'status'].map(field => ({ [field]: match }));
    const digits = search.replace(/^₹\s*/, '').replaceAll(',', '');
    if (/^\d+$/.test(digits) && Number.isSafeInteger(Number(digits))) {
      filter.$or.push({ amount: Number(digits) });
    }
  }
  const direction = order === 'asc' ? 1 : -1;
  return {
    filter,
    // A stable tie-break prevents equal prices or dates hopping between pages.
    sort: { [sort]: direction, id: direction },
    requestedPage: readPageNumber(query.page, 1, Number.MAX_SAFE_INTEGER, 'page'),
    pageSize: readPageNumber(query.pageSize, 8, 100, 'pageSize'),
  };
}

async function readOverview(bookings, scope) {
  const groups = await bookings.aggregate([
    { $match: scope },
    { $group: { _id: '$status', count: { $sum: 1 }, pujas: { $addToSet: '$puja' } } },
  ]).toArray();
  const summary = { total: 0, pending: 0, confirmed: 0, inProgress: 0, completed: 0 };
  const pujas = new Set();
  for (const group of groups) {
    summary.total += group.count;
    if (statusKeys.has(group._id)) summary[statusKeys.get(group._id)] = group.count;
    for (const puja of group.pujas) pujas.add(puja);
  }
  return { summary, pujas: [...pujas].sort((left, right) => left.localeCompare(right, 'en-IN')) };
}

export function createBookingsRouter(db) {
  const router = Router();
  router.use((req, res, next) => {
    const workspace = req.session.workspace;
    res.locals.bookings = db.collection(workspace ? 'reviewBookings' : 'bookings');
    res.locals.scope = workspace ? { workspace } : {};
    next();
  });
  router.get('/', async (req, res) => {
    let query;
    try {
      query = parseQuery(req.query);
    } catch (error) {
      if (error instanceof QueryError) return res.status(400).json({ error: error.message });
      throw error;
    }
    const { bookings, scope } = res.locals;
    const { sort, requestedPage, pageSize } = query;
    const filter = { ...query.filter, ...scope };
    const [total, overview] = await Promise.all([bookings.countDocuments(filter), readOverview(bookings, scope)]);
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const items = await bookings.find(filter, { projection })
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();
    res.json({ items, total, page, pageSize, ...overview });
  });

  const detailProjection = { ...projection, history: 1 };
  router.get('/:id', async (req, res) => {
    const { bookings, scope } = res.locals;
    const booking = await bookings.findOne({ ...scope, id: req.params.id }, { projection: detailProjection });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    res.json(booking);
  });

  router.patch('/:id', async (req, res) => {
    const { bookings, scope } = res.locals;
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => !['status', 'version'].includes(key))) {
      return res.status(400).json({ error: 'Send the booking status and its current version.' });
    }
    const { status, version } = body;
    if (!statusKeys.has(status)) return res.status(400).json({ error: 'Unknown booking status.' });
    if (!Number.isSafeInteger(version) || version < 1) {
      return res.status(400).json({ error: 'A positive booking version is required.' });
    }

    // Checking the displayed version in the write itself prevents lost updates.
    // Re-selecting the current status leaves the document version unchanged.
    const sameStatus = { $eq: ['$status', status] };
    const previousHistory = { $ifNull: ['$history', []] };
    const entry = { from: '$status', to: status, at: '$$NOW', actor: { $literal: req.session.user } };
    const updated = await bookings.findOneAndUpdate(
      { ...scope, id: req.params.id, version },
      [{ $set: {
        status,
        version: { $cond: [sameStatus, '$version', { $add: ['$version', 1] }] },
        history: { $cond: [sameStatus, previousHistory, { $slice: [{ $concatArrays: [previousHistory, [entry]] }, -20] }] },
      } }],
      { returnDocument: 'after', includeResultMetadata: false, projection: detailProjection },
    );
    if (updated) return res.json(updated);
    const exists = await bookings.findOne({ ...scope, id: req.params.id }, { projection: { _id: 1 } });
    if (!exists) return res.status(404).json({ error: 'Booking not found.' });
    return res.status(409).json({ error: 'This booking has changed. Refresh its details and try again.' });
  });
  return router;
}

