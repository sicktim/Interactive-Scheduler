import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDb, closeDb } from './db/connection.js';
import { registerEventRoutes } from './routes/events.js';
import { registerRosterRoutes } from './routes/roster.js';
import { registerCurriculumRoutes } from './routes/curriculum.js';
import { registerAircraftRoutes } from './routes/aircraft.js';
import { registerPrerequisiteRoutes } from './routes/prerequisites.js';

const PORT = 3001;

async function main() {
  // Initialize database (creates schema + seed on first run)
  const db = initDb();

  const app = Fastify({ logger: true });

  // CORS — allow Vite dev server on port 5173
  await app.register(cors, {
    origin: ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // Register route modules
  registerEventRoutes(app, db);
  registerRosterRoutes(app, db);
  registerCurriculumRoutes(app, db);
  registerAircraftRoutes(app, db);
  registerPrerequisiteRoutes(app, db);

  // Health check
  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'sqlite',
  }));

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[server] Shutting down...');
    closeDb();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start server
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[server] TPS Schedule API running on http://localhost:${PORT}`);
    console.log(`[server] Health check: http://localhost:${PORT}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
