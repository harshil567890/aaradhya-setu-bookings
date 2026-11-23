import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { MongoClient } from "mongodb";
import { test as base, expect } from "@playwright/test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve, reject) => {
    socket.close(error => error ? reject(error) : resolve());
  });
  return port;
}

async function launchServer(env, url) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const capture = chunk => { output = (output + chunk.toString()).slice(-5000); };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const exit = new Promise(resolve => child.once("close", resolve));
  async function stop() {
    child.kill();
    await exit;
  }
  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && child.exitCode === null && !child.signalCode) {
      try {
        const response = await fetch(url + "/api/session", { signal: AbortSignal.timeout(1000) });
        if (response.ok) return stop;
      } catch {
        // The HTTP socket opens after MongoDB and the HTTP server are ready.
      }
      await delay(120);
    }
    throw new Error("Test app did not start. " + output);
  } catch (error) {
    await stop();
    throw error;
  }
}

export const test = base.extend({
  app: [async ({}, use) => {
    // Each worker owns its database. Restart tests reuse the database and port.
    const dbName = "puja_e2e_" + randomUUID().replaceAll("-", "");
    const uri = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017";
    const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
    const port = await freePort();
    const url = "http://127.0.0.1:" + port;
    const password = randomBytes(24).toString("hex");
    const env = {
      PORT: String(port),
      HOST: "127.0.0.1",
      PUBLIC_ORIGIN: url,
      VERCEL: "0",
      NODE_ENV: "production",
      MONGODB_URI: uri,
      MONGODB_DB: dbName,
      SEED_DEMO: "true",
      REVIEW_DEMO: "true",
      ADMIN_PASSWORD: password,
      ADMIN_NAME: "Test Administrator",
      SESSION_SECRET: randomBytes(40).toString("hex"),
      COOKIE_SECURE: "false",
    };
    await mongo.connect();
    let stop;
    try {
      stop = await launchServer(env, url);
      await use({
        url, password,
        async restart() {
          await stop();
          stop = await launchServer(env, url);
        },
      });
    } finally {
      try {
        if (stop) await stop();
        await mongo.db(dbName).dropDatabase();
      } finally {
        await mongo.close();
      }
    }
  }, { scope: "worker", timeout: 50_000 }],
  baseURL: async ({ app }, use) => use(app.url),
});

export { expect };

export async function signIn(request, app) {
  const result = await request.post("/api/session", {
    data: { password: app.password },
    headers: { Origin: app.url },
  });
  expect(result.ok()).toBeTruthy();
}
