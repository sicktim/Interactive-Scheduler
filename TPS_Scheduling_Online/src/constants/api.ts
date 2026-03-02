/** Google Apps Script API (legacy — read-only source) */
export const GAS_API_URL =
  'https://script.google.com/macros/s/AKfycbyZNyrLxkW2vjbq8xpii43rWzYkkDvJTQ_KQCGMyErPZKqssL0XiA_UknwxOJ_XGzAt/exec';

/** Local Fastify API server */
export const LOCAL_API_URL = 'http://localhost:3001/api';

/**
 * Active API URL — toggle between GAS and local server.
 * Set USE_LOCAL_API=true in .env or toggle here during development.
 */
export const USE_LOCAL_API = import.meta.env.VITE_USE_LOCAL_API === 'true';
export const API_URL = USE_LOCAL_API ? LOCAL_API_URL : GAS_API_URL;

export const STORAGE_KEY = 'tps-scheduler-state';
export const WORKING_STORAGE_KEY = 'tps-scheduler-working';
export const THEME_KEY = 'tps-scheduler-theme';
