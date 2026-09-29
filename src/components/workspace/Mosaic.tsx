// Full-bleed photo mosaic behind the workspace's own pages (teams and
// projects). 'gis' is real satellite imagery and GIS renders (Sentinel 2,
// ESA WorldCover, iSDA soil, NDVI, rainfall...); 'team' is people and
// places. Small WebP tiles, lazy past the first row, under a navy veil so
// the frosted panels on top stay readable.

const GIS = [
  's2_mine', 'lulc', 's2_mine_ndvi', 'wetlands',
  'hydrorivers', 's2_sugar', 'soil', 's2_delta',
  'rainfall', 's2_sugar_ndvi', 'watersheds', 's2_flats',
  'temperature', 'protected-areas', 'roads', 's2_farms',
].map((n) => `/images/mosaic/gis-${n}.webp`)

const TEAM = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `/images/mosaic/team-${i}.webp`)

export default function Mosaic({ kind }: { kind: 'gis' | 'team' }) {
  const tiles = kind === 'gis' ? GIS : [...TEAM, ...TEAM.slice().reverse()]
  return (
    <div aria-hidden className="ws-mosaic">
      <div className="ws-mosaic-grid">
        {tiles.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" loading={i < 4 ? 'eager' : 'lazy'} decoding="async" />
        ))}
      </div>
      <div className="ws-mosaic-veil" />
    </div>
  )
}
