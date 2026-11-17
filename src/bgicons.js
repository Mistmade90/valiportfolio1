const S = (body) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
const icons = {
  cube: S('<path d="M24 5 41 14v20L24 43 7 34V14z"/><path d="M7 14l17 9 17-9M24 23v20"/>'),
  sphere: S('<circle cx="24" cy="24" r="18"/><ellipse cx="24" cy="24" rx="18" ry="7"/><ellipse cx="24" cy="24" rx="7" ry="18"/>'),
  torus: S('<ellipse cx="24" cy="24" rx="19" ry="12"/><ellipse cx="24" cy="24" rx="8" ry="4"/>'),
  cone: S('<path d="M24 5 8 35"/><path d="M24 5 40 35"/><ellipse cx="24" cy="35" rx="16" ry="6"/>'),
  cylinder: S('<ellipse cx="24" cy="11" rx="14" ry="5"/><path d="M10 11v26M38 11v26"/><path d="M10 37a14 5 0 0 0 28 0"/>'),
  camera: S('<rect x="5" y="14" width="26" height="20" rx="3"/><path d="M31 21l12-6v18l-12-6z"/>'),
  light: S('<circle cx="24" cy="24" r="7"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4"/>'),
  gizmo: S('<circle cx="24" cy="24" r="4"/><path d="M24 24 8 36M24 24 42 18M24 24V5"/><circle cx="7" cy="37" r="3.5"/><circle cx="43" cy="17" r="3.5"/><circle cx="24" cy="4" r="3.5"/>'),
  cursor: S('<circle cx="24" cy="24" r="10"/><path d="M24 4v12M24 32v12M4 24h12M32 24h12"/>'),
  mesh: S('<path d="M8 38 24 8l16 30z"/><path d="M16 23h16M12 31h24"/><circle cx="24" cy="8" r="2.4" fill="currentColor"/><circle cx="8" cy="38" r="2.4" fill="currentColor"/><circle cx="40" cy="38" r="2.4" fill="currentColor"/>'),
  move: S('<path d="M24 5v38M5 24h38"/><path d="M24 5l-5 6M24 5l5 6M24 43l-5-6M24 43l5-6M5 24l6-5M5 24l6 5M43 24l-6-5M43 24l-6 5"/>'),
  rotate: S('<path d="M39 24a15 15 0 1 1-5-11"/><path d="M36 5v9h-9"/>'),
  monkey: S('<ellipse cx="24" cy="26" rx="13" ry="12"/><circle cx="9" cy="22" r="5"/><circle cx="39" cy="22" r="5"/><circle cx="19" cy="23" r="2"/><circle cx="29" cy="23" r="2"/><path d="M19 33c3 2 7 2 10 0"/>'),
  grid: S('<path d="M6 16h36M6 24h36M6 32h36M16 6v36M24 6v36M32 6v36"/>'),
}
const layout = [
  ['cube', 6, 12, 74, 26, 0], ['monkey', 88, 9, 82, 30, -6], ['gizmo', 78, 34, 62, 22, -3],
  ['sphere', 4, 38, 58, 28, -9], ['camera', 90, 58, 70, 24, -12], ['mesh', 12, 64, 66, 27, -4],
  ['torus', 70, 80, 76, 31, -15], ['cursor', 40, 4, 50, 20, -8], ['move', 54, 92, 54, 23, -2],
  ['cone', 28, 86, 60, 29, -11], ['light', 94, 84, 56, 25, -7], ['rotate', 20, 28, 46, 21, -5],
  ['cylinder', 60, 18, 52, 32, -13], ['grid', 47, 52, 56, 34, -10],
]
const layer = document.createElement('div')
layer.className = 'bg-icons'
layer.setAttribute('aria-hidden', 'true')
layer.innerHTML = layout
  .map(([n, x, y, s, d, dl]) => `<i style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-duration:${d}s;animation-delay:${dl}s">${icons[n]}</i>`)
  .join('')
document.body.prepend(layer)
