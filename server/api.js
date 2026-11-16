// Tiny API: login, password change, list / add / delete models. Works as Vite dev middleware and as Vercel function.
import crypto from 'node:crypto'
import { getStorage } from './storage.js'

const DEFAULT_USER = 'Vali'
const DEFAULT_PASS = 'Vali123456' // first-run only; forced to change after first login
const AUTH = 'private/auth.json'
const MODELS = 'models.json'
const DAY = 86400e3

const json = (res, code, data) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(data)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64)
const b64 = (b) => Buffer.from(b).toString('base64url')
const safeName = (n) => n.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '_').slice(0, 120)

async function secret(store) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'v1:' + process.env.BLOB_READ_WRITE_TOKEN
  let s = await store.readJson('secret.json')
  if (!s) { s = { s: crypto.randomBytes(32).toString('hex') }; await store.writeJson('secret.json', s) }
  return s.s
}
async function getAuth(store) {
  const a = await store.readJson(AUTH)
  if (a) return a
  const salt = crypto.randomBytes(16).toString('hex')
  return { user: DEFAULT_USER, salt, hash: hash(DEFAULT_PASS, salt).toString('hex'), mustChange: true, version: 1, virgin: true }
}
const checkPw = (a, pw) => { const h = hash(String(pw), a.salt); const t = Buffer.from(a.hash, 'hex'); return h.length === t.length && crypto.timingSafeEqual(h, t) }
async function sign(store, a) {
  const p = b64(JSON.stringify({ u: a.user, v: a.version, exp: Date.now() + 7 * DAY }))
  return p + '.' + crypto.createHmac('sha256', await secret(store)).update(p).digest('base64url')
}
async function authed(req, store) {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '')
  const [p, sig] = t.split('.')
  if (!p || !sig) return null
  const good = crypto.createHmac('sha256', await secret(store)).update(p).digest('base64url')
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString())
    const a = await getAuth(store)
    return d.exp > Date.now() && d.v === a.version && d.u === a.user ? a : null
  } catch { return null }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Buffer.from(JSON.stringify(req.body))
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}
const readJson = async (req) => { try { return JSON.parse((await readBody(req)).toString() || '{}') } catch { return {} } }

const fails = new Map()
const MAX_FILE = 200 * 1024 * 1024
const MODEL_EXT = ['obj', 'glb']
const TEX_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif']
const ext = (n) => n.split('.').pop().toLowerCase()

export async function handle(req, res) {
  try {
    const store = await getStorage()
    const url = new URL(req.originalUrl || req.url, 'http://x')
    const route = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/'
    const method = req.method

    if (route === '/models' && method === 'GET') {
      const [recs, hid, legacy] = await Promise.all([store.listJson('records'), store.listJson('hidden'), store.readJson(MODELS)])
      const models = [...(legacy?.models ?? []), ...recs].sort((a, b) => a.created - b.created)
      const hidden = [...new Set([...(legacy?.hidden ?? []), ...hid.map((h) => h.id)])]
      return json(res, 200, { models, hidden })
    }

    if (route === '/login' && method === 'POST') {
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
      const f = fails.get(ip)
      if (f && f.until > Date.now()) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' })
      const { user, pass } = await readJson(req)
      const a = await getAuth(store)
      if (String(user || '').toLowerCase() === a.user.toLowerCase() && checkPw(a, pass || '')) {
        fails.delete(ip)
        return json(res, 200, { token: await sign(store, a), mustChange: !!a.mustChange })
      }
      const n = (f?.n ?? 0) + 1
      fails.set(ip, { n, until: n >= 8 ? Date.now() + 5 * 60e3 : 0 })
      await sleep(600)
      return json(res, 401, { error: 'Wrong username or password.' })
    }

    const a = await authed(req, store)
    if (route === '/me' && method === 'GET') return a ? json(res, 200, { user: a.user, mustChange: !!a.mustChange }) : json(res, 401, { error: 'Not logged in.' })
    if (!a) return json(res, 401, { error: 'Not logged in.' })

    if (route === '/password' && method === 'POST') {
      const { current, next } = await readJson(req)
      if (!checkPw(a, current || '')) { await sleep(600); return json(res, 403, { error: 'Current password is wrong.' }) }
      if (typeof next !== 'string' || next.length < 8) return json(res, 400, { error: 'New password needs at least 8 characters.' })
      if (next === current || next === DEFAULT_PASS) return json(res, 400, { error: 'Pick a different, new password.' })
      const salt = crypto.randomBytes(16).toString('hex')
      const na = { user: a.user, salt, hash: hash(next, salt).toString('hex'), mustChange: false, version: (a.version || 1) + 1 }
      await store.writeJson(AUTH, na)
      return json(res, 200, { token: await sign(store, na) })
    }
    if (a.mustChange) return json(res, 403, { error: 'Please change your password first.' })

    if (route === '/models' && method === 'POST') {
      const body = await readBody(req)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const form = await new Request('http://x/', { method: 'POST', headers, body }).formData()
      const model = form.get('model'), mtl = form.get('mtl')
      const textures = form.getAll('textures').filter((f) => f && f.size)
      if (!model || !model.size || !MODEL_EXT.includes(ext(model.name))) return json(res, 400, { error: 'Please add an .obj or .glb file.' })
      if (mtl && mtl.size && ext(mtl.name) !== 'mtl') return json(res, 400, { error: 'Material file must be .mtl' })
      for (const t of textures) if (!TEX_EXT.includes(ext(t.name))) return json(res, 400, { error: `Texture "${t.name}" must be png, jpg, webp or gif.` })
      for (const f of [model, mtl, ...textures]) if (f && f.size > MAX_FILE) return json(res, 400, { error: 'File too large.' })

      const title = String(form.get('title') || model.name.replace(/\.[^.]+$/, '')).slice(0, 80)
      const tag = String(form.get('tag') || 'Model').slice(0, 40)
      const id = (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'model') + '-' + crypto.randomBytes(3).toString('hex')
      const put = async (f) => store.putFile(`models/${id}/${safeName(f.name)}`, Buffer.from(await f.arrayBuffer()))
      const rec = { id, title, tag, kind: ext(model.name), src: await put(model), created: Date.now() }
      if (mtl && mtl.size) rec.mtl = await put(mtl)
      for (const t of textures) await put(t)
      await store.putJson(`records/${id}.json`, rec)
      return json(res, 200, { model: rec })
    }

    if (route === '/models' && method === 'DELETE') {
      const id = url.searchParams.get('id') || ''
      if (!/^[a-z0-9-]+$/.test(id)) return json(res, 400, { error: 'Bad id.' })
      if (id.startsWith('static-')) { // built-in model from models.js: can't delete the file, so hide it
        await store.putJson(`hidden/${id}.json`, { id })
        return json(res, 200, { ok: true })
      }
      await store.delJson(`records/${id}.json`)
      const legacy = await store.readJson(MODELS) // older installs kept everything in models.json
      if (legacy?.models?.some((m) => m.id === id)) { legacy.models = legacy.models.filter((m) => m.id !== id); await store.writeJson(MODELS, legacy) }
      await store.deleteDir(`models/${id}`)
      return json(res, 200, { ok: true })
    }

    return json(res, 404, { error: 'Not found.' })
  } catch (e) {
    console.error('[api]', e)
    return json(res, 500, { error: 'Server error: ' + (e?.message || e) })
  }
}
export default handle
