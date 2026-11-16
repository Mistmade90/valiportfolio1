import { api, getToken, setToken } from './api.js'

const $ = (s, r = document) => r.querySelector(s)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function dialog(html, { closable = true } = {}) {
  const el = document.createElement('div')
  el.className = 'dlg'
  el.innerHTML = `<div class="dlg-box" role="dialog">${html}</div>`
  document.body.appendChild(el)
  const close = () => el.remove()
  if (closable) {
    el.addEventListener('pointerdown', (e) => e.target === el && close())
    el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close))
  }
  return { el, close }
}
function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.classList.add('out'), 2600)
  setTimeout(() => t.remove(), 3200)
}

export function initAdmin(app) {
  const loginBtn = $('#nav-login')
  const setAdmin = (on) => {
    document.body.classList.toggle('is-admin', on)
    loginBtn.textContent = on ? 'Logout' : 'Login'
  }
  setAdmin(false)

  // restore session
  if (getToken()) api('/me').then((d) => { if (d.mustChange) showPassword({ forced: true }); else setAdmin(true) }).catch(() => setToken(''))

  loginBtn.onclick = () => {
    if (document.body.classList.contains('is-admin')) { setToken(''); setAdmin(false); toast('Logged out'); return }
    showLogin()
  }
  $('#btn-add').onclick = showAdd
  $('#btn-pw').onclick = () => showPassword({ forced: false })
  $('#btn-profile').onclick = showProfile

  async function shrink(file, max = 800) { // keep the picture small (fast page + fits Vercel's upload limit)
    try {
      const bmp = await createImageBitmap(file)
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.9))
      return blob && blob.type === 'image/webp' ? new File([blob], 'avatar.webp', { type: 'image/webp' }) : file
    } catch { return file }
  }

  function showProfile() {
    const cur = app.getProfile()
    const d = dialog(`
      <h3>Edit profile</h3>
      <form class="form">
        <label>Profile picture <small>png / jpg / webp — optional</small>
          <div class="pfp-row"><img alt="" src="${esc(cur.avatar || '')}" /><input name="avatar" type="file" accept="image/*" /></div>
        </label>
        <label>Status <small>e.g. Available, Busy, Away</small>
          <input name="status" maxlength="40" list="status-list" value="${esc(cur.status || '')}" required />
          <datalist id="status-list"><option>Available</option><option>Busy</option><option>Away</option><option>Open for commissions</option></datalist>
        </label>
        <label>Description <small>the text under your name</small>
          <textarea name="bio" maxlength="800" required>${esc(cur.bio || '')}</textarea>
        </label>
        <p class="err" hidden></p>
        <div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`)
    const f = $('form', d.el), err = $('.err', d.el), btn = $('.primary', d.el)
    f.avatar.onchange = () => { const x = f.avatar.files[0]; if (x) $('.pfp-row img', d.el).src = URL.createObjectURL(x) }
    f.onsubmit = async (e) => {
      e.preventDefault()
      err.hidden = true; btn.disabled = true; btn.textContent = 'Saving…'
      try {
        const fd = new FormData()
        fd.append('status', f.status.value); fd.append('bio', f.bio.value)
        if (f.avatar.files[0]) fd.append('avatar', await shrink(f.avatar.files[0]))
        const r = await api('/profile', { method: 'POST', form: fd })
        app.applyProfile(r.profile, { instant: true })
        d.close(); toast('Profile saved')
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Save'
        if (ex.status === 401) { setToken(''); setAdmin(false) }
      }
    }
  }

  function showLogin() {
    const d = dialog(`
      <h3>Login</h3>
      <form class="form">
        <label>Username<input name="u" autocomplete="username" required autofocus /></label>
        <label>Password<input name="p" type="password" autocomplete="current-password" required /></label>
        <p class="err" hidden></p>
        <div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Login</button></div>
      </form>`)
    const f = $('form', d.el), err = $('.err', d.el)
    f.onsubmit = async (e) => {
      e.preventDefault()
      err.hidden = true
      try {
        const r = await api('/login', { method: 'POST', json: { user: f.u.value.trim(), pass: f.p.value } })
        setToken(r.token)
        d.close()
        if (r.mustChange) showPassword({ forced: true, current: f.p.value })
        else { setAdmin(true); toast('Welcome back') }
      } catch (ex) { err.textContent = ex.message; err.hidden = false }
    }
  }

  function showPassword({ forced, current = '' }) {
    const d = dialog(`
      <h3>${forced ? 'Set a new password' : 'Change password'}</h3>
      ${forced ? '<p class="hint">First login — please choose your own password before continuing.</p>' : ''}
      <form class="form">
        ${forced && current ? '' : '<label>Current password<input name="c" type="password" autocomplete="current-password" required /></label>'}
        <label>New password (min. 8 characters)<input name="n" type="password" autocomplete="new-password" minlength="8" required /></label>
        <label>Repeat new password<input name="r" type="password" autocomplete="new-password" minlength="8" required /></label>
        <p class="err" hidden></p>
        <div class="row">${forced ? '' : '<button type="button" class="btn" data-close>Cancel</button>'}<button class="btn primary">Save password</button></div>
      </form>`, { closable: !forced })
    const f = $('form', d.el), err = $('.err', d.el)
    f.onsubmit = async (e) => {
      e.preventDefault()
      err.hidden = true
      if (f.n.value !== f.r.value) { err.textContent = 'Passwords do not match.'; err.hidden = false; return }
      try {
        const r = await api('/password', { method: 'POST', json: { current: f.c ? f.c.value : current, next: f.n.value } })
        setToken(r.token)
        d.close()
        setAdmin(true)
        toast('Password saved')
      } catch (ex) { err.textContent = ex.message; err.hidden = false }
    }
  }

  function showAdd() {
    const d = dialog(`
      <h3>Add model</h3>
      <form class="form">
        <label>3D model <small>.obj or .glb</small><input name="model" type="file" accept=".obj,.glb" required /></label>
        <label>Materials <small>.mtl (optional)</small><input name="mtl" type="file" accept=".mtl" /></label>
        <label>Textures <small>images used by the .mtl (optional)</small><input name="tex" type="file" accept="image/*" multiple /></label>
        <div class="two">
          <label>Title<input name="title" maxlength="80" placeholder="e.g. Jabba" /></label>
          <label>Category<input name="tag" maxlength="40" placeholder="e.g. Character" /></label>
        </div>
        <p class="err" hidden></p>
        <div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Preview</button></div>
      </form>`)
    const f = $('form', d.el), err = $('.err', d.el)
    f.model.onchange = () => { if (!f.title.value && f.model.files[0]) f.title.value = f.model.files[0].name.replace(/\.[^.]+$/, '') }
    f.onsubmit = async (e) => {
      e.preventDefault()
      err.hidden = true
      const model = f.model.files[0], mtl = f.mtl.files[0], tex = [...f.tex.files]
      const kind = model.name.split('.').pop().toLowerCase()
      const total = [model, mtl, ...tex].filter(Boolean).reduce((s, x) => s + x.size, 0)
      if (total > 4.4 * 1024 * 1024 && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        err.textContent = `Files total ${(total / 1048576).toFixed(1)} MB — online the limit is 4.4 MB per upload. Compress the model/textures first.`
        err.hidden = false
        return
      }
      const urls = []
      const url = (f) => { const u = URL.createObjectURL(f); urls.push(u); return u }
      const item = {
        title: f.title.value.trim() || model.name.replace(/\.[^.]+$/, ''), tag: f.tag.value.trim() || 'Model',
        kind, src: url(model), strict: true,
        note: [kind.toUpperCase(), mtl && 'MTL', tex.length && `${tex.length} texture${tex.length > 1 ? 's' : ''}`].filter(Boolean).join(' · '),
      }
      if (mtl && kind === 'obj') { item.mtl = url(mtl); item.texMap = new Map(tex.map((t) => [t.name.replace(/[\\/:*?"<>|]/g, '_').toLowerCase(), url(t)])) }
      d.el.style.display = 'none'
      let ok = false
      try { ok = await app.openPreview(item) }
      catch (ex) { err.textContent = 'Could not read the model: ' + ex.message; err.hidden = false; d.el.style.display = ''; urls.forEach(URL.revokeObjectURL); return }
      if (!ok) { d.el.style.display = ''; urls.forEach(URL.revokeObjectURL); return } // Cancel → back to the form

      const btn = $('.primary', d.el)
      d.el.style.display = ''
      btn.disabled = true; btn.textContent = 'Uploading…'
      const fd = new FormData()
      fd.append('title', item.title); fd.append('tag', item.tag); fd.append('model', model)
      if (mtl) fd.append('mtl', mtl)
      tex.forEach((t) => fd.append('textures', t))
      try {
        await api('/models', { method: 'POST', form: fd })
        d.close()
        toast(`"${item.title}" added`)
        await app.reload()
        document.getElementById('work').scrollIntoView({ behavior: 'smooth' })
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false
        btn.disabled = false; btn.textContent = 'Preview'
        if (ex.status === 401) { setToken(''); setAdmin(false) }
      }
      urls.forEach(URL.revokeObjectURL)
    }
  }
  return { toast }
}
export { esc }
