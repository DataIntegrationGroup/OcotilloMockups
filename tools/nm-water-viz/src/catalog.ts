import {addLayer, fitBounds} from '@kepler.gl/actions';
import {toast} from '@sqlrooms/ui';
import {
  featuresToNdjson,
  fetchCollections,
  fetchFeatures,
  getSource,
  OGC_SOURCES,
  tableNameFor,
  type OgcCollection,
  type OgcSourceId,
} from './ogc';
import {getCurrentKeplerMapArtifactId, type RoomState} from './store';

export type CollectionListState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: OgcCollection[];
  error?: string;
};

export type TableLoadState = {
  sourceId: OgcSourceId;
  collectionId: string;
  status: 'loading' | 'ready' | 'error';
  loaded: number;
  total: number | null;
  /** Total features the server has, when it reports it. */
  numberMatched?: number | null;
  rowCount?: number;
  error?: string;
};

export type CatalogSliceState = {
  catalog: {
    collections: Record<OgcSourceId, CollectionListState>;
    /** Keyed by DuckDB table name. */
    loads: Record<string, TableLoadState>;
    maxFeatures: number;
    setMaxFeatures: (n: number) => void;
    fetchCatalog: () => Promise<void>;
    loadCollection: (
      sourceId: OgcSourceId,
      collectionId: string,
      opts?: {layer?: SavedLayerConfig},
    ) => Promise<string | undefined>;
  };
};

export const DEFAULT_MAX_FEATURES = 50_000;

/** [minLng, minLat, maxLng, maxLat] for New Mexico. */
const NM_BOUNDS: [number, number, number, number] = [-109.05, 31.33, -103.0, 37.0];

/** A Kepler layer in its saved (v1) JSON form, as accepted by `addLayer`. */
export type SavedLayerConfig = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  visualChannels?: Record<string, unknown>;
};

/** Layers added when the app starts, bottom to top. */
export const DEFAULT_LAYERS: {
  sourceId: OgcSourceId;
  collectionId: string;
  layer?: SavedLayerConfig;
}[] = [
  {
    sourceId: 'weaver',
    collectionId: 'nm_well_density_by_county',
    layer: {
      id: 'county-well-density',
      type: 'geojson',
      config: {
        dataId: tableNameFor('weaver', 'nm_well_density_by_county'),
        label: 'Water-level wells per km² by county (Weaver)',
        columns: {geojson: '_geojson'},
        isVisible: true,
        visConfig: {opacity: 0.35, filled: true, stroked: true, thickness: 0.5},
      },
      visualChannels: {
        colorField: {name: 'wells_per_sq_km', type: 'real'},
        colorScale: 'quantile',
      },
    },
  },
  {
    sourceId: 'weaver',
    collectionId: 'nm_waterlevel_trends',
    layer: {
      id: 'waterlevel-trends',
      type: 'point',
      config: {
        dataId: tableNameFor('weaver', 'nm_waterlevel_trends'),
        label: 'Water level trends (Weaver)',
        columnMode: 'points',
        columns: {lat: 'latitude', lng: 'longitude'},
        isVisible: true,
        visConfig: {radius: 3, opacity: 0.85},
      },
      visualChannels: {
        colorField: {name: 'trend_category', type: 'string'},
        colorScale: 'ordinal',
      },
    },
  },
];

type SetState = (fn: (state: RoomState) => Partial<RoomState>) => void;
type GetState = () => RoomState;

type Connector = Awaited<ReturnType<RoomState['db']['getConnector']>>;

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Drop columns that are null in every row and return the remaining column
 * names. Empty columns carry no information, and Kepler misreads them as
 * geometry.
 */
async function dropEmptyColumns(connector: Connector, tableName: string) {
  const describe = await connector.query(`DESCRIBE ${quoteIdent(tableName)}`)
    .result;
  const columns: string[] = describe
    .toArray()
    .map((r: any) => String(r.toJSON().column_name));
  const counts = (
    await connector.query(
      `SELECT ${columns
        .map((c, i) => `count(${quoteIdent(c)}) AS c${i}`)
        .join(', ')} FROM ${quoteIdent(tableName)}`,
    ).result
  )
    .toArray()[0]
    .toJSON();
  const empty = columns.filter((_, i) => Number(counts[`c${i}`]) === 0);
  for (const c of empty) {
    await connector.query(
      `ALTER TABLE ${quoteIdent(tableName)} DROP COLUMN ${quoteIdent(c)}`,
    ).result;
  }
  return columns.filter((c) => !empty.includes(c));
}

function defaultLayersFor(
  tableName: string,
  label: string,
  columns: string[],
): SavedLayerConfig[] {
  const layers: SavedLayerConfig[] = [];
  if (columns.includes('_geojson')) {
    layers.push({
      id: `${tableName}-shapes`,
      type: 'geojson',
      config: {
        dataId: tableName,
        label,
        columns: {geojson: '_geojson'},
        isVisible: true,
        visConfig: {opacity: 0.4, filled: true, stroked: true, thickness: 0.5},
      },
    });
  }
  if (columns.includes('latitude') && columns.includes('longitude')) {
    layers.push({
      id: `${tableName}-points`,
      type: 'point',
      config: {
        dataId: tableName,
        label,
        columnMode: 'points',
        columns: {lat: 'latitude', lng: 'longitude'},
        isVisible: true,
        visConfig: {radius: 3, opacity: 0.8},
      },
    });
  }
  return layers;
}

async function waitFor(check: () => boolean, timeoutMs = 15_000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

export function createCatalogSlice() {
  return (set: SetState, get: GetState, _store: unknown): CatalogSliceState => {
    const updateCatalog = (
      fn: (c: CatalogSliceState['catalog']) => Partial<CatalogSliceState['catalog']>,
    ) => set((s) => ({catalog: {...s.catalog, ...fn(s.catalog)}}));

    const updateLoad = (tableName: string, patch: Partial<TableLoadState>) =>
      updateCatalog((c) => ({
        loads: {
          ...c.loads,
          [tableName]: {...c.loads[tableName], ...patch} as TableLoadState,
        },
      }));

    return {
      catalog: {
        collections: Object.fromEntries(
          OGC_SOURCES.map((s) => [s.id, {status: 'idle', items: []}]),
        ) as unknown as Record<OgcSourceId, CollectionListState>,
        loads: {},
        maxFeatures: DEFAULT_MAX_FEATURES,

        setMaxFeatures: (n) => updateCatalog(() => ({maxFeatures: n})),

        fetchCatalog: async () => {
          await Promise.all(
            OGC_SOURCES.map(async ({id}) => {
              updateCatalog((c) => ({
                collections: {
                  ...c.collections,
                  [id]: {...c.collections[id], status: 'loading'},
                },
              }));
              try {
                const items = await fetchCollections(id);
                updateCatalog((c) => ({
                  collections: {...c.collections, [id]: {status: 'ready', items}},
                }));
              } catch (err) {
                updateCatalog((c) => ({
                  collections: {
                    ...c.collections,
                    [id]: {status: 'error', items: [], error: String(err)},
                  },
                }));
              }
            }),
          );
        },

        loadCollection: async (sourceId, collectionId, opts) => {
          const tableName = tableNameFor(sourceId, collectionId);
          if (get().catalog.loads[tableName]?.status === 'loading') return;
          updateLoad(tableName, {
            sourceId,
            collectionId,
            status: 'loading',
            loaded: 0,
            total: null,
            error: undefined,
          });
          try {
            const {features, numberMatched} = await fetchFeatures(
              sourceId,
              collectionId,
              {
                maxFeatures: get().catalog.maxFeatures,
                onProgress: ({loaded, total}) =>
                  updateLoad(tableName, {loaded, total}),
              },
            );
            if (!features.length) throw new Error('No features returned');

            const file = new File([featuresToNdjson(features)], `${tableName}.json`, {
              type: 'application/json',
            });
            const connector = await get().db.getConnector();
            await connector.loadFile(file, tableName, {
              method: 'read_json',
              format: 'newline_delimited',
              // Scan every row: sparse columns are often null for the first
              // thousands of features.
              sample_size: -1,
              replace: true,
            } as any);
            const columns = await dropEmptyColumns(connector, tableName);

            await get().db.refreshTableSchemas();

            const mapId = getCurrentKeplerMapArtifactId(get());
            // addTableToMap silently no-ops if the map isn't registered yet,
            // which happens for loads kicked off during room initialization.
            if (mapId && (await waitFor(() => Boolean(get().kepler.map[mapId])))) {
              const datasets = () =>
                get().kepler.map[mapId]?.visState?.datasets ?? {};
              const onMap = Boolean(datasets()[tableName]);
              const isFirst = Object.keys(datasets()).length === 0;
              // Kepler's layer auto-detection mistakes some text columns for
              // geometry, so layers are always created explicitly below.
              // Re-loading refreshes the data and keeps the existing layers.
              await get().kepler.addTableToMap(mapId, tableName, {
                autoCreateLayers: false,
                centerMap: false,
              });
              if (isFirst) {
                get().kepler.dispatchAction(mapId, fitBounds(NM_BOUNDS));
              }
              // Layers are added separately: passing a config to
              // addTableToMap replaces the map config and drops other datasets.
              if (!onMap) {
                const label = `${
                  get().catalog.collections[sourceId].items.find(
                    (c) => c.id === collectionId,
                  )?.title ?? collectionId
                } (${getSource(sourceId).label})`;
                const layers = opts?.layer
                  ? [opts.layer]
                  : defaultLayersFor(tableName, label, columns);
                if (await waitFor(() => Boolean(datasets()[tableName]), 30_000)) {
                  for (const layer of layers) {
                    get().kepler.dispatchAction(mapId, addLayer(layer, tableName));
                  }
                }
              }
            }

            updateLoad(tableName, {
              status: 'ready',
              rowCount: features.length,
              numberMatched,
              loaded: features.length,
            });
            if (numberMatched !== null && numberMatched > features.length) {
              toast.warning(`Loaded ${features.length.toLocaleString()} rows`, {
                description: `${collectionId} has ${numberMatched.toLocaleString()} features. Raise the row limit to load more.`,
              });
            }
            return tableName;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            updateLoad(tableName, {status: 'error', error: message});
            toast.error(`Could not load ${collectionId}`, {description: message});
            return undefined;
          }
        },
      },
    };
  };
}
