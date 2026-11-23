import { configuration, createApp } from '../server/app.js';

let initialized;
export default async function handler(req, res) {
  try {
    // A warm function reuses its Express instance and MongoDB connection pool.
    initialized ??= createApp(configuration()).catch(error => {
      initialized = undefined;
      throw error;
    });
    const { app } = await initialized;
    return app(req, res);
  } catch (error) {
    console.error('Application initialization failed', error.name, error.code || '');
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'The dashboard is temporarily unavailable. Please try again.' });
  }
}
