// src/lib/workspace/africa.ts
//
// ISO 3166 alpha-2 → alpha-3 for the 54 African countries, so a place picked
// on the map (OpenStreetMap / Nominatim returns alpha-2) can be matched to
// Lenga dataset files (keyed by alpha-3).

export const AFRICA_ISO2_TO_ISO3: Record<string, string> = {
  dz: 'DZA', ao: 'AGO', bj: 'BEN', bw: 'BWA', bf: 'BFA', bi: 'BDI', cv: 'CPV', cm: 'CMR',
  cf: 'CAF', td: 'TCD', km: 'COM', cg: 'COG', cd: 'COD', ci: 'CIV', dj: 'DJI', eg: 'EGY',
  gq: 'GNQ', er: 'ERI', sz: 'SWZ', et: 'ETH', ga: 'GAB', gm: 'GMB', gh: 'GHA', gn: 'GIN',
  gw: 'GNB', ke: 'KEN', ls: 'LSO', lr: 'LBR', ly: 'LBY', mg: 'MDG', mw: 'MWI', ml: 'MLI',
  mr: 'MRT', mu: 'MUS', ma: 'MAR', mz: 'MOZ', na: 'NAM', ne: 'NER', ng: 'NGA', rw: 'RWA',
  st: 'STP', sn: 'SEN', sc: 'SYC', sl: 'SLE', so: 'SOM', za: 'ZAF', ss: 'SSD', sd: 'SDN',
  tz: 'TZA', tg: 'TGO', tn: 'TUN', ug: 'UGA', zm: 'ZMB', zw: 'ZWE', eh: 'ESH',
}

export const AFRICA_ISO2 = Object.keys(AFRICA_ISO2_TO_ISO3)
