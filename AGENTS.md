# AGENTS.md

Zero-dependency, single-file data grid. No build system, package manager, CI, or git repo. Do not add npm scripts, bundlers, or a test framework unless asked. Verify changes in a browser.

- `package.json` — npm package manifest.
- `datagrid.js` — the entire library (IIFE, classic script, `class VanillaDataGrid`).
- `datagrid.css` — all styling; every class is prefixed `v-dg-`/`.v-dg-table`. Keep that prefix.
- `index.html` — working demo with a static 12-row table. Loads `datagrid.js` as a classic script at the end of `<body>`.
- `server_side.html` — remote-mode demo pointed at the example API; works from `http://localhost:8001` or the static server on `:8000`.
- `server_side.py` — zero-dependency Python API + static server for that demo (`/api/users`).
- `tests.html` — 30 zero-dependency integration/unit checks (`console.assert`-style, no runner).
- `README.md` — user documentation and usage guide.
- Old `datatable.js` / `datatable.css` / `VanillaDataTable` were renamed; do not reintroduce them.

## Verification

- Open `tests.html` in a browser. Summary shows pass/fail; `<html data-tests="passed|failed">` and `window.__VDG_TESTS__` are set for automation.
- Headless check: `chrome --headless=new --virtual-time-budget=8000 --dump-dom file:///<abs>/tests.html` and inspect `data-tests`.
- `node --check datagrid.js` catches syntax errors. The pure helpers also run under Node via `VanillaDataGrid.__internals`, but DOM code does not.
- Open `index.html` for the demo. Local mode works from `file://`; ajax/`fetch` mode needs a static server (e.g. `python -m http.server`).
- Server-side example: run `python server_side.py` (port 8001), then open `http://localhost:8001/server_side.html`. It also works from `http://localhost:8000/server_side.html` because the API sends `Access-Control-Allow-Origin: *`; override the endpoint with `?api=…`.

## Wiring and lifecycle

- `datagrid.js` explicitly assigns `globalThis.VanillaDataGrid` (and a deprecated `VanillaDataTable` alias). Load it with a plain `<script src="datagrid.js">`; `type="module"` breaks the global.
- The constructor accepts a CSS selector string **or** a `<table>` element. The table must be in the DOM and contain at least one `<thead><th>`; otherwise it throws before mutating anything.
- Initialization inserts `.v-dg-wrapper`, moves the table inside it, and adds controls. Constructing twice on one table throws (`WeakSet` guard).
- `destroy()` restores the original `<tbody>` and header attributes, unwraps the table, aborts all listeners/fetches, and allows re-init. All listeners use one `AbortController`.

## Column configuration

Column behavior comes only from the first `<thead>` row:

- `data-field` — export/JSON key and ajax `sort` value (defaults `col_<index>`).
- `data-sortable="true"` — opt-in; headers are not sortable by default.
- `data-type="number"` / `"date"` — typed sort; default is string with `localeCompare(..., {numeric:true})`. Blanks/`NaN` always sort last; ties are stable.
- Header text is the default export label. `options.columns` can override `field`, `label`, `sortable`, `type`, or supply `sortValue` by index or field.
- Export JSON keys use `data-field` (de-duplicated); CSV/print use labels.

## Options and API

```js
new VanillaDataGrid('#users', {
  rowsPerPage: 5,             // default
  ajaxUrl: '/api/users',      // or ajax(params) => { rows, total }
  fetchOptions: {},           // headers/credentials
  export: true,               // true = csv/json/print; array; off by default
  exportFilename: 'export',
  exportScope: 'page',        // remote only; 'all' opt-in
  maxExportRows: 10000,
  searchDebounce: 300,
  labels: {},                 // UI/i18n strings; info({start,end,total}) formatter
  columns: null
});
```

- Methods: `reload({resetPage})`, `search(term)`, `sort(index, 'asc'|'desc')`, `goToPage(n)`, `setColumnVisible(index, bool)`, `setData(rows)` (local only), `getExportData()`, `exportCSV()`, `exportJSON()`, `printTable()`, `getState()`, `destroy()`.
- `grid.ready` resolves when the latest load settles; await it after constructor or UI-triggered loads.
- Events bubble from the table: `vdg:load`, `vdg:error`, `vdg:page`, `vdg:sort`, `vdg:search`, `vdg:column`, `vdg:export`. `detail` includes `grid`.
- Search resets to page 1. Local search is case-insensitive substring over cell text; remote search sends the raw query to the server.
- Export: local mode exports the full filtered/sorted set (all pages); remote mode exports the current page by default. `exportScope: 'all'` walks pages in chunks and fails if `maxExportRows` is exceeded.

## Server-side example

`server_side.py` serves the demo page and a small `/api/users` endpoint on port 8001. It generates 57 rows and implements search, typed sort, and pagination server-side, returning `{page,total,rows}` with cells as strings or `{html,text,className}`. `server_side.html` wires it through a custom `ajax(params)` adapter, logs `vdg:*` events, and exports the current page. CORS is open so the page also works from another static server.

## Data contract

- **Local (no ajax)**: rows are read once from `<tbody>` at construction and normalized to `{html, text, className}`. `html` is re-inserted verbatim, `text` drives search/sort/export, `className` is preserved. Later DOM edits are ignored; use `setData()`.
- **Remote**: `GET {ajaxUrl}?page&limit&search&sort&order` (1-based page) or a custom `ajax(params)` returning `{ rows, total }` (`data` is also accepted). Each row is an array of cells; a cell may be an HTML string or `{html, text, className}`. Missing/invalid `total` falls back to the page row count.
- Stale responses are aborted. Remote results whose page exceeds the new total trigger a re-fetch of the clamped page.
- `cell.html` is trusted and inserted with `innerHTML`; sanitize upstream if data is untrusted.

## UI notes

- Generated buttons are `type="button"` so they never submit a surrounding form.
- Sorting is click **and** keyboard (Enter/Space) via focusable headers with `aria-sort`; pagination uses `aria-current`; info is an `aria-live` region; the column menu uses `aria-expanded` and closes on Escape/outside click.
- `:focus-visible` styles are intentional; do not remove outlines.
- Exports: CSV has a UTF-8 BOM and CRLF; object URLs are revoked; print content is escaped and the print window closes on `afterprint`.
- `VanillaDataGrid.__internals` is a frozen test hook for pure helpers — not public API.
