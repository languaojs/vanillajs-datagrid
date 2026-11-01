# VanillaDataGrid

A zero-dependency, single-file JavaScript data grid. Fully responsive, lightweight, accessible, and framework-free.

[Features](#features) • [Installation](#installation) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Server-Side Loading](#server-side-loading) • [API & Options](#api--options)

---

## Features

- **Zero dependencies** — pure vanilla JS (IIFE classic script, no build systems, bundlers, or package managers required).
- **Dual data modes** — works entirely in-memory with existing HTML `<table>` rows, or loads dynamically via Ajax.
- **Rich interactions** — case-insensitive search, adjustable rows per page, typed sorting (`string`, `number`, `date` with blanks-last semantics), and windowed pagination.
- **Column controls** — toggle column visibility on the fly via an accessible dropdown menu.
- **Exports & Printing** — export to CSV (with UTF-8 BOM and CRLF), JSON, or open a clean print view.
- **Accessible** — keyboard-sortable headers (`aria-sort`), `aria-current` pagination, an animated loading indicator with a live info region (`aria-live`), and focus management.
- **Safe & Robust** — supports request cancellation via `AbortController`, page clamping, double-init guards, and complete `destroy()` cleanup.

---

## Installation

Install from npm:

```sh
npm install @languaojs/vanilladatagrid
```

Then reference the published files from your page:

```html
<link rel="stylesheet" href="./node_modules/@languaojs/vanilladatagrid/src/datagrid.css">
<script src="./node_modules/@languaojs/vanilladatagrid/src/datagrid.js"></script>
```

Or use the versioned files from the unpkg CDN:

```html
<link rel="stylesheet" href="https://unpkg.com/@languaojs/vanilladatagrid/src/datagrid.css">
<script src="https://unpkg.com/@languaojs/vanilladatagrid/src/datagrid.js"></script>
```

`datagrid.js` is a classic browser script, not a CommonJS or ES module. It assigns `globalThis.VanillaDataGrid` (along with a deprecated `VanillaDataTable` alias). Do not load it with `type="module"`; use a regular `<script>` tag.

---

## Quick Start

### 1. Local Table (In-Memory)

Configure columns using `data-field`, `data-sortable="true"`, and `data-type` on `<thead><th>`:

```html
<table id="users">
  <thead>
    <tr>
      <th data-field="name" data-sortable="true">Name</th>
      <th data-field="role" data-sortable="true">Role</th>
      <th data-field="score" data-sortable="true" data-type="number">Score</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Ada Lovelace</td><td>Engineer</td><td>98</td></tr>
    <tr><td>Grace Hopper</td><td>Admiral</td><td>92</td></tr>
  </tbody>
</table>

<script src="datagrid.js"></script>
<script>
  const grid = new VanillaDataGrid('#users', {
    rowsPerPage: 5,
    export: true
  });
</script>
```

### 2. Remote Table (Ajax)

Point the grid to an endpoint (`ajaxUrl`) or supply a custom fetch function (`ajax`):

```js
const grid = new VanillaDataGrid('#users', {
  ajaxUrl: '/api/users', // GET /api/users?page=1&limit=10&search=&sort=&order=
  rowsPerPage: 10,
  export: true
});
```

---

## Server-Side Loading

The grid expects backend endpoints to return JSON matching this contract:

```json
{
  "total": 57,
  "rows": [
    ["Ada Lovelace", "Engineer", "98", "2021-03-14", "Active"],
    {
      "attributes": { "data-user-id": "2", "class": "featured" },
      "cells": [
        {
          "html": "<strong data-kind=\"first-name\">Grace</strong> Hopper",
          "text": "Grace Hopper",
          "attributes": { "data-column": "name", "title": "Grace Hopper" }
        },
        "Admiral", "92", "2019-11-08", "Active"
      ]
    }
  ]
}
```

For local HTML tables, nested cell markup and its attributes are retained, as are `<tr>` and `<td>`/`<th>` attributes. The table sections and headers remain in place with their attributes and markup intact. Ajax rows may be arrays of cells or objects with a `cells` array and row `attributes`; each cell may provide `html`, `text`, `attributes`, and `tagName` (`"td"` or `"th"`). The same row and cell metadata is available in `grid.getState().rows`. Markup and attributes are rendered as supplied, so only use trusted HTML and attributes.

### PHP Example (`/api/users.php`)
```php
<?php
header('Content-Type: application/json; charset=utf-8');

$page   = max(1, (int)($_GET['page'] ?? 1));
$limit  = min(100, max(1, (int)($_GET['limit'] ?? 10)));
$search = trim($_GET['search'] ?? '');
$offset = ($page - 1) * $limit;

// Example query with PDO
$stmt = $pdo->prepare('SELECT name, role, score, joined, status FROM users WHERE name LIKE ? LIMIT ? OFFSET ?');
$stmt->execute(["%$search%", $limit, $offset]);

$count = $pdo->prepare('SELECT COUNT(*) FROM users WHERE name LIKE ?');
$count->execute(["%$search%"]);

echo json_encode([
  'total' => (int)$count->fetchColumn(),
  'rows'  => $stmt->fetchAll(PDO::FETCH_NUM)
]);
```

### Node.js / Express Example
```js
app.get('/api/users', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const search = req.query.search || '';

  // Fetch rows and total count from your database...
  res.json({
    total: totalCount,
    rows: rows.map(u => [u.name, u.role, u.score, u.joined, u.status])
  });
});
```

---

## Options & Configuration

```js
const grid = new VanillaDataGrid('#table-id', {
  rowsPerPage: 5,             // Default page size
  showRowsPerPage: true,      // Show the rows-per-page input beside search
  ajaxUrl: null,              // Endpoint URL string (or null for local mode)
  ajax: null,                 // Optional custom function: async ({ page, size, query, sort, order, signal }) => ({ rows, total })
  fetchOptions: {},           // Custom fetch options (headers, credentials, etc.)
  export: true,               // Enable exports: true (all formats), false, or ['csv', 'json', 'print']
  exportFilename: 'export',   // Base download filename
  exportScope: 'page',        // Remote export scope: 'page' (default) or 'all' (walks pages)
  maxExportRows: 10000,       // Safety limit for exportScope: 'all'
  searchDebounce: 300,        // Search input debounce delay in ms
  labels: {},                 // UI string overrides & custom info formatter
  columns: null               // Optional column configuration overrides
});
```

The rows-per-page input appears beside search by default. Set `showRowsPerPage: false` to hide it while keeping the configured page size. `rowsPerPage` sets the initial value; when omitted, it defaults to 10.

---

## API Methods

- `grid.reload({ resetPage })` — Reloads current data source (optionally resetting to page 1).
- `grid.search(term)` — Executes a search query programmatically.
- `grid.sort(index, 'asc' | 'desc')` — Sorts by column index.
- `grid.goToPage(n)` — Navigates to page `n`.
- `grid.setColumnVisible(index, boolean)` — Shows or hides a column.
- `grid.setData(rows)` — Replaces local rows (local mode only).
- `grid.getExportData()` — Returns `{ headers, rows }` for export.
- `grid.exportCSV()` — Triggers CSV download.
- `grid.exportJSON()` — Triggers JSON download.
- `grid.printTable()` — Opens print window.
- `grid.getState()` — Returns a deep clone of the current internal state.
- `grid.destroy()` — Removes controls, un-wraps table, aborts active requests/listeners, and restores original markup.

---

## Events

Events bubble up from the underlying table element:
- `vdg:load` — Fired when data successfully renders (`detail`: `{ grid, rows, total, page, query, sort }`).
- `vdg:error` — Fired on load or export failures (`detail`: `{ grid, error, action }`).
- `vdg:page` — Fired on page change (`detail`: `{ grid, page }`).
- `vdg:sort` — Fired on sort (`detail`: `{ grid, index, dir, field }`).
- `vdg:search` — Fired on search (`detail`: `{ grid, query }`).
- `vdg:column` — Fired when column visibility changes (`detail`: `{ grid, index, visible, field }`).
- `vdg:export` — Fired when an export completes (`detail`: `{ grid, format, rows }`).

---

## Support & Donation

If you find VanillaDataGrid helpful in your projects, consider supporting its maintenance with a donation:

<br>

<a href="https://paypal.me/justumg" target="_blank" rel="noopener">
  <img src="https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif" alt="Donate with PayPal">
</a>

<br>

---

## License

MIT
