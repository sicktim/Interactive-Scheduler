import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * Schedule Event routes — serves the ScheduleEvent shape to the frontend.
 *
 * GET  /api/events?dates=2026-02-03,2026-02-04  → ScheduleEvent[]
 * GET  /api/events/:id                           → ScheduleEvent
 * POST /api/events                               → Create event
 * PUT  /api/events/:id                           → Update event
 * POST /api/events/:id/crew                      → Add crew member
 * DELETE /api/events/:id/crew/:personId           → Remove crew member
 */
export function registerEventRoutes(app: FastifyInstance, db: Database.Database) {

  // ── GET /api/events?dates=... ────────────────────────────
  // Returns events in the ScheduleEvent shape the frontend expects
  app.get<{ Querystring: { dates?: string; date?: string } }>(
    '/api/events',
    async (request, reply) => {
      const { dates, date } = request.query;
      const dateList = (dates || date || '').split(',').map(d => d.trim()).filter(Boolean);

      if (dateList.length === 0) {
        return reply.code(400).send({ error: true, message: 'Provide ?dates=YYYY-MM-DD,... or ?date=YYYY-MM-DD' });
      }

      const placeholders = dateList.map(() => '?').join(',');

      // Query scheduled events with crew
      const events = db.prepare(`
        SELECT
          se.id,
          se.section_id AS section,
          se.date,
          COALESCE(se.aircraft_type_id, tail_type.id) AS model,
          se.event_name AS eventName,
          se.start_time AS startTime,
          se.end_time AS endTime,
          se.etd,
          se.eta,
          se.notes,
          se.is_readonly AS readonly
        FROM scheduled_event se
        LEFT JOIN aircraft_tail tail ON se.aircraft_tail_id = tail.id
        LEFT JOIN aircraft_type tail_type ON tail.aircraft_type_id = tail_type.id
        WHERE se.date IN (${placeholders})
          AND se.status != 'archived'
        ORDER BY se.date, se.section_id, se.start_time
      `).all(...dateList) as Array<{
        id: string;
        section: string;
        date: string;
        model: string | null;
        eventName: string;
        startTime: string | null;
        endTime: string | null;
        etd: string | null;
        eta: string | null;
        notes: string | null;
        readonly: number;
      }>;

      // For each event, get crew
      const crewStmt = db.prepare(`
        SELECT p.display_name, ec.is_original
        FROM event_crew ec
        JOIN person p ON ec.person_id = p.id
        WHERE ec.event_id = ?
        ORDER BY ec.is_original DESC, ec.added_at ASC
      `);

      const result = events.map(ev => {
        const crew = crewStmt.all(ev.id) as Array<{ display_name: string; is_original: number }>;
        const personnel = crew.map(c => c.display_name);
        const originalPersonnel = crew.filter(c => c.is_original).map(c => c.display_name);

        return {
          id: ev.id,
          section: ev.section,
          date: ev.date,
          model: ev.model,
          eventName: ev.eventName,
          startTime: ev.startTime || '',
          endTime: ev.endTime,
          etd: ev.etd,
          eta: ev.eta,
          personnel,
          originalPersonnel,
          notes: ev.notes,
          readonly: Boolean(ev.readonly),
        };
      });

      return result;
    }
  );

  // ── GET /api/events/:id ──────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/events/:id',
    async (request, reply) => {
      const { id } = request.params;

      const ev = db.prepare(`
        SELECT
          se.id, se.section_id AS section, se.date,
          COALESCE(se.aircraft_type_id, tail_type.id) AS model,
          se.event_name AS eventName, se.start_time AS startTime,
          se.end_time AS endTime, se.etd, se.eta, se.notes,
          se.is_readonly AS readonly
        FROM scheduled_event se
        LEFT JOIN aircraft_tail tail ON se.aircraft_tail_id = tail.id
        LEFT JOIN aircraft_type tail_type ON tail.aircraft_type_id = tail_type.id
        WHERE se.id = ?
      `).get(id) as Record<string, unknown> | undefined;

      if (!ev) return reply.code(404).send({ error: true, message: 'Event not found' });

      const crew = db.prepare(`
        SELECT p.display_name, ec.is_original
        FROM event_crew ec JOIN person p ON ec.person_id = p.id
        WHERE ec.event_id = ?
        ORDER BY ec.is_original DESC, ec.added_at ASC
      `).all(id) as Array<{ display_name: string; is_original: number }>;

      return {
        ...ev,
        readonly: Boolean(ev.readonly),
        personnel: crew.map(c => c.display_name),
        originalPersonnel: crew.filter(c => c.is_original).map(c => c.display_name),
      };
    }
  );

  // ── POST /api/events ─────────────────────────────────────
  app.post<{
    Body: {
      section: string;
      date: string;
      eventName: string;
      startTime?: string;
      endTime?: string;
      etd?: string;
      eta?: string;
      aircraftTypeId?: string;
      aircraftTailId?: string;
      aircraftConfigId?: string;
      eventTemplateId?: string;
      classInstanceId?: string;
      notes?: string;
      personnel?: string[];  // Display names to look up
    };
  }>('/api/events', async (request, reply) => {
    const body = request.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO scheduled_event
        (id, section_id, date, event_name, start_time, end_time, etd, eta,
         aircraft_type_id, aircraft_tail_id, aircraft_config_id,
         event_template_id, class_instance_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, body.section, body.date, body.eventName,
      body.startTime || null, body.endTime || null,
      body.etd || null, body.eta || null,
      body.aircraftTypeId || null, body.aircraftTailId || null,
      body.aircraftConfigId || null, body.eventTemplateId || null,
      body.classInstanceId || null, body.notes || null,
    );

    // Add personnel if provided (look up by display_name)
    if (body.personnel && body.personnel.length > 0) {
      const findPerson = db.prepare('SELECT id FROM person WHERE display_name = ?');
      const insertCrew = db.prepare(
        'INSERT INTO event_crew (id, event_id, person_id, is_original) VALUES (?, ?, ?, TRUE)'
      );

      for (const name of body.personnel) {
        const person = findPerson.get(name) as { id: string } | undefined;
        if (person) {
          insertCrew.run(uuid(), id, person.id);
        }
      }
    }

    // Log creation
    db.prepare(`
      INSERT INTO event_change_log (id, event_id, change_type, new_value, changed_at)
      VALUES (?, ?, 'create', ?, datetime('now'))
    `).run(uuid(), id, JSON.stringify(body));

    return reply.code(201).send({ id });
  });

  // ── PUT /api/events/:id ──────────────────────────────────
  app.put<{
    Params: { id: string };
    Body: {
      startTime?: string;
      endTime?: string;
      etd?: string;
      eta?: string;
      eventName?: string;
      notes?: string;
      status?: string;
    };
  }>('/api/events/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body;

    // Get current values for audit log
    const current = db.prepare('SELECT * FROM scheduled_event WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!current) return reply.code(404).send({ error: true, message: 'Event not found' });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.startTime !== undefined) { updates.push('start_time = ?'); values.push(body.startTime); }
    if (body.endTime !== undefined)   { updates.push('end_time = ?');   values.push(body.endTime); }
    if (body.etd !== undefined)       { updates.push('etd = ?');        values.push(body.etd); }
    if (body.eta !== undefined)       { updates.push('eta = ?');        values.push(body.eta); }
    if (body.eventName !== undefined) { updates.push('event_name = ?'); values.push(body.eventName); }
    if (body.notes !== undefined)     { updates.push('notes = ?');      values.push(body.notes); }
    if (body.status !== undefined)    { updates.push('status = ?');     values.push(body.status); }

    if (updates.length === 0) {
      return reply.code(400).send({ error: true, message: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE scheduled_event SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Audit log
    db.prepare(`
      INSERT INTO event_change_log (id, event_id, change_type, old_value, new_value, changed_at)
      VALUES (?, ?, 'time_change', ?, ?, datetime('now'))
    `).run(uuid(), id, JSON.stringify(current), JSON.stringify(body));

    return { success: true };
  });

  // ── POST /api/events/:id/crew ────────────────────────────
  // Add a crew member by person display name or ID
  app.post<{
    Params: { id: string };
    Body: { personId?: string; personName?: string; roleId?: string };
  }>('/api/events/:id/crew', async (request, reply) => {
    const { id } = request.params;
    const { personId, personName, roleId } = request.body;

    // Find the person
    let resolvedPersonId = personId;
    if (!resolvedPersonId && personName) {
      const person = db.prepare('SELECT id FROM person WHERE display_name = ?').get(personName) as { id: string } | undefined;
      if (!person) return reply.code(404).send({ error: true, message: `Person not found: ${personName}` });
      resolvedPersonId = person.id;
    }

    if (!resolvedPersonId) {
      return reply.code(400).send({ error: true, message: 'Provide personId or personName' });
    }

    // Check event exists
    const ev = db.prepare('SELECT id FROM scheduled_event WHERE id = ?').get(id);
    if (!ev) return reply.code(404).send({ error: true, message: 'Event not found' });

    // Check not already assigned
    const existing = db.prepare(
      'SELECT id FROM event_crew WHERE event_id = ? AND person_id = ?'
    ).get(id, resolvedPersonId);
    if (existing) return reply.code(409).send({ error: true, message: 'Person already assigned' });

    const crewId = uuid();
    db.prepare(`
      INSERT INTO event_crew (id, event_id, person_id, crew_role_id, is_original)
      VALUES (?, ?, ?, ?, FALSE)
    `).run(crewId, id, resolvedPersonId, roleId || null);

    // Audit log
    db.prepare(`
      INSERT INTO event_change_log (id, event_id, change_type, person_id, new_value, changed_at)
      VALUES (?, ?, 'crew_add', ?, ?, datetime('now'))
    `).run(uuid(), id, resolvedPersonId, JSON.stringify({ roleId }));

    return reply.code(201).send({ id: crewId });
  });

  // ── DELETE /api/events/:id/crew/:personId ────────────────
  app.delete<{
    Params: { id: string; personId: string };
  }>('/api/events/:id/crew/:personId', async (request, reply) => {
    const { id, personId } = request.params;

    const crew = db.prepare(
      'SELECT id FROM event_crew WHERE event_id = ? AND person_id = ?'
    ).get(id, personId) as { id: string } | undefined;

    if (!crew) return reply.code(404).send({ error: true, message: 'Crew assignment not found' });

    db.prepare('DELETE FROM event_crew WHERE id = ?').run(crew.id);

    // Audit log
    db.prepare(`
      INSERT INTO event_change_log (id, event_id, change_type, person_id, changed_at)
      VALUES (?, ?, 'crew_remove', ?, datetime('now'))
    `).run(uuid(), id, personId);

    return { success: true };
  });
}
