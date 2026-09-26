// src/lib/workspace/gpkg.ts
//
// Read every feature table of a GeoPackage in the browser (SQLite via
// sql.js/WebAssembly) and return one GeoJSON FeatureCollection.

import type { Feature, FeatureCollection } from 'geojson'
import type { SqlJsStatic } from 'sql.js'
import { parseGpkgGeometry } from './wkb'

let sqlPromise: Promise<SqlJsStatic> | null = null

function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = import('sql.js').then((m) =>
      m.default({ locateFile: () => '/vendor/sql-wasm.wasm' }))
  }
  return sqlPromise
}

export async function readGeoPackage(bytes: Uint8Array): Promise<{ fc: FeatureCollection; srsId: number | null }> {
  const SQL = await loadSql()
  const db = new SQL.Database(bytes)
  try {
    const tables = db.exec(
      `select c.table_name, g.column_name, g.srs_id
         from gpkg_contents c join gpkg_geometry_columns g on g.table_name = c.table_name
        where c.data_type = 'features'`,
    )[0]?.values ?? []

    const features: Feature[] = []
    let srsId: number | null = null

    for (const [table, geomCol, srs] of tables as [string, string, number][]) {
      srsId ??= srs
      const stmt = db.prepare(`select * from "${table.replace(/"/g, '""')}"`)
      try {
        const cols = stmt.getColumnNames()
        while (stmt.step()) {
          const row = stmt.get()
          const props: Record<string, unknown> = {}
          let geometry = null
          for (let i = 0; i < cols.length; i++) {
            const v = row[i]
            if (cols[i] === geomCol) {
              geometry = v instanceof Uint8Array ? parseGpkgGeometry(v) : null
            } else if (!(v instanceof Uint8Array)) {
              props[cols[i]] = v
            }
          }
          if (geometry) features.push({ type: 'Feature', geometry, properties: props })
        }
      } finally {
        stmt.free()
      }
    }
    return { fc: { type: 'FeatureCollection', features }, srsId }
  } finally {
    db.close()
  }
}
