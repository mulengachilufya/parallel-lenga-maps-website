// src/lib/workspace/templates.ts
//
// Project templates: a starting set of Lenga datasets for a type of job,
// filled in for one country when the project is created. Safe to import
// on the client (no server code); the server resolves the actual files.

export interface TemplateLayer {
  dataset: string          // DATASETS id in lib/api-datasets
  prefer?: string[]        // variant labels to prefer when a country has several files (e.g. 'ADM1')
}

export interface ProjectTemplate {
  id:          string
  name:        string
  blurb:       string
  /** Bottom of the layer stack first. */
  layers:      TemplateLayer[]
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'eia', name: 'Environmental impact assessment (baseline)',
    blurb: 'Land cover, soils, water, protected areas, people and access: the usual EIA baseline chapters.',
    layers: [
      { dataset: 'lulc' }, { dataset: 'soil' }, { dataset: 'watersheds' }, { dataset: 'protected-areas' },
      { dataset: 'lakes' }, { dataset: 'rivers' }, { dataset: 'roads' }, { dataset: 'population' },
      { dataset: 'admin-boundaries', prefer: ['ADM2', 'ADM1'] },
    ],
  },
  {
    id: 'mining', name: 'Mining licence area',
    blurb: 'Sensitive receptors around a licence: protected areas, drainage, settlements and access roads.',
    layers: [
      { dataset: 'lulc' }, { dataset: 'watersheds' }, { dataset: 'protected-areas' }, { dataset: 'rivers' },
      { dataset: 'roads' }, { dataset: 'population' }, { dataset: 'admin-boundaries', prefer: ['ADM2', 'ADM1'] },
    ],
  },
  {
    id: 'water', name: 'Water resources and catchment study',
    blurb: 'Catchments, rivers, lakes and aquifers with rainfall and drought for the water balance.',
    layers: [
      { dataset: 'rainfall' }, { dataset: 'drought-index' }, { dataset: 'aquifer' }, { dataset: 'watersheds' },
      { dataset: 'lakes' }, { dataset: 'rivers' }, { dataset: 'admin-boundaries', prefer: ['ADM1'] },
    ],
  },
  {
    id: 'infrastructure', name: 'Road or infrastructure corridor',
    blurb: 'Route screening: existing roads, river crossings, protected areas and the people along the way.',
    layers: [
      { dataset: 'lulc' }, { dataset: 'protected-areas' }, { dataset: 'rivers' }, { dataset: 'roads' },
      { dataset: 'population' }, { dataset: 'admin-boundaries', prefer: ['ADM2', 'ADM1'] },
    ],
  },
  {
    id: 'agriculture', name: 'Agriculture and food security',
    blurb: 'Land cover and soils with rainfall, temperature and drought for suitability and risk.',
    layers: [
      { dataset: 'rainfall' }, { dataset: 'temperature' }, { dataset: 'drought-index' }, { dataset: 'soil' },
      { dataset: 'lulc' }, { dataset: 'population' }, { dataset: 'admin-boundaries', prefer: ['ADM2', 'ADM1'] },
    ],
  },
]

export function findTemplate(id: unknown): ProjectTemplate | undefined {
  return typeof id === 'string' ? TEMPLATES.find((t) => t.id === id) : undefined
}

/** The 54 countries the catalogue covers, for the "country" picker. */
export const AFRICAN_COUNTRIES: { iso3: string; name: string }[] = [
  ['DZA', 'Algeria'], ['AGO', 'Angola'], ['BEN', 'Benin'], ['BWA', 'Botswana'], ['BFA', 'Burkina Faso'],
  ['BDI', 'Burundi'], ['CPV', 'Cabo Verde'], ['CMR', 'Cameroon'], ['CAF', 'Central African Republic'],
  ['TCD', 'Chad'], ['COM', 'Comoros'], ['COG', 'Congo'], ['COD', 'Democratic Republic of the Congo'],
  ['DJI', 'Djibouti'], ['EGY', 'Egypt'], ['GNQ', 'Equatorial Guinea'], ['ERI', 'Eritrea'], ['SWZ', 'Eswatini'],
  ['ETH', 'Ethiopia'], ['GAB', 'Gabon'], ['GMB', 'Gambia'], ['GHA', 'Ghana'], ['GIN', 'Guinea'],
  ['GNB', 'Guinea-Bissau'], ['CIV', "Cote d'Ivoire"], ['KEN', 'Kenya'], ['LSO', 'Lesotho'], ['LBR', 'Liberia'],
  ['LBY', 'Libya'], ['MDG', 'Madagascar'], ['MWI', 'Malawi'], ['MLI', 'Mali'], ['MRT', 'Mauritania'],
  ['MUS', 'Mauritius'], ['MAR', 'Morocco'], ['MOZ', 'Mozambique'], ['NAM', 'Namibia'], ['NER', 'Niger'],
  ['NGA', 'Nigeria'], ['RWA', 'Rwanda'], ['STP', 'Sao Tome and Principe'], ['SEN', 'Senegal'],
  ['SYC', 'Seychelles'], ['SLE', 'Sierra Leone'], ['SOM', 'Somalia'], ['ZAF', 'South Africa'],
  ['SSD', 'South Sudan'], ['SDN', 'Sudan'], ['TZA', 'Tanzania'], ['TGO', 'Togo'], ['TUN', 'Tunisia'],
  ['UGA', 'Uganda'], ['ZMB', 'Zambia'], ['ZWE', 'Zimbabwe'],
].map(([iso3, name]) => ({ iso3, name }))
