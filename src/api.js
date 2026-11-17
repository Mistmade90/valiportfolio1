let token = ''
try { token = localStorage.getItem('vali_token') || '' } catch {}
export const getToken = () => token
export function setToken(t) {
  token = t || ''
  try { t ? localStorage.setItem('vali_token', t) : localStorage.removeItem('vali_token') } catch {}
}

export async function api(path, { method = 'GET', json, form } = {}) {
  const headers = {}
  if (token) headers.Authorization = 'Bearer ' + token
  let body
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json) }
  else if (form) body = form
  let r
  try { r = await fetch('/api' + path, { method, headers, body }) }
  catch { throw new Error('Server not reachable.') }
  let data = {}
  try { data = await r.json() } catch {}
  if (!r.ok) {
    const hint = r.status === 404 && !data.error ? 'Error 404 — the server API was not found. Open the site via the dev server (node node_modules/vite/bin/vite.js) or the Vercel deployment with API enabled, not a plain static preview.' : 'Error ' + r.status
    throw Object.assign(new Error(data.error || hint), { status: r.status })
  }
  return data
}

export async function fetchModels() {
  try { const d = await api('/models'); return { models: d.models || [], hidden: d.hidden || [] } } catch { return { models: [], hidden: [] } }
}
export const deleteModel = (id) => api('/models?id=' + encodeURIComponent(id), { method: 'DELETE' })

export async function fetchProfile() {
  try { return (await api('/profile')).profile } catch { return null }
}

export async function fetchSkills() {
  try { const d = await api('/skills'); return { skills: d.skills || [], hidden: d.hidden || [] } } catch { return { skills: [], hidden: [] } }
}
