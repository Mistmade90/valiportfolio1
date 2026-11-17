const S = (b) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`
export const ICONS = {
  weapon: S('<circle cx="24" cy="24" r="12"/><path d="M24 4v10M24 34v10M4 24h10M34 24h10"/><circle cx="24" cy="24" r="2" fill="currentColor"/>'),
  building: S('<path d="M8 42V14l16-8 16 8v28z"/><path d="M8 14l16 8 16-8M24 22v20M16 30h4M28 30h4"/>'),
  cube: S('<path d="M24 5 41 14v20L24 43 7 34V14z"/><path d="M7 14l17 9 17-9M24 23v20"/>'),
  star: S('<path d="m24 5 5.5 12.5L43 19l-10 9 3 13.5L24 34.5 12 41.5 15 28 5 19l13.5-1.5z"/>'),
  brush: S('<path d="M8 40l6-2 22-22-4-4L10 34z"/><path d="M30 12l6 6"/>'),
  rocket: S('<path d="M24 5c8 5 11 14 9 24H15c-2-10 1-19 9-24z"/><circle cx="24" cy="19" r="3"/><path d="M15 29l-6 8 8-2M33 29l6 8-8-2M20 36l4 7 4-7"/>'),
  gamepad: S('<rect x="5" y="14" width="38" height="22" rx="10"/><path d="M15 21v8M11 25h8"/><circle cx="31" cy="23" r="1.6" fill="currentColor"/><circle cx="36" cy="27" r="1.6" fill="currentColor"/>'),
  code: S('<path d="M17 14 7 24l10 10M31 14l10 10-10 10M27 9l-6 30"/>'),
  wrench: S('<path d="M34 8a9 9 0 0 0-8 12L8 38l4 4 18-18a9 9 0 0 0 12-8l-6 5-5-1-1-5z"/>'),
  heart: S('<path d="M24 41S7 31 7 19a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 12-17 22-17 22z"/>'),
  sparkle: S('<path d="M24 5c1 10 5 14 15 15-10 1-14 5-15 15-1-10-5-14-15-15 10-1 14-5 15-15z"/>'),
  camera: S('<rect x="5" y="14" width="26" height="20" rx="3"/><path d="M31 21l12-6v18l-12-6z"/>'),
}

export const defaultSkills = [
  { id: 'static-weapons', title: 'Weapons', icon: 'weapon', text: 'Detailed hard-surface weapons modeled in Blender, ready to drop into your game.' },
  { id: 'static-buildings', title: 'Buildings', icon: 'building', text: 'From small structures to full buildings and environments with a clean, believable look.' },
  { id: 'static-roblox', title: 'Roblox Builder', icon: 'cube', text: 'Builds and models made for Roblox games and the communities that play them.' },
  { id: 'static-starwars', title: 'Star Wars Projects', icon: 'star', text: 'Experience from many Star Wars projects and the talent to show it across communities.' },
]
