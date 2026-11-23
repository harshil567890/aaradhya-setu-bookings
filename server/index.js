import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import express from 'express';
import { configuration, createApp } from './app.js';

async function start() {
  const settings = configuration({ localDemo: process.argv.includes('--demo') });
  const development = process.argv.includes('--dev');
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  if (!development) await access(resolve(dist, 'index.html'));
  const { app, client } = await createApp(settings, { development });
  let vite;
  if (development) {
    const { createServer } = await import('vite');
    vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use('/assets', express.static(resolve(dist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(dist, { maxAge: 0 }));
    app.get('/', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  const server = app.listen(settings.port, settings.host, () =>
    console.log('Booking dashboard listening at http://' + settings.host + ':' + settings.port));
  const close = async () => {
    await new Promise(resolve => server.close(resolve));
    await vite?.close();
    await client.close();
  };
  server.on('error', async error => {
    console.error('HTTP server failed', error.code || error.name);
    await vite?.close();
    await client.close();
    process.exitCode = 1;
  });
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}

start().catch(error => {
  const message = error.name.startsWith('Mongo') ? 'MongoDB connection or setup failed. Check your URI and database access.' : error.message;
  console.error(message);
  process.exitCode = 1;
});
