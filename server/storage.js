// Storage adapter: local disk in dev, Vercel Blob in production (when BLOB_READ_WRITE_TOKEN is set).
import { promises as fs } from 'node:fs'
import path from 'node:path'

const TYPES = { obj: 'text/plain', mtl: 'text/plain', glb: 'model/gltf-binary', gltf: 'model/gltf+json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
const typeOf = (n) => TYPES[n.split('.').pop().toLowerCase()] || 'application/octet-stream'

function fsStorage() {
  const root = process.cwd()
  const dataDir = path.join(root, 'data')
  const upDir = path.join(root, 'public', 'uploads')
  return {
    mode: 'fs',
    async readJson(name) {
      try { return JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8')) } catch { return null }
    },
    async writeJson(name, obj) {
      const p = path.join(dataDir, name)
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, JSON.stringify(obj, null, 2))
    },
    async getJson(rel) { return this.readJson(rel) },
    async putJson(rel, obj) { return this.writeJson(rel, obj) },
    async listJson(dir) {
      try {
        const names = (await fs.readdir(path.join(dataDir, dir))).filter((n) => n.endsWith('.json'))
        return (await Promise.all(names.map((n) => this.readJson(dir + '/' + n)))).filter(Boolean)
      } catch { return [] }
    },
    async delJson(rel) { await fs.rm(path.join(dataDir, rel), { force: true }) },
    async putFile(rel, buf) {
      const p = path.join(upDir, rel)
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, buf)
      return '/uploads/' + rel.split('/').map(encodeURIComponent).join('/')
    },
    async deleteDir(rel) { await fs.rm(path.join(upDir, rel), { recursive: true, force: true }) },
  }
}

async function blobStorage() {
  const { put, list, del } = await import('@vercel/blob')
  const priv = (name) => name.startsWith('private/') // never exposed: random suffix → unguessable URL
  return {
    mode: 'blob',
    async readJson(name) {
      // real errors must surface (never pretend the file is empty, or a later write would wipe it)
      const { blobs } = await list({ prefix: name.replace(/\.json$/, '') })
      const mine = blobs.filter((b) => b.pathname.endsWith('.json')).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      if (!mine.length) return null
      const r = await fetch(mine[0].url + '?cb=' + Date.now(), { cache: 'no-store' })
      if (!r.ok) throw new Error(`Could not read ${name} (${r.status})`)
      return r.json()
    },
    async writeJson(name, obj) {
      const body = JSON.stringify(obj)
      const res = await put(name, body, { access: 'public', contentType: 'application/json', addRandomSuffix: priv(name), allowOverwrite: !priv(name), cacheControlMaxAge: 60 })
      if (priv(name)) {
        const { blobs } = await list({ prefix: name.replace(/\.json$/, '') })
        const old = blobs.filter((b) => b.url !== res.url).map((b) => b.url)
        if (old.length) await del(old)
      }
    },
    // one small file per record → no read-modify-write races, no stale overwrites
    async putJson(rel, obj) {
      await put(rel, JSON.stringify(obj), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 })
    },
    async getJson(rel) {
      const { blobs } = await list({ prefix: rel })
      const hit = blobs.find((b) => b.pathname === rel)
      if (!hit) return null
      const r = await fetch(hit.url + '?cb=' + Date.now(), { cache: 'no-store' })
      if (!r.ok) throw new Error(`Could not read ${rel} (${r.status})`)
      return r.json()
    },
    async listJson(dir) {
      const { blobs } = await list({ prefix: dir + '/' })
      return Promise.all(blobs.filter((b) => b.pathname.endsWith('.json')).map(async (b) => {
        const r = await fetch(b.url + '?cb=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) throw new Error(`Could not read ${b.pathname} (${r.status})`)
        return r.json()
      }))
    },
    async delJson(rel) {
      const { blobs } = await list({ prefix: rel })
      const hit = blobs.filter((b) => b.pathname === rel).map((b) => b.url)
      if (hit.length) await del(hit)
    },
    async putFile(rel, buf) {
      const r = await put('uploads/' + rel, buf, { access: 'public', contentType: typeOf(rel), addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 })
      return r.url
    },
    async deleteDir(rel) {
      const { blobs } = await list({ prefix: 'uploads/' + rel + '/' })
      if (blobs.length) await del(blobs.map((b) => b.url))
    },
  }
}

let cached
export function getStorage() {
  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN)
    throw new Error('Storage is not set up. In Vercel: Storage → create a Blob store → connect it to this project → Redeploy.')
  return (cached ??= process.env.BLOB_READ_WRITE_TOKEN ? blobStorage() : Promise.resolve(fsStorage()))
}
