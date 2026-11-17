const HOME = { zone: 'Europe/Berlin', label: 'Germany' }
const WORLD = [
  ['Los Angeles', 'America/Los_Angeles'],
  ['New York', 'America/New_York'],
  ['São Paulo', 'America/Sao_Paulo'],
  ['London', 'Europe/London'],
  ['Berlin', 'Europe/Berlin'],
  ['Moscow', 'Europe/Moscow'],
  ['Dubai', 'Asia/Dubai'],
  ['India', 'Asia/Kolkata'],
  ['Singapore', 'Asia/Singapore'],
  ['Tokyo', 'Asia/Tokyo'],
  ['Sydney', 'Australia/Sydney'],
]

const fmt = (zone, opts, locale) => new Intl.DateTimeFormat(locale, { timeZone: zone, ...opts })
const hm = fmt(HOME.zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'de-DE')
const sec = fmt(HOME.zone, { second: '2-digit' }, 'de-DE')
const hourFmt = new Map()
const hourOf = (zone, d) => {
  if (!hourFmt.has(zone)) hourFmt.set(zone, fmt(zone, { hour: 'numeric', hour12: false }, 'en-US'))
  return parseInt(hourFmt.get(zone).formatToParts(d).find((p) => p.type === 'hour').value, 10) % 24
}
const dayOf = (zone, d) => fmt(zone, { year: 'numeric', month: 'numeric', day: 'numeric' }, 'en-CA').format(d)

function offsetMinutes(zone, d) {
  try {
    const part = fmt(zone, { timeZoneName: 'longOffset' }, 'en-US').formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT'
    const m = part.match(/GMT([+-])(\d{1,2}):?(\d{2})?/)
    return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0
  } catch { return 0 }
}
function diffLabel(zone, d) {
  const mins = offsetMinutes(zone, d) - offsetMinutes(HOME.zone, d)
  if (!mins) return 'same time'
  const h = Math.abs(mins) / 60
  const txt = Number.isInteger(h) ? h : h.toFixed(1)
  return `${mins > 0 ? '+' : '−'}${txt}h`
}
const isDay = (zone, d) => { const h = hourOf(zone, d); return h >= 7 && h < 19 }

export function initClock() {
  const root = document.getElementById('clock')
  if (!root || !window.Intl) return
  const btn = root.querySelector('.clock-btn')
  const pop = root.querySelector('.clock-pop')
  const timeEl = root.querySelector('.clock-hm')
  const secEl = root.querySelector('.clock-sec')
  const mood = root.querySelector('.clock-mood')

  const local = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zones = [['Your time', local, local.replace(/_/g, ' ').split('/').pop()], ...WORLD.map(([n, z]) => [n, z, null])]
  pop.innerHTML = `<p class="clock-title">Valithar's time <b>${HOME.label}</b></p><ul>${zones.map(([name, zone, sub], i) => `
      <li data-zone="${zone}" class="${zone === HOME.zone && i > 0 ? 'home' : ''}">
        <span class="cz-ico"></span><span class="cz-name">${name}${sub ? `<small>${sub}</small>` : ''}</span>
        <span class="cz-diff"></span><span class="cz-time"></span>
      </li>`).join('')}</ul><p class="clock-note">Compared to Germany</p>`
  const rows = [...pop.querySelectorAll('li')].map((li) => ({
    li, zone: li.dataset.zone, time: li.querySelector('.cz-time'), diff: li.querySelector('.cz-diff'), ico: li.querySelector('.cz-ico'),
    f: fmt(li.dataset.zone, { hour: '2-digit', minute: '2-digit' }),
  }))
  let open = false
  let lastHm = '', lastDay = ''

  const set = (el, v) => { if (el.textContent !== v) el.textContent = v }
  function update() {
    const now = new Date()
    const t = hm.format(now)
    if (t !== lastHm) { lastHm = t; timeEl.textContent = t; mood.textContent = isDay(HOME.zone, now) ? '☀' : '☾' }
    set(secEl, ':' + sec.format(now).padStart(2, '0'))
    if (open) {
      const homeDay = dayOf(HOME.zone, now)
      for (const r of rows) {
        set(r.time, r.f.format(now))
        set(r.ico, isDay(r.zone, now) ? '☀' : '☾')
        const d = dayOf(r.zone, now)
        const rel = d === homeDay ? '' : d > homeDay ? ' · tomorrow' : ' · yesterday'
        set(r.diff, diffLabel(r.zone, now) + rel)
      }
      lastDay = homeDay
    }
    clearTimeout(update.t)
    update.t = setTimeout(update, 1000 - (Date.now() % 1000) + 5)
  }

  function toggle(on) {
    open = on ?? !open
    pop.hidden = !open
    btn.setAttribute('aria-expanded', String(open))
    if (open) update()
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle() })
  document.addEventListener('pointerdown', (e) => { if (open && !root.contains(e.target)) toggle(false) })
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { toggle(false); btn.focus() } })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update() })
  update()
}
