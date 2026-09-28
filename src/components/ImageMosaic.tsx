// Full-bleed 4×4 photo mosaic used behind the auth pages. A navy veil sits
// on top so forms stay readable; tiles are plain lazy <img>s so the page
// never waits on them.
const TILES = [
  'satellite-orbit.jpg', 'hippos.jpg', 'flood.jpg', 'forest.jpg',
  'river-aerial.jpg', 'soil.jpg', 'deforestation.jpg', 'ocean.jpg',
  'ground-story.jpeg', 'city-map.jpg', 'satellite.jpg', 'flood.jpg',
  'beautiful-african-women-having-fun-while-fetching-water.jpg', 'world-map.jpg', 'african-kids-enjoying-life.jpg', 'hippos.jpg',
].map((f) => `/images/branding/${f}`)

export default function ImageMosaic() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 bg-[#07121d]">
      <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-[3px]">
        {TILES.map((src, i) => (
          <div key={i} className="relative overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading={i < 8 ? 'eager' : 'lazy'} decoding="async"
                 className="h-full w-full object-cover saturate-[1.05]" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-[#07121d]/75" />
    </div>
  )
}
