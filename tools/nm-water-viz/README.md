# NM Water Data Explorer

A browser-only map explorer for New Mexico water data, built with
[SQLRooms](https://sqlrooms.org) (DuckDB-WASM in the browser) and kepler.gl.

It reads from two OGC API – Features services:

- **Weaver**: `https://weaver-api.newmexicowaterdata.org` (statewide summaries,
  time series, trends, densities)
- **Ocotillo**: `https://ocotillo-api.newmexicowaterdata.org/ogcapi` (NMBGMR
  wells, springs, chemistry, geothermal)

## Open it

Open [`../../nm-water-data-explorer.html`](../../nm-water-data-explorer.html)
in a browser. It is one self-contained file (about 30 MB) and works from
`file://` without a server, but it needs a network connection for the APIs,
DuckDB-WASM and the base map.

## Develop

Run these in `tools/nm-water-viz/`:

```bash
npm install
npm run dev            # http://localhost:5173
npm run build:mockup   # rebuild ../../nm-water-data-explorer.html
```

Commit the source and the rebuilt HTML together. See the *Working prototypes*
section of the repo's `AGENTS.md` for why this folder is allowed an npm build.

On startup it loads county well density (polygons) and water-level trends
(points, colored by `trend_category`). Use the **NM Water Data** panel to add
any other collection.

## How it works

- `src/ogc.ts` lists collections and pages through `/items` (10,000 features
  per request, 4 requests in parallel), then flattens GeoJSON to NDJSON.
  Points get `longitude`/`latitude` columns. Other geometries are kept as a
  GeoJSON string in `_geojson`.
- `src/catalog.ts` loads the NDJSON into DuckDB with `read_json`
  (`sample_size=-1`, so sparse columns get the right types), drops all-null
  columns, and adds the table to the Kepler map with an explicit layer.
- Each collection becomes a DuckDB table named `<source>_<collection>`, for
  example `weaver_nm_tds_summary`. Query it from the SQL editor (terminal icon,
  bottom left):

  ```sql
  SELECT trend_category, count(*) AS n, avg(slope_per_year) AS ft_per_yr
  FROM weaver_nm_waterlevel_trends
  GROUP BY 1 ORDER BY n DESC;
  ```

- **Max rows per collection** caps how many features are fetched (default
  50,000). The large time-series collections hold close to 900k rows.

## Notes

- `package.json` `overrides` pin deck.gl 9.4.1, luma.gl 9.4.2 and a single
  React. Without them npm installs several copies and kepler.gl fails to
  render. These match the pins in the SQLRooms monorepo.
- The single-file build (`vite-plugin-singlefile`) needs two things in
  `src/main.tsx`: monaco is imported as core editor plus SQL only (the full
  entry adds about 15 MB of unused language workers), and its editor worker is
  imported with `?worker&inline` so that no separate worker file is emitted.
- Collections that the server does not serve as features (for example
  Ocotillo `waterlevels` and `water_chemistry`) show an error in the panel.
