# Valithar — 3D Portfolio

Vite + three.js. One shared WebGL canvas for all viewports.

## Develop
```
node node_modules/vite/bin/vite.js      # or: npm run dev
```
Uploads in dev go to `public/uploads`, login data to `data/` (both git-ignored).

## Deploy on Vercel
1. Import this repo (Framework: Vite).
2. Storage → create a **Blob** store and connect it to the project (sets `BLOB_READ_WRITE_TOKEN`).
3. Optional: set `SESSION_SECRET` to any long random string.
4. First login: `Vali` / `Vali123456` → you are forced to choose a new password.

Online upload limit is ~4.4 MB per upload (Vercel function body limit).
