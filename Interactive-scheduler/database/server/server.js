// server.js - TPS Local API Server
//
// Fastify application that serves GAS-compatible schedule data from PostgreSQL.
// Start with: node server.js  (or npm start)
// Dev mode:   node --watch server.js  (or npm run dev)
//
// Endpoints:
//   GET /api/health  - db connectivity check
//   GET /api/roster  - personnel roster { roster: { "FTC-A": [...], ... } }
//   GET /api/batch   - schedule batch { metadata: {...}, days: [...] }

import Fastify from "fastify";
import cors from "@fastify/cors";
import { close as closeDb } from "./db.js";
import { healthRoutes } from "./routes/health.js";
import { rosterRoutes } from "./routes/roster.js";
import { batchRoutes } from "./routes/batch.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

const fastify = Fastify({ logger: { level: "info" } });

// Enable CORS for all origins (local dev only)
await fastify.register(cors, { origin: true });

// Register all routes under /api prefix
await fastify.register(healthRoutes, { prefix: "/api" });
await fastify.register(rosterRoutes, { prefix: "/api" });
await fastify.register(batchRoutes,  { prefix: "/api" });

// Graceful shutdown
const shutdown = async (signal) => {
  fastify.log.info(`Received ${signal}, shutting down...`);
  await fastify.close();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start
try {
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`TPS Local API server running on http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
