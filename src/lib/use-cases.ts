/**
 * Use cases: the kinds of work Lenga Maps is built for. Drives the navbar
 * dropdown and the /use-cases page (one card per entry, linked by #slug).
 * Images are real renders from open data (Sentinel-2, NDVI, WorldCover,
 * iSDAsoil, CHIRPS SPI, Overture, WDPA, HRSL, Copernicus DEM), not stock.
 * Where a ready-made workspace template exists, `template` is its id.
 */

export interface UseCase {
  slug:      string
  name:      string            // short label (dropdown, chips)
  line:      string            // one line for the dropdown
  title:     string            // the headline on the card
  body:      string            // one or two sentences
  datasets:  string[]          // Lenga datasets that serve it
  image:     string
  imageNote: string            // what the image actually shows
  template?: string            // workspace template id, if any
}

const img = (n: string) => `/images/use-cases/${n}.webp`

export const USE_CASES: UseCase[] = [
  {
    slug: 'eia', name: 'Environmental impact assessment', line: 'Every baseline layer before the scoping meeting',
    title: 'Day one of the EIA, not week three.',
    body: 'Every baseline layer for the study area arrives in one coordinate system before the scoping meeting, so the weeks go to assessment instead of data hunting.',
    datasets: ['Land use / land cover', 'River networks', 'Soil classification', 'Protected areas', 'Population & settlements'],
    image: img('lulc'), imageNote: 'ESA WorldCover land cover', template: 'eia',
  },
  {
    slug: 'mining', name: 'Mining and ESG', line: 'What sits downstream of the licence',
    title: "Licences end at a line. Impacts don't.",
    body: 'Lay the licence polygon over rivers, aquifers, settlements and protected land, and show regulators exactly what sits downstream and next door.',
    datasets: ['River networks', 'Transboundary aquifers', 'Population & settlements', 'Protected areas', 'Roads'],
    image: img('s2_mine'), imageNote: 'Sentinel-2, open pit mine', template: 'mining',
  },
  {
    slug: 'closure', name: 'Mine closure and rehabilitation', line: 'Revegetation you can measure',
    title: 'Rehabilitation you can prove from orbit.',
    body: 'Load NDVI from your own Sentinel-2 or drone imagery against the land cover baseline and show regrowth season by season, not only in the closure report.',
    datasets: ['Land use / land cover', 'River networks', 'Soil classification'],
    image: img('s2_mine_ndvi'), imageNote: 'NDVI of the same mine',
  },
  {
    slug: 'satellite-ndvi', name: 'Satellite imagery and NDVI', line: 'Your scenes beside national reference layers',
    title: 'Pixels need context. We supply it.',
    body: 'Drop Sentinel-2, Landsat or NDVI rasters up to 400 MB beside boundaries, rivers and soils, and the whole team reads the same scene.',
    datasets: ['Administrative boundaries', 'River networks', 'Soil classification', 'Land use / land cover'],
    image: img('s2_sugar_ndvi'), imageNote: 'NDVI over irrigated estates',
  },
  {
    slug: 'agriculture', name: 'Agriculture and food security', line: 'Where harvests fail first',
    title: 'Plan for the dry year, not the average one.',
    body: 'Twelve month drought history, rainfall, temperature and soils by district show where harvests fail first.',
    datasets: ['Drought index (SPI 12)', 'Rainfall', 'Temperature', 'Soil classification'],
    image: img('s2_farms'), imageNote: 'Sentinel-2, smallholder farmland', template: 'agriculture',
  },
  {
    slug: 'soil', name: 'Soil and crop suitability', line: 'A first screen before the lab',
    title: 'Read the soil before you buy the seed.',
    body: 'Soil classes against rainfall and temperature give a first suitability screen for any district, before a single sample goes to the lab.',
    datasets: ['Soil classification', 'Rainfall', 'Temperature'],
    image: img('soil'), imageNote: 'iSDAsoil classes',
  },
  {
    slug: 'climate', name: 'Climate finance and adaptation', line: 'Evidence for the climate rationale',
    title: 'Funders ask where. Answer with evidence.',
    body: 'Drought index, rainfall and the people exposed, sourced and dated, ready to support the climate rationale of a proposal.',
    datasets: ['Drought index (SPI 12)', 'Rainfall', 'Temperature', 'Population & settlements'],
    image: img('drought-index'), imageNote: 'SPI 12 drought index, southern Africa',
  },
  {
    slug: 'floods', name: 'Floods and floodplains', line: 'Who lives in the wet season footprint',
    title: "Floodplains don't read zoning maps.",
    body: 'Floodplains, rivers, rainfall and settlements on one map show who lives inside the wet season footprint.',
    datasets: ['Wetlands & floodplains', 'River networks', 'Rainfall', 'Population & settlements'],
    image: img('s2_flats'), imageNote: 'Sentinel-2, river floodplain',
  },
  {
    slug: 'water', name: 'Water supply and catchments', line: 'Everything upstream of the intake',
    title: 'A reservoir is only as good as its catchment.',
    body: 'Watersheds, rivers, rainfall and land cover upstream of the intake, shared live with the hydrologists and engineers on the job.',
    datasets: ['Watersheds', 'River networks', 'Lakes', 'Rainfall', 'Transboundary aquifers'],
    image: img('s2_dam'), imageNote: 'Sentinel-2, dam and reservoir', template: 'water',
  },
  {
    slug: 'wetlands', name: 'Wetlands', line: 'Conflicts found while design can change',
    title: 'Map the wetland before someone drains it.',
    body: 'Wetland and floodplain extents beside roads, farms and settlements flag conflicts while the design can still change.',
    datasets: ['Wetlands & floodplains', 'River networks', 'Land use / land cover', 'Roads'],
    image: img('wetlands'), imageNote: 'Wetland and floodplain extent',
  },
  {
    slug: 'conservation', name: 'Conservation and protected areas', line: 'Pressure at the park edge',
    title: 'Where the park ends, the pressure starts.',
    body: 'Protected area boundaries against land cover, roads and settlements reveal encroachment at the edges, where it actually happens.',
    datasets: ['Protected areas', 'Land use / land cover', 'Roads', 'Population & settlements'],
    image: img('protected-areas'), imageNote: 'Protected areas (WDPA)',
  },
  {
    slug: 'infrastructure', name: 'Roads and infrastructure corridors', line: 'Every route option on one map',
    title: 'Score every route before anyone walks it.',
    body: 'River crossings, protected land and communities along each option, compared on one map with the decision recorded.',
    datasets: ['Roads', 'River networks', 'Protected areas', 'Population & settlements'],
    image: img('roads'), imageNote: 'Road network (Overture)', template: 'infrastructure',
  },
  {
    slug: 'humanitarian', name: 'Humanitarian and WASH planning', line: 'People inside the risk zone',
    title: 'Know who lives inside the risk zone.',
    body: 'Population and settlement layers under your hazard map, for WASH, health and response planning that reaches people, not polygons.',
    datasets: ['Population & settlements', 'Drought index (SPI 12)', 'River networks', 'Administrative boundaries'],
    image: img('population'), imageNote: 'Settlement density (HRSL)',
  },
  {
    slug: 'drone-survey', name: 'Drone and terrain surveys', line: 'Your flight beside national layers',
    title: 'Your drone flight, on the same map as the country.',
    body: 'Upload orthomosaics, elevation models and field points beside national reference layers, and pin comments to the exact spot.',
    datasets: ['Administrative boundaries', 'River networks', 'Land use / land cover'],
    image: img('contours'), imageNote: 'Contours from a DEM',
  },
]
