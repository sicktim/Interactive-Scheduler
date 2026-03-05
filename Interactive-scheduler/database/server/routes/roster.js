// routes/roster.js - GET /api/roster
//
// Returns a GAS-compatible roster response:
//   { roster: { "FTC-A": ["Name1", ...], ... } }
//
// The app consumes this as: const loadedRoster = rosterJson.roster;
// Keyed by category name, values are arrays of display_name in sort_order.

import { query } from "../db.js";

export async function rosterRoutes(fastify) {
  fastify.get("/roster", async (request, reply) => {
    try {
      const result = await query(`
        SELECT rp.category_id, rp.display_name
        FROM roster_person rp
        WHERE rp.is_active = TRUE
        ORDER BY rp.category_id, rp.sort_order, rp.display_name
      `);

      const roster = {};
      for (const row of result.rows) {
        const cat = row.category_id;
        if (!roster[cat]) roster[cat] = [];
        roster[cat].push(row.display_name);
      }

      return reply.send({ roster });
    } catch (err) {
      return reply.status(500).send({
        error: true,
        message: "Failed to load roster: " + err.message,
      });
    }
  });
}
