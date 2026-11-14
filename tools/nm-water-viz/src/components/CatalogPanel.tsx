import {RoomPanel} from '@sqlrooms/room-shell';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  cn,
  Input,
  Progress,
  Spinner,
} from '@sqlrooms/ui';
import {
  AlertCircleIcon,
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
} from 'lucide-react';
import {useMemo, useState, type FC} from 'react';
import {
  getSource,
  OGC_SOURCES,
  tableNameFor,
  type OgcCollection,
} from '../ogc';
import {useRoomStore} from '../store';

const ROW_LIMITS = [10_000, 50_000, 100_000, 250_000, 1_000_000];

export const CatalogPanel: FC = () => {
  const collections = useRoomStore((s) => s.catalog.collections);
  const fetchCatalog = useRoomStore((s) => s.catalog.fetchCatalog);
  const maxFeatures = useRoomStore((s) => s.catalog.maxFeatures);
  const setMaxFeatures = useRoomStore((s) => s.catalog.setMaxFeatures);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      Object.fromEntries(
        OGC_SOURCES.map((s) => [
          s.id,
          collections[s.id].items.filter(
            (c) =>
              !q ||
              c.title.toLowerCase().includes(q) ||
              c.id.toLowerCase().includes(q),
          ),
        ]),
      ),
    [collections, q],
  );

  return (
    <RoomPanel>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search collections"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Refresh catalogs"
            onClick={() => fetchCatalog()}
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
          </Button>
        </div>

        <label className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          Max rows per collection
          <select
            className="bg-background border-input h-7 rounded-md border px-2 text-xs"
            value={maxFeatures}
            onChange={(e) => setMaxFeatures(Number(e.target.value))}
          >
            {ROW_LIMITS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </label>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Accordion
            type="multiple"
            defaultValue={OGC_SOURCES.map((s) => s.id)}
          >
            {OGC_SOURCES.map((source) => {
              const state = collections[source.id];
              const items = filtered[source.id] ?? [];
              return (
                <AccordionItem key={source.id} value={source.id}>
                  <AccordionTrigger className="py-2 hover:no-underline">
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-medium">
                        {source.label}
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          {state.status === 'ready' && `${items.length}`}
                        </span>
                      </span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {source.description}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    {state.status === 'loading' && (
                      <div className="text-muted-foreground flex items-center gap-2 p-2 text-xs">
                        <Spinner className="h-3 w-3" /> Loading catalog…
                      </div>
                    )}
                    {state.status === 'error' && (
                      <div className="text-destructive p-2 text-xs">
                        {state.error}
                      </div>
                    )}
                    {state.status === 'ready' && items.length === 0 && (
                      <div className="text-muted-foreground p-2 text-xs">
                        No matching collections.
                      </div>
                    )}
                    <ul className="flex flex-col">
                      {items.map((c) => (
                        <CollectionRow key={c.id} collection={c} />
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>
    </RoomPanel>
  );
};

const CollectionRow: FC<{collection: OgcCollection}> = ({collection}) => {
  const tableName = tableNameFor(collection.sourceId, collection.id);
  const load = useRoomStore((s) => s.catalog.loads[tableName]);
  const loadCollection = useRoomStore((s) => s.catalog.loadCollection);
  const {baseUrl} = getSource(collection.sourceId);
  const isLoading = load?.status === 'loading';
  const pct =
    load?.total && load.total > 0
      ? Math.min(100, (load.loaded / load.total) * 100)
      : undefined;

  return (
    <li className="hover:bg-muted/60 group rounded-md px-2 py-1.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium" title={collection.title}>
            {collection.title}
          </div>
          <div className="text-muted-foreground flex items-center gap-1 truncate font-mono text-[10px]">
            {load?.status === 'ready' ? (
              <span title="DuckDB table">
                {tableName} · {load.rowCount?.toLocaleString()} rows
                {load.numberMatched && load.numberMatched > (load.rowCount ?? 0)
                  ? ` of ${load.numberMatched.toLocaleString()}`
                  : ''}
              </span>
            ) : (
              <span>{collection.id}</span>
            )}
            <a
              href={`${baseUrl}/collections/${collection.id}?f=html`}
              target="_blank"
              rel="noreferrer"
              className="opacity-0 group-hover:opacity-100"
              title="Open collection in the API"
            >
              <ExternalLinkIcon className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>
        <Button
          size="sm"
          variant={load?.status === 'ready' ? 'ghost' : 'outline'}
          className={cn('h-6 shrink-0 px-2 text-[11px]')}
          disabled={isLoading}
          title={
            load?.status === 'ready'
              ? 'Reload from the API'
              : 'Load into DuckDB and add to the map'
          }
          onClick={() => loadCollection(collection.sourceId, collection.id)}
        >
          {isLoading ? (
            <Spinner className="h-3 w-3" />
          ) : load?.status === 'ready' ? (
            <CheckIcon className="h-3 w-3 text-emerald-500" />
          ) : load?.status === 'error' ? (
            <AlertCircleIcon className="text-destructive h-3 w-3" />
          ) : (
            <PlusIcon className="h-3 w-3" />
          )}
          {!isLoading && load?.status !== 'ready' && (
            <span className="ml-1">{load?.status === 'error' ? 'Retry' : 'Add'}</span>
          )}
        </Button>
      </div>
      {isLoading && (
        <div className="mt-1 flex items-center gap-2">
          <Progress value={pct ?? 5} className="h-1 flex-1" />
          <span className="text-muted-foreground font-mono text-[10px]">
            {load.loaded.toLocaleString()}
            {load.total ? ` / ${load.total.toLocaleString()}` : ''}
          </span>
        </div>
      )}
      {load?.status === 'error' && (
        <div className="text-destructive mt-0.5 text-[10px]">{load.error}</div>
      )}
    </li>
  );
};
