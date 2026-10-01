/**
 * Use cases: the work Lenga Maps serves, written for the people who run it
 * (project managers and specialists who know GIS but carry a larger project).
 * Drives the navbar dropdown and the /use-cases page (one card per entry,
 * linked by #slug). Images are real renders from open data (Sentinel-2, NDVI,
 * WorldCover, iSDAsoil, CHIRPS, SPI, Overture, WDPA, HRSL, HydroBASINS,
 * geoBoundaries, Copernicus DEM), not stock.
 * Where a ready-made workspace template exists, `template` is its id.
 */

export interface UseCase {
  slug:      string
  name:      string            // sector label (dropdown, card label)
  line:      string            // one line for the dropdown
  title:     string            // the job, stated plainly
  body:      string            // why it matters, in one or two sentences
  uses:      string[]          // concrete tasks, three at most
  image:     string
  imageNote: string            // what the image actually shows (alt text)
  template?: string            // workspace template id, if any
}

const img = (n: string) => `/images/use-cases/${n}.webp`

export const USE_CASES: UseCase[] = [
  {
    slug: 'eia', name: 'Environmental and social impact assessment', line: 'Baseline and area of influence before scoping',
    title: 'ESIA baseline and area of influence',
    body: 'Define the area of influence and assemble the physical, biological and social baseline from one consistent source, so every specialist starts from the same map.',
    uses: [
      'Screen the site against protected areas and IFC PS6 sensitivities',
      'Count settlements and people in the direct and indirect area of influence',
      'Map receiving watercourses, soils and land cover for the baseline chapter',
    ],
    image: img('lulc'), imageNote: 'ESA WorldCover land cover', template: 'eia',
  },
  {
    slug: 'mining', name: 'Mining and ESG reporting', line: 'Licence area, receptors and disclosure',
    title: 'Receptors around a mining licence',
    body: 'Know what lies downstream of and around the licence before permitting, lender due diligence or an ESG disclosure asks for it.',
    uses: [
      'Trace drainage from pit and plant to downstream users',
      'Quantify communities and land use within set buffers of the licence',
      'Support IFRS S2 physical risk disclosure with rainfall, heat and drought history',
    ],
    image: img('s2_mine'), imageNote: 'Sentinel-2, open pit mine', template: 'mining',
  },
  {
    slug: 'closure', name: 'Tailings and mine closure', line: 'GISTM consequence and closure monitoring',
    title: 'Tailings consequence and closure evidence',
    body: 'Tailings classification depends on who and what lies downstream. Closure depends on proving rehabilitation over years, not at one inspection.',
    uses: [
      'Map people, infrastructure and ecosystems in a potential breach path for GISTM classification',
      'Track revegetation with NDVI against the land cover baseline',
      'Keep each season of closure monitoring in one project history',
    ],
    image: img('s2_mine_ndvi'), imageNote: 'NDVI over a mine and its surroundings',
  },
  {
    slug: 'redd', name: 'REDD+ and avoided deforestation', line: 'Project area, leakage belt and safeguards',
    title: 'REDD+ project design and monitoring',
    body: 'Under VM0048 the jurisdictional risk map comes from Verra. The project still draws its own boundaries, documents the drivers and shows its safeguards, and that is spatial work.',
    uses: [
      'Delineate the project area and leakage belt against land cover, roads and settlements',
      'Document the drivers of deforestation near the boundary for the project description',
      'Screen drought and fire exposure for the AFOLU non-permanence risk assessment',
    ],
    image: img('s2_delta'), imageNote: 'Sentinel-2, forest and cleared land',
  },
  {
    slug: 'arr', name: 'Afforestation and restoration carbon', line: 'Eligibility and planting suitability for ARR',
    title: 'ARR land eligibility and species suitability',
    body: 'Before a hectare is planted, an ARR project has to show the land was not forest in the years before the start date and that the trees will survive the local climate.',
    uses: [
      'Check land cover history to support land eligibility',
      'Match species to soils, rainfall and temperature by planting block',
      'Estimate drought risk to survival rates and the buffer contribution',
    ],
    image: img('soil'), imageNote: 'iSDAsoil soil classes',
  },
  {
    slug: 'climate-finance', name: 'Climate finance proposals', line: 'The climate rationale, sourced and dated',
    title: 'Climate rationale for GCF and Adaptation Fund proposals',
    body: 'Funders want evidence that climate is driving the problem the project solves. The observed record and the exposure behind it belong in the proposal, not in a promise for inception.',
    uses: [
      'Show observed rainfall, temperature and drought trends for the target districts',
      'Quantify the people and cropland exposed to the hazard addressed',
      'Produce the maps for the concept note, feasibility study and results framework',
    ],
    image: img('rainfall'), imageNote: 'CHIRPS mean annual rainfall, Africa',
  },
  {
    slug: 'el-nino', name: 'El Niño and drought response', line: 'Exposure mapped before the season fails',
    title: 'El Niño drought exposure and early action',
    body: 'The 2023/24 El Niño cut harvests across southern Africa and took Kariba close to its minimum operating level. Response and investment plans need the exposure mapped before the next event.',
    uses: [
      'Rank districts by SPI 12 history, rainfall deficit and population',
      'Set and test drought triggers for anticipatory action and contingency plans',
      'Compare past El Niño seasons with the long term record for one area',
    ],
    image: img('drought-index'), imageNote: 'SPI 12 drought index, southern Africa',
  },
  {
    slug: 'agriculture', name: 'Agriculture and food security', line: 'Production risk by district',
    title: 'Production risk for programmes and offtake',
    body: 'Input, extension and offtake plans all assume a normal season. Drought history, soils and rainfall by district show where that assumption fails most often.',
    uses: [
      'Target input and extension programmes to suitable soils and reliable rainfall',
      'Identify districts with repeated drought for food security planning',
      'Give spatial context to crop assessments and IPC analysis',
    ],
    image: img('s2_farms'), imageNote: 'Sentinel-2, smallholder farmland', template: 'agriculture',
  },
  {
    slug: 'lending', name: 'Agricultural lending and insurance', line: 'Portfolio exposure to drought',
    title: 'Drought exposure across a loan or insurance book',
    body: 'Lenders and insurers carry weather risk they rarely see on a map. Placing the portfolio on the drought and rainfall record shows where it is concentrated.',
    uses: [
      'Map borrower or policy locations against SPI 12 drought history',
      'Support index insurance design with long rainfall records by area',
      'Report climate exposure to investors and regulators',
    ],
    image: img('s2_sugar'), imageNote: 'Sentinel-2, irrigated estates and outgrowers',
  },
  {
    slug: 'solar', name: 'Solar and renewable energy siting', line: 'Screening land before the option agreement',
    title: 'Utility scale solar site screening',
    body: 'Most solar sites fail on land, access or environmental constraints, not on sunshine. Screening those first saves months of option agreements and studies.',
    uses: [
      'Exclude protected areas, wetlands, floodplains and forest from the search area',
      'Rank parcels by land cover and road access, with your grid and irradiance layers beside them',
      'Account for heat, which lowers panel output, in yield assumptions',
    ],
    image: img('temperature'), imageNote: 'Mean air temperature, Africa',
  },
  {
    slug: 'hydropower', name: 'Hydropower and reservoirs', line: 'Inflow risk from the catchment up',
    title: 'Catchment and inflow risk for hydropower',
    body: 'Kariba showed that generation depends on rain falling hundreds of kilometres upstream. Investment and dispatch planning need the whole catchment, not only the dam site.',
    uses: [
      'Delineate the contributing catchment of a reservoir or run of river site',
      'Review rainfall and drought history across the catchment for inflow risk',
      'Track upstream land cover change that affects runoff and sediment',
    ],
    image: img('lakes'), imageNote: 'Lake Kariba and the Zambezi',
  },
  {
    slug: 'water', name: 'Water supply and catchments', line: 'Sources, catchments and groundwater',
    title: 'Source protection and groundwater planning',
    body: 'Utilities and WASH programmes need to know where their water comes from, who shares it and what threatens it, from the catchment down to the borehole.',
    uses: [
      'Delineate catchments upstream of surface water intakes',
      'Place boreholes and schemes in their aquifer and catchment',
      'Map land use pressure inside source protection zones',
    ],
    image: img('watersheds'), imageNote: 'HydroBASINS watersheds', template: 'water',
  },
  {
    slug: 'satellite-ndvi', name: 'Satellite imagery and NDVI', line: 'Imagery read against reference layers',
    title: 'Satellite and NDVI analysis in context',
    body: 'An NDVI anomaly means little until you know the land cover, the soil, the rainfall that season and whose land it is. The reference layers sit beside your scenes.',
    uses: [
      'Interpret vegetation change against land cover and rainfall',
      'Compare seasons over a site for monitoring and verification',
      'Share imagery with colleagues who do not run GIS software',
    ],
    image: img('s2_sugar_ndvi'), imageNote: 'NDVI over irrigated estates',
  },
  {
    slug: 'floods', name: 'Floods and wetlands', line: 'Exposure inside the wet season footprint',
    title: 'Flood and wetland exposure',
    body: 'Settlements, roads and farms move into floodplains and wetlands faster than planning records show.',
    uses: [
      'Map people and assets inside floodplain and wetland extents',
      'Flag designs that cross wetlands while they can still change',
      'Support drainage and resettlement planning with the rainfall record',
    ],
    image: img('s2_flats'), imageNote: 'Sentinel-2, river floodplain',
  },
  {
    slug: 'biodiversity', name: 'Biodiversity and nature disclosure', line: 'Critical habitat and TNFD screening',
    title: 'Biodiversity screening and nature disclosure',
    body: 'IFC Performance Standard 6 and TNFD both start with location: which operations sit in or near sensitive ecosystems.',
    uses: [
      'Screen sites against protected areas, wetlands and intact land cover',
      'Measure pressure at protected area edges from roads and settlements',
      'Support the Locate phase of a TNFD LEAP assessment',
    ],
    image: img('protected-areas'), imageNote: 'Protected areas (WDPA)',
  },
  {
    slug: 'infrastructure', name: 'Roads and infrastructure corridors', line: 'Route options compared on one map',
    title: 'Corridor and route option analysis',
    body: 'Route selection trades cost against crossings, communities and protected land. All of it can be compared on one map, with the reasoning recorded.',
    uses: [
      'Count river crossings and wetland sections on each option',
      'Estimate affected settlements for land take and resettlement planning',
      'Record the alignment decision and its comments in the project history',
    ],
    image: img('roads'), imageNote: 'Road network (Overture)', template: 'infrastructure',
  },
  {
    slug: 'humanitarian', name: 'Humanitarian and WASH planning', line: 'Populations inside the hazard',
    title: 'Population exposure for response and WASH',
    body: 'Response, WASH and health planning need people, not polygons. Settlement layers under the hazard map turn an affected area into a number of people.',
    uses: [
      'Estimate people in drought or flood affected areas by district',
      'Plan water points and services against settlement distribution',
      'Share one operational map across agencies and partners',
    ],
    image: img('population'), imageNote: 'Settlement density (HRSL)',
  },
  {
    slug: 'automation', name: 'Data pipelines, AI and automation', line: 'The same layers through an API',
    title: 'Reference data for models, pipelines and AI agents',
    body: 'Models and automated workflows fail quietly when inputs differ from country to country. The Lenga API returns the same documented layers, in the same structure, for every country covered.',
    uses: [
      'Pull boundaries, climate and hydrology into scheduled jobs with an API key',
      'Feed district statistics to forecasting and risk models',
      'Ground AI agents and report generators in sourced spatial data',
    ],
    image: img('admin-boundaries'), imageNote: 'Administrative boundaries (geoBoundaries)',
  },
  {
    slug: 'drone-survey', name: 'Drone and field surveys', line: 'Survey data beside national layers',
    title: 'Drone and field data in national context',
    body: 'A survey is most useful when the whole team sees it against the wider landscape. Orthomosaics, elevation models and field points sit beside the national layers.',
    uses: [
      'Check survey results against land cover, rivers and boundaries',
      'Pin comments and voice notes to exact locations for the field team',
      'Keep each flight in the project history for comparison',
    ],
    image: img('contours'), imageNote: 'Contours from a DEM',
  },
]
