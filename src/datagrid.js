(function (global) {
  'use strict';

  const DEFAULT_LABELS = {
    search: 'Search table...',
    searchLabel: 'Search table',
    columns: 'Columns',
    prev: 'Prev',
    next: 'Next',
    page: function (n) { return 'Page ' + n; },
    pagination: 'Pagination',
    loading: 'Loading...',
    empty: 'No records found.',
    error: 'Failed to load data.',
    retry: 'Retry',
    exportError: 'Export failed.',
    exportEmpty: 'There is nothing to export.',
    csv: 'CSV',
    json: 'JSON',
    print: 'Print'
  };

  const EXPORT_FORMATS = ['csv', 'json', 'print'];
  const initializedTables = new WeakSet();
  let uid = 0;
  let template = null;

  /* ---------------------------------------------------------------- utils */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toPositiveInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function textFromHtml(html) {
    if (!template) template = document.createElement('template');
    template.innerHTML = String(html == null ? '' : html);
    return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeCell(raw) {
    if (raw == null) return { html: '', text: '', className: '' };
    if (typeof raw === 'string' || typeof raw === 'number') {
      const html = String(raw);
      return { html: html, text: textFromHtml(html), className: '' };
    }
    if (typeof raw === 'object') {
      const className = raw.className == null ? '' : String(raw.className);
      if (raw.html != null) {
        const html = String(raw.html);
        const text = raw.text != null ? String(raw.text).trim() : textFromHtml(html);
        return { html: html, text: text, className: className };
      }
      if (raw.text != null) {
        const text = String(raw.text).trim();
        return { html: escapeHtml(text), text: text, className: className };
      }
      return { html: '', text: '', className: className };
    }
    const text = String(raw);
    return { html: escapeHtml(text), text: text, className: '' };
  }

  function normalizeRow(raw) {
    if (!Array.isArray(raw)) {
      throw new Error('Each data row must be an array of cells.');
    }
    return raw.map(normalizeCell);
  }

  function readRows(tbody) {
    if (!tbody) return [];
    const rows = [];
    Array.prototype.forEach.call(tbody.rows, function (tr) {
      const cells = Array.prototype.slice.call(tr.cells);
      if (cells.length === 1 && cells[0].colSpan > 1) return;
      rows.push(cells.map(function (cell) {
        return normalizeCell({ html: cell.innerHTML.trim(), className: cell.className });
      }));
    });
    return rows;
  }

  function filterRows(rows, query) {
    const needle = String(query == null ? '' : query).trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(function (row) {
      return row.some(function (cell) {
        return cell.text.toLowerCase().indexOf(needle) !== -1;
      });
    });
  }

  function toNumber(value) {
    const cleaned = String(value == null ? '' : value)
      .trim()
      .replace(/,/g, '')
      .replace(/[^0-9eE+\-.]/g, '');
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }

  function toTime(value) {
    const t = Date.parse(String(value == null ? '' : value).trim());
    return Number.isFinite(t) ? t : NaN;
  }

  function isEmptySortValue(value) {
    return value == null || value === '' || (typeof value === 'number' && Number.isNaN(value));
  }

  function sortValue(row, column) {
    const text = row[column.index] ? row[column.index].text : '';
    if (typeof column.sortValue === 'function') return column.sortValue(row, text);
    if (column.type === 'number') return toNumber(text);
    if (column.type === 'date') return toTime(text);
    return text;
  }

  function compareValues(a, b, type) {
    if (type === 'number' || type === 'date') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  function sortRows(rows, column, direction) {
    if (!column) return rows;
    const factor = direction === 'desc' ? -1 : 1;
    const decorated = rows.map(function (row, index) {
      return { row: row, index: index, value: sortValue(row, column) };
    });
    decorated.sort(function (a, b) {
      const aEmpty = isEmptySortValue(a.value);
      const bEmpty = isEmptySortValue(b.value);
      if (aEmpty || bEmpty) {
        if (aEmpty && bEmpty) return a.index - b.index;
        return aEmpty ? 1 : -1;
      }
      const result = compareValues(a.value, b.value, column.type);
      return result === 0 ? a.index - b.index : result * factor;
    });
    return decorated.map(function (entry) { return entry.row; });
  }

  function paginate(rows, page, size) {
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const safePage = clamp(Number(page) || 1, 1, totalPages);
    const start = (safePage - 1) * size;
    return {
      rows: rows.slice(start, start + size),
      page: safePage,
      total: total,
      totalPages: totalPages
    };
  }

  function pageWindow(current, totalPages) {
    if (totalPages <= 1) return [1];
    const pages = new Set([1, totalPages]);
    for (let i = current - 1; i <= current + 1; i += 1) {
      if (i >= 1 && i <= totalPages) pages.add(i);
    }
    const sorted = Array.from(pages).sort(function (a, b) { return a - b; });
    const result = [];
    sorted.forEach(function (page, index) {
      if (index > 0 && page - sorted[index - 1] > 1) result.push('\u2026');
      result.push(page);
    });
    return result;
  }

  function sanitizeFilename(name) {
    const cleaned = String(name == null ? '' : name)
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
    return cleaned || 'export';
  }

  function createCSV(headers, rows) {
    const encode = function (value) {
      return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
    };
    const lines = [headers].concat(rows).map(function (row) {
      return row.map(encode).join(',');
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  function createJSON(headers, rows) {
    const keys = headers.map(function (header) {
      return typeof header === 'string' ? header : header.key;
    });
    const objects = rows.map(function (row) {
      const object = {};
      keys.forEach(function (key, index) {
        object[key] = row[index] == null ? '' : row[index];
      });
      return object;
    });
    return JSON.stringify(objects, null, 2);
  }

  function uniqueKeys(columns) {
    const used = new Map();
    return columns.map(function (column) {
      const base = String(column.field || column.label || 'col_' + column.index);
      const count = used.get(base) || 0;
      used.set(base, count + 1);
      return count ? base + '_' + (count + 1) : base;
    });
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function printTableFile(title, headers, rows) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) throw new Error('Unable to open the print window. Check popup blocking.');
    const head = headers.map(function (header) {
      return '<th>' + escapeHtml(header) + '</th>';
    }).join('');
    const body = rows.map(function (row) {
      return '<tr>' + row.map(function (cell) {
        return '<td>' + escapeHtml(cell) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    printWindow.document.open();
    printWindow.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>' + escapeHtml(title) + '</title>' +
      '<style>body{font-family:sans-serif;margin:24px}table{width:100%;border-collapse:collapse}' +
      'th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f4f4f4}</style>' +
      '</head><body><h2>' + escapeHtml(title) + '</h2><table><thead><tr>' + head +
      '</tr></thead><tbody>' + body + '</tbody></table></body></html>'
    );
    printWindow.document.close();
    printWindow.addEventListener('afterprint', function () {
      try { printWindow.close(); } catch (error) { /* ignore */ }
    }, { once: true });
    const run = function () {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        try { printWindow.close(); } catch (closeError) { /* ignore */ }
      }
    };
    if (printWindow.document.readyState === 'complete') run();
    else printWindow.addEventListener('load', run, { once: true });
  }

  /* -------------------------------------------------------------- options */

  function normalizeOptions(input) {
    const options = input || {};
    const exportValue = options.export;
    let exports = [];
    if (exportValue === true) exports = EXPORT_FORMATS.slice();
    else if (typeof exportValue === 'string') exports = [exportValue];
    else if (Array.isArray(exportValue)) exports = exportValue;
    exports = exports.filter(function (format, index) {
      return EXPORT_FORMATS.indexOf(format) !== -1 && exports.indexOf(format) === index;
    });

    if (options.ajaxUrl != null && typeof options.ajaxUrl !== 'string') {
      throw new Error('options.ajaxUrl must be a string.');
    }
    if (options.ajax != null && typeof options.ajax !== 'function') {
      throw new Error('options.ajax must be a function.');
    }

    const labels = Object.assign(
      {},
      DEFAULT_LABELS,
      options.labels && typeof options.labels === 'object' ? options.labels : {}
    );

    return {
      ajaxUrl: options.ajaxUrl || null,
      ajax: typeof options.ajax === 'function' ? options.ajax : null,
      fetchOptions: options.fetchOptions && typeof options.fetchOptions === 'object' ? options.fetchOptions : {},
      rowsPerPage: toPositiveInt(options.rowsPerPage, toPositiveInt(options.pageSize, 5)),
      export: exports,
      exportFilename: options.exportFilename || 'export',
      exportScope: options.exportScope === 'all' ? 'all' : 'page',
      maxExportRows: toPositiveInt(options.maxExportRows, 10000),
      searchDebounce: Math.max(0, Number(options.searchDebounce == null ? 300 : options.searchDebounce) || 0),
      labels: labels,
      columns: options.columns || null
    };
  }

  function applyColumnOverrides(columns, overrides) {
    if (!overrides) return;
    const apply = function (column, override) {
      if (!override || typeof override !== 'object') return;
      ['field', 'label', 'sortable', 'type', 'sortValue'].forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(override, key)) column[key] = override[key];
      });
    };
    if (Array.isArray(overrides)) {
      overrides.forEach(function (override, index) {
        if (columns[index]) apply(columns[index], override);
      });
      return;
    }
    Object.keys(overrides).forEach(function (key) {
      const index = /^\d+$/.test(key) ? Number(key) : columns.findIndex(function (column) {
        return column.field === key;
      });
      if (columns[index]) apply(columns[index], overrides[key]);
    });
  }

  /* --------------------------------------------------------------- sources */

  function createLocalSource(rows, columns) {
    let data = rows;
    const queryRows = function (query, sort) {
      const filtered = filterRows(data, query);
      return sort ? sortRows(filtered, columns[sort.index], sort.dir) : filtered;
    };
    return {
      mode: 'local',
      load: function (params) {
        const sorted = queryRows(params.query, params.sort);
        const result = paginate(sorted, params.page, params.size);
        return { rows: result.rows, total: result.total, page: result.page };
      },
      exportRows: function (params) {
        return queryRows(params.query, params.sort);
      },
      setData: function (next) {
        data = next;
      }
    };
  }

  function normalizeRemoteResult(payload) {
    if (Array.isArray(payload)) {
      return { rows: payload.map(normalizeRow), total: payload.length };
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('The data source returned an invalid response.');
    }
    const rawRows = Array.isArray(payload.rows) ? payload.rows
      : (Array.isArray(payload.data) ? payload.data : null);
    if (!rawRows) throw new Error('The data source response must include a "rows" array.');
    const total = Number(payload.total);
    return {
      rows: rawRows.map(normalizeRow),
      total: Number.isFinite(total) && total >= 0 ? total : rawRows.length
    };
  }

  function createRemoteSource(options, columns) {
    const source = {
      mode: 'remote',
      load: async function (params) {
        const column = params.sort ? columns[params.sort.index] : null;
        const request = {
          page: params.page,
          size: params.size,
          query: params.query,
          sort: column ? column.field : '',
          order: params.sort ? params.sort.dir : 'asc',
          signal: params.signal
        };
        let payload;
        if (options.ajax) {
          payload = await options.ajax(request);
        } else {
          const url = new URL(options.ajaxUrl, document.baseURI);
          url.searchParams.set('page', String(request.page));
          url.searchParams.set('limit', String(request.size));
          url.searchParams.set('search', request.query);
          url.searchParams.set('sort', request.sort);
          url.searchParams.set('order', request.order);
          const response = await fetch(url.toString(), Object.assign({}, options.fetchOptions, {
            signal: request.signal
          }));
          if (!response.ok) {
            throw new Error('Request failed with status ' + response.status + '.');
          }
          payload = await response.json();
        }
        return normalizeRemoteResult(payload);
      },
      exportRows: async function (params) {
        const chunk = Math.min(500, Math.max(100, params.size || 100));
        const rows = [];
        let total = 0;
        let page = 1;
        for (let guard = 0; guard < 10000; guard += 1) {
          const result = await source.load({
            page: page,
            size: chunk,
            query: params.query,
            sort: params.sort,
            signal: params.signal
          });
          total = result.total;
          if (total > params.maxRows) {
            throw new Error('Export is limited to ' + params.maxRows + ' rows.');
          }
          rows.push.apply(rows, result.rows);
          if (rows.length > params.maxRows) {
            throw new Error('Export is limited to ' + params.maxRows + ' rows.');
          }
          if (rows.length >= total || result.rows.length === 0) break;
          page += 1;
        }
        return rows.slice(0, Math.min(total, params.maxRows));
      }
    };
    return source;
  }

  /* --------------------------------------------------------------- the grid */

  class VanillaDataGrid {
    constructor(target, options) {
      let table = null;
      if (typeof target === 'string') table = document.querySelector(target);
      else if (target instanceof Element) table = target;

      if (!table) throw new Error('Table "' + String(target) + '" not found.');
      if (table.tagName !== 'TABLE') throw new Error('VanillaDataGrid requires a <table> element.');
      if (!table.parentNode) throw new Error('The table must be in the DOM before initialization.');
      if (initializedTables.has(table)) {
        throw new Error('This table is already initialized as a VanillaDataGrid.');
      }

      this.table = table;
      this.options = normalizeOptions(options);
      this.labels = this.options.labels;
      this.destroyed = false;
      this.ready = Promise.resolve();
      this.debounceTimer = null;
      this.fetchController = null;
      this.exportController = null;
      this.originalHeaderState = [];

      const existingBody = table.tBodies[0] || null;
      this.originalTbodyHTML = existingBody ? existingBody.innerHTML : '';
      this.createdTbody = !existingBody;
      this.tbody = existingBody;

      this.columns = this.#readColumns();
      applyColumnOverrides(this.columns, this.options.columns);
      this.#normalizeColumns();
      if (!this.columns.length) {
        throw new Error('No columns found. Add <th> elements to <thead>.');
      }
      this.originalHeaderState = this.columns.map(function (column) {
        return {
          element: column.element,
          ariaSort: column.element.getAttribute('aria-sort'),
          tabindex: column.element.getAttribute('tabindex'),
          scope: column.element.getAttribute('scope')
        };
      });

      const localRows = existingBody ? readRows(existingBody) : [];
      this.source = this.options.ajax || this.options.ajaxUrl
        ? createRemoteSource(this.options, this.columns)
        : createLocalSource(localRows, this.columns);

      this.state = {
        page: 1,
        size: this.options.rowsPerPage,
        query: '',
        sort: null,
        hidden: new Set(),
        rows: [],
        total: 0,
        status: 'idle',
        error: null
      };

      initializedTables.add(table);
      try {
        this.#buildDOM();
        this.#bindEvents();
        this.#renderHeaders();
        this.ready = this.#load();
      } catch (error) {
        this.destroy();
        throw error;
      }
    }

    #readColumns() {
      const headers = this.table.tHead ? this.table.tHead.rows[0] : null;
      const cells = headers ? Array.prototype.slice.call(headers.cells) : [];
      return cells.filter(function (cell) {
        return cell.tagName === 'TH';
      }).map(function (th, index) {
        return {
          index: index,
          element: th,
          field: th.getAttribute('data-field') || 'col_' + index,
          label: (th.textContent || '').trim(),
          sortable: th.getAttribute('data-sortable') === 'true',
          type: th.getAttribute('data-type') || 'string'
        };
      });
    }

    #normalizeColumns() {
      this.columns.forEach(function (column, index) {
        column.index = index;
        if (!column.field) column.field = 'col_' + index;
        if (!column.label) column.label = column.field;
        if (['string', 'number', 'date'].indexOf(column.type) === -1) column.type = 'string';
        column.sortable = Boolean(column.sortable);
      });
    }

    #buildDOM() {
      const labels = this.labels;
      const id = 'vdg-' + (++uid);
      this.table.classList.add('v-dg-table');
      if (!this.tbody) {
        this.tbody = document.createElement('tbody');
        this.table.appendChild(this.tbody);
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'v-dg-wrapper';
      wrapper.innerHTML =
        '<div class="v-dg-controls">' +
          '<div class="v-dg-left-controls">' +
            '<label class="v-dg-sr-only" for="' + id + '-search">' + escapeHtml(labels.searchLabel) + '</label>' +
            '<input id="' + id + '-search" class="v-dg-input v-dg-search" type="search" placeholder="' +
              escapeHtml(labels.search) + '" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<div class="v-dg-right-controls"></div>' +
        '</div>' +
        '<div class="v-dg-bottom">' +
          '<div class="v-dg-info" role="status" aria-live="polite"></div>' +
          '<nav class="v-dg-pagination" aria-label="' + escapeHtml(labels.pagination) + '"></nav>' +
        '</div>';

      this.wrapper = wrapper;
      this.table.parentNode.insertBefore(wrapper, this.table);
      const bottom = wrapper.querySelector('.v-dg-bottom');
      wrapper.insertBefore(this.table, bottom);

      this.searchInput = wrapper.querySelector('.v-dg-search');
      this.infoDiv = wrapper.querySelector('.v-dg-info');
      this.paginationDiv = wrapper.querySelector('.v-dg-pagination');
      this.rightControls = wrapper.querySelector('.v-dg-right-controls');

      if (this.options.export.length) {
        const group = document.createElement('div');
        group.className = 'v-dg-export-group';
        this.options.export.forEach((format) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'v-dg-btn';
          button.dataset.vdg = 'export';
          button.dataset.format = format;
          button.textContent = labels[format] || format.toUpperCase();
          group.appendChild(button);
        });
        this.rightControls.appendChild(group);
      }

      this.#buildColumnMenu(id);
    }

    #buildColumnMenu(id) {
      const dropdown = document.createElement('div');
      dropdown.className = 'v-dg-dropdown';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'v-dg-btn v-dg-toggle-btn';
      toggle.dataset.vdg = 'columns';
      toggle.setAttribute('aria-haspopup', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', id + '-columns');
      toggle.textContent = this.labels.columns + ' \u2699';

      const menu = document.createElement('div');
      menu.id = id + '-columns';
      menu.className = 'v-dg-dropdown-menu v-dg-toggle-menu';

      this.columns.forEach((column) => {
        const item = document.createElement('label');
        item.className = 'v-dg-dropdown-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.dataset.vdg = 'column';
        checkbox.dataset.index = String(column.index);
        item.appendChild(checkbox);
        item.appendChild(document.createTextNode(' ' + column.label));
        menu.appendChild(item);
      });

      dropdown.appendChild(toggle);
      dropdown.appendChild(menu);
      this.rightControls.appendChild(dropdown);
      this.dropdown = dropdown;
      this.columnToggleBtn = toggle;
      this.columnToggleMenu = menu;
    }

    #bindEvents() {
      this.events = new AbortController();
      const signal = this.events.signal;

      this.searchInput.addEventListener('input', () => {
        this.#scheduleSearch();
      }, { signal });

      this.searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.#applySearchNow();
        }
      }, { signal });

      this.wrapper.addEventListener('click', (event) => {
        const target = event.target.closest('[data-vdg]');
        if (!target || !this.wrapper.contains(target)) return;
        const action = target.dataset.vdg;
        if (action === 'export') {
          event.preventDefault();
          this.#export(target.dataset.format);
        } else if (action === 'columns') {
          event.preventDefault();
          event.stopPropagation();
          this.#setMenu(!this.columnToggleMenu.classList.contains('v-dg-show'));
        } else if (action === 'page') {
          event.preventDefault();
          this.goToPage(Number(target.dataset.page));
        } else if (action === 'retry') {
          event.preventDefault();
          this.reload();
        }
      }, { signal });

      this.columnToggleMenu.addEventListener('change', (event) => {
        const checkbox = event.target.closest('input[data-vdg="column"]');
        if (!checkbox) return;
        this.setColumnVisible(Number(checkbox.dataset.index), checkbox.checked);
      }, { signal });

      this.table.addEventListener('click', (event) => {
        const th = event.target.closest('th');
        if (!th || !this.table.tHead || !this.table.tHead.contains(th)) return;
        const column = this.columns.find((item) => item.element === th);
        if (!column || !column.sortable) return;
        this.#toggleSort(column.index);
      }, { signal });

      this.table.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        const th = event.target.closest('th');
        if (!th || !this.table.tHead || !this.table.tHead.contains(th)) return;
        const column = this.columns.find((item) => item.element === th);
        if (!column || !column.sortable) return;
        event.preventDefault();
        this.#toggleSort(column.index);
      }, { signal });

      document.addEventListener('click', (event) => {
        if (this.dropdown && !this.dropdown.contains(event.target)) {
          this.#setMenu(false);
        }
      }, { signal });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.columnToggleMenu.classList.contains('v-dg-show')) {
          this.#setMenu(false);
          this.columnToggleBtn.focus();
        }
      }, { signal });
    }

    #setMenu(open) {
      this.columnToggleMenu.classList.toggle('v-dg-show', Boolean(open));
      this.columnToggleBtn.setAttribute('aria-expanded', String(Boolean(open)));
    }

    #scheduleSearch() {
      clearTimeout(this.debounceTimer);
      const apply = () => {
        const query = this.searchInput.value.trim();
        if (query === this.state.query) return;
        this.state.query = query;
        this.state.page = 1;
        this.#emit('search', { query: query });
        this.ready = this.#load();
      };
      if (this.options.searchDebounce === 0) apply();
      else this.debounceTimer = setTimeout(apply, this.options.searchDebounce);
    }

    #applySearchNow() {
      clearTimeout(this.debounceTimer);
      const query = this.searchInput.value.trim();
      if (query === this.state.query && this.state.status === 'ready') return;
      this.state.query = query;
      this.state.page = 1;
      this.#emit('search', { query: query });
      this.ready = this.#load();
    }

    #toggleSort(index) {
      const current = this.state.sort;
      const direction = current && current.index === index
        ? (current.dir === 'asc' ? 'desc' : 'asc')
        : 'asc';
      this.state.sort = { index: index, dir: direction };
      this.state.page = 1;
      this.#renderHeaders();
      this.#emit('sort', {
        index: index,
        dir: direction,
        field: this.columns[index] ? this.columns[index].field : ''
      });
      this.ready = this.#load();
      return this.ready;
    }

    async #load() {
      this.#assertAlive();
      this.fetchController?.abort();
      const controller = new AbortController();
      this.fetchController = controller;

      this.state.status = 'loading';
      this.state.error = null;
      this.#renderStatus();
      this.#renderInfo();
      this.#renderPagination();
      if (!this.state.rows.length) this.#renderRows();

      const requestedPage = this.state.page;
      try {
        const result = await this.source.load({
          page: requestedPage,
          size: this.state.size,
          query: this.state.query,
          sort: this.state.sort,
          signal: controller.signal
        });
        if (controller.signal.aborted || this.destroyed) return;

        const total = Number.isFinite(Number(result.total))
          ? Math.max(0, Math.floor(Number(result.total)))
          : result.rows.length;
        const totalPages = Math.max(1, Math.ceil(total / this.state.size));
        const page = clamp(Number(result.page) || requestedPage, 1, totalPages);

        if (this.source.mode === 'remote' && page !== requestedPage) {
          this.state.page = page;
          return this.#load();
        }

        this.state.rows = result.rows;
        this.state.total = total;
        this.state.page = page;
        this.state.status = 'ready';
        this.#render();
        this.#emit('load', {
          rows: this.state.rows,
          total: total,
          page: page,
          query: this.state.query,
          sort: this.state.sort
        });
      } catch (error) {
        if (controller.signal.aborted || this.destroyed) return;
        if (error && error.name === 'AbortError') return;
        this.state.status = 'error';
        this.state.error = error;
        this.#render();
        this.#emit('error', { error: error });
      } finally {
        if (this.fetchController === controller) this.fetchController = null;
      }
    }

    #render() {
      this.#renderStatus();
      this.#renderHeaders();
      this.#renderRows();
      this.#renderInfo();
      this.#renderPagination();
    }

    #renderStatus() {
      const loading = this.state.status === 'loading';
      this.wrapper.classList.toggle('v-dg-loading', loading);
      if (loading) this.table.setAttribute('aria-busy', 'true');
      else this.table.removeAttribute('aria-busy');
    }

    #renderHeaders() {
      this.columns.forEach((column) => {
        const th = column.element;
        if (!th) return;
        if (!th.hasAttribute('scope')) th.setAttribute('scope', 'col');
        th.classList.toggle('v-dg-sortable', column.sortable);
        th.classList.toggle('v-dg-hidden', this.state.hidden.has(column.index));
        if (column.sortable) {
          if (!th.hasAttribute('tabindex')) th.setAttribute('tabindex', '0');
          const active = this.state.sort && this.state.sort.index === column.index;
          const value = active ? (this.state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
          th.setAttribute('aria-sort', value);
        }
      });
    }

    #renderRows() {
      this.tbody.replaceChildren();

      if (this.state.status === 'error') {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = Math.max(1, this.columns.length);
        td.className = 'v-dg-state';
        td.textContent = this.labels.error;
        if (this.state.error && this.state.error.message) {
          const detail = document.createElement('div');
          detail.className = 'v-dg-error-detail';
          detail.textContent = this.state.error.message;
          td.appendChild(detail);
        }
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'v-dg-btn';
        retry.dataset.vdg = 'retry';
        retry.textContent = this.labels.retry;
        td.appendChild(retry);
        tr.appendChild(td);
        this.tbody.appendChild(tr);
        return;
      }

      if (!this.state.rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = Math.max(1, this.columns.length);
        td.className = 'v-dg-state';
        td.textContent = this.state.status === 'loading' ? this.labels.loading : this.labels.empty;
        tr.appendChild(td);
        this.tbody.appendChild(tr);
        return;
      }

      const fragment = document.createDocumentFragment();
      this.state.rows.forEach((row) => {
        const tr = document.createElement('tr');
        this.columns.forEach((column) => {
          const cell = row[column.index] || { html: '', text: '', className: '' };
          const td = document.createElement('td');
          if (cell.className) td.className = cell.className;
          if (this.state.hidden.has(column.index)) td.classList.add('v-dg-hidden');
          td.innerHTML = cell.html;
          tr.appendChild(td);
        });
        fragment.appendChild(tr);
      });
      this.tbody.appendChild(fragment);
    }

    #renderInfo() {
      this.infoDiv.classList.remove('v-dg-info-error');
      if (this.state.status === 'loading') {
        this.infoDiv.textContent = this.labels.loading;
        return;
      }
      if (this.state.status === 'error') {
        this.infoDiv.textContent = this.labels.error;
        return;
      }
      const total = this.state.total;
      const start = total > 0 ? (this.state.page - 1) * this.state.size + 1 : 0;
      const end = Math.min(this.state.page * this.state.size, total);
      this.infoDiv.textContent = typeof this.labels.info === 'function'
        ? this.labels.info({ start: start, end: end, total: total, page: this.state.page, pageSize: this.state.size })
        : 'Showing ' + start + ' to ' + end + ' of ' + total + ' entries';
    }

    #renderPagination() {
      const totalPages = Math.max(1, Math.ceil(this.state.total / this.state.size));
      const page = clamp(this.state.page, 1, totalPages);
      this.paginationDiv.replaceChildren();

      const prev = document.createElement('button');
      prev.type = 'button';
      prev.textContent = this.labels.prev;
      prev.dataset.vdg = 'page';
      prev.dataset.page = String(page - 1);
      prev.disabled = page <= 1;
      this.paginationDiv.appendChild(prev);

      pageWindow(page, totalPages).forEach((entry) => {
        if (typeof entry === 'string') {
          const span = document.createElement('span');
          span.className = 'v-dg-ellipsis';
          span.setAttribute('aria-hidden', 'true');
          span.textContent = entry;
          this.paginationDiv.appendChild(span);
          return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.vdg = 'page';
        button.dataset.page = String(entry);
        button.textContent = String(entry);
        button.setAttribute('aria-label', typeof this.labels.page === 'function'
          ? this.labels.page(entry)
          : 'Page ' + entry);
        if (entry === page) button.setAttribute('aria-current', 'page');
        this.paginationDiv.appendChild(button);
      });

      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = this.labels.next;
      next.dataset.vdg = 'page';
      next.dataset.page = String(page + 1);
      next.disabled = page >= totalPages;
      this.paginationDiv.appendChild(next);
    }

    #notifyError(error) {
      const message = error && error.message ? error.message : this.labels.exportError;
      this.infoDiv.textContent = message;
      this.infoDiv.classList.add('v-dg-info-error');
    }

    #emit(type, detail) {
      const payload = Object.assign({ grid: this }, detail || {});
      this.table.dispatchEvent(new CustomEvent('vdg:' + type, { bubbles: true, detail: payload }));
    }

    #assertAlive() {
      if (this.destroyed) throw new Error('This VanillaDataGrid instance has been destroyed.');
    }

    getState() {
      this.#assertAlive();
      return {
        page: this.state.page,
        size: this.state.size,
        query: this.state.query,
        sort: this.state.sort ? { index: this.state.sort.index, dir: this.state.sort.dir } : null,
        hidden: Array.from(this.state.hidden).sort(function (a, b) { return a - b; }),
        rows: this.state.rows.map(function (row) {
          return row.map(function (cell) { return Object.assign({}, cell); });
        }),
        total: this.state.total,
        status: this.state.status,
        error: this.state.error ? String(this.state.error.message || this.state.error) : null
      };
    }

    reload(settings) {
      this.#assertAlive();
      if (settings && settings.resetPage) this.state.page = 1;
      this.ready = this.#load();
      return this.ready;
    }

    search(term) {
      this.#assertAlive();
      clearTimeout(this.debounceTimer);
      const query = String(term == null ? '' : term).trim();
      this.searchInput.value = query;
      this.state.query = query;
      this.state.page = 1;
      this.#emit('search', { query: query });
      this.ready = this.#load();
      return this.ready;
    }

    sort(index, direction) {
      this.#assertAlive();
      const column = this.columns[Number(index)];
      if (!column) throw new Error('Column ' + index + ' not found.');
      const dir = direction == null ? 'asc' : direction;
      if (dir !== 'asc' && dir !== 'desc') {
        throw new Error('Sort direction must be "asc" or "desc".');
      }
      this.state.sort = { index: column.index, dir: dir };
      this.state.page = 1;
      this.#renderHeaders();
      this.#emit('sort', { index: column.index, dir: dir, field: column.field });
      this.ready = this.#load();
      return this.ready;
    }

    goToPage(page) {
      this.#assertAlive();
      const totalPages = Math.max(1, Math.ceil(this.state.total / this.state.size));
      const next = clamp(Math.floor(Number(page)) || 1, 1, totalPages);
      if (next === this.state.page && this.state.status === 'ready') return this.ready;
      this.state.page = next;
      this.#emit('page', { page: next });
      this.ready = this.#load();
      return this.ready;
    }

    setColumnVisible(index, visible) {
      this.#assertAlive();
      const column = this.columns[Number(index)];
      if (!column) throw new Error('Column ' + index + ' not found.');
      const show = visible !== false;
      if (show) this.state.hidden.delete(column.index);
      else this.state.hidden.add(column.index);
      const checkbox = this.columnToggleMenu.querySelector('input[data-index="' + column.index + '"]');
      if (checkbox) checkbox.checked = show;
      this.#renderHeaders();
      this.#renderRows();
      this.#emit('column', { index: column.index, visible: show, field: column.field });
    }

    setData(rows) {
      this.#assertAlive();
      if (this.source.mode !== 'local') {
        throw new Error('setData() is only available without an ajax source.');
      }
      if (!Array.isArray(rows)) throw new Error('setData() expects an array of rows.');
      this.source.setData(rows.map(normalizeRow));
      this.state.page = 1;
      this.ready = this.#load();
      return this.ready;
    }

    async #collectExport(signal) {
      const visible = this.columns.filter((column) => !this.state.hidden.has(column.index));
      if (!visible.length) throw new Error('There are no visible columns to export.');

      let rows;
      if (this.source.mode === 'local') {
        rows = this.source.exportRows({ query: this.state.query, sort: this.state.sort });
      } else if (this.options.exportScope === 'all') {
        rows = await this.source.exportRows({
          query: this.state.query,
          sort: this.state.sort,
          size: this.state.size,
          maxRows: this.options.maxExportRows,
          signal: signal
        });
      } else {
        rows = this.state.rows;
      }

      if (!rows.length) throw new Error(this.labels.exportEmpty);
      const keys = uniqueKeys(visible);
      return {
        headers: visible.map(function (column, index) {
          return { field: keys[index], label: column.label };
        }),
        rows: rows.map(function (row) {
          return visible.map(function (column) {
            const cell = row[column.index];
            return cell ? cell.text : '';
          });
        })
      };
    }

    async getExportData() {
      this.#assertAlive();
      this.exportController?.abort();
      const controller = new AbortController();
      this.exportController = controller;
      try {
        return await this.#collectExport(controller.signal);
      } finally {
        if (this.exportController === controller) this.exportController = null;
      }
    }

    async #export(format) {
      if (EXPORT_FORMATS.indexOf(format) === -1) return;
      try {
        const data = await this.getExportData();
        const base = sanitizeFilename(this.options.exportFilename);
        if (format === 'csv') {
          downloadFile(
            createCSV(data.headers.map(function (header) { return header.label; }), data.rows),
            base + '.csv',
            'text/csv;charset=utf-8;'
          );
        } else if (format === 'json') {
          downloadFile(
            createJSON(data.headers.map(function (header) { return { key: header.field }; }), data.rows),
            base + '.json',
            'application/json;charset=utf-8;'
          );
        } else {
          printTableFile(base, data.headers.map(function (header) { return header.label; }), data.rows);
        }
        this.#emit('export', { format: format, rows: data.rows.length });
      } catch (error) {
        if (this.destroyed) return;
        if (error && error.name === 'AbortError') return;
        this.#notifyError(error);
        this.#emit('error', { error: error, action: 'export' });
      }
    }

    exportCSV() {
      this.#assertAlive();
      return this.#export('csv');
    }

    exportJSON() {
      this.#assertAlive();
      return this.#export('json');
    }

    printTable() {
      this.#assertAlive();
      return this.#export('print');
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      initializedTables.delete(this.table);
      clearTimeout(this.debounceTimer);
      if (this.events) this.events.abort();
      if (this.fetchController) this.fetchController.abort();
      if (this.exportController) this.exportController.abort();

      this.originalHeaderState.forEach(function (entry) {
        const th = entry.element;
        if (!th) return;
        th.classList.remove('v-dg-sortable', 'v-dg-hidden');
        if (entry.ariaSort == null) th.removeAttribute('aria-sort');
        else th.setAttribute('aria-sort', entry.ariaSort);
        if (entry.tabindex == null) th.removeAttribute('tabindex');
        else th.setAttribute('tabindex', entry.tabindex);
        if (entry.scope == null) th.removeAttribute('scope');
        else th.setAttribute('scope', entry.scope);
      });

      this.table.classList.remove('v-dg-table');
      this.table.removeAttribute('aria-busy');

      if (this.createdTbody) {
        if (this.tbody && this.tbody.parentNode) this.tbody.remove();
      } else if (this.tbody) {
        this.tbody.innerHTML = this.originalTbodyHTML;
      }

      if (this.wrapper && this.wrapper.parentNode) {
        this.wrapper.parentNode.insertBefore(this.table, this.wrapper);
        this.wrapper.remove();
      }

      this.wrapper = null;
      this.searchInput = null;
      this.infoDiv = null;
      this.paginationDiv = null;
      this.rightControls = null;
      this.dropdown = null;
      this.columnToggleBtn = null;
      this.columnToggleMenu = null;
    }
  }

  VanillaDataGrid.__internals = Object.freeze({
    clamp: clamp,
    escapeHtml: escapeHtml,
    textFromHtml: textFromHtml,
    normalizeCell: normalizeCell,
    normalizeRow: normalizeRow,
    readRows: readRows,
    filterRows: filterRows,
    toNumber: toNumber,
    toTime: toTime,
    sortValue: sortValue,
    sortRows: sortRows,
    paginate: paginate,
    pageWindow: pageWindow,
    sanitizeFilename: sanitizeFilename,
    createCSV: createCSV,
    createJSON: createJSON,
    uniqueKeys: uniqueKeys
  });

  global.VanillaDataGrid = VanillaDataGrid;
  global.VanillaDataTable = VanillaDataGrid;
})(globalThis);
