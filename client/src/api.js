export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const res = await fetch(apiUrl + '/api' + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
