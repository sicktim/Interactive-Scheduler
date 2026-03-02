import { useState, useEffect, useCallback } from 'react';
import { personnelApi, healthApi } from '../../services/adminApi';
import type { PersonnelCategory, Person } from '../../services/adminApi';
import { AdminTable } from '../../components/admin/AdminTable';
import type { Column } from '../../components/admin/AdminTable';
import { AdminFormModal } from '../../components/admin/AdminFormModal';
import type { FormField } from '../../components/admin/AdminFormModal';

// API helper for persons list (uses LOCAL_API_URL directly)
import { LOCAL_API_URL } from '../../constants';
async function fetchPersons(): Promise<Person[]> {
  const res = await fetch(`${LOCAL_API_URL}/roster/persons`);
  if (!res.ok) throw new Error('Failed to load persons');
  const data = await res.json();
  return data.persons;
}

async function createPerson(body: { displayName: string; categoryId: string; email?: string; notes?: string }) {
  const res = await fetch(`${LOCAL_API_URL}/roster/person`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Create failed'); }
  return res.json();
}

async function updatePerson(id: string, body: Record<string, unknown>) {
  const res = await fetch(`${LOCAL_API_URL}/roster/person/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Update failed'); }
  return res.json();
}

export default function AdminPersonnelPage() {
  const [categories, setCategories] = useState<PersonnelCategory[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<'person' | null>(null);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const loadData = useCallback(async () => {
    try {
      await healthApi.check();
      setServerStatus('online');
    } catch {
      setServerStatus('offline');
    }
    try {
      const [catRes, personsRes] = await Promise.all([
        personnelApi.getCategories(),
        fetchPersons(),
      ]);
      setCategories(catRes.categories);
      setPersons(personsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personnel data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Columns ──────────────────────────────────────

  const categoryColumns: Column<PersonnelCategory>[] = [
    {
      key: 'color_bg', label: 'Color', width: '60px', sortable: false,
      render: (row) => (
        <div className="color-swatch" style={{ background: row.color_bg || '#475569', width: 24, height: 24, borderRadius: 4 }} />
      ),
    },
    { key: 'id', label: 'ID' },
    { key: 'display_name', label: 'Display Name' },
    {
      key: 'is_staff', label: 'Type',
      render: (row) => row.is_staff ? 'Staff' : row.is_student ? 'Student' : '\u2014',
    },
    { key: 'sort_order', label: 'Sort Order' },
  ];

  const personColumns: Column<Person>[] = [
    {
      key: 'category_id', label: '', width: '30px', sortable: false,
      render: (row) => {
        const cat = categories.find(c => c.id === row.category_id);
        return <div className="color-swatch" style={{ background: cat?.color_bg || '#475569', width: 14, height: 14, borderRadius: 3 }} />;
      },
    },
    { key: 'display_name', label: 'Name', sortable: true },
    {
      key: 'category_id', label: 'Category', sortable: true,
      render: (row) => <span>{row.category_name || row.category_id}</span>,
    },
    {
      key: 'email', label: 'Email', sortable: true,
      render: (row) => <span className="cell-muted">{row.email || '\u2014'}</span>,
    },
    {
      key: 'is_active', label: 'Active', width: '70px', sortable: true,
      render: (row) => (
        <span className={`cell-badge ${row.is_active ? 'badge-active' : 'badge-inactive'}`}>
          {row.is_active ? 'Yes' : 'No'}
        </span>
      ),
    },
  ];

  // ── Form fields ──────────────────────────────────

  const personFields: FormField[] = [
    { name: 'displayName', label: 'Display Name', type: 'text', required: true, placeholder: 'e.g. Larsen, R' },
    {
      name: 'categoryId', label: 'Category', type: 'select', required: true,
      options: categories.map(c => ({ value: c.id, label: c.display_name })),
    },
    { name: 'email', label: 'Email', type: 'text', placeholder: 'Optional' },
    { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Optional notes' },
  ];

  // ── Handlers ─────────────────────────────────────

  const handleSavePerson = async (data: Record<string, unknown>) => {
    if (editItem) {
      await updatePerson(editItem._id as string, {
        displayName: data.displayName,
        categoryId: data.categoryId,
        email: data.email || null,
        notes: data.notes || null,
      });
      setEditItem(null);
    } else {
      await createPerson({
        displayName: data.displayName as string,
        categoryId: data.categoryId as string,
        email: (data.email as string) || undefined,
        notes: (data.notes as string) || undefined,
      });
    }
    await loadData();
  };

  const openEditPerson = (row: Person) => {
    setEditItem({ _id: row.id, displayName: row.display_name, categoryId: row.category_id, email: row.email || '', notes: row.notes || '' });
    setShowModal('person');
  };

  // ── Render ───────────────────────────────────────

  return (
    <div>
      {/* Connection Status */}
      <div className="admin-status-bar">
        <span
          className="status-dot"
          style={{
            background: serverStatus === 'online' ? '#22c55e' : serverStatus === 'offline' ? '#ef4444' : '#eab308',
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6,
          }}
        />
        {serverStatus === 'checking' && 'Checking server...'}
        {serverStatus === 'online' && 'Connected to SQLite'}
        {serverStatus === 'offline' && 'Server offline'}
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
          color: '#fca5a5', fontSize: '0.72rem', marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="admin-empty" style={{ padding: 32, textAlign: 'center' }}>
          Loading personnel data...
        </div>
      ) : (
        <>
          {/* Personnel Table */}
          <div className="admin-section-title" style={{ marginBottom: 12 }}>
            Personnel ({persons.length})
          </div>
          <AdminTable<Person>
            columns={personColumns}
            data={persons}
            keyField="id"
            emptyMessage="No personnel records — click '+ Add Person' to create one"
            searchPlaceholder="Search by name, category, email..."
            searchFields={['display_name', 'category_id', 'email', 'category_name']}
            actions={(row) => (
              <button className="admin-btn admin-btn-sm" onClick={() => openEditPerson(row)}>
                Edit
              </button>
            )}
            toolbar={
              <button className="admin-btn admin-btn-primary" onClick={() => { setEditItem(null); setShowModal('person'); }}>
                + Add Person
              </button>
            }
          />

          {/* Personnel Categories */}
          <div className="admin-section-title" style={{ marginTop: 32, marginBottom: 12 }}>
            Categories
          </div>
          <AdminTable
            columns={categoryColumns}
            data={categories}
            keyField="id"
            emptyMessage="No categories defined"
            searchPlaceholder="Search categories..."
            searchFields={['id', 'display_name']}
          />
        </>
      )}

      {/* Person modal */}
      {showModal === 'person' && (
        <AdminFormModal
          title={editItem ? 'Edit Person' : 'Add Person'}
          fields={personFields}
          initial={editItem ?? undefined}
          onSave={handleSavePerson}
          onClose={() => { setShowModal(null); setEditItem(null); }}
        />
      )}
    </div>
  );
}
