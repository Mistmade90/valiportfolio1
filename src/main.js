import './style.css'
import './bgicons.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { items } from './models.js'
import { makeDemo } from './demos.js'
import { fetchModels, deleteModel } from './api.js'
import { initAdmin } from './admin.js'

const $ = (s) => document.querySelector(s)
$('#yr').textContent = new Date().getFullYear()

/* ───────────── ONE shared renderer / canvas for every viewport ───────────── */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.setClearColor(0x000000, 0)
renderer.autoClear = false
renderer.setScissorTest(true)
renderer.domElement.className = 'gl'
document.body.appendChild(renderer.domElement)

const pmrem = new THREE.PMREMGenerator(renderer)
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

let W = 0, H = 0
function resize() {
  W = innerWidth; H = innerHeight
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  renderer.setSize(W, H)
  dirty = true
}

/* ───────────── views ───────────── */
const views = []
function createView(el, { fov = 32, dist = 4.2 } = {}) {
  const scene = new THREE.Scene()
  scene.environment = envTex
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100)
  camera.position.set(0, 0.25, dist)
  const pivot = new THREE.Group()
  scene.add(pivot)
  const v = { el, scene, camera, pivot, hover: false, visible: false, dist, spin: 0.5, onFrame: null }
  views.push(v)
  return v
}

function frameObject(obj, view, margin = 1.15) {
  // normalise to ~2 units, centred at origin
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const s = 2 / Math.max(size.x, size.y, size.z)
  obj.position.sub(center)
  const wrap = new THREE.Group()
  wrap.add(obj)
  wrap.scale.setScalar(s)
  view.camera.position.set(0, 0.25, view.dist * margin)
  return wrap
}

function testVisible(v) {
  const r = v.el.getBoundingClientRect()
  v.rect = r
  v.visible = r.bottom > 0 && r.top < H && r.right > 0 && r.left < W && r.width > 0
  v.near = r.bottom > -350 && r.top < H + 350
  return v.visible
}

function drawView(v) {
  const r = v.rect
  const x = Math.max(0, r.left), y = Math.max(0, H - r.bottom)
  renderer.setViewport(r.left, H - r.bottom, r.width, r.height)
  renderer.setScissor(x, y, Math.min(r.right, W) - x, Math.min(r.height, H - y))
  const a = r.width / r.height
  if (v.camera.aspect !== a) { v.camera.aspect = a; v.camera.updateProjectionMatrix() }
  renderer.render(v.scene, v.camera)
}

/* ───────────── model loading (lazy) ───────────── */
let gltfLoaderPromise
function getLoader() {
  return (gltfLoaderPromise ??= Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]).then(([{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }]) => {
    const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
    return new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder)
  }))
}

// OBJ support: optional `mtl` (material file) and `color` per item in models.js
const baseName = (p) => p.replace(/\\/g, '/').split('/').pop()
const safeName = (n) => n.replace(/[\\/:*?"<>|]/g, '_')
const absUrl = (u) => new URL(u, location.href).href

// Keeps only texture lines whose image really exists (a missing texture would render BLACK).
// Textures are looked up by file name next to the .mtl (or in item.texMap for previews).
async function resolveMtl(item) {
  const text = await (await fetch(item.mtl)).text()
  const dir = item.mtl.replace(/[^/]*$/, '')
  const out = await Promise.all(text.split(/\r?\n/).map(async (line) => {
    const m = line.match(/^\s*(map_\w+|bump|norm|disp)\s+(?:-\w+\s+\S+\s+)*(.+?)\s*$/i)
    if (!m) return line
    const name = safeName(baseName(m[2]))
    let url = item.texMap?.get(name.toLowerCase())
    if (!url && !item.texMap) {
      const cand = absUrl(dir + encodeURIComponent(name))
      try {
        const r = await fetch(cand, { method: 'HEAD' })
        if (r.ok && (r.headers.get('content-type') || '').startsWith('image')) url = cand
      } catch {}
    }
    return url ? `${m[1]} ${url}` : ''
  }))
  return out.join('\n')
}

// MTL gives Phong materials, which ignore our environment light → convert to PBR so they are lit.
function toStandard(m) {
  if (!m || !m.isMeshPhongMaterial) return m
  const std = new THREE.MeshStandardMaterial({
    name: m.name, color: m.color, map: m.map, normalMap: m.normalMap, alphaMap: m.alphaMap,
    roughness: THREE.MathUtils.clamp(1 - Math.sqrt(Math.min(m.shininess ?? 30, 1000) / 1000), 0.08, 1),
    metalness: 0.05, transparent: m.transparent, opacity: m.opacity, side: m.side,
  })
  m.dispose()
  return std
}

async function loadObj(item) {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
  const loader = new OBJLoader()
  if (item.mtl) {
    const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js')
    const mats = new MTLLoader().parse(await resolveMtl(item), '')
    mats.preload()
    loader.setMaterials(mats)
  }
  const obj = await loader.loadAsync(item.src)
  const fallback = new THREE.MeshStandardMaterial({ color: item.color ?? 0xd8d8dc, metalness: 0.15, roughness: 0.45 })
  obj.traverse((o) => {
    if (!o.isMesh) return
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals()
    if (!item.mtl) o.material = fallback
    else o.material = Array.isArray(o.material) ? o.material.map(toStandard) : toStandard(o.material)
  })
  return obj
}

function stats(obj) {
  let tris = 0, verts = 0, meshes = 0
  obj.traverse((o) => {
    if (!o.isMesh) return
    meshes++
    const g = o.geometry
    verts += g.attributes.position.count
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  return { tris: Math.round(tris), verts, meshes }
}

async function loadItem(item) {
  if (item.object) return item.object
  item.loading ??= (async () => {
    let obj
    if (item.src) {
      try {
        const kind = item.kind ?? (/\.(glb|gltf)(\?|$)/i.test(item.src) ? 'glb' : 'obj')
        obj = kind === 'obj' ? await loadObj(item) : (await (await getLoader()).loadAsync(item.src)).scene
      } catch (e) {
        if (item.strict) throw e
        console.warn('Could not load', item.src, e)
        obj = makeDemo('knot')
      }
    } else obj = makeDemo(item.demo)
    item.stats = stats(obj)
    item.object = obj
    return obj
  })()
  return item.loading
}

/* reveal on scroll */
const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { threshold: 0.12 })

/* ───────────── grid cards ───────────── */
// built-in models get a stable id so they can be hidden (deleted) from the admin UI too
items.forEach((it) => { it.id ??= 'static-' + it.src.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-') })
let list = [...items] // static models (models.js) + uploaded ones (API)
const grid = $('#grid')
function buildGrid() {
  for (let k = views.length - 1; k >= 0; k--) if (views[k].item) views.splice(k, 1)
  grid.innerHTML = ''
  $('#count').textContent = String(list.length).padStart(2, '0') + ' models'
  list.forEach((item, i) => {
    const card = document.createElement('article')
    card.className = 'card'
    card.tabIndex = 0
    card.innerHTML = `
      <div class="view"><span class="loading">Loading…</span></div>
      ${item.id ? '<button class="del" title="Delete this model" aria-label="Delete">🗑 Delete</button>' : ''}
      <div class="cap"><div><b></b><small></small></div><span class="idx">${String(i + 1).padStart(2, '0')}</span></div>`
    card.querySelector('b').textContent = item.title
    card.querySelector('small').textContent = item.tag
    grid.appendChild(card)
    const v = createView(card.querySelector('.view'), { fov: 30, dist: 4.4 })
    v.item = item
    card.addEventListener('pointerenter', () => { v.hover = true; dirty = true })
    card.addEventListener('pointerleave', () => { v.hover = false })
    card.addEventListener('click', () => showItem(item, { index: i }))
    card.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), showItem(item, { index: i })))
    card.querySelector('.del')?.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!confirm(`Delete "${item.title}" from your portfolio? This cannot be undone.`)) return
      try { await deleteModel(item.id); await refreshRemote() } catch (ex) { alert(ex.message) }
    })
    v.onFrame = (dt) => { v.pivot.rotation.y += dt * (v.hover ? 1.4 : 0.25) }
    card.classList.add('reveal'); io.observe(card)
  })
  dirty = true
}
async function refreshRemote() {
  const { models, hidden } = await fetchModels()
  list = [...items.filter((it) => !hidden.includes(it.id)), ...models]
  buildGrid()
}

async function ensureLoaded(v) {
  if (v.requested) return
  v.requested = true
  const obj = (await loadItem(v.item)).clone()
  const wrap = frameObject(obj, v)
  v.pivot.add(wrap)
  v.pivot.rotation.y = Math.random() * 6
  v.el.querySelector('.loading')?.remove()
  v.ready = true
  dirty = true
}

/* ───────────── modal ───────────── */
const modalBg = $('#modal-bg'), modalUi = $('#modal-ui')
const modal = createView($('#modal-view'), { fov: 32, dist: 4.6 })
modal.active = false
const controls = new OrbitControls(modal.camera, modal.el)
controls.enableDamping = true
controls.enablePan = false
controls.autoRotate = true
controls.autoRotateSpeed = 1.2
controls.minDistance = 2
controls.maxDistance = 9
controls.addEventListener('change', () => (dirty = true))
controls.enabled = false
const wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
let current = -1
let previewResolve = null

async function showItem(item, { index = -1, preview = false } = {}) {
  current = index
  const obj = (await loadItem(item)).clone()
  modal.pivot.clear()
  const wrap = frameObject(obj, modal, 1.0)
  modal.pivot.add(wrap)
  modal.camera.position.set(0, 0.5, 4.6)
  controls.target.set(0, 0, 0)
  controls.update()
  modal.scene.overrideMaterial = null
  $('#m-wire').classList.remove('on')
  $('#m-title').textContent = item.title
  $('#m-tag').textContent = item.tag
  const s = item.stats
  $('#m-stats').innerHTML = `<span><b>${s.tris.toLocaleString('en')}</b> tris</span><span><b>${s.verts.toLocaleString('en')}</b> verts</span><span><b>${s.meshes}</b> meshes</span>` + (item.note ? `<span>${item.note}</span>` : '')
  modalUi.classList.toggle('preview', preview)
  modalBg.hidden = modalUi.hidden = false
  document.body.classList.add('modal-open')
  modal.active = true
  controls.enabled = true
  dirty = true
}
function closeModal() {
  if (previewResolve) { const r = previewResolve; previewResolve = null; r(false) }
  modal.active = false
  controls.enabled = false
  modalBg.hidden = modalUi.hidden = true
  document.body.classList.remove('modal-open')
  modal.pivot.clear()
  dirty = true
}
const step = (d) => { if (previewResolve || current < 0) return; const i = (current + d + list.length) % list.length; showItem(list[i], { index: i }) }
function openPreview(item) {
  return new Promise((resolve, reject) => {
    previewResolve = resolve
    showItem(item, { preview: true }).catch((e) => { previewResolve = null; closeModal(); reject(e) })
  })
}
$('#m-cancel').onclick = closeModal
$('#m-ok').onclick = () => { const r = previewResolve; previewResolve = null; closeModal(); r?.(true) }
$('#m-close').onclick = closeModal
$('#m-prev').onclick = () => step(-1)
$('#m-next').onclick = () => step(1)
$('#m-wire').onclick = (e) => {
  modal.scene.overrideMaterial = modal.scene.overrideMaterial ? null : wireMat
  e.currentTarget.classList.toggle('on')
  dirty = true
}
$('#m-rot').onclick = (e) => { controls.autoRotate = !controls.autoRotate; e.currentTarget.classList.toggle('on') }
addEventListener('keydown', (e) => {
  if (!modal.active) return
  if (e.key === 'Escape') closeModal()
  if (e.key === 'ArrowLeft') step(-1)
  if (e.key === 'ArrowRight') step(1)
})

/* ───────────── render loop (only does work when needed) ───────────── */
let dirty = true
let boostUntil = 0
addEventListener("transitionrun", () => (boostUntil = performance.now() + 1000), true)
let last = performance.now()
let running = true
document.addEventListener('visibilitychange', () => { running = !document.hidden; last = performance.now(); if (running) requestAnimationFrame(tick) })
addEventListener('scroll', () => (dirty = true), { passive: true })
addEventListener('resize', resize)
resize()

function tick(now) {
  if (!running) return
  requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  // modal open → render ONLY the modal (huge saving)
  if (modal.active) {
    controls.update()
    modal.rect = modal.el.getBoundingClientRect()
    renderer.setScissor(0, 0, W, H); renderer.setViewport(0, 0, W, H); renderer.clear()
    drawView(modal)
    return
  }

  let animating = false
  for (const v of views) {
    if (v === modal) continue
    testVisible(v)
    if (v.near && v.item && !v.requested) ensureLoaded(v)
    if (v.visible && (v.alwaysOn || v.hover)) animating = true
  }
  if (now < boostUntil) dirty = true
  if (!animating && !dirty) return
  dirty = false

  renderer.setScissor(0, 0, W, H); renderer.setViewport(0, 0, W, H); renderer.clear()
  for (const v of views) {
    if (v === modal || !v.visible) continue
    if (v.item && !v.ready) continue
    v.onFrame?.(v.hover || v.alwaysOn ? dt : 0, now / 1000)
    drawView(v)
  }
}
requestAnimationFrame(tick)

document.querySelectorAll('.section-head, .contact > *').forEach((el) => { el.classList.add('reveal'); io.observe(el) })
buildGrid()
refreshRemote()
initAdmin({ openPreview, reload: refreshRemote })

/* typewriter intro */
function type(el, text, speed, done) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; done?.(); return }
  let i = 0
  const id = setInterval(() => {
    el.textContent = text.slice(0, ++i)
    if (i >= text.length) { clearInterval(id); done?.() }
  }, speed)
}
const bio = $('#bio')
const bioText = bio.dataset.text
type($('#name'), 'Valithar', 110, () => setTimeout(() => type(bio, bioText, 14), 150))

/* click-to-copy Discord name */
$('#discord')?.addEventListener('click', (e) => {
  e.preventDefault()
  navigator.clipboard?.writeText('rough4574')
  const el = e.currentTarget, old = el.textContent
  el.textContent = 'Copied ✓'
  setTimeout(() => (el.textContent = old), 1500)
})
