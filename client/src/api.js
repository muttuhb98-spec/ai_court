const configuredApi = import.meta.env.VITE_API_BASE_URL?.trim();
const isGithubPages = window.location.hostname === 'muttuhb98-spec.github.io';
const API = configuredApi || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

export async function request(path, options = {}) {
  if (isGithubPages && !configuredApi) {
    throw new Error('Login is unavailable because the API URL is not configured. Deploy the server, then set the VITE_API_BASE_URL repository Actions variable to its URL ending in /api.');
  }

  const response = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  if (response.status === 204) return null;
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The API did not return JSON. Check that VITE_API_BASE_URL points to the deployed server and ends in /api.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Something went wrong. Please try again.');
  return data;
}

