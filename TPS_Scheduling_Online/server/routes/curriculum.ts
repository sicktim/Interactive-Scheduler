import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

/**
 * Curriculum routes — MCG (Master Curriculum Guide) management.
 *
 * GET    /api/curriculum                      → List all curriculum versions
 * GET    /api/curriculum/:id                  → Get curriculum with templates
 * POST   /api/curriculum                      → Create curriculum version
 * PUT    /api/curriculum/:id                  → Update curriculum version
 * POST   /api/curriculum/:id/clone            → Clone curriculum for new class
 *
 * GET    /api/curriculum/:id/templates        → List event templates
 * POST   /api/curriculum/:id/templates        → Add event template
 * PUT    /api/curriculum/templates/:id        → Update event template
 *
 * POST   /api/curriculum/templates/:id/prerequisite  → Add prerequisite link
 * DELETE /api/curriculum/prerequisites/:eventId/:reqId → Remove prerequisite
 *
 * GET    /api/classes                          → List class instances
 * POST   /api/classes                          → Create class instance
 * POST   /api/classes/:id/enroll               → Enroll student
 */
export function registerCurriculumRoutes(app: FastifyInstance, db: Database.Database) {

  // ── GET /api/curriculum ──────────────────────────────────
  app.get('/api/curriculum', async () => {
    const versions = db.prepare(`
      SELECT cv.*,
        (SELECT COUNT(*) FROM event_template et WHERE et.curriculum_id = cv.id) AS template_count,
        (SELECT COUNT(*) FROM class_instance ci WHERE ci.curriculum_id = cv.id) AS class_count
      FROM curriculum_version cv
      ORDER BY cv.effective_date DESC
    `).all();

    return { curricula: versions };
  });

  // ── GET /api/curriculum/:id ──────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/curriculum/:id',
    async (request, reply) => {
      const { id } = request.params;
      const cv = db.prepare('SELECT * FROM curriculum_version WHERE id = ?').get(id);
      if (!cv) return reply.code(404).send({ error: true, message: 'Curriculum not found' });

      const templates = db.prepare(`
        SELECT et.*,
          (SELECT COUNT(*) FROM event_prerequisite ep WHERE ep.event_template_id = et.id) AS prereq_count
        FROM event_template et
        WHERE et.curriculum_id = ?
        ORDER BY et.sort_order
      `).all(id);

      const classes = db.prepare(
        'SELECT * FROM class_instance WHERE curriculum_id = ? ORDER BY start_date'
      ).all(id);

      return { curriculum: cv, templates, classes };
    }
  );

  // ── POST /api/curriculum ─────────────────────────────────
  app.post<{
    Body: {
      name: string;
      courseType: string;
      versionCode: string;
      effectiveDate: string;
      description?: string;
    };
  }>('/api/curriculum', async (request, reply) => {
    const { name, courseType, versionCode, effectiveDate, description } = request.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO curriculum_version (id, name, course_type, version_code, effective_date, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, courseType, versionCode, effectiveDate, description || null);

    return reply.code(201).send({ id });
  });

  // ── PUT /api/curriculum/:id ──────────────────────────────
  app.put<{
    Params: { id: string };
    Body: { name?: string; description?: string; isActive?: boolean };
  }>('/api/curriculum/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, description, isActive } = request.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (isActive !== undefined) { updates.push('is_active = ?'); values.push(isActive); }

    if (updates.length === 0) {
      return reply.code(400).send({ error: true, message: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE curriculum_version SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return { success: true };
  });

  // ── POST /api/curriculum/:id/clone ───────────────────────
  // Clone a curriculum version (templates + prerequisites + requirements)
  app.post<{
    Params: { id: string };
    Body: { newVersionCode: string; newName: string };
  }>('/api/curriculum/:id/clone', async (request, reply) => {
    const { id } = request.params;
    const { newVersionCode, newName } = request.body;

    const source = db.prepare('SELECT * FROM curriculum_version WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!source) return reply.code(404).send({ error: true, message: 'Source curriculum not found' });

    const newId = uuid();

    const transaction = db.transaction(() => {
      // 1. Copy curriculum version
      db.prepare(`
        INSERT INTO curriculum_version (id, name, course_type, version_code, effective_date, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(newId, newName, source.course_type, newVersionCode, source.effective_date, source.description);

      // 2. Copy event templates — build old→new ID map
      const templates = db.prepare(
        'SELECT * FROM event_template WHERE curriculum_id = ?'
      ).all(id) as Array<Record<string, unknown>>;

      const templateIdMap = new Map<string, string>();
      for (const t of templates) {
        const newTemplateId = uuid();
        templateIdMap.set(t.id as string, newTemplateId);
        db.prepare(`
          INSERT INTO event_template
            (id, curriculum_id, event_name, section_id, default_duration_min, description, notes, sort_order, is_required)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newTemplateId, newId, t.event_name, t.section_id, t.default_duration_min,
          t.description, t.notes, t.sort_order, t.is_required,
        );
      }

      // 3. Copy prerequisites (remapped)
      const prereqs = db.prepare(`
        SELECT * FROM event_prerequisite
        WHERE event_template_id IN (SELECT id FROM event_template WHERE curriculum_id = ?)
      `).all(id) as Array<{ event_template_id: string; requires_template_id: string; notes: string | null }>;

      for (const p of prereqs) {
        const newEventId = templateIdMap.get(p.event_template_id);
        const newReqId = templateIdMap.get(p.requires_template_id);
        if (newEventId && newReqId) {
          db.prepare(`
            INSERT INTO event_prerequisite (event_template_id, requires_template_id, notes)
            VALUES (?, ?, ?)
          `).run(newEventId, newReqId, p.notes);
        }
      }

      // 4. Copy crew requirements (remapped)
      const crewReqs = db.prepare(`
        SELECT * FROM crew_requirement
        WHERE event_template_id IN (SELECT id FROM event_template WHERE curriculum_id = ?)
      `).all(id) as Array<Record<string, unknown>>;

      for (const cr of crewReqs) {
        const newTemplateId = templateIdMap.get(cr.event_template_id as string);
        if (newTemplateId) {
          db.prepare(`
            INSERT INTO crew_requirement (id, event_template_id, crew_role_id, min_count, max_count, is_mandatory, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(uuid(), newTemplateId, cr.crew_role_id, cr.min_count, cr.max_count, cr.is_mandatory, cr.notes);
        }
      }

      // 5. Copy aircraft requirements (remapped)
      const acftReqs = db.prepare(`
        SELECT * FROM aircraft_requirement
        WHERE event_template_id IN (SELECT id FROM event_template WHERE curriculum_id = ?)
      `).all(id) as Array<Record<string, unknown>>;

      for (const ar of acftReqs) {
        const newTemplateId = templateIdMap.get(ar.event_template_id as string);
        if (newTemplateId) {
          db.prepare(`
            INSERT INTO aircraft_requirement (id, event_template_id, aircraft_type_id, required_config_id, notes)
            VALUES (?, ?, ?, ?, ?)
          `).run(uuid(), newTemplateId, ar.aircraft_type_id, ar.required_config_id, ar.notes);
        }
      }
    });

    transaction();

    return reply.code(201).send({
      id: newId,
      templateCount: db.prepare('SELECT COUNT(*) AS c FROM event_template WHERE curriculum_id = ?').get(newId) as { c: number },
    });
  });

  // ── GET /api/curriculum/:id/templates ────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/curriculum/:id/templates',
    async (request) => {
      const { id } = request.params;
      const templates = db.prepare(`
        SELECT et.*,
          json_group_array(json_object(
            'requiresId', ep.requires_template_id,
            'requiresName', req.event_name
          )) AS prerequisites_json
        FROM event_template et
        LEFT JOIN event_prerequisite ep ON et.id = ep.event_template_id
        LEFT JOIN event_template req ON ep.requires_template_id = req.id
        WHERE et.curriculum_id = ?
        GROUP BY et.id
        ORDER BY et.sort_order
      `).all(id);

      return { templates };
    }
  );

  // ── POST /api/curriculum/:id/templates ───────────────────
  app.post<{
    Params: { id: string };
    Body: {
      eventName: string;
      sectionId: string;
      defaultDurationMin?: number;
      description?: string;
      notes?: string;
      sortOrder: number;
      isRequired?: boolean;
    };
  }>('/api/curriculum/:id/templates', async (request, reply) => {
    const { id: curriculumId } = request.params;
    const body = request.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO event_template
        (id, curriculum_id, event_name, section_id, default_duration_min, description, notes, sort_order, is_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, curriculumId, body.eventName, body.sectionId,
      body.defaultDurationMin || null, body.description || null,
      body.notes || null, body.sortOrder, body.isRequired !== false,
    );

    return reply.code(201).send({ id });
  });

  // ── POST /api/curriculum/templates/:id/prerequisite ──────
  app.post<{
    Params: { id: string };
    Body: { requiresTemplateId: string; notes?: string };
  }>('/api/curriculum/templates/:id/prerequisite', async (request, reply) => {
    const { id } = request.params;
    const { requiresTemplateId, notes } = request.body;

    db.prepare(`
      INSERT INTO event_prerequisite (event_template_id, requires_template_id, notes)
      VALUES (?, ?, ?)
    `).run(id, requiresTemplateId, notes || null);

    return reply.code(201).send({ success: true });
  });

  // ── DELETE /api/curriculum/prerequisites/:eventId/:reqId ──
  app.delete<{
    Params: { eventId: string; reqId: string };
  }>('/api/curriculum/prerequisites/:eventId/:reqId', async (request) => {
    const { eventId, reqId } = request.params;
    db.prepare(
      'DELETE FROM event_prerequisite WHERE event_template_id = ? AND requires_template_id = ?'
    ).run(eventId, reqId);
    return { success: true };
  });

  // ── GET /api/classes ─────────────────────────────────────
  app.get('/api/classes', async () => {
    const classes = db.prepare(`
      SELECT ci.*, cv.name AS curriculum_name, pc.display_name AS category_name,
        (SELECT COUNT(*) FROM student_enrollment se WHERE se.class_instance_id = ci.id AND se.status = 'active') AS enrolled_count
      FROM class_instance ci
      JOIN curriculum_version cv ON ci.curriculum_id = cv.id
      JOIN personnel_category pc ON ci.category_id = pc.id
      ORDER BY ci.start_date DESC
    `).all();

    return { classes };
  });

  // ── POST /api/classes ────────────────────────────────────
  app.post<{
    Body: {
      curriculumId: string;
      className: string;
      categoryId: string;
      startDate: string;
      endDate?: string;
      phase?: string;
      notes?: string;
    };
  }>('/api/classes', async (request, reply) => {
    const body = request.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO class_instance (id, curriculum_id, class_name, category_id, start_date, end_date, phase, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.curriculumId, body.className, body.categoryId, body.startDate,
      body.endDate || null, body.phase || null, body.notes || null);

    return reply.code(201).send({ id });
  });

  // ── POST /api/classes/:id/enroll ─────────────────────────
  app.post<{
    Params: { id: string };
    Body: { personId: string; enrolledDate?: string };
  }>('/api/classes/:id/enroll', async (request, reply) => {
    const { id: classId } = request.params;
    const { personId, enrolledDate } = request.body;
    const id = uuid();

    db.prepare(`
      INSERT INTO student_enrollment (id, class_instance_id, person_id, enrolled_date)
      VALUES (?, ?, ?, ?)
    `).run(id, classId, personId, enrolledDate || new Date().toISOString().split('T')[0]);

    return reply.code(201).send({ id });
  });
}
