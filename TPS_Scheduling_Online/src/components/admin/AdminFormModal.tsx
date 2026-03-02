import { useState } from 'react';
import { Modal } from '../shared/Modal/Modal';

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'date';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number;
}

interface AdminFormModalProps {
  title: string;
  fields: FormField[];
  initial?: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

export function AdminFormModal({ title, fields, initial, onSave, onClose }: AdminFormModalProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {};
    for (const f of fields) {
      v[f.name] = initial?.[f.name] ?? f.defaultValue ?? '';
    }
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const set = (name: string, value: unknown) =>
    setValues(prev => ({ ...prev, [name]: value }));

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="admin-form-title">{title}</div>
        {fields.map(f => (
          <div key={f.name} className="admin-form-field">
            <label className="admin-form-label">{f.label}{f.required && ' *'}</label>
            {f.type === 'select' ? (
              <select
                className="admin-form-select"
                value={String(values[f.name] ?? '')}
                onChange={e => set(f.name, e.target.value)}
                required={f.required}
              >
                <option value="">— Select —</option>
                {f.options?.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                className="admin-form-textarea"
                value={String(values[f.name] ?? '')}
                onChange={e => set(f.name, e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
              />
            ) : (
              <input
                className="admin-form-input"
                type={f.type}
                value={String(values[f.name] ?? '')}
                onChange={e => set(f.name, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
              />
            )}
          </div>
        ))}
        {error && <div className="admin-form-error">{error}</div>}
        <div className="admin-form-actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
