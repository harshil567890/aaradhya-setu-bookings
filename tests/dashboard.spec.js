import { test, expect, signIn } from "./fixtures.js";

const rowButtons = page => page.getByRole("button", { name: /^View booking / });
const search = page => page.getByRole("searchbox", { name: "Search bookings" });
const drawer = page => page.getByRole("dialog", { name: "Booking details" });

test.afterEach(async ({ page }) => {
  const uncaughtErrors = (await page.pageErrors()).map(error => error.message);
  expect(uncaughtErrors).toEqual([]);
});

async function openDashboard(page, app) {
  await signIn(page.request, app);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Puja bookings", exact: true })).toBeVisible();
  await expect(rowButtons(page).first()).toBeVisible();
}

async function expectVisibleIds(page, items) {
  await expect.poll(() => rowButtons(page).evaluateAll(nodes =>
    nodes.filter(node => node.getClientRects().length > 0).map(node => node.getAttribute("aria-label"))
  )).toEqual(items.map(item => "View booking " + item.id));
}

test("admin signs in, inspects a booking using the keyboard, and signs out", async ({ page, app }) => {
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill(app.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const first = rowButtons(page).first();
  await expect(first).toBeVisible();
  const sample = (await (await page.request.get("/api/bookings")).json()).items[0];
  const register = page.getByRole("table");
  for (const heading of ["Booking ID", "Devotee", "Puja", "Date", "Amount", "Status"]) {
    await expect(register.getByRole("columnheader", { name: heading, exact: true })).toBeVisible();
  }
  const row = register.getByRole("row").filter({ has: page.getByRole("button", { name: "View booking " + sample.id }) });
  for (const value of [sample.id, sample.devotee, sample.puja, sample.status]) {
    await expect(row.getByText(value, { exact: true })).toBeVisible();
  }
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  await expect(row.getByText(amount.format(sample.amount), { exact: true })).toBeVisible();
  await expect(row.getByText(date.format(new Date(sample.date)), { exact: true })).toBeVisible();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText(sample.email, { exact: true })).toBeVisible();
  await expect(drawer(page).getByText(sample.temple, { exact: true })).toBeVisible();
  await expect(drawer(page).getByRole("combobox", { name: "Booking status" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await expect(first).toBeFocused();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("search by booking ID, recover from an empty result and browse pages", async ({ page, app }) => {
  await openDashboard(page, app);
  const firstPage = await (await page.request.get("/api/bookings")).json();
  const sample = firstPage.items[0];
  await search(page).fill(sample.id.toLowerCase());
  await expectVisibleIds(page, [sample]);
  await search(page).fill("no-matching-00000");
  await expect(page.getByText("No bookings found", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expectVisibleIds(page, firstPage.items);
  await page.getByRole("button", { name: "Next page" }).click();
  const second = await (await page.request.get("/api/bookings?page=2")).json();
  await expectVisibleIds(page, second.items);
  await page.getByRole("button", { name: "Previous page" }).click();
  await expectVisibleIds(page, firstPage.items);
});

test("combined status and puja filters and amount sorting match the API", async ({ page, app }) => {
  await openDashboard(page, app);
  const firstPage = await (await page.request.get("/api/bookings")).json();
  const sample = firstPage.items[0];
  await page.getByRole("button", { name: "Sort", exact: true }).click();
  await page.getByRole("combobox", { name: "Sort bookings" }).selectOption("amount:desc");
  const sorted = await (await page.request.get("/api/bookings?sort=amount&order=desc")).json();
  await expectVisibleIds(page, sorted.items);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter by status" }).selectOption({ label: sample.status });
  await page.getByRole("combobox", { name: "Filter by puja" }).selectOption({ label: sample.puja });
  const matched = await (await page.request.get("/api/bookings", {
    params: { status: sample.status, puja: sample.puja, sort: "amount", order: "desc" },
  })).json();
  await expectVisibleIds(page, matched.items);
});

test("mobile admin changes a status and reads the saved result after reloading", async ({ page, app }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, app);
  const sample = (await (await page.request.get("/api/bookings")).json()).items[0];
  const button = page.getByRole("button", { name: "View booking " + sample.id, exact: true });
  await button.click();
  const select = drawer(page).getByRole("combobox", { name: "Booking status" });
  await expect(select).toHaveValue(sample.status);
  const status = sample.status === "Completed" ? "In Progress" : "Completed";
  await select.selectOption({ label: status });
  await drawer(page).getByRole("button", { name: "Save changes" }).click();
  await expect.poll(async () => {
    const detail = await page.request.get("/api/bookings/" + sample.id);
    return (await detail.json()).status;
  }).toBe(status);
  await page.reload();
  await button.click();
  await expect(select).toHaveValue(status);
  await drawer(page).getByRole("button", { name: "Close details" }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )).toBe(true);
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("a failed list request can be retried from the dashboard", async ({ page, app }) => {
  await signIn(page.request, app);
  await page.route(url => url.pathname === "/api/bookings", route => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "Service unavailable" }),
  }), { times: 1 });
  await page.goto("/");
  const retry = page.getByRole("button", { name: /retry|try again/i });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(rowButtons(page).first()).toBeVisible();
});

test("another administrator's save is shown before a stale editor can retry", async ({ page, app }) => {
  await openDashboard(page, app);
  const sample = (await (await page.request.get("/api/bookings")).json()).items[0];
  const [otherStatus, myStatus] = ["Pending", "Confirmed", "In Progress", "Completed"].filter(status => status !== sample.status);
  await page.getByRole("button", { name: "View booking " + sample.id }).click();
  const select = drawer(page).getByRole("combobox", { name: "Booking status" });
  await expect(select).toHaveValue(sample.status);
  const path = "/api/bookings/" + sample.id;
  const otherUpdate = await page.request.patch(path, {
    data: { status: otherStatus, version: sample.version }, headers: { Origin: app.url },
  });
  expect(otherUpdate.status()).toBe(200);
  await select.selectOption({ label: myStatus });
  const save = drawer(page).getByRole("button", { name: "Save changes" });
  await save.click();
  await expect(drawer(page).getByRole("alert")).toBeVisible();
  await expect(select).toHaveValue(otherStatus);
  await expect(save).toBeDisabled();
  await select.selectOption({ label: myStatus });
  await save.click();
  await expect(drawer(page).getByText("Status updated.", { exact: true })).toBeVisible();
  expect(await (await page.request.get(path)).json()).toMatchObject({ status: myStatus, version: sample.version + 2 });
});

test("an expired dashboard session returns the admin to sign-in", async ({ page, app }) => {
  await openDashboard(page, app);
  expect((await page.request.delete("/api/session", { headers: { Origin: app.url } })).ok()).toBe(true);
  await rowButtons(page).first().click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("a reviewer link opens a working dashboard and keeps the reviewer's changes on reload", async ({ page }) => {
  await page.goto("/?demo=1");
  await expect(rowButtons(page).first()).toBeVisible();
  const sample = (await (await page.request.get("/api/bookings")).json()).items[0];
  const button = page.getByRole("button", { name: "View booking " + sample.id });
  await button.click();
  const select = drawer(page).getByRole("combobox", { name: "Booking status" });
  const next = sample.status === "Pending" ? "Confirmed" : "Pending";
  await select.selectOption({ label: next });
  await drawer(page).getByRole("button", { name: "Save changes" }).click();
  await expect(drawer(page).getByText("Status updated.", { exact: true })).toBeVisible();
  await page.reload();
  await button.click();
  await expect(select).toHaveValue(next);
  await expect(drawer(page).getByText(sample.status + " → " + next)).toBeVisible();
  await expect(drawer(page).getByText(/Demo reviewer ·/)).toBeVisible();
});
