import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * Aircraft routes — manage types, tails, configurations.
 *
 * GET    /api/aircraft/types                      → List aircraft types
 * POST   /api/aircraft/types                      → Create aircraft type
 * PUT    /api/aircraft/types/:id                  → Update aircraft type
 *
 * GET    /api/aircraft/tails?typeId=...           → List tails (optionally by type)
 * POST   /api/aircraft/tails                      → Create tail
 * PUT    /api/aircraft/tails/:id                  → Update tail
 *
 * GET    /api/aircraft/configs?typeId=...         → List configs for a type
 * POST   /api/aircraft/configs                    → Create config
 * POST   /api/aircraft/configs/incompatibility    → Add incompatibility pair
 * DELETE /api/aircraft/configs/incompatibility    → Remove incompatibility pair
 */
export function registerAircraftRoutes(app: FastifyInstance, db: Database.Database) {

  // ── GET /api/aircraft/types ──────────────────────────────
  app.get('/api/aircraft/types', async () => {
    const types = db.prepare(`
      SELECT at2.*,
        (SELECT COUNT(*) FROM aircraft_tail tail WHERE tail.aircraft_type_id = at2.id AND tail.is_active = TRUE) AS tail_count,
        (SELECT COUNT(*) FROM aircraft_config ac WHERE ac.aircraft_type_id = at2.id) AS config_count
      FROM aircraft_type at2
      ORDER BY at2.display_name
    `).all();

    return { types };
  });

  // ── POST /api/aircraft/types ─────────────────────────────
  app.post<{
    Body: {
      id: string;
      displayName: string;
      defaultMaxSeats: number;
      notes?: string;
    };
  }>('/api/aircraft/types', async (request, reply) => {
    const { id, displayName, defaultMaxSeats, notes } = request.body;

    db.prepare(`
      INSERT INTO aircraft_type (id, display_name, default_max_seats, notes)
      VALUES (?, ?, ?, ?)
    `).run(id, displayName, defaultMaxSeats, notes || null);

    return reply.code(201).send({ id });
  });

  // ── PUT /api/aircraft/types/:id ──────────────────────────
  app.put<{
    Params: { id: string };
    Body: { displayName?: string; defaultMaxSeats?: number; notes?: string; isActive?: boolean };
  }>('/api/aircraft/types/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.displayName !== undefined) { updates.push('display_name = ?'); values.push(body.displayName); }
    if (body.defaultMaxSeats !== undefined) { updates.push('default_max_seats = ?'); values.push(body.defaultMaxSeats); }
    if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }
    if (body.isActive !== undefined) { updates.push('is_active = ?'); values.push(body.isActive); }

    if (updates.length === 0) {
      return reply.code(400).send({ error: true, message: 'No fields to update' });
    }
    values.push(id);

    db.prepare(`UPDATE aircraft_type SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  });

  // ── GET /api/aircraft/tails ──────────────────────────────
  app.get<{ Querystring: { typeId?: string } }>(
    '/api/aircraft/tails',
    async (request) => {
      const { typeId } = request.query;
      let query = `
        SELECT tail.*, at2.display_name AS type_name, at2.default_max_seats
        FROM aircraft_tail tail
        JOIN aircraft_type at2 ON tail.aircraft_type_id = at2.id
      `;
      const params: string[] = [];
      if (typeId) {
        query += ' WHERE tail.aircraft_type_id = ?';
        params.push(typeId);
      }
      query += ' ORDER BY tail.tail_number';

      const tails = db.prepare(query).all(...params);
      return { tails };
    }
  );

  // ── POST /api/aircraft/tails ─────────────────────────────
  app.post<{
    Body: {
      aircraftTypeId: string;
      tailNumber: string;
      maxSeats?: number;
      notes?: string;
    };
  }>('/api/aircraft/tails', async (request, reply) => {
    const { aircraftTypeId, tailNumber, maxSeats, notes } = request.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO aircraft_tail (id, aircraft_type_id, tail_number, max_seats, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, aircraftTypeId, tailNumber, maxSeats ?? null, notes || null);

    return reply.code(201).send({ id });
  });

  // ── PUT /api/aircraft/tails/:id ──────────────────────────
  app.put<{
    Params: { id: string };
    Body: { tailNumber?: string; maxSeats?: number; notes?: string; isActive?: boolean };
  }>('/api/aircraft/tails/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.tailNumber !== undefined) { updates.push('tail_number = ?'); values.push(body.tailNumber); }
    if (body.maxSeats !== undefined) { updates.push('max_seats = ?'); values.push(body.maxSeats); }
    if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }
    if (body.isActive !== undefined) { updates.push('is_active = ?'); values.push(body.isActive); }

    if (updates.length === 0) {
      return reply.code(400).send({ error: true, message: 'No fields to update' });
    }
    values.push(id);

    db.prepare(`UPDATE aircraft_tail SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  });

  // ── GET /api/aircraft/configs ────────────────────────────
  app.get<{ Querystring: { typeId?: string } }>(
    '/api/aircraft/configs',
    async (request) => {
      const { typeId } = request.query;
      let query = `
        SELECT ac.*, at2.display_name AS type_name
        FROM aircraft_config ac
        JOIN aircraft_type at2 ON ac.aircraft_type_id = at2.id
      `;
      const params: string[] = [];
      if (typeId) {
        query += ' WHERE ac.aircraft_type_id = ?';
        params.push(typeId);
      }
      query += ' ORDER BY ac.config_name';

      const configs = db.prepare(query).all(...params);

      // Also get incompatibilities
      const incompatibilities = db.prepare(`
        SELECT ci.*, a.config_name AS config_a_name, b.config_name AS config_b_name
        FROM config_incompatibility ci
        JOIN aircraft_config a ON ci.config_a_id = a.id
        JOIN aircraft_config b ON ci.config_b_id = b.id
        ${typeId ? 'WHERE a.aircraft_type_id = ?' : ''}
      `).all(...params);

      return { configs, incompatibilities };
    }
  );

  // ── POST /api/aircraft/configs ───────────────────────────
  app.post<{
    Body: {
      id: string;
      aircraftTypeId: string;
      configName: string;
      description?: string;
      reducesSeatsBy?: number;
    };
  }>('/api/aircraft/configs', async (request, reply) => {
    const { id, aircraftTypeId, configName, description, reducesSeatsBy } = request.body;

    db.prepare(`
      INSERT INTO aircraft_config (id, aircraft_type_id, config_name, description, reduces_seats_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, aircraftTypeId, configName, description || null, reducesSeatsBy ?? 0);

    return reply.code(201).send({ id });
  });

  // ── POST /api/aircraft/configs/incompatibility ───────────
  app.post<{
    Body: { configAId: string; configBId: string; reason?: string };
  }>('/api/aircraft/configs/incompatibility', async (request, reply) => {
    let { configAId, configBId, reason } = request.body;
    // Ensure alphabetical order for the CHECK constraint
    if (configAId > configBId) [configAId, configBId] = [configBId, configAId];

    db.prepare(`
      INSERT INTO config_incompatibility (config_a_id, config_b_id, reason)
      VALUES (?, ?, ?)
    `).run(configAId, configBId, reason || null);

    return reply.code(201).send({ success: true });
  });

  // ── DELETE /api/aircraft/configs/incompatibility ──────────
  app.delete<{
    Body: { configAId: string; configBId: string };
  }>('/api/aircraft/configs/incompatibility', async (request) => {
    let { configAId, configBId } = request.body;
    if (configAId > configBId) [configAId, configBId] = [configBId, configAId];

    db.prepare(
      'DELETE FROM config_incompatibility WHERE config_a_id = ? AND config_b_id = ?'
    ).run(configAId, configBId);

    return { success: true };
  });
}
