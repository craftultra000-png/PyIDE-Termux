import { findRootForPath, parentPath } from '../core/path-utils.js';

/** @typedef {{ id: string, path: string, label: string }} StorageRoot */

/**
 * Visual folder selection component. It deliberately lists folders only and
 * never accepts a raw user-supplied path.
 */
export class LocationPicker {
  /**
   * @param {{ getElement: (id: string) => HTMLElement, api: (path: string) => Promise<any>, t: (key: string) => string }} options
   */
  constructor({ getElement, api, t }) {
    this.$ = getElement;
    this.api = api;
    this.t = t;
    /** @type {StorageRoot[]} */ this.roots = [];
    /** @type {StorageRoot | null} */ this.root = null;
    this.path = null;
    this.onConfirm = null;

    this.$('btn-location-confirm').addEventListener('click', () => this.confirm());
  }

  /** @param {StorageRoot[]} roots */
  setRoots(roots) { this.roots = roots; }

  /** @param {string | null | undefined} initialPath @param {(path: string) => void} onConfirm */
  async open(initialPath, onConfirm) {
    this.onConfirm = onConfirm;
    this.root = findRootForPath(this.roots, initialPath) || this.roots[0] || null;
    this.path = initialPath || this.root?.path || null;
    if (!this.path || !this.root) throw new Error(this.t('loadingError'));
    this.$('modal-location-picker').classList.remove('hidden');
    await this.render();
  }

  close() { this.$('modal-location-picker').classList.add('hidden'); }

  confirm() {
    if (!this.path || !this.onConfirm) return;
    this.onConfirm(this.path);
    this.close();
  }

  async render() {
    this.$('picker-path').textContent = this.path;
    const rootList = this.$('location-roots');
    rootList.replaceChildren(...this.roots.map(root => this.makeRootButton(root)));

    const tree = this.$('picker-tree');
    tree.replaceChildren();
    if (this.path !== this.root.path) tree.append(this.makeUpButton());
    try {
      const data = await this.api(`/api/files?path=${encodeURIComponent(this.path)}`);
      if (data.error) throw new Error(data.error);
      const folders = (data.entries || []).filter(entry => entry.isDir && !entry.name.startsWith('.'));
      if (!folders.length) {
        const empty = document.createElement('p');
        empty.className = 'pkg-loading';
        empty.textContent = '—';
        tree.append(empty);
      }
      folders.forEach(entry => tree.append(this.makeFolderButton(entry)));
    } catch (error) {
      const message = document.createElement('p');
      message.className = 'pkg-loading';
      message.textContent = `${this.t('loadingError')}: ${error.message}`;
      tree.append(message);
    }
  }

  /** @param {StorageRoot} root */
  makeRootButton(root) {
    const button = document.createElement('button');
    button.className = `location-root ${root.path === this.root?.path ? 'active' : ''}`;
    button.innerHTML = `<strong>${root.label}</strong><small>${root.path}</small>`;
    button.addEventListener('click', () => { this.root = root; this.path = root.path; this.render(); });
    return button;
  }

  makeUpButton() {
    const button = document.createElement('button');
    button.className = 'picker-row up';
    button.innerHTML = '<span>↥</span><span>..</span>';
    button.addEventListener('click', () => { this.path = parentPath(this.path, this.root.path); this.render(); });
    return button;
  }

  /** @param {{ name: string, path: string }} entry */
  makeFolderButton(entry) {
    const button = document.createElement('button');
    button.className = 'picker-row';
    button.innerHTML = `<span class="folder-symbol">□</span><span>${entry.name}</span>`;
    button.addEventListener('click', () => { this.path = entry.path; this.render(); });
    return button;
  }
}
