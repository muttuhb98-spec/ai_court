const configuredApi = import.meta.env.VITE_API_BASE_URL?.trim();
const API = configuredApi || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');
export const isDemoMode = window.location.hostname === 'muttuhb98-spec.github.io' && !configuredApi;

async function demoRequest(path, options) {
  const { requestDemoApi } = await import('./demoApi.js');
  return requestDemoApi(path, options);
}

export async function request(path, options = {}) {
  if (isDemoMode) return demoRequest(path, options);

  const response = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  if (response.status === 204) return null;
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The API did not return JSON. Check that VITE_API_BASE_URL points to the deployed server and ends in /api.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Something went wrong. Please try again.');
  return data;
}

