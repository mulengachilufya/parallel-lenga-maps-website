// src/lib/datasets/gpkg-subset.ts
//
// Server-side: build a NEW GeoPackage that keeps only the features matching
// a SQL condition (e.g. main rivers: "ORD_STRA" >= 4). The source file is
// only read, never changed.
//
// Why a fresh file instead of deleting rows in a copy: GDAL-made GeoPackages
// carry an R*Tree spatial index, and sql.js is built without the rtree
// module, so it cannot touch those tables. The output has no spatial index,
// which is valid GeoPackage; QGIS and GDAL read it normally (and can add an
// index if they want one).

import type { Database, SqlJsStatic, SqlValue } from 'sql.js'

const CORE_TABLES = ['gpkg_spatial_ref_sys', 'gpkg_contents', 'gpkg_geometry_columns']

export interface SubsetResult {
  bytes: Uint8Array
  table: string
  total: number
  kept: number
}

function ddl(db: Database, name: string): string {
  const r = db.exec(`select sql from sqlite_master where type = 'table' and name = ?`, [name])[0]?.values?.[0]?.[0]
  if (typeof r !== 'string') throw new Error(`table ${name} not found`)
  return r
}

function copyRows(src: Database, out: Database, table: string, where = '', params: SqlValue[] = []): number {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const stmt = src.prepare(`select * from ${q(table)}${where ? ` where ${where}` : ''}`, params)
  let n = 0
  try {
    const cols = stmt.getColumnNames()
    const ins = out.prepare(`insert into ${q(table)} (${cols.map(q).join(', ')}) values (${cols.map(() => '?').join(', ')})`)
    try {
      while (stmt.step()) { ins.run(stmt.get()); n++ }
    } finally { ins.free() }
  } finally { stmt.free() }
  return n
}

/**
 * Copy `bytes` (a GeoPackage with one feature table) keeping only rows where
 * `where` is true. `requiredColumn` must exist on the feature table, so a
 * file without it fails loudly instead of producing an empty or full copy.
 */
export function subsetGeoPackage(SQL: SqlJsStatic, bytes: Uint8Array, where: string, requiredColumn: string): SubsetResult {
  const src = new SQL.Database(bytes)
  const out = new SQL.Database()
  try {
    const feats = (src.exec(`select table_name from gpkg_contents where data_type = 'features'`)[0]?.values ?? []).map((v) => String(v[0]))
    if (feats.length !== 1) throw new Error(`expected 1 feature table, found ${feats.length}`)
    const table = feats[0]
    const cols = (src.exec(`select name from pragma_table_info(?)`, [table])[0]?.values ?? []).map((v) => String(v[0]))
    if (!cols.includes(requiredColumn)) throw new Error(`column ${requiredColumn} missing from ${table}`)

    out.run(`PRAGMA application_id = 1196444487`) // 'GPKG'
    out.run(`PRAGMA user_version = 10400`)         // GeoPackage 1.4
    for (const t of CORE_TABLES) out.run(ddl(src, t))
    out.run(ddl(src, table))

    out.run('BEGIN')
    copyRows(src, out, 'gpkg_spatial_ref_sys')
    copyRows(src, out, 'gpkg_contents', 'table_name = ?', [table])
    copyRows(src, out, 'gpkg_geometry_columns', 'table_name = ?', [table])
    const kept = copyRows(src, out, table, where)
    out.run('COMMIT')
    out.run(`update gpkg_contents set last_change = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where table_name = ?`, [table])

    const total = Number(src.exec(`select count(*) from "${table.replace(/"/g, '""')}"`)[0].values[0][0])
    return { bytes: out.export(), table, total, kept }
  } finally {
    src.close(); out.close()
  }
}
