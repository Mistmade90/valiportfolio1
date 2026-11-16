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
  const fresh = async (url) => (await fetch(url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(), { cache: 'no-store' })).json()
  const priv = (name) => name.startsWith('private/') // never exposed: random suffix → unguessable URL
  return {
    mode: 'blob',
    async readJson(name) {
      try {
        const { blobs } = await list({ prefix: name.replace(/\.json$/, '') })
        const mine = blobs.filter((b) => b.pathname.endsWith('.json')).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
        return mine.length ? await fresh(mine[0].url) : null
      } catch { return null }
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
