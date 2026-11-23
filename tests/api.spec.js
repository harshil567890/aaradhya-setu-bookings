import { test, expect, signIn } from "./fixtures.js";

const statuses = ["Pending", "Confirmed", "In Progress", "Completed"];

test("admin routes require a session and logout revokes access", async ({ request, app }) => {
  expect((await request.get("/api/bookings")).status()).toBe(401);
  expect((await (await request.get("/api/session")).json()).authenticated).toBe(false);
  const invalid = await request.post("/api/session", { data: { password: "incorrect" } });
  expect(invalid.status()).toBe(401);
  await signIn(request, app);
  expect((await (await request.get("/api/session")).json()).authenticated).toBe(true);
  expect((await request.get("/api/bookings")).status()).toBe(200);
  expect((await request.delete("/api/session", { headers: { Origin: "https://other.example" } })).status()).toBe(403);
  expect((await request.get("/api/bookings")).status()).toBe(200);
  expect((await request.delete("/api/session", { headers: { Origin: app.url } })).ok()).toBe(true);
  expect((await request.get("/api/bookings")).status()).toBe(401);
});

test("two review sessions can edit independently without changing the administrator's bookings", async ({ app, request, playwright }) => {
  await signIn(request, app);
  const firstReviewer = await playwright.request.newContext({ baseURL: app.url });
  const secondReviewer = await playwright.request.newContext({ baseURL: app.url });
  try {
    for (const reviewer of [firstReviewer, secondReviewer]) {
      expect((await reviewer.post("/api/session", {
        data: { demo: true }, headers: { Origin: app.url },
      })).status()).toBe(200);
    }
    const sample = (await (await firstReviewer.get("/api/bookings")).json()).items[0];
    const path = "/api/bookings/" + sample.id;
    const secondBefore = await (await secondReviewer.get(path)).json();
    const adminBefore = await (await request.get(path)).json();
    const next = statuses.find(status => status !== sample.status);
    const result = await firstReviewer.patch(path, {
      data: { status: next, version: sample.version }, headers: { Origin: app.url },
    });
    expect(result.status()).toBe(200);
    const read = await (await firstReviewer.get(path)).json();
    expect(read).toMatchObject({ status: next, version: sample.version + 1 });
    const filtered = await (await firstReviewer.get("/api/bookings", { params: { q: sample.id, status: next } })).json();
    const { history, ...listItem } = read;
    expect(history).toEqual([{ from: sample.status, to: next, actor: "Demo reviewer", at: expect.any(String) }]);
    expect(filtered.items).toEqual([listItem]);
    expect(await (await secondReviewer.get(path)).json()).toEqual(secondBefore);
    expect(await (await request.get(path)).json()).toEqual(adminBefore);
  } finally {
    await Promise.all([firstReviewer.dispose(), secondReviewer.dispose()]);
  }
});

test("search, filters, sorting and pagination agree with the stored bookings", async ({ request, app }) => {
  await signIn(request, app);
  const list = async params => {
    const response = await request.get("/api/bookings", { params });
    expect(response.status()).toBe(200);
    return response.json();
  };
  const first = await list({ pageSize: 5, sort: "amount", order: "asc" });
  expect(first.items).toHaveLength(5);
  const { total, pending, confirmed, inProgress, completed } = first.summary;
  expect(total).toBe(first.total);
  expect(pending + confirmed + inProgress + completed).toBe(total);
  expect(Math.min(pending, confirmed, inProgress, completed)).toBeGreaterThan(0);
  const second = await list({ pageSize: 5, page: 2, sort: "amount", order: "asc" });
  const items = [...first.items, ...second.items];
  expect(new Set(items.map(item => item.id)).size).toBe(items.length);
  const amounts = items.map(item => item.amount);
  expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
  const descending = await list({ pageSize: 5, sort: "amount", order: "desc" });
  expect(descending.items[0].amount).toBeGreaterThan(first.items[0].amount);
  for (const key of ["date", "devotee", "id"]) {
    for (const order of ["asc", "desc"]) {
      const sorted = await list({ pageSize: 100, sort: key, order });
      const actual = sorted.items.map(item => item[key]);
      const expected = [...actual].sort();
      if (order === "desc") expected.reverse();
      expect(actual).toEqual(expected);
    }
  }
  const last = await list({ pageSize: 5, page: 999 });
  expect(last.page).toBe(Math.ceil(total / 5));

  const sample = first.items[0];
  for (const text of [sample.id, sample.devotee, sample.puja]) {
    const filtered = await list({ q: text.toLowerCase(), status: sample.status, puja: sample.puja });
    expect(filtered.items.length).toBeGreaterThan(0);
    expect(filtered.items.every(row => row.status === sample.status && row.puja === sample.puja)).toBe(true);
    expect(filtered.summary).toEqual(first.summary);
  }
  const missing = await list({ q: "unassigned-reference-00000" });
  expect(missing.items).toEqual([]);
  expect(missing.total).toBe(0);
  expect(first.pujas).toContain(sample.puja);
  for (const params of [{ sort: "email" }, { page: 0 }, { status: "Cancelled" }]) {
    expect((await request.get("/api/bookings", { params })).status()).toBe(400);
  }
  const detail = await request.get("/api/bookings/" + sample.id);
  expect(await detail.json()).toMatchObject({
    id: sample.id, devotee: sample.devotee, puja: sample.puja,
    date: sample.date, amount: sample.amount, status: sample.status,
  });
  expect((await request.get("/api/bookings/AS-9999")).status()).toBe(404);
});

test("all four statuses round-trip, invalid updates preserve the record, concurrent edits conflict", async ({ request, app }) => {
  await signIn(request, app);
  const { items } = await (await request.get("/api/bookings")).json();
  let booking = items[0];
  const path = "/api/bookings/" + booking.id;
  const patch = (status, version) => request.patch(path, {
    data: { status, version }, headers: { Origin: app.url },
  });
  const same = await patch(booking.status, booking.version);
  expect(await same.json()).toMatchObject({ status: booking.status, version: booking.version });
  expect((await patch("Cancelled", booking.version)).status()).toBe(400);
  expect((await patch("Pending", undefined)).status()).toBe(400);
  expect(await (await request.get(path)).json()).toMatchObject({ version: booking.version, status: booking.status });
  const sequence = [...statuses.filter(status => status !== booking.status), booking.status];
  for (const status of sequence) {
    const result = await patch(status, booking.version);
    expect(result.status()).toBe(200);
    const updated = await result.json();
    expect(updated).toMatchObject({ id: booking.id, status, version: booking.version + 1 });
    expect(await (await request.get(path)).json()).toMatchObject({ status, version: updated.version });
    booking = updated;
  }
  const candidates = statuses.filter(status => status !== booking.status).slice(0, 2);
  const writes = await Promise.all(candidates.map(status => patch(status, booking.version)));
  expect(writes.map(result => result.status()).sort()).toEqual([200, 409]);
  const winner = writes.findIndex(result => result.status() === 200);
  expect(await (await request.get(path)).json()).toMatchObject({
    status: candidates[winner], version: booking.version + 1,
  });
});

test("a saved status survives a fresh server process without reseeding the database", async ({ request, app }) => {
  await signIn(request, app);
  const before = await (await request.get("/api/bookings")).json();
  const sample = before.items[0];
  const status = statuses.find(value => value !== sample.status);
  const path = "/api/bookings/" + sample.id;
  const write = await request.patch(path, {
    data: { status, version: sample.version }, headers: { Origin: app.url },
  });
  expect(write.status()).toBe(200);
  await app.restart();
  await signIn(request, app);
  expect(await (await request.get(path)).json()).toMatchObject({
    id: sample.id, status, version: sample.version + 1,
  });
  expect((await (await request.get("/api/bookings")).json()).total).toBe(before.total);
});

test("booking intake validates data and safely replays concurrent submissions", async ({ request, app }) => {
  await signIn(request, app);
  const headers = { "Idempotency-Key": crypto.randomUUID() };
  const data = { devotee:"Booking Test", email:"booking@example.org", phone:"0000012345", puja:"Aarti",
    temple:"Test Mandir", date:"2030-02-28", time:"18:30", amount:100 };
  const post = value => request.post("/api/bookings", {headers, data:value});
  expect((await post({...data, date:"2030-02-31"})).status()).toBe(400);
  const responses = await Promise.all([post(data), post(data)]);
  expect(responses.map(r => r.status()).sort()).toEqual([200,201]);
  const [{id}, replay] = await Promise.all(responses.map(r => r.json()));
  expect(replay.id).toBe(id);
  expect((await post({...data, amount:200})).status()).toBe(409);
  expect(await (await request.get("/api/bookings/"+id)).json()).toMatchObject({...data, status:"Pending"});
});
