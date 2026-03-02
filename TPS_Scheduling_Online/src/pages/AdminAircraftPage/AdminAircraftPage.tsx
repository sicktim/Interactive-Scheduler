import { useState, useEffect, useCallback } from 'react';
import { aircraftApi } from '../../services/adminApi';
import type { AircraftType, AircraftTail, AircraftConfig, ConfigIncompat } from '../../services/adminApi';
import { AdminTable } from '../../components/admin/AdminTable';
import type { Column } from '../../components/admin/AdminTable';
import { AdminFormModal } from '../../components/admin/AdminFormModal';
import type { FormField } from '../../components/admin/AdminFormModal';

// ── Column definitions ──────────────────────────────

const typeColumns: Column<AircraftType>[] = [
  { key: 'id', label: 'ID', width: '160px' },
  { key: 'display_name', label: 'Display Name' },
  { key: 'default_max_seats', label: 'Max Seats', width: '90px' },
  {
    key: 'tail_count',
    label: 'Tails',
    width: '70px',
    render: (row: AircraftType) => (
      <span className="cell-muted">{row.tail_count ?? 0}</span>
    ),
  },
  {
    key: 'config_count',
    label: 'Configs',
    width: '80px',
    render: (row: AircraftType) => (
      <span className="cell-muted">{row.config_count ?? 0}</span>
    ),
  },
  {
    key: 'is_active',
    label: 'Active',
    width: '80px',
    render: (row: AircraftType) => (
      <span className={`cell-badge ${row.is_active ? 'badge-active' : 'badge-inactive'}`}>
        {row.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
  },
];

const tailColumns: Column<AircraftTail>[] = [
  { key: 'tail_number', label: 'Tail Number' },
  {
    key: 'max_seats',
    label: 'Max Seats',
    width: '100px',
    render: (row: AircraftTail) => (
      <span className={row.max_seats == null ? 'cell-muted' : ''}>
        {row.max_seats ?? 'Default'}
      </span>
    ),
  },
  {
    key: 'notes',
    label: 'Notes',
    render: (row: AircraftTail) => (
      <span className="cell-muted">{row.notes ?? ''}</span>
    ),
  },
  {
    key: 'is_active',
    label: 'Active',
    width: '80px',
    render: (row: AircraftTail) => (
      <span className={`cell-badge ${row.is_active ? 'badge-active' : 'badge-inactive'}`}>
        {row.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
  },
];

const configColumns: Column<AircraftConfig>[] = [
  { key: 'id', label: 'ID', width: '160px' },
  { key: 'config_name', label: 'Config Name' },
  {
    key: 'description',
    label: 'Description',
    render: (row: AircraftConfig) => (
      <span className="cell-muted">{row.description ?? ''}</span>
    ),
  },
  { key: 'reduces_seats_by', label: 'Reduces Seats By', width: '130px' },
];

// ── Form field definitions ──────────────────────────

const typeFields: FormField[] = [
  { name: 'id', label: 'ID', type: 'text', required: true, placeholder: 'e.g. T38' },
  { name: 'displayName', label: 'Display Name', type: 'text', required: true, placeholder: 'e.g. T-38 Talon' },
  { name: 'defaultMaxSeats', label: 'Default Max Seats', type: 'number', required: true, defaultValue: 1 },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

const tailFields: FormField[] = [
  { name: 'tailNumber', label: 'Tail Number', type: 'text', required: true, placeholder: 'e.g. 68-8201' },
  { name: 'maxSeats', label: 'Max Seats (blank = use default)', type: 'number' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

const configFields: FormField[] = [
  { name: 'id', label: 'ID', type: 'text', required: true, placeholder: 'e.g. WING_TANKS' },
  { name: 'configName', label: 'Config Name', type: 'text', required: true, placeholder: 'e.g. Wing Tanks' },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'reducesSeatsBy', label: 'Reduces Seats By', type: 'number', defaultValue: 0 },
];

// ── Component ───────────────────────────────────────

export default function AdminAircraftPage() {
  const [types, setTypes] = useState<AircraftType[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [tails, setTails] = useState<AircraftTail[]>([]);
  const [configs, setConfigs] = useState<AircraftConfig[]>([]);
  const [incompatibilities, setIncompatibilities] = useState<ConfigIncompat[]>([]);
  const [showModal, setShowModal] = useState<'type' | 'tail' | 'config' | null>(null);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Data fetching ───────────────────────────────

  const loadTypes = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await aircraftApi.getTypes();
      setTypes(res.types);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load aircraft types');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (typeId: string) => {
    try {
      setError(null);
      const [tailsRes, configsRes] = await Promise.all([
        aircraftApi.getTails(typeId),
        aircraftApi.getConfigs(typeId),
      ]);
      setTails(tailsRes.tails);
      setConfigs(configsRes.configs);
      setIncompatibilities(configsRes.incompatibilities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load type details');
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    if (selectedType) {
      loadDetails(selectedType);
    } else {
      setTails([]);
      setConfigs([]);
      setIncompatibilities([]);
    }
  }, [selectedType, loadDetails]);

  // ── Save handlers ─────────────────────────────

  const handleSaveType = async (data: Record<string, unknown>) => {
    if (editItem) {
      await aircraftApi.updateType(editItem.id as string, {
        display_name: data.displayName as string,
        default_max_seats: Number(data.defaultMaxSeats),
        notes: (data.notes as string) || null,
        is_active: data.isActive !== undefined ? Number(data.isActive) : undefined,
      } as Partial<AircraftType>);
    } else {
      await aircraftApi.createType({
        id: data.id as string,
        display_name: data.displayName as string,
        default_max_seats: Number(data.defaultMaxSeats),
        notes: (data.notes as string) || null,
      } as Partial<AircraftType>);
    }
    setEditItem(null);
    await loadTypes();
  };

  const handleSaveTail = async (data: Record<string, unknown>) => {
    if (!selectedType) return;
    if (editItem) {
      await aircraftApi.updateTail(editItem.id as string, {
        max_seats: data.maxSeats ? Number(data.maxSeats) : null,
        notes: (data.notes as string) || null,
        is_active: data.isActive !== undefined ? Number(data.isActive) : undefined,
      } as Partial<AircraftTail>);
    } else {
      await aircraftApi.createTail({
        aircraftTypeId: selectedType,
        tailNumber: data.tailNumber as string,
        maxSeats: data.maxSeats ? Number(data.maxSeats) : undefined,
        notes: (data.notes as string) || undefined,
      });
    }
    setEditItem(null);
    await loadDetails(selectedType);
  };

  const handleSaveConfig = async (data: Record<string, unknown>) => {
    if (!selectedType) return;
    await aircraftApi.createConfig({
      id: data.id as string,
      aircraftTypeId: selectedType,
      configName: data.configName as string,
      description: (data.description as string) || undefined,
      reducesSeatsBy: Number(data.reducesSeatsBy) || 0,
    });
    await loadDetails(selectedType);
  };

  const openEditType = (row: AircraftType) => {
    setEditItem({ id: row.id, displayName: row.display_name, defaultMaxSeats: row.default_max_seats, notes: row.notes || '' });
    setShowModal('type');
  };

  const openEditTail = (row: AircraftTail) => {
    setEditItem({ id: row.id, tailNumber: row.tail_number, maxSeats: row.max_seats ?? '', notes: row.notes || '' });
    setShowModal('tail');
  };

  const handleRemoveIncompat = async (configAId: string, configBId: string) => {
    if (!selectedType) return;
    try {
      setError(null);
      await aircraftApi.removeIncompatibility(configAId, configBId);
      await loadDetails(selectedType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove incompatibility');
    }
  };

  // ── Render ────────────────────────────────────

  if (loading) {
    return <div className="admin-empty">Loading aircraft data...</div>;
  }

  return (
    <div>
      {error && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: 12,
            borderRadius: 6,
            background: 'var(--danger-bg, #2d1215)',
            color: 'var(--danger-text, #f87171)',
            fontSize: '0.75rem',
            border: '1px solid var(--danger-border, #7f1d1d)',
          }}
        >
          {error}
        </div>
      )}

      {/* ── Aircraft Types ─────────────────────── */}
      <h2 className="admin-section-title">Aircraft Types</h2>
      <AdminTable<AircraftType>
        columns={typeColumns}
        data={types}
        keyField="id"
        onRowClick={(row) => setSelectedType(row.id)}
        searchPlaceholder="Search types..."
        searchFields={['id', 'display_name']}
        emptyMessage="No aircraft types found"
        actions={(row) => (
          <button className="admin-btn admin-btn-sm" onClick={(e) => { e.stopPropagation(); openEditType(row); }}>
            Edit
          </button>
        )}
        toolbar={
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => { setEditItem(null); setShowModal('type'); }}
          >
            + Add Type
          </button>
        }
      />

      {/* ── Selected type details ──────────────── */}
      {selectedType && (
        <>
          <div style={{ marginTop: 24, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Selected:</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-blue-text)' }}>
                {selectedType}
              </span>
              <button className="admin-btn admin-btn-sm" onClick={() => setSelectedType(null)}>
                Clear
              </button>
            </div>
          </div>

          {/* ── Tail Numbers ───────────────────── */}
          <h2 className="admin-section-title">Tail Numbers</h2>
          <AdminTable<AircraftTail>
            columns={tailColumns}
            data={tails}
            keyField="id"
            searchPlaceholder="Search tails..."
            searchFields={['tail_number', 'notes']}
            emptyMessage="No tail numbers for this type"
            actions={(row) => (
              <button className="admin-btn admin-btn-sm" onClick={() => openEditTail(row)}>
                Edit
              </button>
            )}
            toolbar={
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => { setEditItem(null); setShowModal('tail'); }}
              >
                + Add Tail
              </button>
            }
          />

          {/* ── Configurations ─────────────────── */}
          <h2 className="admin-section-title" style={{ marginTop: 24 }}>Configurations</h2>
          <AdminTable<AircraftConfig>
            columns={configColumns}
            data={configs}
            keyField="id"
            searchPlaceholder="Search configs..."
            searchFields={['id', 'config_name', 'description']}
            emptyMessage="No configurations for this type"
            toolbar={
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => setShowModal('config')}
              >
                + Add Config
              </button>
            }
          />

          {/* ── Incompatibilities ───────────────── */}
          {incompatibilities.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Incompatibility Pairs
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {incompatibilities.map((inc) => (
                  <li
                    key={`${inc.config_a_id}-${inc.config_b_id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 0',
                      fontSize: '0.72rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span>
                      {inc.config_a_name ?? inc.config_a_id}
                      {' \u2194 '}
                      {inc.config_b_name ?? inc.config_b_id}
                      {inc.reason && (
                        <span className="cell-muted">: {inc.reason}</span>
                      )}
                    </span>
                    <button
                      className="admin-btn admin-btn-danger admin-btn-sm"
                      onClick={() => handleRemoveIncompat(inc.config_a_id, inc.config_b_id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* ── Modals ─────────────────────────────── */}
      {showModal === 'type' && (
        <AdminFormModal
          title={editItem ? 'Edit Aircraft Type' : 'Add Aircraft Type'}
          fields={editItem ? typeFields.filter(f => f.name !== 'id') : typeFields}
          initial={editItem ?? undefined}
          onSave={handleSaveType}
          onClose={() => { setShowModal(null); setEditItem(null); }}
        />
      )}
      {showModal === 'tail' && (
        <AdminFormModal
          title={editItem ? 'Edit Tail Number' : 'Add Tail Number'}
          fields={editItem ? tailFields.filter(f => f.name !== 'tailNumber') : tailFields}
          initial={editItem ?? undefined}
          onSave={handleSaveTail}
          onClose={() => { setShowModal(null); setEditItem(null); }}
        />
      )}
      {showModal === 'config' && (
        <AdminFormModal
          title="Add Configuration"
          fields={configFields}
          onSave={handleSaveConfig}
          onClose={() => { setShowModal(null); setEditItem(null); }}
        />
      )}
    </div>
  );
}
