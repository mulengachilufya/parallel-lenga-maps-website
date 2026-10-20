"""
Shared pieces of the district-statistics pipelines (crop-production,
forest-loss, soil-fertility).

Every one of those datasets is the same shape: one GeoPackage per country,
one polygon per district (geoBoundaries ADM2), statistics as columns. This
module holds what they share:

  * the 54-country list (same canonical list as the other pipelines)
  * geoBoundaries ADM2 districts, with the ADM1 name joined on
  * a raster zonal engine that adds up area-weighted histograms per district
    (exact per-pixel areas, never "count of pixels")
  * a GeoPackage writer that stores source, licence, citation, processing
    date and the unit of every column inside the file
  * manifest.json handling, in the same style as output/Rivers

Why geoBoundaries and not GADM: GADM's licence does not allow commercial
redistribution. geoBoundaries gbOpen is CC BY 4.0 for almost every country;
the licence of each country's file is read from its own metadata and kept.
"""

from __future__ import annotations

import datetime as dt
import json
import math
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Optional

import numpy as np
import requests

ROOT      = Path(__file__).resolve().parents[2]
OUTPUT    = ROOT / "output"
CACHE_DIR = OUTPUT / ".cache"

HEADERS = {"User-Agent": "lenga-maps-gis-pipeline/1.0 (contact: lengamaps@gmail.com)"}

AFRICA = [
    ("DZA", "Algeria"), ("AGO", "Angola"), ("BEN", "Benin"), ("BWA", "Botswana"),
    ("BFA", "Burkina Faso"), ("BDI", "Burundi"), ("CPV", "Cabo Verde"),
    ("CMR", "Cameroon"), ("CAF", "Central African Republic"), ("TCD", "Chad"),
    ("COM", "Comoros"), ("COG", "Congo"), ("COD", "Democratic Republic of the Congo"),
    ("CIV", "Cote d'Ivoire"), ("DJI", "Djibouti"), ("EGY", "Egypt"),
    ("GNQ", "Equatorial Guinea"), ("ERI", "Eritrea"), ("SWZ", "Eswatini"),
    ("ETH", "Ethiopia"), ("GAB", "Gabon"), ("GMB", "Gambia"), ("GHA", "Ghana"),
    ("GIN", "Guinea"), ("GNB", "Guinea-Bissau"), ("KEN", "Kenya"), ("LSO", "Lesotho"),
    ("LBR", "Liberia"), ("LBY", "Libya"), ("MDG", "Madagascar"), ("MWI", "Malawi"),
    ("MLI", "Mali"), ("MRT", "Mauritania"), ("MUS", "Mauritius"), ("MAR", "Morocco"),
    ("MOZ", "Mozambique"), ("NAM", "Namibia"), ("NER", "Niger"), ("NGA", "Nigeria"),
    ("RWA", "Rwanda"), ("STP", "Sao Tome and Principe"), ("SEN", "Senegal"),
    ("SYC", "Seychelles"), ("SLE", "Sierra Leone"), ("SOM", "Somalia"),
    ("ZAF", "South Africa"), ("SSD", "South Sudan"), ("SDN", "Sudan"),
    ("TZA", "Tanzania"), ("TGO", "Togo"), ("TUN", "Tunisia"), ("UGA", "Uganda"),
    ("ZMB", "Zambia"), ("ZWE", "Zimbabwe"),
]
COUNTRY_NAME = dict(AFRICA)


def log(msg: str) -> None:
    print(msg, flush=True)


def targets(only: Optional[str]) -> list[tuple[str, str]]:
    if not only:
        return list(AFRICA)
    wanted = {s.strip().upper() for s in only.split(",") if s.strip()}
    unknown = wanted - set(COUNTRY_NAME)
    if unknown:
        raise SystemExit(f"Unknown ISO-3: {', '.join(sorted(unknown))}")
    return [(i, n) for (i, n) in AFRICA if i in wanted]


# ── Downloads ────────────────────────────────────────────────────────────────

def download(url: str, dest: Path, *, retries: int = 4, quiet: bool = False) -> Path:
    """Download once into the cache; later runs reuse the file."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(retries):
        try:
            if not quiet:
                log(f"  downloading {url}")
            with requests.get(url, headers=HEADERS, stream=True, timeout=600) as r:
                r.raise_for_status()
                with tmp.open("wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        f.write(chunk)
            tmp.replace(dest)
            return dest
        except requests.HTTPError as err:
            if err.response is not None and err.response.status_code == 404:
                raise
            if attempt == retries - 1:
                raise
        except requests.RequestException:
            if attempt == retries - 1:
                raise
        time.sleep(2 ** (attempt + 1))
    return dest


# ── District boundaries (geoBoundaries gbOpen) ───────────────────────────────

# geoBoundaries keeps its release files in Git LFS; media.githubusercontent.com
# serves the LFS objects directly (the API's gjDownloadURL redirects there).
GB_BASE = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen"
GB_DIR  = CACHE_DIR / "geoboundaries"


@dataclass
class Districts:
    iso3:        str
    gdf:         "object"          # GeoDataFrame, EPSG:4326
    admin_level: int               # 2 normally; 1 where gbOpen has no ADM2
    meta:        dict = field(default_factory=dict)

    @property
    def n(self) -> int:
        return len(self.gdf)


def _gb_files(iso3: str, level: str) -> tuple[Optional[Path], Optional[dict]]:
    stem = f"geoBoundaries-{iso3}-{level}"
    geo  = GB_DIR / iso3 / f"{stem}.geojson"
    meta = GB_DIR / iso3 / f"{stem}-metaData.json"
    try:
        download(f"{GB_BASE}/{iso3}/{level}/{stem}-metaData.json", meta, quiet=True)
        download(f"{GB_BASE}/{iso3}/{level}/{stem}.geojson", geo, quiet=True)
    except requests.HTTPError as err:
        if err.response is not None and err.response.status_code == 404:
            return None, None
        raise
    return geo, json.loads(meta.read_text(encoding="utf-8"))


def _clean(gdf):
    import shapely
    geoms = shapely.make_valid(gdf.geometry.values)
    # make_valid can return collections with stray lines/points; keep area.
    out = []
    for g in geoms:
        if g is None or g.is_empty:
            out.append(None)
            continue
        if g.geom_type == "GeometryCollection":
            polys = [p for p in g.geoms if p.geom_type in ("Polygon", "MultiPolygon")]
            g = shapely.union_all(polys) if polys else None
        out.append(g)
    gdf = gdf.set_geometry(out, crs=gdf.crs)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    gdf["geometry"] = [shapely.multipolygons(shapely.get_parts(g)) if g.geom_type == "Polygon" else g
                       for g in gdf.geometry]
    return gdf


def load_districts(iso3: str) -> Districts:
    """ADM2 districts with shapeID, shapeName and the ADM1 name."""
    import geopandas as gpd

    geo2, meta2 = _gb_files(iso3, "ADM2")
    geo1, meta1 = _gb_files(iso3, "ADM1")
    if geo1 is None:
        raise RuntimeError(f"{iso3}: geoBoundaries has no ADM1 file")

    adm1 = _clean(gpd.read_file(geo1).to_crs(4326))
    if geo2 is None:
        # A few small states (islands mostly) have no ADM2 in gbOpen. Their
        # first-level units are the districts, flagged by admin_level = 1.
        d = adm1[["shapeID", "shapeName", "geometry"]].copy()
        d["adm1_name"] = d["shapeName"]
        level, meta = 1, meta1
    else:
        d = _clean(gpd.read_file(geo2).to_crs(4326))[["shapeID", "shapeName", "geometry"]].copy()
        d["adm1_name"] = _adm1_for(d, adm1)
        level, meta = 2, meta2

    d = d.reset_index(drop=True)
    d["shapeName"] = d["shapeName"].fillna("").astype(str)
    d.insert(0, "iso3", iso3)
    d["admin_level"] = level
    d = d[["shapeID", "shapeName", "adm1_name", "iso3", "admin_level", "geometry"]]
    return Districts(iso3=iso3, gdf=d, admin_level=level, meta={
        "boundary_source":  f"geoBoundaries gbOpen {meta.get('boundaryType', '')} ({meta.get('boundarySource', '')})".strip(),
        "boundary_id":      meta.get("boundaryID"),
        "boundary_year":    meta.get("boundaryYear"),
        "boundary_license": meta.get("boundaryLicense"),
        "boundary_build":   meta.get("buildDate"),
    })


def _adm1_for(adm2, adm1) -> list[Optional[str]]:
    """ADM1 name for each ADM2: the ADM1 that holds most of its area."""
    import geopandas as gpd
    a2 = adm2[["geometry"]].reset_index(names="i2").to_crs(6933)
    a1 = adm1[["shapeName", "geometry"]].rename(columns={"shapeName": "adm1"}).to_crs(6933)
    hits = gpd.sjoin(a2, a1, how="left", predicate="intersects")
    names: list[Optional[str]] = [None] * len(adm2)
    for i2, grp in hits.groupby("i2"):
        grp = grp.dropna(subset=["adm1"])
        if grp.empty:
            continue
        if len(grp) == 1:
            names[i2] = grp["adm1"].iloc[0]
            continue
        g = a2.geometry.iloc[i2]
        best = max(grp.itertuples(), key=lambda r: g.intersection(a1.geometry.loc[r.index_right]).area)
        names[i2] = best.adm1
    # Anything still unmatched (slivers off the coast): nearest ADM1.
    missing = [i for i, v in enumerate(names) if v is None]
    if missing:
        near = gpd.sjoin_nearest(a2.iloc[missing], a1, how="left")
        for row in near.itertuples():
            names[row.i2] = row.adm1
    return names


SIMPLIFY_DEG = 0.0005   # ~50 m: invisible on a district map, files several times smaller


def output_geometry(gdf):
    """
    Lighter copy of the district outlines for the delivered file. Shared
    borders are simplified once (coverage simplification), so neighbouring
    districts still meet exactly with no gaps or slivers. Statistics are
    always computed on the full-detail outlines, never on these.
    """
    import shapely
    out = gdf.copy()
    try:
        simple = shapely.coverage_simplify(np.asarray(gdf.geometry.values), SIMPLIFY_DEG)
    except Exception:
        simple = shapely.simplify(np.asarray(gdf.geometry.values), SIMPLIFY_DEG, preserve_topology=True)
    simple = shapely.make_valid(simple)
    fixed = []
    for orig, s in zip(gdf.geometry.values, simple):
        if s is None or s.is_empty or s.geom_type not in ("Polygon", "MultiPolygon"):
            s = orig       # tiny islands can vanish; keep the original then
        fixed.append(shapely.multipolygons(shapely.get_parts(s)) if s.geom_type == "Polygon" else s)
    out["geometry"] = fixed
    return out


# ── Pixel areas ──────────────────────────────────────────────────────────────

_A  = 6378137.0
_F  = 1 / 298.257223563
_E2 = _F * (2 - _F)
_E  = math.sqrt(_E2)


def _q(phi: np.ndarray) -> np.ndarray:
    s = np.sin(phi)
    return s / (1 - _E2 * s * s) + (1 / (2 * _E)) * np.log((1 - _E * s) / (1 + _E * s)) * -1


def latlon_cell_area_ha(lat_top: np.ndarray, lat_bottom: np.ndarray, dlon_deg: float) -> np.ndarray:
    """Exact area (ha) on the WGS84 ellipsoid of lat/lon cells."""
    p1, p2 = np.radians(lat_bottom), np.radians(lat_top)
    area_m2 = (_A * _A * (1 - _E2) * math.radians(dlon_deg) / 2) * (_q(p2) - _q(p1))
    return np.abs(area_m2) / 10_000.0


def row_areas_ha(transform, row0: int, nrows: int, crs) -> np.ndarray:
    """Area (ha) of one pixel in each row of a north-up raster window."""
    rows = np.arange(row0, row0 + nrows, dtype=np.float64)
    top    = transform.f + rows * transform.e
    bottom = top + transform.e
    if crs is None or crs.is_geographic:
        return latlon_cell_area_ha(top, bottom, abs(transform.a))
    epsg = crs.to_epsg()
    if epsg in (3857, 900913):
        # Spherical Mercator: ground size = map size × cos(latitude).
        y   = (top + bottom) / 2
        lat = np.degrees(2 * np.arctan(np.exp(y / _A)) - math.pi / 2)
        return abs(transform.a * transform.e) * np.cos(np.radians(lat)) ** 2 / 10_000.0
    if crs.is_projected and crs.linear_units in ("metre", "meter"):
        return np.full(nrows, abs(transform.a * transform.e) / 10_000.0)
    raise ValueError(f"Unsupported raster CRS for pixel areas: {crs}")


# ── Zonal engine ─────────────────────────────────────────────────────────────

class ZonalHist:
    """
    Area-weighted histograms per district: hist[d, code] = hectares of
    district d whose pixel value is `code`. Pixels are assigned to the
    district that contains their centre (at 30 m this differs from exact
    partial-cell weighting by far less than the source data's own error).

    Every statistic the pipelines need (sums, means after back-transform,
    percentiles, modal class) is exact from these histograms, because the
    rasters are integer coded.
    """

    def __init__(self, n_districts: int, n_codes: int):
        self.n  = n_districts
        self.k  = n_codes
        self.h  = np.zeros((n_districts + 1, n_codes), dtype=np.float64)   # row 0 = outside

    def add(self, ids: np.ndarray, codes: np.ndarray, row_area_ha: np.ndarray,
            valid: Optional[np.ndarray] = None) -> None:
        w = np.broadcast_to(row_area_ha[:, None], ids.shape)
        m = ids > 0
        if valid is not None:
            m &= valid
        if not m.any():
            return
        flat = ids[m].astype(np.int64) * self.k + codes[m].astype(np.int64)
        self.h += np.bincount(flat, weights=w[m], minlength=(self.n + 1) * self.k).reshape(self.n + 1, self.k)

    def districts(self) -> np.ndarray:
        return self.h[1:]


@dataclass
class Tile:
    """
    One unit of raster work: rasters that share a grid (e.g. a Hansen tile's
    treecover2000 + lossyear), optionally limited to a lon/lat box (used to
    split one continent-wide COG into pieces that run in parallel).
    `downloads` are (url, local path) pairs fetched first (a 404 means the
    source has no such tile, e.g. open ocean, and the tile is skipped);
    `cleanup` deletes them afterwards so disk use stays bounded.
    """
    key:       str
    paths:     list[str] = field(default_factory=list)
    downloads: list[tuple[str, str]] = field(default_factory=list)
    bbox:      Optional[tuple[float, float, float, float]] = None
    cleanup:   bool = False


def _fetch(tile: Tile) -> list[str]:
    if not tile.downloads:
        return tile.paths
    out = []
    for url, dest in tile.downloads:
        try:
            out.append(str(download(url, Path(dest), quiet=True)))
        except requests.HTTPError as err:
            if err.response is not None and err.response.status_code == 404:
                return []
            raise
    return out


# Per-process state for the worker pool (district geometries are sent once).
_W: dict = {}


def _init_worker(districts: dict, n_codes: list[int], to_codes, block: int, env: dict):
    _W.update(districts=districts, n_codes=n_codes, to_codes=to_codes, block=block, env=env, crs_cache={})


def _geoms_in(crs) -> dict:
    """District geometries of every country, reprojected to `crs` once."""
    import geopandas as gpd
    import shapely
    key = crs.to_string() if crs else "EPSG:4326"
    hit = _W["crs_cache"].get(key)
    if hit is None:
        hit = {}
        for iso3, geoms in _W["districts"].items():
            g = gpd.GeoSeries(geoms, crs=4326)
            if crs is not None and not crs.equals("EPSG:4326"):
                g = g.to_crs(crs)
            arr = np.asarray(g.values)
            hit[iso3] = (arr, shapely.STRtree(arr), shapely.total_bounds(arr))
        _W["crs_cache"][key] = hit
    return hit


def _run_tile(tile: Tile) -> tuple[str, dict]:
    import rasterio
    from rasterio.features import rasterize
    from rasterio.windows import Window, from_bounds
    from rasterio.warp import transform_bounds
    import shapely

    paths = _fetch(tile)
    out: dict[str, list[np.ndarray]] = {}
    if not paths:          # e.g. an all-ocean tile the source does not publish
        return tile.key, {}
    block = _W["block"]
    with rasterio.Env(**_W["env"]):
        srcs = [rasterio.open(p) for p in paths]
        try:
            src = srcs[0]
            geoms = _geoms_in(src.crs)
            full = Window(0, 0, src.width, src.height)
            # Work area: union of the country boxes inside this tile (and bbox).
            boxes = [b for (_, _, b) in geoms.values()]
            minx = min(b[0] for b in boxes); miny = min(b[1] for b in boxes)
            maxx = max(b[2] for b in boxes); maxy = max(b[3] for b in boxes)
            if tile.bbox is not None:
                bx = transform_bounds("EPSG:4326", src.crs, *tile.bbox) if src.crs and not src.crs.is_geographic else tile.bbox
                minx, miny = max(minx, bx[0]), max(miny, bx[1])
                maxx, maxy = min(maxx, bx[2]), min(maxy, bx[3])
            if minx >= maxx or miny >= maxy:
                return tile.key, out
            try:
                f = from_bounds(minx, miny, maxx, maxy, transform=src.transform)
                c0_, r0_ = math.floor(f.col_off), math.floor(f.row_off)
                win = Window(c0_, r0_, math.ceil(f.col_off + f.width) - c0_,
                             math.ceil(f.row_off + f.height) - r0_).intersection(full)
            except rasterio.errors.WindowError:
                return tile.key, out
            r_end, c_end = int(win.row_off + win.height), int(win.col_off + win.width)
            for r0 in range(int(win.row_off), r_end, block):
                for c0 in range(int(win.col_off), c_end, block):
                    w = Window(c0, r0, min(block, c_end - c0), min(block, r_end - r0))
                    wbox = shapely.box(*rasterio.windows.bounds(w, src.transform))
                    wt = rasterio.windows.transform(w, src.transform)
                    hits = []
                    for iso3, (arr, tree, _) in geoms.items():
                        idx = tree.query(wbox)
                        if len(idx) == 0:
                            continue
                        ids = rasterize(((arr[i], int(i) + 1) for i in idx),
                                        out_shape=(int(w.height), int(w.width)),
                                        transform=wt, fill=0, dtype="int32")
                        if ids.any():
                            hits.append((iso3, ids))
                    if not hits:
                        continue
                    arrays = [s.read(1, window=w) for s in srcs]
                    areas = row_areas_ha(src.transform, r0, int(w.height), src.crs)
                    coded = _W["to_codes"](arrays)
                    for iso3, ids in hits:
                        hs = out.get(iso3)
                        if hs is None:
                            n = len(geoms[iso3][0])
                            hs = out[iso3] = [ZonalHist(n, k) for k in _W["n_codes"]]
                        for h, (codes, valid) in zip(hs, coded):
                            h.add(ids, codes, areas, valid)
        finally:
            for s in srcs:
                s.close()
            if tile.cleanup:
                for p in paths:
                    Path(p).unlink(missing_ok=True)
    return tile.key, {iso3: [h.h for h in hs] for iso3, hs in out.items()}


def zonal_tiles(tiles: list[Tile], districts: dict[str, list], n_codes: list[int], to_codes,
                *, checkpoint: Path, block: int = 4096, workers: int = 1,
                env: Optional[dict] = None) -> dict[str, list[np.ndarray]]:
    """
    Area-weighted histograms per district for every country, over a set of
    tiles. `to_codes(arrays) -> [(codes, valid), ...]` turns the tile's pixel
    arrays into one integer code array per output histogram (n_codes[i]
    codes each). Countries are rasterised separately, so a disputed area
    that two countries both claim counts fully for each of them.

    Progress is saved after every tile (checkpoint .npz + .json), so a run
    that stops can be restarted and skips the tiles already done.
    """
    env = env or {}
    done: set[str] = set()
    totals: dict[str, list[np.ndarray]] = {}
    ck_json, ck_npz = checkpoint.with_suffix(".json"), checkpoint.with_suffix(".npz")
    if ck_json.exists() and ck_npz.exists():
        state = json.loads(ck_json.read_text())
        if state.get("countries") == sorted(districts) and state.get("n_codes") == n_codes:
            done = set(state["done"])
            z = np.load(ck_npz)
            for name in z.files:
                iso3, i = name.rsplit("_", 1)
                totals.setdefault(iso3, [None] * len(n_codes))[int(i)] = z[name]
            log(f"  resuming: {len(done)} of {len(tiles)} tiles already done")

    def save():
        checkpoint.parent.mkdir(parents=True, exist_ok=True)
        arrays = {f"{iso3}_{i}": a for iso3, hs in totals.items() for i, a in enumerate(hs) if a is not None}
        np.savez(ck_npz, **arrays)
        ck_json.write_text(json.dumps({"countries": sorted(districts), "n_codes": n_codes, "done": sorted(done)}))

    def merge(key, part):
        for iso3, hs in part.items():
            cur = totals.setdefault(iso3, [None] * len(n_codes))
            for i, h in enumerate(hs):
                cur[i] = h if cur[i] is None else cur[i] + h
        done.add(key)
        save()

    todo = [t for t in tiles if t.key not in done]
    t0 = time.time()
    if workers <= 1:
        _init_worker(districts, n_codes, to_codes, block, env)
        for k, t in enumerate(todo, 1):
            merge(*_run_tile(t))
            log(f"  tile {k}/{len(todo)} {t.key} done ({time.time() - t0:.0f}s)")
    else:
        from concurrent.futures import ProcessPoolExecutor, as_completed
        import multiprocessing as mp
        with ProcessPoolExecutor(workers, mp_context=mp.get_context("fork"), initializer=_init_worker,
                                 initargs=(districts, n_codes, to_codes, block, env)) as pool:
            futs = {pool.submit(_run_tile, t): t for t in todo}
            for k, f in enumerate(as_completed(futs), 1):
                merge(*f.result())
                log(f"  tile {k}/{len(todo)} {futs[f].key} done ({time.time() - t0:.0f}s)")

    # Countries no tile touched still get (empty) histograms.
    for iso3, geoms in districts.items():
        cur = totals.setdefault(iso3, [None] * len(n_codes))
        for i, k in enumerate(n_codes):
            if cur[i] is None:
                cur[i] = np.zeros((len(geoms) + 1, k))
    return totals


# ── Histogram statistics ─────────────────────────────────────────────────────

def hist_mean(h: np.ndarray, values: np.ndarray) -> np.ndarray:
    """Area-weighted mean of value[code] per row; NaN where no area."""
    tot = h.sum(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(tot > 0, (h * values[None, :]).sum(axis=1) / tot, np.nan)


def hist_percentile(h: np.ndarray, values: np.ndarray, q: float) -> np.ndarray:
    """Area-weighted q-quantile (0..1) per row, on values sorted by code."""
    order = np.argsort(values, kind="stable")
    hs, vs = h[:, order], values[order]
    cum = np.cumsum(hs, axis=1)
    tot = cum[:, -1]
    out = np.full(h.shape[0], np.nan)
    for i in np.nonzero(tot > 0)[0]:
        out[i] = vs[np.searchsorted(cum[i], q * tot[i], side="left")]
    return out


def hist_mode(h: np.ndarray) -> np.ndarray:
    """Most common code per row (by area); -1 where no area."""
    out = h.argmax(axis=1)
    out[h.sum(axis=1) <= 0] = -1
    return out


# ── GeoPackage output ────────────────────────────────────────────────────────

@dataclass
class Column:
    name:        str
    unit:        str
    description: str


def write_gpkg(path: Path, layer: str, gdf, columns: list[Column], dataset_meta: dict,
               attribute_tables: Optional[dict[str, tuple["object", list[Column]]]] = None) -> None:
    """
    Write one feature layer (plus optional attribute-only tables) and store
    the metadata inside the file:
      * gpkg_contents.description  — one-line summary QGIS shows
      * gpkg_data_columns          — title + "unit: …" description per column
                                     (GDAL/QGIS read these as field aliases/comments)
      * gpkg_metadata              — the full JSON record (source, version,
                                     licence, citation, processing date, units)
    """
    import pyogrio

    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    pyogrio.write_dataframe(output_geometry(gdf), path, layer=layer, driver="GPKG",
                            layer_options={"GEOMETRY_NAME": "geom", "FID": "fid", "SPATIAL_INDEX": "YES"})

    con = sqlite3.connect(path)
    try:
        cur = con.cursor()
        tables = {layer: columns}
        for tname, (df, cols) in (attribute_tables or {}).items():
            _write_attribute_table(cur, tname, df, cols)
            tables[tname] = cols

        cur.execute("UPDATE gpkg_contents SET description = ?, identifier = ? WHERE table_name = ?",
                    (dataset_meta.get("summary", ""), dataset_meta.get("title", layer), layer))

        cur.executescript("""
          CREATE TABLE IF NOT EXISTS gpkg_extensions (
            table_name TEXT, column_name TEXT, extension_name TEXT NOT NULL,
            definition TEXT NOT NULL, scope TEXT NOT NULL,
            CONSTRAINT ge_tce UNIQUE (table_name, column_name, extension_name));
          CREATE TABLE IF NOT EXISTS gpkg_data_columns (
            table_name TEXT NOT NULL, column_name TEXT NOT NULL, name TEXT, title TEXT,
            description TEXT, mime_type TEXT, constraint_name TEXT,
            CONSTRAINT pk_gdc PRIMARY KEY (table_name, column_name),
            CONSTRAINT gdc_tn UNIQUE (table_name, name));
          CREATE TABLE IF NOT EXISTS gpkg_metadata (
            id INTEGER CONSTRAINT m_pk PRIMARY KEY ASC NOT NULL,
            md_scope TEXT NOT NULL DEFAULT 'dataset',
            md_standard_uri TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'text/xml',
            metadata TEXT NOT NULL DEFAULT '');
          CREATE TABLE IF NOT EXISTS gpkg_metadata_reference (
            reference_scope TEXT NOT NULL, table_name TEXT, column_name TEXT, row_id_value INTEGER,
            timestamp DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            md_file_id INTEGER NOT NULL, md_parent_id INTEGER,
            CONSTRAINT crmr_mfi_fk FOREIGN KEY (md_file_id) REFERENCES gpkg_metadata(id),
            CONSTRAINT crmr_mpi_fk FOREIGN KEY (md_parent_id) REFERENCES gpkg_metadata(id));
        """)
        for tname, ext, defn in [
            ("gpkg_data_columns", "gpkg_schema", "http://www.geopackage.org/spec/#extension_schema"),
            ("gpkg_metadata", "gpkg_metadata", "http://www.geopackage.org/spec/#extension_metadata"),
            ("gpkg_metadata_reference", "gpkg_metadata", "http://www.geopackage.org/spec/#extension_metadata"),
        ]:
            cur.execute("INSERT OR IGNORE INTO gpkg_extensions VALUES (?, NULL, ?, ?, 'read-write')", (tname, ext, defn))

        for tname, cols in tables.items():
            for c in cols:
                desc = f"{c.description} (unit: {c.unit})" if c.unit else c.description
                cur.execute("INSERT OR REPLACE INTO gpkg_data_columns (table_name, column_name, name, title, description) "
                            "VALUES (?, ?, ?, ?, ?)", (tname, c.name, c.name, c.name, desc))

        record = dict(dataset_meta)
        record["columns"] = {t: {c.name: {"unit": c.unit, "description": c.description} for c in cols}
                             for t, cols in tables.items()}
        cur.execute("INSERT INTO gpkg_metadata (md_scope, md_standard_uri, mime_type, metadata) VALUES "
                    "('dataset', 'https://lengamaps.com/metadata/district-stats/v1', 'application/json', ?)",
                    (json.dumps(record, indent=2, ensure_ascii=False),))
        md_id = cur.lastrowid
        cur.execute("INSERT INTO gpkg_metadata_reference (reference_scope, table_name, md_file_id) "
                    "VALUES ('table', ?, ?)", (layer, md_id))
        con.commit()
    finally:
        con.close()


def _write_attribute_table(cur, name: str, df, cols: list[Column]) -> None:
    import pandas as pd
    sqltype = {"i": "INTEGER", "u": "INTEGER", "f": "DOUBLE", "b": "BOOLEAN"}
    defs = []
    for col in df.columns:
        kind = df[col].dtype.kind
        defs.append(f'"{col}" {sqltype.get(kind, "TEXT")}')
    cur.execute(f'CREATE TABLE "{name}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, {", ".join(defs)})')
    placeholders = ", ".join("?" for _ in df.columns)
    rows = [tuple(None if (isinstance(v, float) and math.isnan(v)) or v is pd.NA else
                  (v.item() if hasattr(v, "item") else v) for v in r)
            for r in df.itertuples(index=False, name=None)]
    cur.executemany(f'INSERT INTO "{name}" ({", ".join(chr(34) + c + chr(34) for c in df.columns)}) VALUES ({placeholders})', rows)
    cur.execute("INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change) "
                "VALUES (?, 'attributes', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
                (name, name, ""))


# ── Manifest ─────────────────────────────────────────────────────────────────

class Manifest:
    """output/<Folder>/manifest.json: one entry per country, same style as Rivers."""

    def __init__(self, folder: Path):
        self.path = folder / "manifest.json"
        self.rows: dict[str, dict] = {}
        if self.path.exists():
            try:
                self.rows = {m["iso3"]: m for m in json.loads(self.path.read_text())}
            except Exception:
                self.rows = {}

    def put(self, entry: dict) -> None:
        self.rows[entry["iso3"]] = entry
        ordered = [self.rows[i] for i, _ in AFRICA if i in self.rows]
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(ordered, indent=2, ensure_ascii=False))


def today() -> str:
    return dt.date.today().isoformat()


def size_mb(p: Path) -> float:
    return round(p.stat().st_size / 1_048_576, 2)


def run_countries(name: str, only: Optional[str], fn: Callable[[str, str], Optional[dict]],
                  manifest: Manifest) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ok, failed = 0, []
    for iso3, country in targets(only):
        log(f"\n{country} ({iso3})")
        t0 = time.time()
        try:
            entry = fn(iso3, country)
        except Exception as err:  # keep going; the summary lists failures
            log(f"  [{iso3}] FAILED: {type(err).__name__}: {err}")
            failed.append(iso3)
            continue
        if entry:
            manifest.put(entry)
            ok += 1
            log(f"  ✓ {entry['filename']} · {entry['district_count']} districts · "
                f"{entry['file_size_mb']} MB · {time.time() - t0:.0f}s")
    log(f"\n{name}: {ok} packaged, {len(failed)} failed{': ' + ', '.join(failed) if failed else ''}")
    return 1 if failed else 0
