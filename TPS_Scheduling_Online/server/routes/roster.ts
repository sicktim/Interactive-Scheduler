import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

/**
 * Roster routes — serves the same shape as the GAS API.
 *
 * GET /api/roster → { roster: Record<string, string[]> }
 *
 * Groups active personnel by their category, matching the exact shape
 * that fetchRoster() returns from the Google Apps Script endpoint.
 */
export function registerRosterRoutes(app: FastifyInstance, db: Database.Database) {

  // ── GET /api/roster ──────────────────────────────────────
  app.get('/api/roster', async () => {
    const rows = db.prepare(`
      SELECT p.display_name, pc.id AS category_id, pc.sort_order
      FROM person p
      JOIN personnel_category pc ON p.category_id = pc.id
      WHERE p.is_active = TRUE
      ORDER BY pc.sort_order, p.display_name
    `).all() as Array<{ display_name: string; category_id: string; sort_order: number }>;

    // Group into { "FTC-A": ["Bertke, F", ...], "FTC-B": [...], ... }
    const roster: Record<string, string[]> = {};

    for (const row of rows) {
      if (!roster[row.category_id]) {
        roster[row.category_id] = [];
      }
      roster[row.category_id].push(row.display_name);
    }

    return { roster };
  });

  // ── GET /api/roster/categories ───────────────────────────
  // Returns category metadata (colors, staff/student flags)
  app.get('/api/roster/categories', async () => {
    const categories = db.prepare(`
      SELECT id, display_name, sort_order, is_staff, is_student, color_bg, color_text
      FROM personnel_category
      ORDER BY sort_order
    `).all();

    return { categories };
  });

  // ── GET /api/roster/person/:id ───────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/roster/person/:id',
    async (request, reply) => {
      const { id } = request.params;
      const person = db.prepare(`
        SELECT p.*, pc.display_name AS category_name, pc.color_bg, pc.color_text
        FROM person p
        JOIN personnel_category pc ON p.category_id = pc.id
        WHERE p.id = ?
      `).get(id);

      if (!person) return reply.code(404).send({ error: true, message: 'Person not found' });

      // Get qualifications
      const quals = db.prepare(
        'SELECT * FROM person_qualification WHERE person_id = ? AND is_current = TRUE'
      ).all(id);

      // Get non-availability
      const na = db.prepare(
        'SELECT * FROM non_availability WHERE person_id = ? AND end_date >= date("now") ORDER BY start_date'
      ).all(id);

      return { person, qualifications: quals, nonAvailability: na };
    }
  );

  // ── GET /api/roster/persons ──────────────────────────────
  // List all persons with category info (for admin table)
  app.get('/api/roster/persons', async () => {
    const persons = db.prepare(`
      SELECT p.*, pc.display_name AS category_name, pc.color_bg, pc.color_text
      FROM person p
      JOIN personnel_category pc ON p.category_id = pc.id
      ORDER BY pc.sort_order, p.display_name
    `).all();

    return { persons };
  });

  // ── POST /api/roster/person ────────────────────────────────
  // Create a new person
  app.post<{
    Body: { displayName: string; categoryId: string; email?: string; notes?: string };
  }>('/api/roster/person', async (request, reply) => {
    const { displayName, categoryId, email, notes } = request.body;

    if (!displayName || !categoryId) {
      return reply.code(400).send({ error: true, message: 'displayName and categoryId are required' });
    }

    // Verify category exists
    const category = db.prepare('SELECT id FROM personnel_category WHERE id = ?').get(categoryId);
    if (!category) {
      return reply.code(400).send({ error: true, message: `Invalid categoryId: ${categoryId}` });
    }

    const id = randomUUID();

    db.prepare(`
      INSERT INTO person (id, display_name, category_id, email, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, displayName, categoryId, email ?? null, notes ?? null);

    return reply.code(201).send({ id, success: true });
  });

  // ── PUT /api/roster/person/:id ─────────────────────────────
  // Update an existing person
  app.put<{
    Params: { id: string };
    Body: { displayName?: string; categoryId?: string; email?: string; notes?: string; isActive?: boolean };
  }>('/api/roster/person/:id', async (request, reply) => {
    const { id } = request.params;
    const { displayName, categoryId, email, notes, isActive } = request.body;

    // Verify person exists
    const existing = db.prepare('SELECT id FROM person WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send({ error: true, message: 'Person not found' });
    }

    // If categoryId provided, verify it exists
    if (categoryId !== undefined) {
      const category = db.prepare('SELECT id FROM personnel_category WHERE id = ?').get(categoryId);
      if (!category) {
        return reply.code(400).send({ error: true, message: `Invalid categoryId: ${categoryId}` });
      }
    }

    // Build dynamic UPDATE from provided fields
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (displayName !== undefined) {
      setClauses.push('display_name = ?');
      values.push(displayName);
    }
    if (categoryId !== undefined) {
      setClauses.push('category_id = ?');
      values.push(categoryId);
    }
    if (email !== undefined) {
      setClauses.push('email = ?');
      values.push(email);
    }
    if (notes !== undefined) {
      setClauses.push('notes = ?');
      values.push(notes);
    }
    if (isActive !== undefined) {
      setClauses.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }

    if (setClauses.length === 0) {
      return reply.code(400).send({ error: true, message: 'No fields to update' });
    }

    setClauses.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`
      UPDATE person SET ${setClauses.join(', ')} WHERE id = ?
    `).run(...values);

    return { success: true };
  });
}
