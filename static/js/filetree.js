/**
 * UI design contract: "مرصد الشيفرة" keeps navigation calm and explicit.
 * The active root is always replaced, never appended, and private dot-files
 * remain out of the normal explorer flow.
 */

// ── File-type icon map ────────────────────────────────────────────────────────

const ICONS = {
  // Python
  py:   `<svg viewBox="0 0 24 24" class="ft-icon" style="color:#3b82f6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9.5 7h5C15.33 7 16 7.67 16 8.5v2c0 .83-.67 1.5-1.5 1.5h-5C8.67 12 8 11.33 8 10.5v-2C8 7.67 8.67 7 9.5 7zM8.5 12h5c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5v-2c0-.83.67-1.5 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10.5" cy="9.5" r=".75" fill="currentColor"/><circle cx="13.5" cy="14.5" r=".75" fill="currentColor"/></svg>`,
  // Text / Markdown
  txt:  fileIcon('#8b949e'),
  md:   fileIcon('#e879f9'),
  // Config / Data
  json: fileIcon('#facc15'),
  yaml: fileIcon('#facc15'),
  yml:  fileIcon('#facc15'),
  toml: fileIcon('#facc15'),
  ini:  fileIcon('#facc15'),
  cfg:  fileIcon('#facc15'),
  // Web
  html: fileIcon('#f97316'),
  css:  fileIcon('#3b82f6'),
  js:   fileIcon('#facc15'),
  ts:   fileIcon('#3b82f6'),
  // Images
  png:  imgIcon(), jpg: imgIcon(), jpeg: imgIcon(), gif: imgIcon(), svg: imgIcon(), webp: imgIcon(),
  // Archives
  zip: archiveIcon(), gz: archiveIcon(), tar: archiveIcon(), '7z': archiveIcon(),
  // Shell
  sh:   fileIcon('#22c55e'),
  bash: fileIcon('#22c55e'),
  // Default
  _dir: folderIcon(),
  _file: fileIcon('#8b949e'),
};

function fileIcon(color) {
  return `<svg viewBox="0 0 24 24" class="ft-icon" style="color:${color}" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}
function folderIcon() {
  return `<svg viewBox="0 0 24 24" class="ft-icon" style="color:#f59e0b" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`;
}
function imgIcon() {
  return `<svg viewBox="0 0 24 24" class="ft-icon" style="color:#ec4899" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}
function archiveIcon() {
  return `<svg viewBox="0 0 24 24" class="ft-icon" style="color:#a78bfa" stroke="currentColor" stroke-width="1.5" fill="none"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
}

function iconFor(entry) {
  if (entry.isDir) return ICONS._dir;
  const ext = entry.ext.replace('.', '');
  return ICONS[ext] || ICONS._file;
}

// ── FileTree class ────────────────────────────────────────────────────────────

export class FileTree {
  /**
   * @param {HTMLElement} container
   * @param {Function} onOpen   — called with entry object
   * @param {Function} onCtxMenu — called with (event, entry)
   */
  constructor(container, onOpen, onCtxMenu, t = key => key) {
    this.el       = container;
    this.onOpen   = onOpen;
    this.onCtxMenu = onCtxMenu;
    this.t        = t;
    this._open    = new Set();   // expanded dir paths
    this._cache   = new Map();   // path → entries[]
    this._current = null;        // currently active file path
    this._rootPath = null;       // selected storage root
    this._selectedDir = null;    // destination used by creation and uploads
    this.el.addEventListener('contextmenu', event => {
      if (event.target.closest('.ft-item')) return;
      const destination = event.target.closest('[data-directory]')?.dataset.directory || this.getSelectedDirectory();
      if (!destination) return;
      event.preventDefault();
      this.onCtxMenu(event, { path: destination, name: '', isDir: true, isDestination: true });
    });
  }

  /** Render a directory at root level */
  async loadRoot(path) {
    this._open.clear();
    this._cache.clear();
    this.el.replaceChildren();
    this._rootPath = path;
    this._selectedDir = path;
    this._open.add(path);
    await this._renderTree(this.el, path, 0);
  }

  getRootPath() { return this._rootPath; }
  getSelectedDirectory() { return this._selectedDir || this._rootPath; }

  /** Highlight a file as active */
  setActive(path) {
    this._current = path;
    this.el.querySelectorAll('.ft-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === path);
    });
  }

  /** Refresh current visible tree */
  async refresh() {
    const root = this._rootPath;
    if (!root) return;
    this._cache.clear();
    this.el.replaceChildren();
    await this._renderTree(this.el, root, 0);
  }

  // ── Internals ──────────────────────────────────────────────────

  async _renderTree(container, dirPath, depth) {
    container.dataset.directory = dirPath;
    let entries = this._cache.get(dirPath);
    if (!entries) {
      try {
        const resp = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
        const data = await resp.json();
        if (data.error) { this._showError(container, data.error); return; }
        entries = (data.entries || []).filter(entry => !entry.name.startsWith('.'));
        this._cache.set(dirPath, entries);
      } catch {
        this._showError(container, this.t('loadingError'));
        return;
      }
    }

    for (const entry of entries) {
      const item = this._makeItem(entry, depth);
      container.appendChild(item);

      if (entry.isDir && this._open.has(entry.path)) {
        const sub = document.createElement('div');
        sub.className = 'ft-subtree';
        container.appendChild(sub);
        await this._renderTree(sub, entry.path, depth + 1);
      }
    }
  }

  _makeItem(entry, depth) {
    const div = document.createElement('div');
    div.className = 'ft-item';
    div.dataset.path  = entry.path;
    div.dataset.isDir = entry.isDir ? '1' : '0';
    if (entry.path === this._current) div.classList.add('active');

    // Build inner HTML
    const indent  = `<span class="ft-indent" style="width:${depth * 14}px"></span>`;
    const chevron = entry.isDir
      ? `<svg viewBox="0 0 24 24" class="ft-chevron${this._open.has(entry.path) ? ' open' : ''}"><polyline points="9 18 15 12 9 6"/></svg>`
      : `<span style="width:14px;display:inline-block"></span>`;
    const icon  = iconFor(entry);
    const label = `<span class="ft-name" title="${entry.path}">${entry.name}</span>`;

    div.innerHTML = indent + chevron + icon + label;

    // Click to open file / toggle dir
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      if (entry.isDir) {
        this._selectedDir = entry.path;
        this._toggleDir(div, entry);
      } else {
        // Opening a file is a single, direct action. The coordinator receives
        // the path and can immediately switch the mobile workbench to editor.
        this.onOpen(entry.path);
      }
    });

    // Context menu
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onCtxMenu(e, entry);
    });

    return div;
  }

  async _toggleDir(itemEl, entry) {
    const isOpen = this._open.has(entry.path);
    const chevron = itemEl.querySelector('.ft-chevron');
    let sub = itemEl.nextElementSibling;

    if (isOpen) {
      this._open.delete(entry.path);
      if (sub && sub.className === 'ft-subtree') sub.remove();
      chevron && chevron.classList.remove('open');
    } else {
      this._open.add(entry.path);
      chevron && chevron.classList.add('open');
      const newSub = document.createElement('div');
      newSub.className = 'ft-subtree';
      itemEl.after(newSub);
      await this._renderTree(newSub, entry.path, this._depthOf(itemEl));
    }
  }

  _depthOf(el) {
    const indent = el.querySelector('.ft-indent');
    return indent ? Math.round(parseInt(indent.style.width || '0') / 14) + 1 : 1;
  }

  _showError(container, msg) {
    const p = document.createElement('div');
    p.className = 'term-info';
    p.style.padding = '6px 10px';
    p.textContent = msg;
    container.appendChild(p);
  }
}
