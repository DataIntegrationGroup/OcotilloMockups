import {
  createArtifactPanelDefinition,
  createArtifactsSlice,
  defineArtifactTypes,
  type ArtifactsSliceState,
  type ArtifactTypeDefinition,
} from '@sqlrooms/artifacts';
import {createWasmDuckDbConnector} from '@sqlrooms/duckdb';
import {createKeplerSlice, KeplerSliceState} from '@sqlrooms/kepler';
import {
  createRoomShellSlice,
  createRoomStore,
  LayoutConfig,
  LoadFileOptions,
  RoomShellSliceState,
} from '@sqlrooms/room-shell';
import {createSqlEditorSlice, SqlEditorSliceState} from '@sqlrooms/sql-editor';
import {convertToValidColumnOrTableName} from '@sqlrooms/utils';
import {
  DatabaseIcon,
  Droplets,
  Filter,
  Layers,
  Map as MapIcon,
  SlidersHorizontal,
} from 'lucide-react';
import {z} from 'zod';
import {CatalogPanel} from './components/CatalogPanel';
import {DataPanel} from './components/DataPanel';
import {
  createCatalogSlice,
  DEFAULT_LAYERS,
  type CatalogSliceState,
} from './catalog';
import {KeplerMapArtifactPanel} from './components/KeplerMapArtifactPanel';
import {KeplerMapsContainer} from './components/KeplerMapsContainer';
import {
  KeplerSidePanelBaseMapManager,
  KeplerSidePanelFilterManager,
  KeplerSidePanelInteractionManager,
  KeplerSidePanelLayerManager,
} from './components/KeplerSidePanels';

export const RoomPanelTypes = z.enum([
  'left',
  'catalog',
  'data',
  'layers',
  'filters',
  'interactions',
  'basemaps',
  'main',
] as const);
export type RoomPanelTypes = z.infer<typeof RoomPanelTypes>;

const DEFAULT_KEPLER_MAP_ID = 'default-kepler-map';

/**
 * Room config for saving
 */
export type RoomState = RoomShellSliceState &
  KeplerSliceState &
  ArtifactsSliceState &
  SqlEditorSliceState &
  CatalogSliceState & {
    addFile: (file: File, loadOptions?: LoadFileOptions) => Promise<string>;
  };

export function getCurrentKeplerMapArtifactId(
  state: Pick<RoomState, 'artifacts'>,
) {
  // This example only registers kepler-map artifacts, so the current artifact
  // is always the current map.
  return state.artifacts.config.currentArtifactId;
}

export const KEPLER_ARTIFACT_TYPES = defineArtifactTypes({
  'kepler-map': {
    label: 'Map',
    defaultTitle: 'NM Water Data',
    icon: MapIcon,
    component: KeplerMapArtifactPanel,
    onCreate: ({artifactId, artifact, store}) => {
      store.getState().kepler.ensureMap(artifactId, artifact.title);
    },
    onEnsure: ({artifactId, artifact, store}) => {
      store.getState().kepler.ensureMap(artifactId, artifact.title);
    },
    onRename: ({artifactId, artifact, store}) => {
      store.getState().kepler.renameMap(artifactId, artifact.title);
    },
    onDelete: ({artifactId, store}) => {
      store.getState().kepler.deleteMap(artifactId);
    },
  },
} satisfies Record<'kepler-map', ArtifactTypeDefinition<RoomState>>);

/**
 * Create a customized room store
 */
export const {roomStore, useRoomStore} = createRoomStore<RoomState>(
  (set, get, store) => {
    return {
      ...createRoomShellSlice({
        config: {
          dataSources: [],
        },
        connector: createWasmDuckDbConnector({
          query: {
            // Prevents bigint errors in Kepler
            castTimestampToDate: true,
            castBigIntToDouble: true,
          },
        }),
        layout: {
          config: {
            id: 'root',
            type: 'split',
            direction: 'row',
            children: [
              {
                type: 'tabs',
                id: RoomPanelTypes.enum.left,
                children: [
                  RoomPanelTypes.enum.catalog,
                  RoomPanelTypes.enum.data,
                  RoomPanelTypes.enum.layers,
                  RoomPanelTypes.enum.filters,
                  RoomPanelTypes.enum.interactions,
                  RoomPanelTypes.enum.basemaps,
                ],
                defaultSize: '30%',
                maxSize: '50%',
                minSize: '300px',
                activeTabIndex: 0,
                collapsible: true,
                collapsed: false,
                collapsedSize: 0,
                hideTabStrip: true,
              },
              {
                type: 'tabs',
                id: RoomPanelTypes.enum.main,
                panel: RoomPanelTypes.enum.main,
                children: [],
                activeTabIndex: 0,
                defaultSize: '70%',
              },
            ],
          } satisfies LayoutConfig,
          panels: {
            [RoomPanelTypes.enum.catalog]: {
              title: 'NM Water Data',
              icon: Droplets,
              component: CatalogPanel,
            },
            [RoomPanelTypes.enum.data]: {
              title: 'Data',
              icon: DatabaseIcon,
              component: DataPanel,
            },
            [RoomPanelTypes.enum.layers]: {
              title: 'Layers',
              icon: Layers,
              component: KeplerSidePanelLayerManager,
            },
            [RoomPanelTypes.enum.filters]: {
              title: 'Filters',
              icon: Filter,
              component: KeplerSidePanelFilterManager,
            },
            [RoomPanelTypes.enum.interactions]: {
              title: 'Interactions',
              icon: SlidersHorizontal,
              component: KeplerSidePanelInteractionManager,
            },
            [RoomPanelTypes.enum.basemaps]: {
              title: 'Base Maps',
              icon: MapIcon,
              component: KeplerSidePanelBaseMapManager,
            },
            // MapIcon
            [RoomPanelTypes.enum.main]: {
              title: 'Main view',
              icon: () => null,
              component: KeplerMapsContainer,
            },
            artifact: createArtifactPanelDefinition(
              KEPLER_ARTIFACT_TYPES,
              store,
            ),
          },
        },
      })(set, get, store),

      initialize: async () => {
        void get().catalog.fetchCatalog();
        // Don't await: the room shows a blocking modal until initialize
        // resolves, and the catalog panel already shows per-layer progress.
        // Layers load one after another so their order on the map is stable.
        void (async () => {
          for (const layer of DEFAULT_LAYERS) {
            await get().catalog.loadCollection(
              layer.sourceId,
              layer.collectionId,
              {layer: layer.layer},
            );
          }
        })();
      },

      ...createCatalogSlice()(set, get, store),

      ...createKeplerSlice({
        actionLogging: false,
        config: {
          maps: [
            {
              id: DEFAULT_KEPLER_MAP_ID,
              name: 'NM Water Data',
              lastOpenedAt: Date.now(),
            },
          ],
        },
      })(set, get, store),

      ...createArtifactsSlice({
        artifactTypes: KEPLER_ARTIFACT_TYPES,
        config: {
          artifactsById: {
            [DEFAULT_KEPLER_MAP_ID]: {
              id: DEFAULT_KEPLER_MAP_ID,
              type: 'kepler-map',
              title: 'NM Water Data',
            },
          },
          artifactOrder: [DEFAULT_KEPLER_MAP_ID],
          currentArtifactId: DEFAULT_KEPLER_MAP_ID,
        },
      })(set, get, store),

      ...createSqlEditorSlice()(set, get, store),

      addFile: async (file, loadOptions) => {
        const tableName = convertToValidColumnOrTableName(file.name);
        await get().db.connector.loadFile(file, tableName, loadOptions);
        await get().db.refreshTableSchemas();
        await get().kepler.syncKeplerDatasets();
        const targetMapId = getCurrentKeplerMapArtifactId(get());
        if (targetMapId) {
          await get().kepler.addTableToMap(targetMapId, tableName);
        }
        return tableName;
      },
    };
  },
);

if (import.meta.env.DEV) {
  // Handy for poking at state from the browser console.
  (window as any).roomStore = roomStore;
}
