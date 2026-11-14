/**
 * Minimal OGC API - Features client for the two New Mexico Water Data
 * services. Both are pygeoapi deployments that serve GeoJSON, cap pages at
 * 10,000 features, and allow cross-origin requests from the browser.
 */

export type OgcSourceId = 'ocotillo' | 'weaver';

export type OgcSource = {
  id: OgcSourceId;
  label: string;
  description: string;
  baseUrl: string;
};

export const OGC_SOURCES: OgcSource[] = [
  {
    id: 'weaver',
    label: 'Weaver',
    description: 'NM Unified Water Data: statewide summaries from many agencies',
    baseUrl: 'https://weaver-api.newmexicowaterdata.org',
  },
  {
    id: 'ocotillo',
    label: 'Ocotillo',
    description: 'NMBGMR wells, springs, chemistry and geothermal data',
    baseUrl: 'https://ocotillo-api.newmexicowaterdata.org/ogcapi',
  },
];

export type OgcCollection = {
  sourceId: OgcSourceId;
  id: string;
  title: string;
  description?: string;
};

/** Largest page the servers will return. */
const PAGE_SIZE = 10_000;
const CONCURRENCY = 4;

export function getSource(id: OgcSourceId): OgcSource {
  const source = OGC_SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`Unknown source ${id}`);
  return source;
}

/** DuckDB table name for a collection, e.g. `weaver_nm_tds_summary`. */
export function tableNameFor(sourceId: OgcSourceId, collectionId: string) {
  const id = collectionId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  // Weaver ids already start with `nm_`; keep names short but unambiguous.
  return `${sourceId}_${id}`;
}

async function getJson(url: string, signal?: AbortSignal) {
  const res = await fetch(url, {signal, headers: {Accept: 'application/json'}});
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.description ?? '';
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

export async function fetchCollections(
  sourceId: OgcSourceId,
  signal?: AbortSignal,
): Promise<OgcCollection[]> {
  const {baseUrl} = getSource(sourceId);
  const body = await getJson(`${baseUrl}/collections?f=json`, signal);
  return (body.collections ?? [])
    .filter((c: any) => !c.itemType || c.itemType === 'feature')
    .map((c: any) => ({
      sourceId,
      id: c.id,
      title: c.title ?? c.id,
      description: c.description,
    }));
}

type Feature = {
  id?: string | number;
  geometry: {type: string; coordinates?: unknown} | null;
  properties: Record<string, unknown> | null;
};

export type FetchProgress = {loaded: number; total: number | null};

/**
 * Fetch up to `maxFeatures` features from a collection. When the server
 * reports `numberMatched`, the remaining pages are fetched in parallel;
 * otherwise `next` links are followed one at a time.
 */
export async function fetchFeatures(
  sourceId: OgcSourceId,
  collectionId: string,
  opts: {
    maxFeatures: number;
    onProgress?: (p: FetchProgress) => void;
    signal?: AbortSignal;
  },
): Promise<{features: Feature[]; numberMatched: number | null}> {
  const {baseUrl} = getSource(sourceId);
  const {maxFeatures, onProgress, signal} = opts;
  const itemsUrl = (offset: number, limit: number) =>
    `${baseUrl}/collections/${encodeURIComponent(collectionId)}/items?f=json&offset=${offset}&limit=${limit}`;

  const firstLimit = Math.min(PAGE_SIZE, maxFeatures);
  const first = await getJson(itemsUrl(0, firstLimit), signal);
  const features: Feature[] = [...(first.features ?? [])];
  const numberMatched: number | null =
    typeof first.numberMatched === 'number' ? first.numberMatched : null;
  const target =
    numberMatched === null ? maxFeatures : Math.min(numberMatched, maxFeatures);
  onProgress?.({loaded: features.length, total: numberMatched === null ? null : target});

  if (features.length < firstLimit || features.length >= target) {
    return {features: features.slice(0, target), numberMatched};
  }

  if (numberMatched !== null) {
    const offsets: number[] = [];
    for (let o = features.length; o < target; o += PAGE_SIZE) offsets.push(o);
    const pages: Feature[][] = new Array(offsets.length);
    let next = 0;
    let loaded = features.length;
    const worker = async () => {
      while (next < offsets.length) {
        const i = next++;
        const offset = offsets[i];
        const limit = Math.min(PAGE_SIZE, target - offset);
        const page = await getJson(itemsUrl(offset, limit), signal);
        pages[i] = page.features ?? [];
        loaded += pages[i].length;
        onProgress?.({loaded, total: target});
      }
    };
    await Promise.all(
      Array.from({length: Math.min(CONCURRENCY, offsets.length)}, worker),
    );
    for (const page of pages) features.push(...page);
    return {features: features.slice(0, target), numberMatched};
  }

  // Unknown total: follow `next` links.
  let nextLink = (first.links ?? []).find((l: any) => l.rel === 'next')?.href;
  while (nextLink && features.length < target) {
    const page = await getJson(nextLink, signal);
    features.push(...(page.features ?? []));
    onProgress?.({loaded: features.length, total: null});
    if (!page.features?.length) break;
    nextLink = (page.links ?? []).find((l: any) => l.rel === 'next')?.href;
  }
  return {features: features.slice(0, target), numberMatched};
}

/**
 * Flatten features into newline-delimited JSON rows that DuckDB's
 * `read_json` can ingest. Points get `longitude`/`latitude` columns so Kepler
 * builds point layers automatically; other geometries are kept as a GeoJSON
 * string in `_geojson`, which Kepler turns into a GeoJSON layer.
 */
export function featuresToNdjson(features: Feature[]): string {
  const lines: string[] = new Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const row: Record<string, unknown> = {};
    if (f.properties) {
      for (const [k, v] of Object.entries(f.properties)) {
        // Nested values become strings; Kepler can't use STRUCT/LIST columns.
        row[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      }
    }
    if (row.id === undefined && f.id !== undefined) row.id = f.id;
    const g = f.geometry;
    if (g?.type === 'Point' && Array.isArray(g.coordinates)) {
      delete row.bbox; // Weaver repeats the point as a bbox; it's noise here
      row.longitude = g.coordinates[0];
      row.latitude = g.coordinates[1];
    } else if (g) {
      row._geojson = JSON.stringify(g);
    }
    lines[i] = JSON.stringify(row);
  }
  return lines.join('\n');
}
