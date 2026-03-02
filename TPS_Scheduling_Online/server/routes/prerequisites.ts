import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

/**
 * Prerequisite checking routes.
 *
 * GET /api/prerequisites/check?enrollmentId=...&templateId=...
 *   → Check if a student can be scheduled for an event
 *   → Returns { eligible: boolean, missing: [...] }
 *
 * GET /api/prerequisites/chain?templateId=...
 *   → Get the full prerequisite chain for an event template
 *
 * GET /api/prerequisites/progress?enrollmentId=...
 *   → Get a student's completion progress through their curriculum
 */
export function registerPrerequisiteRoutes(app: FastifyInstance, db: Database.Database) {

  // ── GET /api/prerequisites/check ─────────────────────────
  // Check if a student can be scheduled for a specific event template
  app.get<{
    Querystring: { enrollmentId: string; templateId: string };
  }>('/api/prerequisites/check', async (request, reply) => {
    const { enrollmentId, templateId } = request.query;

    if (!enrollmentId || !templateId) {
      return reply.code(400).send({ error: true, message: 'Provide enrollmentId and templateId' });
    }

    // Find prerequisites NOT yet completed by this student
    const missing = db.prepare(`
      SELECT et.event_name AS missing_prerequisite, et.id AS template_id
      FROM event_prerequisite ep
      JOIN event_template et ON ep.requires_template_id = et.id
      WHERE ep.event_template_id = ?
        AND ep.requires_template_id NOT IN (
            SELECT sc.event_template_id
            FROM student_completion sc
            WHERE sc.enrollment_id = ?
              AND sc.grade IN ('Pass', 'Waived')
        )
    `).all(templateId, enrollmentId) as Array<{ missing_prerequisite: string; template_id: string }>;

    return {
      eligible: missing.length === 0,
      missing,
      enrollmentId,
      templateId,
    };
  });

  // ── GET /api/prerequisites/chain ─────────────────────────
  // Get the full prerequisite chain (DAG) for an event template
  app.get<{
    Querystring: { templateId: string };
  }>('/api/prerequisites/chain', async (request, reply) => {
    const { templateId } = request.query;

    if (!templateId) {
      return reply.code(400).send({ error: true, message: 'Provide templateId' });
    }

    // Recursive CTE to walk the prerequisite chain
    const chain = db.prepare(`
      WITH RECURSIVE prereq_chain AS (
        -- Base: direct prerequisites
        SELECT
          ep.event_template_id,
          ep.requires_template_id,
          et.event_name AS requires_name,
          1 AS depth
        FROM event_prerequisite ep
        JOIN event_template et ON ep.requires_template_id = et.id
        WHERE ep.event_template_id = ?

        UNION ALL

        -- Recursive: prerequisites of prerequisites
        SELECT
          ep2.event_template_id,
          ep2.requires_template_id,
          et2.event_name AS requires_name,
          pc.depth + 1
        FROM prereq_chain pc
        JOIN event_prerequisite ep2 ON ep2.event_template_id = pc.requires_template_id
        JOIN event_template et2 ON ep2.requires_template_id = et2.id
        WHERE pc.depth < 20
      )
      SELECT DISTINCT requires_template_id AS id, requires_name AS name, MIN(depth) AS depth
      FROM prereq_chain
      GROUP BY requires_template_id
      ORDER BY depth, requires_name
    `).all(templateId);

    return { templateId, chain };
  });

  // ── GET /api/prerequisites/progress ──────────────────────
  // Get a student's completion progress through their curriculum
  app.get<{
    Querystring: { enrollmentId: string };
  }>('/api/prerequisites/progress', async (request, reply) => {
    const { enrollmentId } = request.query;

    if (!enrollmentId) {
      return reply.code(400).send({ error: true, message: 'Provide enrollmentId' });
    }

    // Get enrollment info
    const enrollment = db.prepare(`
      SELECT se.*, ci.class_name, ci.curriculum_id, p.display_name AS student_name
      FROM student_enrollment se
      JOIN class_instance ci ON se.class_instance_id = ci.id
      JOIN person p ON se.person_id = p.id
      WHERE se.id = ?
    `).get(enrollmentId) as Record<string, unknown> | undefined;

    if (!enrollment) {
      return reply.code(404).send({ error: true, message: 'Enrollment not found' });
    }

    // Get all required templates in the curriculum
    const templates = db.prepare(`
      SELECT et.id, et.event_name, et.sort_order, et.is_required, et.section_id
      FROM event_template et
      WHERE et.curriculum_id = ?
      ORDER BY et.sort_order
    `).all(enrollment.curriculum_id as string) as Array<{
      id: string;
      event_name: string;
      sort_order: number;
      is_required: number;
      section_id: string;
    }>;

    // Get completed events
    const completions = db.prepare(`
      SELECT sc.event_template_id, sc.completed_date, sc.grade
      FROM student_completion sc
      WHERE sc.enrollment_id = ?
    `).all(enrollmentId) as Array<{
      event_template_id: string;
      completed_date: string;
      grade: string;
    }>;

    const completionMap = new Map(completions.map(c => [c.event_template_id, c]));

    const progress = templates.map(t => ({
      templateId: t.id,
      eventName: t.event_name,
      section: t.section_id,
      sortOrder: t.sort_order,
      isRequired: Boolean(t.is_required),
      status: completionMap.has(t.id) ? 'completed' : 'pending',
      completedDate: completionMap.get(t.id)?.completed_date || null,
      grade: completionMap.get(t.id)?.grade || null,
    }));

    const total = templates.filter(t => t.is_required).length;
    const completed = templates.filter(t => t.is_required && completionMap.has(t.id)).length;

    return {
      enrollment,
      progress,
      summary: {
        total,
        completed,
        remaining: total - completed,
        percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
    };
  });
}
