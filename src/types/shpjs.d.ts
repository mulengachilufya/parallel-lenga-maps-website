declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson'
  type Result = FeatureCollection | FeatureCollection[]
  export function parseZip(buffer: ArrayBuffer | Uint8Array, whiteList?: string[]): Promise<Result>
  const getShapefile: (base: string | ArrayBuffer, whiteList?: string[]) => Promise<Result>
  export default getShapefile
}
