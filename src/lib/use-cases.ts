/**
 * Use cases: the kinds of work Lenga Maps is built for. Drives the navbar
 * dropdown and the /use-cases page (one section per entry, linked by slug).
 * Where a ready-made workspace template exists, `template` is its id.
 */

export interface UseCase {
  slug:     string
  name:     string
  line:     string            // one line for the dropdown
  problem:  string            // what the work needs
  datasets: string[]          // Lenga datasets that serve it
  workspace: string           // what the shared workspace adds
  template?: string           // workspace template id, if any
  image:    string            // a real Lenga layer or Sentinel-2 tile (dropdown, cards)
  photo:    string            // full-bleed background on /use-cases
  heading:  string            // the line the section opens with
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'eia',
    photo: '/images/services/project-partner.jpg',
    heading: 'A baseline before the first site visit.',
    image: '/images/mosaic/gis-lulc.webp',
    name: 'Environmental impact assessment',
    line: 'Baseline layers for EIA and ESIA studies',
    problem: 'An EIA baseline needs boundaries, water, soils, land cover, protected areas and people for the study area, in one coordinate system, before fieldwork starts.',
    datasets: ['Administrative boundaries', 'River networks and watersheds', 'Soil classification', 'Land use and land cover', 'Protected areas', 'Population and settlements'],
    workspace: 'Start from the EIA map, add your site boundary and field data, and let specialists comment on exact receptors.',
    template: 'eia',
  },
  {
    slug: 'mining',
    photo: '/images/services/webgis-dev.jpg',
    heading: 'Know what surrounds the pit.',
    image: '/images/mosaic/gis-s2_mine.webp',
    name: 'Mining licences and ESG',
    line: 'Sensitive receptors, drainage and access around a licence',
    problem: 'Licence applications, ESG reporting and closure planning all ask what lies around the pit: water, protected land, settlements and access.',
    datasets: ['River networks and watersheds', 'Protected areas', 'Population and settlements', 'Roads and infrastructure', 'Transboundary aquifers', 'Elevation'],
    workspace: 'Overlay your licence polygon and site imagery on the reference layers and keep a dated history of every change.',
    template: 'mining',
  },
  {
    slug: 'satellite-ndvi',
    photo: '/images/services/data-platform.jpg',
    heading: 'Your imagery, finally in context.',
    image: '/images/mosaic/gis-s2_mine_ndvi.webp',
    name: 'Satellite imagery and NDVI',
    line: 'Your Sentinel-2, Landsat or drone imagery beside reference layers',
    problem: 'Imagery and vegetation indices only mean something against context: where the boundaries, rivers, soils and land cover classes are.',
    datasets: ['Land use and land cover', 'Administrative boundaries', 'River networks', 'Soil classification', 'Protected areas'],
    workspace: 'Upload GeoTIFFs up to 400 MB (scenes, orthomosaics or NDVI rasters), switch between dates layer by layer and pin observations to the exact spot.',
  },
  {
    slug: 'water',
    photo: '/images/branding/river-aerial.jpg',
    heading: 'Surface and groundwater that agree.',
    image: '/images/mosaic/gis-watersheds.webp',
    name: 'Water resources and catchments',
    line: 'Catchments, rivers, aquifers, rainfall and drought',
    problem: 'Water balance, borehole siting and catchment studies need surface and groundwater layers that agree with each other.',
    datasets: ['Watersheds', 'River networks and lakes', 'Transboundary aquifers', 'Rainfall', 'Drought index (SPI 12)'],
    workspace: 'Build the catchment map once and share it with hydrologists, engineers and the client on the same live map.',
    template: 'water',
  },
  {
    slug: 'climate',
    photo: '/images/services/automation.jpg',
    heading: 'Show where the stress is.',
    image: '/images/mosaic/gis-rainfall.webp',
    name: 'Climate risk and adaptation',
    line: 'Drought, rainfall and temperature exposure for proposals and appraisal',
    problem: 'Adaptation proposals and physical risk assessments must show where climate stress is, who is exposed and how conditions have changed.',
    datasets: ['Drought index (SPI 12)', 'Rainfall', 'Temperature', 'Population and settlements', 'Land use and land cover'],
    workspace: 'Combine exposure layers with your project sites and keep the evidence, with sources, in one place for reviewers.',
  },
  {
    slug: 'agriculture',
    photo: '/images/branding/soil.jpg',
    heading: 'Start from the soil.',
    image: '/images/mosaic/gis-s2_farms.webp',
    name: 'Agriculture and food security',
    line: 'Soils, rainfall and drought for suitability and risk',
    problem: 'Crop suitability, irrigation planning and food security assessments start from soils, water and climate together.',
    datasets: ['Soil classification', 'Rainfall', 'Temperature', 'Drought index (SPI 12)', 'Land use and land cover'],
    workspace: 'Start from the agriculture map, add farm or scheme boundaries and field observations, and work on it as a team.',
    template: 'agriculture',
  },
  {
    slug: 'infrastructure',
    photo: '/images/branding/city-map.jpg',
    heading: 'Screen every route option.',
    image: '/images/mosaic/gis-roads.webp',
    name: 'Roads and infrastructure corridors',
    line: 'Route screening: crossings, protected land and communities',
    problem: 'Corridor screening needs existing roads, river crossings, protected areas and settlements along every route option.',
    datasets: ['Roads and infrastructure', 'River networks', 'Protected areas', 'Population and settlements', 'Elevation'],
    workspace: 'Draw or upload route options, compare them on one map and record decisions in the discussion.',
    template: 'infrastructure',
  },
  {
    slug: 'conservation',
    photo: '/images/branding/hippos.jpg',
    heading: 'Protected land, and the pressure around it.',
    image: '/images/mosaic/gis-protected-areas.webp',
    name: 'Conservation and protected areas',
    line: 'Protected areas, land cover and pressures around them',
    problem: 'Conservation planning and monitoring look at protected areas together with land cover, water and the settlements and roads around them.',
    datasets: ['Protected areas', 'Land use and land cover', 'River networks and watersheds', 'Population and settlements', 'Roads and infrastructure'],
    workspace: 'Bring in survey points, camera trap locations or imagery and review them with partners on a shared map.',
  },
]
