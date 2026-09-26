// scripts/copy-vendor.mjs
//
// Copies browser runtime files the workspace loads by URL into
// public/vendor. Re-run after upgrading maplibre-gl or sql.js:
//   node scripts/copy-vendor.mjs
// Versions are pinned exactly in package.json so the committed copies always
// match the bundled main scripts.
import { copyFileSync, mkdirSync } from 'fs'

const files = [
  ['node_modules/sql.js/dist/sql-wasm.wasm', 'public/vendor/sql-wasm.wasm'],
  ['node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'public/vendor/maplibre/maplibre-gl-worker.mjs'],
  ['node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs', 'public/vendor/maplibre/maplibre-gl-shared.mjs'],
]
mkdirSync('public/vendor/maplibre', { recursive: true })
for (const [from, to] of files) { copyFileSync(from, to); console.log(`${from} → ${to}`) }
