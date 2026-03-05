// routes/health.js - GET /api/health
// Returns db connectivity status and event count.

import { query } from '../db.js';

export async function healthRoutes(fastify) {
  fastify.get('/health', async (request, reply) => {
    try {
      const result = await query(
        'SELECT COUNT(*) AS total FROM scheduled_event WHERE is_stale = FALSE'
      );
      const eventCount = parseInt(result.rows[0].total, 10);
      return reply.send({
        status: 'ok',
        db: 'connected',
        events: eventCount,
      });
    } catch (err) {
      return reply.status(503).send({
        status: 'error',
        db: 'disconnected',
        error: err.message,
      });
    }
  });
}
