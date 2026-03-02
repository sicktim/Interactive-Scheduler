import { useState, useEffect, useCallback } from 'react';
import { curriculumApi } from '../../services/adminApi';
import type { CurriculumVersion, EventTemplate, ClassInstance } from '../../services/adminApi';
import { AdminTable } from '../../components/admin/AdminTable';
import type { Column } from '../../components/admin/AdminTable';
import { AdminFormModal } from '../../components/admin/AdminFormModal';
import type { FormField } from '../../components/admin/AdminFormModal';
import { Modal } from '../../components/shared/Modal/Modal';

// ── Column definitions ──────────────────────────────

const curriculumColumns: Column<CurriculumVersion>[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'course_type', label: 'Course Type', sortable: true, width: '100px' },
  { key: 'version_code', label: 'Version Code', sortable: true, width: '110px' },
  {
    key: 'effective_date', label: 'Effective Date', sortable: true, width: '120px',
    render: (row) => <span>{row.effective_date ?? ''}</span>,
  },
  {
    key: 'template_count', label: 'Templates', sortable: true, width: '90px',
    render: (row) => <span className="cell-muted">{row.template_count ?? 0}</span>,
  },
  {
    key: 'class_count', label: 'Classes', sortable: true, width: '80px',
    render: (row) => <span className="cell-muted">{row.class_count ?? 0}</span>,
  },
  {
    key: 'is_active', label: 'Active', sortable: true, width: '70px',
    render: (row) => (
      <span className={`cell-badge ${row.is_active ? 'badge-active' : 'badge-inactive'}`}>
        {row.is_active ? 'Yes' : 'No'}
      </span>
    ),
  },
];

const templateColumns: Column<EventTemplate>[] = [
  { key: 'sort_order', label: 'Sort Order', sortable: true, width: '90px' },
  { key: 'event_name', label: 'Event Name', sortable: true },
  { key: 'section_id', label: 'Section', sortable: true, width: '100px' },
  {
    key: 'default_duration_min', label: 'Duration (min)', sortable: true, width: '110px',
    render: (row) => <span>{row.default_duration_min ?? '—'}</span>,
  },
  {
    key: 'is_required', label: 'Required', sortable: true, width: '80px',
    render: (row) => <span>{row.is_required ? 'Yes' : 'No'}</span>,
  },
  {
    key: 'prerequisites_json', label: 'Prerequisites', sortable: false,
    render: (row) => {
      try {
        const prereqs = JSON.parse(String(row.prerequisites_json || '[]'));
        const valid = prereqs.filter((p: { requiresName: string | null }) => p.requiresName);
        return valid.length > 0
          ? <span className="cell-muted">{valid.map((p: { requiresName: string }) => p.requiresName).join(', ')}</span>
          : <span className="cell-muted">&mdash;</span>;
      } catch { return <span className="cell-muted">&mdash;</span>; }
    },
  },
];

const classColumns: Column<ClassInstance>[] = [
  { key: 'class_name', label: 'Class Name', sortable: true },
  { key: 'category_id', label: 'Category', sortable: true, width: '100px' },
  { key: 'start_date', label: 'Start Date', sortable: true, width: '110px' },
  {
    key: 'end_date', label: 'End Date', sortable: true, width: '110px',
    render: (row) => <span>{row.end_date ?? '—'}</span>,
  },
  {
    key: 'enrolled_count', label: 'Enrolled', sortable: true, width: '80px',
    render: (row) => <span className="cell-muted">{row.enrolled_count ?? 0}</span>,
  },
  {
    key: 'is_active', label: 'Active', sortable: true, width: '70px',
    render: (row) => (
      <span className={`cell-badge ${row.is_active ? 'badge-active' : 'badge-inactive'}`}>
        {row.is_active ? 'Yes' : 'No'}
      </span>
    ),
  },
];

// ── Form field definitions ──────────────────────────

const curriculumFields: FormField[] = [
  { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. FTC MCG 2026A' },
  {
    name: 'courseType', label: 'Course Type', type: 'select', required: true,
    options: [
      { value: 'FTC', label: 'FTC' },
      { value: 'STC', label: 'STC' },
    ],
  },
  { name: 'versionCode', label: 'Version Code', type: 'text', required: true, placeholder: 'e.g. 2026A' },
  { name: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
  { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
];

const templateFields: FormField[] = [
  { name: 'eventName', label: 'Event Name', type: 'text', required: true, placeholder: 'e.g. T-38 Sortie 1' },
  {
    name: 'sectionId', label: 'Section', type: 'select', required: true,
    options: [
      { value: 'Flying', label: 'Flying' },
      { value: 'Ground', label: 'Ground' },
      { value: 'NA', label: 'N/A' },
      { value: 'Supervision', label: 'Supervision' },
      { value: 'Academics', label: 'Academics' },
    ],
  },
  { name: 'defaultDurationMin', label: 'Duration (min)', type: 'number', placeholder: 'e.g. 60' },
  { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional description' },
  { name: 'sortOrder', label: 'Sort Order', type: 'number', required: true, placeholder: 'e.g. 10' },
  { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
];

const classFields: FormField[] = [
  { name: 'className', label: 'Class Name', type: 'text', required: true, placeholder: 'e.g. FTC-A 26-01' },
  {
    name: 'categoryId', label: 'Category', type: 'select', required: true,
    options: [
      { value: 'FTC-A', label: 'FTC-A' },
      { value: 'STC-A', label: 'STC-A' },
      { value: 'FTC-B', label: 'FTC-B' },
      { value: 'STC-B', label: 'STC-B' },
    ],
  },
  { name: 'startDate', label: 'Start Date', type: 'date', required: true },
  { name: 'endDate', label: 'End Date', type: 'date' },
  { name: 'phase', label: 'Phase', type: 'text', placeholder: 'e.g. Phase 1' },
  { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
];

// ── Component ───────────────────────────────────────

export default function AdminCurriculumPage() {
  const [curricula, setCurricula] = useState<CurriculumVersion[]>([]);
  const [selectedCurriculum, setSelectedCurriculum] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [classes, setClasses] = useState<ClassInstance[]>([]);
  const [showModal, setShowModal] = useState<'curriculum' | 'template' | 'class' | 'clone' | null>(null);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [cloneSource, setCloneSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Data loaders ────────────────────────────────

  const loadCurricula = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await curriculumApi.list();
      setCurricula(res.curricula);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load curricula');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCurriculumDetail = useCallback(async (id: string) => {
    setError(null);
    try {
      const [detailRes, templateRes] = await Promise.all([
        curriculumApi.get(id),
        curriculumApi.getTemplates(id),
      ]);
      setTemplates(templateRes.templates);
      setClasses(detailRes.classes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load curriculum details');
    }
  }, []);

  useEffect(() => {
    loadCurricula();
  }, [loadCurricula]);

  useEffect(() => {
    if (selectedCurriculum) {
      loadCurriculumDetail(selectedCurriculum);
    } else {
      setTemplates([]);
      setClasses([]);
    }
  }, [selectedCurriculum, loadCurriculumDetail]);

  // ── Handlers ────────────────────────────────────

  const handleCurriculumRowClick = (row: CurriculumVersion) => {
    setSelectedCurriculum(row.id);
  };

  const handleSaveCurriculum = async (data: Record<string, unknown>) => {
    if (editItem) {
      await curriculumApi.update(editItem._id as string, {
        name: data.name as string,
        description: (data.description as string) || null,
        is_active: data.isActive !== undefined ? Number(data.isActive) : undefined,
      } as Partial<CurriculumVersion>);
      setEditItem(null);
    } else {
      await curriculumApi.create(data as {
        name: string; courseType: string; versionCode: string;
        effectiveDate: string; description?: string;
      });
    }
    await loadCurricula();
  };

  const openEditCurriculum = (row: CurriculumVersion) => {
    setEditItem({ _id: row.id, name: row.name, courseType: row.course_type, versionCode: row.version_code, effectiveDate: row.effective_date, description: row.description || '' });
    setShowModal('curriculum');
  };

  const handleSaveTemplate = async (data: Record<string, unknown>) => {
    if (!selectedCurriculum) return;
    await curriculumApi.createTemplate(selectedCurriculum, data as Partial<EventTemplate>);
    await loadCurriculumDetail(selectedCurriculum);
  };

  const handleSaveClass = async (data: Record<string, unknown>) => {
    if (!selectedCurriculum) return;
    await curriculumApi.createClass({
      ...data,
      curriculumId: selectedCurriculum,
    } as Partial<ClassInstance>);
    await loadCurriculumDetail(selectedCurriculum);
  };

  // ── Render ──────────────────────────────────────

  if (loading && curricula.length === 0) {
    return <div className="admin-empty">Loading curricula...</div>;
  }

  return (
    <div>
      {error && (
        <div className="admin-form-error" style={{ marginBottom: 12 }}>
          {error}
          <button className="admin-btn admin-btn-sm" style={{ marginLeft: 8 }} onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* ── Curriculum Versions ─────────────────────── */}
      <h3 className="admin-section-title">Curriculum Versions</h3>

      <AdminTable<CurriculumVersion>
        columns={curriculumColumns}
        data={curricula}
        keyField="id"
        onRowClick={handleCurriculumRowClick}
        emptyMessage="No curriculum versions found"
        searchPlaceholder="Search curricula..."
        searchFields={['name', 'course_type', 'version_code']}
        toolbar={
          <button className="admin-btn admin-btn-primary" onClick={() => { setEditItem(null); setShowModal('curriculum'); }}>
            + New Curriculum
          </button>
        }
        actions={(row) => (
          <>
            <button className="admin-btn admin-btn-sm" onClick={(e) => { e.stopPropagation(); openEditCurriculum(row); }}>
              Edit
            </button>
            <button
              className="admin-btn admin-btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setCloneSource(row.id);
                setShowModal('clone');
              }}
            >
              Clone
            </button>
          </>
        )}
      />

      {/* ── Selected curriculum indicator ──────────── */}
      {selectedCurriculum && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, marginTop: 24 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Selected:</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-blue-text)' }}>
            {curricula.find(c => c.id === selectedCurriculum)?.name || selectedCurriculum}
          </span>
          <button className="admin-btn admin-btn-sm" onClick={() => setSelectedCurriculum(null)}>Clear</button>
        </div>
      )}

      {/* ── Event Templates ────────────────────────── */}
      {selectedCurriculum && (
        <>
          <h3 className="admin-section-title">Event Templates</h3>

          <AdminTable<EventTemplate>
            columns={templateColumns}
            data={templates}
            keyField="id"
            emptyMessage="No event templates for this curriculum"
            searchPlaceholder="Search templates..."
            searchFields={['event_name', 'section_id']}
            toolbar={
              <button className="admin-btn admin-btn-primary" onClick={() => setShowModal('template')}>
                + Add Template
              </button>
            }
          />

          {/* ── Class Instances ──────────────────────── */}
          <h3 className="admin-section-title" style={{ marginTop: 24 }}>Class Instances</h3>

          <AdminTable<ClassInstance>
            columns={classColumns}
            data={classes}
            keyField="id"
            emptyMessage="No class instances for this curriculum"
            searchPlaceholder="Search classes..."
            searchFields={['class_name', 'category_id']}
            toolbar={
              <button className="admin-btn admin-btn-primary" onClick={() => setShowModal('class')}>
                + New Class
              </button>
            }
          />
        </>
      )}

      {/* ── Modals ─────────────────────────────────── */}

      {showModal === 'curriculum' && (
        <AdminFormModal
          title={editItem ? 'Edit Curriculum' : 'New Curriculum Version'}
          fields={editItem ? curriculumFields.filter(f => f.name !== 'courseType' && f.name !== 'versionCode') : curriculumFields}
          initial={editItem ?? undefined}
          onSave={handleSaveCurriculum}
          onClose={() => { setShowModal(null); setEditItem(null); }}
        />
      )}

      {showModal === 'template' && (
        <AdminFormModal
          title="Add Event Template"
          fields={templateFields}
          onSave={handleSaveTemplate}
          onClose={() => setShowModal(null)}
        />
      )}

      {showModal === 'class' && (
        <AdminFormModal
          title="New Class Instance"
          fields={classFields}
          onSave={handleSaveClass}
          onClose={() => setShowModal(null)}
        />
      )}

      {showModal === 'clone' && cloneSource && (
        <Modal onClose={() => { setShowModal(null); setCloneSource(null); }}>
          <div className="admin-form-title">Clone Curriculum</div>
          <div className="admin-form-field">
            <label className="admin-form-label">New Version Code *</label>
            <input className="admin-form-input" id="clone-code" placeholder="e.g. 2026B" />
          </div>
          <div className="admin-form-field">
            <label className="admin-form-label">New Name *</label>
            <input className="admin-form-input" id="clone-name" placeholder="e.g. FTC MCG 2026B" />
          </div>
          <div className="admin-form-actions">
            <button className="admin-btn" onClick={() => { setShowModal(null); setCloneSource(null); }}>Cancel</button>
            <button className="admin-btn admin-btn-primary" onClick={async () => {
              const code = (document.getElementById('clone-code') as HTMLInputElement).value;
              const name = (document.getElementById('clone-name') as HTMLInputElement).value;
              if (!code || !name) return;
              try {
                await curriculumApi.clone(cloneSource, code, name);
                setShowModal(null);
                setCloneSource(null);
                loadCurricula();
              } catch (e) { setError(e instanceof Error ? e.message : 'Clone failed'); }
            }}>Clone</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
