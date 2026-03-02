import { LOCAL_API_URL } from '../constants';

/** Admin API always uses the local server (never GAS) */
const BASE = LOCAL_API_URL;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || `API ${res.status}`);
  }
  return res.json();
}

// ── Aircraft ─────────────────────────────────────────

export const aircraftApi = {
  getTypes: () => request<{ types: AircraftType[] }>('/aircraft/types'),
  createType: (data: Partial<AircraftType>) =>
    request<{ id: string }>('/aircraft/types', { method: 'POST', body: JSON.stringify(data) }),
  updateType: (id: string, data: Partial<AircraftType>) =>
    request<{ success: boolean }>(`/aircraft/types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getTails: (typeId?: string) =>
    request<{ tails: AircraftTail[] }>(`/aircraft/tails${typeId ? `?typeId=${typeId}` : ''}`),
  createTail: (data: { aircraftTypeId: string; tailNumber: string; maxSeats?: number; notes?: string }) =>
    request<{ id: string }>('/aircraft/tails', { method: 'POST', body: JSON.stringify(data) }),
  updateTail: (id: string, data: Partial<AircraftTail>) =>
    request<{ success: boolean }>(`/aircraft/tails/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getConfigs: (typeId?: string) =>
    request<{ configs: AircraftConfig[]; incompatibilities: ConfigIncompat[] }>(
      `/aircraft/configs${typeId ? `?typeId=${typeId}` : ''}`
    ),
  createConfig: (data: { id: string; aircraftTypeId: string; configName: string; description?: string; reducesSeatsBy?: number }) =>
    request<{ id: string }>('/aircraft/configs', { method: 'POST', body: JSON.stringify(data) }),
  addIncompatibility: (configAId: string, configBId: string, reason?: string) =>
    request<{ success: boolean }>('/aircraft/configs/incompatibility', {
      method: 'POST', body: JSON.stringify({ configAId, configBId, reason }),
    }),
  removeIncompatibility: (configAId: string, configBId: string) =>
    request<{ success: boolean }>('/aircraft/configs/incompatibility', {
      method: 'DELETE', body: JSON.stringify({ configAId, configBId }),
    }),
};

// ── Roster / Personnel ───────────────────────────────

export const personnelApi = {
  getRoster: () => request<{ roster: Record<string, string[]> }>('/roster'),
  getCategories: () => request<{ categories: PersonnelCategory[] }>('/roster/categories'),
  getPerson: (id: string) =>
    request<{ person: Person; qualifications: Qualification[]; nonAvailability: NonAvailability[] }>(
      `/roster/person/${id}`
    ),
};

// ── Curriculum ───────────────────────────────────────

export const curriculumApi = {
  list: () => request<{ curricula: CurriculumVersion[] }>('/curriculum'),
  get: (id: string) =>
    request<{ curriculum: CurriculumVersion; templates: EventTemplate[]; classes: ClassInstance[] }>(
      `/curriculum/${id}`
    ),
  create: (data: { name: string; courseType: string; versionCode: string; effectiveDate: string; description?: string }) =>
    request<{ id: string }>('/curriculum', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CurriculumVersion>) =>
    request<{ success: boolean }>(`/curriculum/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  clone: (id: string, newVersionCode: string, newName: string) =>
    request<{ id: string }>(`/curriculum/${id}/clone`, {
      method: 'POST', body: JSON.stringify({ newVersionCode, newName }),
    }),

  getTemplates: (curriculumId: string) =>
    request<{ templates: EventTemplate[] }>(`/curriculum/${curriculumId}/templates`),
  createTemplate: (curriculumId: string, data: Partial<EventTemplate>) =>
    request<{ id: string }>(`/curriculum/${curriculumId}/templates`, { method: 'POST', body: JSON.stringify(data) }),

  addPrerequisite: (templateId: string, requiresTemplateId: string, notes?: string) =>
    request<{ success: boolean }>(`/curriculum/templates/${templateId}/prerequisite`, {
      method: 'POST', body: JSON.stringify({ requiresTemplateId, notes }),
    }),
  removePrerequisite: (eventId: string, reqId: string) =>
    request<{ success: boolean }>(`/curriculum/prerequisites/${eventId}/${reqId}`, { method: 'DELETE' }),

  getClasses: () => request<{ classes: ClassInstance[] }>('/classes'),
  createClass: (data: Partial<ClassInstance>) =>
    request<{ id: string }>('/classes', { method: 'POST', body: JSON.stringify(data) }),
  enrollStudent: (classId: string, personId: string) =>
    request<{ id: string }>(`/classes/${classId}/enroll`, { method: 'POST', body: JSON.stringify({ personId }) }),
};

// ── Prerequisites ────────────────────────────────────

export const prerequisiteApi = {
  check: (enrollmentId: string, templateId: string) =>
    request<{ eligible: boolean; missing: { missing_prerequisite: string; template_id: string }[] }>(
      `/prerequisites/check?enrollmentId=${enrollmentId}&templateId=${templateId}`
    ),
  chain: (templateId: string) =>
    request<{ chain: { id: string; name: string; depth: number }[] }>(
      `/prerequisites/chain?templateId=${templateId}`
    ),
  progress: (enrollmentId: string) =>
    request<{ enrollment: Record<string, unknown>; progress: ProgressItem[]; summary: ProgressSummary }>(
      `/prerequisites/progress?enrollmentId=${enrollmentId}`
    ),
};

// ── Health ────────────────────────────────────────────

export const healthApi = {
  check: () => request<{ status: string; timestamp: string; database: string }>('/health'),
};

// ── Types ────────────────────────────────────────────

export interface AircraftType {
  id: string;
  display_name: string;
  default_max_seats: number;
  notes: string | null;
  is_active: number;
  tail_count?: number;
  config_count?: number;
}

export interface AircraftTail {
  id: string;
  aircraft_type_id: string;
  tail_number: string;
  max_seats: number | null;
  notes: string | null;
  is_active: number;
  type_name?: string;
  default_max_seats?: number;
}

export interface AircraftConfig {
  id: string;
  aircraft_type_id: string;
  config_name: string;
  description: string | null;
  reduces_seats_by: number;
  type_name?: string;
}

export interface ConfigIncompat {
  config_a_id: string;
  config_b_id: string;
  reason: string | null;
  config_a_name?: string;
  config_b_name?: string;
}

export interface PersonnelCategory {
  id: string;
  display_name: string;
  sort_order: number;
  is_staff: number;
  is_student: number;
  color_bg: string | null;
  color_text: string | null;
}

export interface Person {
  id: string;
  display_name: string;
  category_id: string;
  email: string | null;
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string;
  color_bg?: string;
  color_text?: string;
}

export interface Qualification {
  id: string;
  person_id: string;
  qualification_type: string;
  qualification_value: string;
  earned_date: string | null;
  expiry_date: string | null;
  is_current: number;
  notes: string | null;
}

export interface NonAvailability {
  id: string;
  person_id: string;
  reason: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
}

export interface CurriculumVersion {
  id: string;
  name: string;
  course_type: string;
  version_code: string;
  effective_date: string;
  description: string | null;
  is_active: number;
  template_count?: number;
  class_count?: number;
}

export interface EventTemplate {
  id: string;
  curriculum_id: string;
  event_name: string;
  section_id: string;
  default_duration_min: number | null;
  description: string | null;
  notes: string | null;
  sort_order: number;
  is_required: number;
  prereq_count?: number;
  prerequisites_json?: string;
}

export interface ClassInstance {
  id: string;
  curriculum_id: string;
  class_name: string;
  category_id: string;
  start_date: string;
  end_date: string | null;
  phase: string | null;
  is_active: number;
  notes: string | null;
  curriculum_name?: string;
  category_name?: string;
  enrolled_count?: number;
}

export interface ProgressItem {
  templateId: string;
  eventName: string;
  section: string;
  sortOrder: number;
  isRequired: boolean;
  status: string;
  completedDate: string | null;
  grade: string | null;
}

export interface ProgressSummary {
  total: number;
  completed: number;
  remaining: number;
  percentComplete: number;
}
