import './style.css'
import './bgicons.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { items } from './models.js'
import { makeDemo } from './demos.js'
import { fetchModels, deleteModel, fetchProfile, fetchSkills } from './api.js'
import { initAdmin, editModel, editSkill, removeSkill } from './admin.js'
import { toast } from './ui.js'
import { initClock } from './clock.js'
import { ICONS, defaultSkills } from './skills.js'

const $ = (s) => document.querySelector(s)
$('#yr').textContent = new Date().getFullYear()

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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.setSize(W, H)
  dirty = true
}

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

const baseName = (p) => p.replace(/\\/g, '/').split('/').pop()
const safeName = (n) => n.replace(/[\\/:*?"<>|]/g, '_')
const absUrl = (u) => new URL(u, location.href).href

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

const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { threshold: 0.12 })

items.forEach((it) => { it.id ??= 'static-' + it.src.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-') })
let list = [...items]
const grid = $('#grid')
const chips = $('#chips')
let activeTag = ''
function applyFilter() {
  const cards = grid.children
  let shown = 0
  list.forEach((it, i) => {
    const on = !activeTag || it.tag === activeTag
    cards[i].hidden = !on
    shown += on
  })
  $('#count').textContent = String(shown).padStart(2, '0') + (shown === 1 ? ' model' : ' models')
  chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.tag || '') === activeTag))
  dirty = true
}
function buildChips() {
  const tags = [...new Set(list.map((i) => i.tag).filter(Boolean))]
  if (!tags.includes(activeTag)) activeTag = ''
  chips.hidden = tags.length < 2
  chips.innerHTML = ''
  for (const t of ['', ...tags]) {
    const b = document.createElement('button')
    b.dataset.tag = t
    b.textContent = t || 'All'
    b.onclick = () => { activeTag = t; applyFilter() }
    chips.appendChild(b)
  }
}
function buildGrid() {
  for (let k = views.length - 1; k >= 0; k--) if (views[k].item) views.splice(k, 1)
  grid.innerHTML = ''
  list.forEach((item, i) => {
    const card = document.createElement('article')
    card.className = 'card'
    card.tabIndex = 0
    card.innerHTML = `
      <div class="view"><span class="vhud tl">Persp</span><span class="vhud tr">${String(i + 1).padStart(2, '0')}</span><span class="vhud bl tris"></span><span class="vhud br open">Open ↗</span><span class="loading">Loading…</span></div>
      <div class="card-tools"><button class="edit" aria-label="Edit">✎ Edit</button><button class="del" aria-label="Delete">🗑 Delete</button></div>
      <div class="cap"><div><b></b><small></small></div><span class="idx">${String(i + 1).padStart(2, '0')}</span></div>`
    card.querySelector('b').textContent = item.title
    card.querySelector('small').textContent = item.tag
    grid.appendChild(card)
    const v = createView(card.querySelector('.view'), { fov: 30, dist: 4.4 })
    v.item = item
    card.addEventListener('pointerenter', () => { v.hover = true; v.scene.overrideMaterial = cardWire; dirty = true })
    card.addEventListener('pointerleave', () => { v.hover = false; v.scene.overrideMaterial = null; dirty = true })
    card.addEventListener('click', () => showItem(item, { index: i }))
    card.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), showItem(item, { index: i })))
    card.querySelector('.edit').addEventListener('click', (e) => { e.stopPropagation(); editModel(item) })
    card.querySelector('.del')?.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!confirm(`Delete "${item.title}" from your portfolio? This cannot be undone.`)) return
      try { await deleteModel(item.id); await refreshRemote() } catch (ex) { alert(ex.message) }
    })
    v.onFrame = (dt) => { v.pivot.rotation.y += dt * (v.hover ? 1.4 : 0.25) }
    card.classList.add('reveal'); io.observe(card)
  })
  if (list.length < 3) {
    const slot = document.createElement('div')
    slot.className = 'slot'
    slot.innerHTML = `<span class="vhud tl">Persp</span><div class="slot-body"><div class="bar"><i></i></div><b>Next model</b><small>Rendering…</small><button class="btn primary admin-only">+ Add model</button></div>`
    slot.querySelector('button').addEventListener('click', () => $('#btn-add').click())
    grid.appendChild(slot)
  }
  buildChips()
  applyFilter()
}
async function refreshRemote() {
  const { models, hidden } = await fetchModels()
  for (const o of models.filter((m) => m.override)) { const it = items.find((x) => x.id === o.id); if (it) { it.title = o.title; it.tag = o.tag } }
  list = [...items.filter((it) => !hidden.includes(it.id)), ...models.filter((m) => !m.override)]
  buildGrid()
  setHeroModel()
  if (!hashChecked) { hashChecked = true; openFromHash() }
}
let hashChecked = false
function openFromHash() {
  const m = location.hash.match(/^#model\/([a-z0-9-]+)$/)
  const i = m ? list.findIndex((it) => it.id === m[1]) : -1
  if (i >= 0) showItem(list[i], { index: i })
}

async function ensureLoaded(v) {
  if (v.requested) return
  v.requested = true
  const obj = (await loadItem(v.item)).clone()
  const wrap = frameObject(obj, v)
  v.pivot.add(wrap)
  v.pivot.rotation.y = Math.random() * 6
  v.el.querySelector('.loading')?.remove()
  const t = v.item.stats.tris
  const tris = v.el.querySelector('.tris')
  if (tris) tris.textContent = (t >= 1000 ? (t / 1000).toFixed(1) + 'K' : t) + ' tris'
  v.ready = true
  dirty = true
}

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
const cardWire = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.85 })
let current = -1
let previewResolve = null

let showToken = 0
let pushed = false
const modeLoading = $('#m-loading')

async function showItem(item, { index = -1, preview = false } = {}) {
  const token = ++showToken
  current = index
  modal.pivot.clear()
  modal.scene.overrideMaterial = null
  $('#m-wire').classList.remove('on')
  $('#m-title').textContent = item.title
  $('#m-tag').textContent = item.tag
  $('#m-stats').innerHTML = ''
  modalUi.classList.toggle('preview', preview)
  modalUi.classList.toggle('no-share', preview || !item.id)
  modeLoading.hidden = false
  modalBg.hidden = modalUi.hidden = false
  document.body.classList.add('modal-open')
  modal.active = true
  controls.enabled = false
  dirty = true
  if (!preview && item.id) {
    const url = '#model/' + item.id
    if (location.hash.startsWith('#model/')) history.replaceState(null, '', url)
    else { history.pushState(null, '', url); pushed = true }
  }
  const obj = (await loadItem(item)).clone()
  if (token !== showToken || !modal.active) return
  const wrap = frameObject(obj, modal, 1.0)
  modal.pivot.add(wrap)
  resetView()
  const s = item.stats
  $('#m-stats').innerHTML = `<span><b>${s.tris.toLocaleString('en')}</b> tris</span><span><b>${s.verts.toLocaleString('en')}</b> verts</span><span><b>${s.meshes}</b> meshes</span>` + (item.note ? `<span>${item.note}</span>` : '')
  modeLoading.hidden = true
  controls.enabled = true
  dirty = true
}
function resetView() {
  modal.camera.position.set(0, 0.5, 4.6)
  controls.target.set(0, 0, 0)
  controls.update()
  dirty = true
}
function closeModal() {
  showToken++
  if (previewResolve) { const r = previewResolve; previewResolve = null; r(false) }
  modal.active = false
  controls.enabled = false
  modalBg.hidden = modalUi.hidden = true
  document.body.classList.remove('modal-open')
  modal.pivot.clear()
  if (document.fullscreenElement) document.exitFullscreen?.()
  dirty = true
}
function requestClose() {
  if (!modal.active) return
  if (!previewResolve && location.hash.startsWith('#model/')) {
    if (pushed) { pushed = false; history.back() }
    else { history.replaceState(null, '', location.pathname + location.search); closeModal() }
  } else closeModal()
}
addEventListener('popstate', () => {
  if (modal.active && !previewResolve) { pushed = false; closeModal() }
  else if (!modal.active) openFromHash()
})
const step = (d) => { if (previewResolve || current < 0) return; const i = (current + d + list.length) % list.length; showItem(list[i], { index: i }) }
function openPreview(item) {
  return new Promise((resolve, reject) => {
    previewResolve = resolve
    showItem(item, { preview: true }).catch((e) => { previewResolve = null; closeModal(); reject(e) })
  })
}
$('#m-cancel').onclick = closeModal
$('#m-reset').onclick = resetView
$('#m-full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())
$('#m-share').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); toast('Link copied') } catch { toast('Copy the link from the address bar') }
}
$('#m-ok').onclick = () => { const r = previewResolve; previewResolve = null; closeModal(); r?.(true) }
$('#m-close').onclick = requestClose
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
  if (e.key === 'Escape' && !document.fullscreenElement) requestClose()
  if (e.key === 'ArrowLeft') step(-1)
  if (e.key === 'ArrowRight') step(1)
})

let dirty = true
let heroOn = true
let heroOff = false
let slowAcc = 0
let lastMeasure = 0
let lastDraw = 0
let boostUntil = 0
addEventListener("transitionrun", () => (boostUntil = performance.now() + 1000), true)
let last = performance.now()
let running = true
document.addEventListener('visibilitychange', () => { running = !document.hidden; last = performance.now(); slowAcc = 0; if (running) requestAnimationFrame(tick) })
addEventListener('scroll', () => (dirty = true), { passive: true })
addEventListener('resize', resize)
resize()

function tick(now) {
  if (!running) return
  requestAnimationFrame(tick)
  const raw = now - last
  const dt = Math.min(0.05, raw / 1000)
  last = now
  if (heroOn && !heroOff && !modal.active) {
    slowAcc = raw > 40 ? slowAcc + 1 : Math.max(0, slowAcc - 2)
    if (slowAcc > 90) { heroOff = true; $('#hero-3d').hidden = true; dirty = true }
  }

  if (modal.active) {
    controls.update()
    modal.rect = modal.el.getBoundingClientRect()
    renderer.setScissor(0, 0, W, H); renderer.setViewport(0, 0, W, H); renderer.clear()
    drawView(modal)
    return
  }

  if (now < boostUntil) dirty = true
  const cardHover = views.some((v) => v.hover)
  if (!dirty && !cardHover && (!heroOn || heroOff || now - lastDraw < 24)) return
  const measure = dirty || now - lastMeasure > 400
  dirty = false
  if (measure) {
    lastMeasure = now
    for (const v of views) {
      if (v === modal) continue
      testVisible(v)
      if (v.near && v.item && !v.requested) ensureLoaded(v)
    }
  }

  renderer.setScissor(0, 0, W, H); renderer.setViewport(0, 0, W, H); renderer.clear()
  const ddt = Math.min(0.05, (now - lastDraw) / 1000)
  for (const v of views) {
    if (v === modal || !v.visible || (v === hero && heroOff)) continue
    if (v.item && !v.ready) continue
    v.onFrame?.(v.hover || v.alwaysOn ? ddt : 0, now / 1000)
    drawView(v)
  }
  lastDraw = now
}
requestAnimationFrame(tick)

document.querySelectorAll('.section-head, .contact > *, .skill, .step, .marquee').forEach((el, i) => {
  el.classList.add('reveal'); io.observe(el)
})
buildGrid()
refreshRemote()
initAdmin({ openPreview, reload: refreshRemote, refreshSkills, getSkills: () => skills, getProfile: () => ({ status: $('.status b').textContent, bio: bio.dataset.text, avatar: $('.avatar img').getAttribute('src') }), applyProfile })

function type(el, text, speed, done) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; done?.(); return }
  let i = 0
  clearInterval(el._t)
  const id = el._t = setInterval(() => {
    el.textContent = text.slice(0, ++i)
    if (i >= text.length) { clearInterval(id); done?.() }
  }, speed)
}
const bio = $('#bio')

const STATUS_COLORS = [[/avail|open|online|free/i, '#0a0a0a'], [/busy|closed|unavail|booked|full/i, '#8a8a8a'], [/away|brb|soon|later/i, '#5a5a5a']]
function applyProfile(p, { instant = false } = {}) {
  if (!p) return
  if (p.avatar) $('.avatar img').src = p.avatar
  if (p.status) {
    $('.status b').textContent = p.status
    $('.status').style.setProperty('--dot', (STATUS_COLORS.find(([re]) => re.test(p.status)) || [0, '#0a0a0a'])[1])
  }
  if (p.bio) { bio.dataset.text = p.bio; if (instant) { clearInterval(bio._t); bio.textContent = p.bio } }
}
let profile = null
const profileReady = fetchProfile().then((p) => { profile = p; applyProfile(p) })

const bioText = () => bio.dataset.text
Promise.race([profileReady, new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(() => type(bio, bioText(), 14), 700))

$('#discord')?.addEventListener('click', (e) => {
  e.preventDefault()
  navigator.clipboard?.writeText('rough4574')
  const el = e.currentTarget, old = el.textContent
  el.textContent = 'Copied ✓'
  setTimeout(() => (el.textContent = old), 1500)
})

const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches

const offscreen = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('idle', !e.isIntersecting)), { rootMargin: '80px' })
document.querySelectorAll('.hero, .marquee').forEach((el) => offscreen.observe(el))
const bar = $('#progress')
let docMax = 0
new ResizeObserver(() => { docMax = document.documentElement.scrollHeight - innerHeight }).observe(document.body)
addEventListener('resize', () => { docMax = document.documentElement.scrollHeight - innerHeight })
let ticking = false
let scrollTimer = 0
addEventListener('scroll', () => {
  document.body.classList.add('scrolling')
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => document.body.classList.remove('scrolling'), 160)
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    bar.style.transform = `scaleX(${docMax > 0 ? Math.min(1, scrollY / docMax) : 0})`
    ticking = false
  })
}, { passive: true })

const countIO = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return
  countIO.unobserve(e.target)
  const m = e.target.textContent.match(/^(\d+)(.*)$/)
  if (!m || calm) return
  const to = +m[1], t0 = performance.now()
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 1400)
    e.target.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + m[2]
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}), { threshold: 0.6 })
document.querySelectorAll('.stats b').forEach((b) => countIO.observe(b))

const hudXY = $('#hud-xy')
const gizmo = $('#gizmo')
if (fine && !calm) {
  let hx = 0, hy = 0, hframe = 0
  const paint = () => {
    hframe = 0
    hudXY.textContent = `X ${(hx * 2 - 1).toFixed(2)} · Y ${(1 - hy * 2).toFixed(2)}`
    gizmo.style.setProperty('--gx', (hx - 0.5) * 14 + 'px')
    gizmo.style.setProperty('--gy', (hy - 0.5) * 14 + 'px')
  }
  addEventListener('pointermove', (e) => {
    if (scrollY > innerHeight) return
    hx = e.clientX / innerWidth; hy = e.clientY / innerHeight
    if (!hframe) hframe = requestAnimationFrame(paint)
  }, { passive: true })
}

const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n] || String(n)
const skillGrid = $('#skill-grid')
let skills = []
function renderSkills() {
  skillGrid.innerHTML = ''
  skills.forEach((s, i) => {
    const el = document.createElement('article')
    el.className = 'skill reveal'
    el.innerHTML = `<span class="n">${roman(i + 1)}</span><h3></h3><p></p><div class="ico">${ICONS[s.icon] || ICONS.cube}</div>
      <div class="tools"><button class="mini" data-act="edit">✎ Edit</button><button class="mini danger" data-act="del">🗑 Delete</button></div>`
    el.querySelector('h3').textContent = s.title
    el.querySelector('p').textContent = s.text
    el.querySelector('[data-act=edit]').onclick = () => editSkill(s)
    el.querySelector('[data-act=del]').onclick = () => removeSkill(s)
    skillGrid.appendChild(el)
    io.observe(el)
  })
}
async function refreshSkills() {
  const { skills: recs, hidden } = await fetchSkills()
  const byId = new Map(recs.map((r) => [r.id, r]))
  const base = defaultSkills.filter((d) => !hidden.includes(d.id)).map((d) => byId.get(d.id) || d)
  skills = [...base, ...recs.filter((r) => !defaultSkills.some((d) => d.id === r.id))]
  renderSkills()
}
skills = [...defaultSkills]; renderSkills()
refreshSkills()

const totop = $('#totop')
addEventListener('scroll', () => totop.classList.toggle('show', scrollY > 700), { passive: true })
totop.onclick = () => scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' })

const navLinks = [...document.querySelectorAll('.nav nav a[href^="#"]')]
const spy = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id))
}), { rootMargin: '-45% 0px -50% 0px' })
navLinks.forEach((a) => { const s = document.querySelector(a.getAttribute('href')); if (s) spy.observe(s) })

initClock()

const pointer = { x: 0.5, y: 0.5 }
addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth; pointer.y = e.clientY / innerHeight }, { passive: true })

const hero = createView($('#hero-3d'), { fov: 26, dist: 4.1 })
hero.alwaysOn = true
const sun = new THREE.DirectionalLight(0xffffff, 2.2)
sun.position.set(2.5, 3, 4)
hero.scene.add(sun)
const clay = new THREE.MeshStandardMaterial({ color: 0x6d6d6d, roughness: 0.55, metalness: 0, envMapIntensity: 0.9 })
const heroWire = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, wireframe: true })
hero.scene.overrideMaterial = clay
let heroSpin = 0
hero.onFrame = (dt) => {
  heroSpin += dt * 0.32
  const ty = heroSpin + (pointer.x - 0.5) * 1.3, tx = (pointer.y - 0.5) * 0.45
  const k = Math.min(1, dt * 3)
  hero.pivot.rotation.y += (ty - hero.pivot.rotation.y) * k
  hero.pivot.rotation.x += (tx - hero.pivot.rotation.x) * k
}
let heroId = null
async function setHeroModel() {
  const src = list[0] || { demo: 'knot', id: 'demo-knot' }
  if (heroId === src.id) return
  heroId = src.id
  const obj = (await loadItem(src)).clone()
  hero.pivot.clear()
  hero.pivot.add(frameObject(obj, hero, 1.0))
  dirty = true
}
setHeroModel()
new IntersectionObserver((es) => { heroOn = es[0].isIntersecting; dirty = true }, { rootMargin: '60px' }).observe($('#hero'))
addEventListener('keydown', (e) => {
  if ((e.key !== 'w' && e.key !== 'W' && e.key !== 'z' && e.key !== 'Z') || e.ctrlKey || e.metaKey || e.altKey) return
  if (modal.active || e.target.closest?.('input, textarea')) return
  hero.scene.overrideMaterial = hero.scene.overrideMaterial === clay ? heroWire : clay
  dirty = true
})
$('.hint-w')?.addEventListener('click', () => { hero.scene.overrideMaterial = hero.scene.overrideMaterial === clay ? heroWire : clay; dirty = true })

const sideLabels = { hero: 'I — Intro', skills: 'II — Skills', work: 'III — Work', process: 'IV — Process', contact: 'V — Contact' }
const sidenum = $('#sidenum')
const sideSpy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) sidenum.textContent = sideLabels[e.target.id] }), { rootMargin: '-45% 0px -50% 0px' })
Object.keys(sideLabels).forEach((id) => { const el = document.getElementById(id); if (el) sideSpy.observe(el) })

if (fine && !calm) {
  const cur = document.createElement('div')
  cur.className = 'cursor3d'
  cur.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="13" fill="none" stroke="#fff" stroke-width="3"/><circle cx="24" cy="24" r="13" fill="none" stroke="#8a8a8a" stroke-width="3" stroke-dasharray="6 6"/><path d="M24 3v13M24 32v13M3 24h13M32 24h13" stroke="#fff" stroke-width="2"/></svg><span></span>'
  document.body.appendChild(cur)
  const label = cur.querySelector('span')
  let cx = -100, cy = -100, tx = -100, ty = -100, run = 0, mode = ''
  const loop = () => {
    cx += (tx - cx) * 0.24; cy += (ty - cy) * 0.24
    cur.style.transform = `translate3d(${cx}px, ${cy}px, 0)`
    run = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.3 ? requestAnimationFrame(loop) : 0
  }
  addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY
    if (!run) run = requestAnimationFrame(loop)
    cur.classList.add('on')
    const t = e.target
    const next = t.closest?.('.modal-view') ? 'DRAG' : t.closest?.('.card') ? 'VIEW' : t.closest?.('a, button, input, textarea, label, .chips, .clock-btn') ? 'link' : ''
    if (next !== mode) { mode = next; cur.dataset.mode = next; label.textContent = next === 'link' ? '' : next }
  }, { passive: true })
  document.addEventListener('pointerleave', () => cur.classList.remove('on'))
}
