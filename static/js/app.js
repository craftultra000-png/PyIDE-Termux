/**
 * PyIDE Termux application coordinator.
 *
 * The application deliberately keeps the browser bundle dependency-free. This
 * module coordinates UI state only; API, i18n, folder picking and commands are
 * separate modules so each responsibility can be tested independently.
 */
import { Editor } from './editor.js';
import { FileTree } from './filetree.js';
import { Terminal } from './terminal.js';
import { api, apiPost } from './core/api.js';
import { applyTranslations, translate } from './core/i18n.js';
import { isValidName, joinPath, parentPath } from './core/path-utils.js';
import { LocationPicker } from './components/location-picker.js';
import { CommandPalette } from './components/command-palette.js';

/** @param {string} id @returns {HTMLElement} */
const $ = id => document.getElementById(id);

const editorTextarea = $('editor-textarea');
const editor = new Editor(editorTextarea, $('editor-gutter'), $('syntax-overlay'));
const terminal = new Terminal($('terminal-output'), $('terminal-input'));

/**
 * Runtime-only UI state. Persisted preferences live separately in localStorage.
 * @type {{ currentFile: string | null, clipboard: {action: string, path: string} | null, contextTarget: any, roots: any[], newFileDir: string | null, newFolderDir: string | null, isDirty: boolean, findCursor: number, panelCollapsed: boolean, autoSaveTimer: number | null }}
 */
const state = {
  currentFile: null,
  clipboard: null,
  contextTarget: null,
  roots: [],
  newFileDir: null,
  newFolderDir: null,
  isDirty: false,
  findCursor: 0,
  panelCollapsed: false,
  autoSaveTimer: null,
};

const savedPreferences = JSON.parse(localStorage.getItem('pyide.settings') || '{}');
/** @type {{ fontSize: number, termFontSize: number, tabSize: number, wordWrap: boolean, autoBracket: boolean, autoSave: boolean, locale: string }} */
const settings = {
  fontSize: 14,
  termFontSize: 13,
  tabSize: 4,
  wordWrap: false,
  autoBracket: true,
  autoSave: false,
  locale: 'ar',
  ...savedPreferences,
};

const t = key => translate(settings.locale, key);
const filetree = new FileTree($('filetree'), entry => openFile(entry.path), showContextMenu);
const locationPicker = new LocationPicker({ getElement: $, api, t });
const commandPalette = new CommandPalette({ getElement: $, openModal, closeModal });

function persistSettings() {
  localStorage.setItem('pyide.settings', JSON.stringify(settings));
}

/** @param {string} message @param {'info'|'success'|'error'} [type] */
function toast(message, type = 'info') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  $('toast-container').append(item);
  setTimeout(() => item.remove(), 3200);
}

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

function updateSaveStatus() {
  const label = $('status-save');
  label.textContent = state.isDirty ? t('changed') : t('ready');
  label.style.color = state.isDirty ? '#ffc75d' : '';
}

function updateCursor() {
  const lines = editorTextarea.value.slice(0, editorTextarea.selectionStart).split('\n');
  $('status-cursor').textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1}`;
}

function markDirty() {
  if (!state.currentFile) return;
  state.isDirty = true;
  updateSaveStatus();
  if (!settings.autoSave) return;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(() => saveFile({ silent: true }), 2000);
}

function applyLocale() {
  applyTranslations(settings.locale, t);
  $('terminal-input').placeholder = t('commandPlaceholder');
  $('command-input').placeholder = t('commandPlaceholder');
  $('set-language').value = settings.locale;
  updateSaveStatus();
}

function applySettings() {
  editor.setFontSize(settings.fontSize);
  editor.setTabSize(settings.tabSize);
  editor.setWordWrap(settings.wordWrap);
  editor.autoBracket = settings.autoBracket;
  $('terminal-output').style.fontSize = `${settings.termFontSize}px`;
  $('set-font-size').value = settings.fontSize;
  $('set-term-font-size').value = settings.termFontSize;
  $('set-tab-size').value = settings.tabSize;
  $('set-word-wrap').checked = settings.wordWrap;
  $('set-auto-bracket').checked = settings.autoBracket;
  $('set-auto-save').checked = settings.autoSave;
  applyLocale();
}

/** @param {string} path */
async function openFile(path) {
  const data = await api(`/api/file?path=${encodeURIComponent(path)}`);
  if (data.error) return toast(data.error, 'error');

  state.currentFile = data.path || path;
  state.isDirty = false;
  editor.setValue(data.content || '');
  $('editor-container').classList.remove('hidden');
  $('welcome-screen').classList.add('hidden');
  $('current-path-display').removeAttribute('data-i18n');
  $('status-file').removeAttribute('data-i18n');
  $('current-path-display').textContent = state.currentFile;
  $('status-file').textContent = state.currentFile.split('/').pop();
  filetree.setActive(state.currentFile);
  updateSaveStatus();
  updateCursor();
  editor.focus();
}

/** @param {{ silent?: boolean }} [options] */
async function saveFile({ silent = false } = {}) {
  if (!state.currentFile) {
    if (!silent) toast(t('openFileFirst'), 'error');
    return false;
  }
  const data = await apiPost('/api/file', { path: state.currentFile, content: editor.getValue() });
  if (data.error) {
    if (!silent) toast(data.error, 'error');
    return false;
  }
  state.isDirty = false;
  updateSaveStatus();
  if (!silent) toast(t('saved'), 'success');
  return true;
}

async function runCurrentFile() {
  if (!state.currentFile) return toast(t('openFileFirst'), 'error');
  await saveFile({ silent: true });
  switchPanel('output');
  $('output-display').innerHTML = `<div class="out-info">${t('run')}… <span class="spinner"></span></div>`;
  renderOutput(await apiPost('/api/run', { path: state.currentFile, stdin: $('stdin-input').value }));
}

/** @param {{ error?: string, stdout?: string, stderr?: string, returncode?: number }} data */
function renderOutput(data) {
  const output = $('output-display');
  output.replaceChildren();
  output.className = 'output-display';
  if (data.error) {
    output.classList.add('out-stderr');
    output.textContent = data.error;
    return;
  }
  for (const [key, className] of [['stdout', 'out-stdout'], ['stderr', 'out-stderr']]) {
    if (!data[key]) continue;
    const pre = document.createElement('pre');
    pre.className = className;
    pre.textContent = data[key];
    output.append(pre);
  }
  const result = document.createElement('div');
  result.className = data.returncode === 0 ? 'out-rc-ok' : 'out-rc-err';
  result.textContent = `[exit ${data.returncode}]`;
  output.append(result);
}

/** @param {MouseEvent} event @param {any} entry */
function showContextMenu(event, entry) {
  state.contextTarget = entry;
  $('context-menu').querySelector('[data-action="paste"]').classList.toggle('ctx-paste-disabled', !state.clipboard);
  const menu = $('context-menu');
  menu.classList.remove('hidden');
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 175)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 220)}px`;
}

function hideContextMenu() { $('context-menu').classList.add('hidden'); }

async function pasteClipboard(target) {
  if (!state.clipboard) return;
  const destinationDir = target.isDir ? target.path : parentPath(target.path, filetree.getRootPath());
  const destination = joinPath(destinationDir, state.clipboard.path.split('/').pop());
  const endpoint = state.clipboard.action === 'copy' ? '/api/copy' : '/api/move';
  const data = await apiPost(endpoint, { src: state.clipboard.path, dst: destination });
  if (data.error) return toast(data.error, 'error');
  if (state.clipboard.action === 'cut') state.clipboard = null;
  toast(t('pasted'), 'success');
  filetree.refresh();
}

/** @param {string} path */
function downloadFile(path) {
  const link = document.createElement('a');
  link.href = `/api/download?path=${encodeURIComponent(path)}`;
  link.download = path.split('/').pop();
  link.click();
}

function openNewFileModal() {
  state.newFileDir = filetree.getSelectedDirectory() || state.roots[0]?.path || null;
  $('new-file-dir').textContent = state.newFileDir || '';
  $('new-file-name').value = '';
  openModal('modal-new-file');
  setTimeout(() => $('new-file-name').focus(), 50);
}

function openNewFolderModal() {
  state.newFolderDir = filetree.getSelectedDirectory() || state.roots[0]?.path || null;
  $('new-folder-dir').textContent = state.newFolderDir || '';
  $('new-folder-name').value = '';
  openModal('modal-new-folder');
  setTimeout(() => $('new-folder-name').focus(), 50);
}

/** @param {'file'|'folder'} type */
async function openLocationPicker(type) {
  const currentPath = type === 'file' ? state.newFileDir : state.newFolderDir;
  try {
    await locationPicker.open(currentPath, path => {
      if (type === 'file') {
        state.newFileDir = path;
        $('new-file-dir').textContent = path;
      } else {
        state.newFolderDir = path;
        $('new-folder-dir').textContent = path;
      }
      toast(t('locationSelected'), 'success');
    });
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function createFile() {
  const name = $('new-file-name').value.trim();
  if (!isValidName(name)) return toast(t('invalidName'), 'error');
  const data = await apiPost('/api/file', { path: joinPath(state.newFileDir, name), content: '' });
  if (data.error) return toast(data.error, 'error');
  closeModal('modal-new-file');
  await filetree.refresh();
  toast(t('createdFile'), 'success');
  openFile(data.path);
}

async function createFolder() {
  const name = $('new-folder-name').value.trim();
  if (!isValidName(name)) return toast(t('invalidName'), 'error');
  const data = await apiPost('/api/folder', { path: joinPath(state.newFolderDir, name) });
  if (data.error) return toast(data.error, 'error');
  closeModal('modal-new-folder');
  await filetree.refresh();
  toast(t('createdFolder'), 'success');
}

/** @param {any} entry */
function openRenameModal(entry) {
  $('rename-value').value = entry.name;
  openModal('modal-rename');
  setTimeout(() => $('rename-value').focus(), 50);
  $('btn-rename-confirm').onclick = async () => {
    const name = $('rename-value').value.trim();
    if (!isValidName(name)) return toast(t('invalidName'), 'error');
    const destination = joinPath(parentPath(entry.path, filetree.getRootPath()), name);
    const data = await apiPost('/api/move', { src: entry.path, dst: destination });
    if (data.error) return toast(data.error, 'error');
    if (state.currentFile === entry.path) state.currentFile = data.dst || destination;
    closeModal('modal-rename');
    await filetree.refresh();
    toast(t('renaming'), 'success');
  };
}

/** @param {any} entry */
function openDeleteModal(entry) {
  $('delete-confirm-msg').textContent = `${t('delete')} “${entry.name}”?`;
  openModal('modal-delete');
  $('btn-delete-confirm').onclick = async () => {
    const data = await api(`/api/file?path=${encodeURIComponent(entry.path)}`, { method: 'DELETE' });
    if (data.error) return toast(data.error, 'error');
    if (state.currentFile === entry.path) resetOpenFile();
    closeModal('modal-delete');
    await filetree.refresh();
    toast(t('deleted'), 'success');
  };
}

function resetOpenFile() {
  state.currentFile = null;
  state.isDirty = false;
  $('editor-container').classList.add('hidden');
  $('welcome-screen').classList.remove('hidden');
  $('current-path-display').setAttribute('data-i18n', 'noFile');
  $('status-file').setAttribute('data-i18n', 'noFile');
  $('current-path-display').textContent = t('noFile');
  $('status-file').textContent = t('noFile');
  updateSaveStatus();
}

function switchSidebarTab(name) {
  document.querySelectorAll('.stab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${name}`));
  if (name === 'packages') loadPackageList();
}

function toggleSidebar(force) {
  const sidebar = $('sidebar');
  const mobile = window.innerWidth <= 700;
  if (mobile) sidebar.classList.toggle('open', force ?? !sidebar.classList.contains('open'));
  else sidebar.classList.toggle('collapsed', force === undefined ? !sidebar.classList.contains('collapsed') : !force);
}

function switchPanel(name) {
  document.querySelectorAll('.ptab').forEach(tab => tab.classList.toggle('active', tab.dataset.ptab === name));
  document.querySelectorAll('.panel-body').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${name}`));
  if (state.panelCollapsed) expandPanel();
}

function expandPanel() {
  $('bottom-panel').classList.remove('collapsed');
  $('panel-toggle-icon').innerHTML = '<polyline points="18 15 12 9 6 15"/>';
  state.panelCollapsed = false;
}

function collapsePanel() {
  $('bottom-panel').classList.add('collapsed');
  $('panel-toggle-icon').innerHTML = '<polyline points="6 9 12 15 18 9"/>';
  state.panelCollapsed = true;
}

async function loadRoots() {
  const data = await api('/api/roots');
  state.roots = data.roots || [];
  locationPicker.setRoots(state.roots);
  const rootBar = $('ft-roots');
  rootBar.replaceChildren(...state.roots.map(root => {
    const chip = document.createElement('button');
    chip.className = 'root-chip';
    chip.textContent = root.label;
    chip.title = root.path;
    chip.addEventListener('click', async () => {
      rootBar.querySelectorAll('.root-chip').forEach(item => item.classList.remove('active'));
      chip.classList.add('active');
      $('ft-cwd-label').textContent = root.path;
      await filetree.loadRoot(root.path);
      terminal.setCwd(root.path);
    });
    return chip;
  }));
  rootBar.querySelector('.root-chip')?.click();
}

async function loadPackageList() {
  const list = $('pkg-list');
  list.innerHTML = `<div class="pkg-loading">${t('loading')}</div>`;
  const data = await api('/api/packages');
  if (data.error || !data.packages) {
    list.textContent = data.error || t('loadingError');
    return;
  }
  list.replaceChildren(...data.packages.map(pkg => {
    const row = document.createElement('div');
    row.className = 'pkg-item';
    row.innerHTML = `<span>${pkg.name}</span><span class="pkg-version">${pkg.version}</span>`;
    return row;
  }));
}

async function installPackage(packageName, manager) {
  if (!packageName) return;
  switchPanel('terminal');
  terminal.printInfo(`${t('install')} ${packageName} (${manager})…`);
  const data = await apiPost('/api/install', { package: packageName, manager });
  if (data.error) return terminal.printErr(data.error);
  terminal.printOut(data.stdout);
  terminal.printErr(data.stderr);
  loadPackageList();
}

function openFind(focusReplace = false) {
  if (!state.currentFile) return toast(t('openFileFirst'), 'error');
  $('findbar').classList.remove('hidden');
  const selected = editorTextarea.value.slice(editorTextarea.selectionStart, editorTextarea.selectionEnd);
  if (selected) $('find-input').value = selected;
  (focusReplace ? $('replace-input') : $('find-input')).focus();
  state.findCursor = editorTextarea.selectionEnd;
}

function closeFind() {
  $('findbar').classList.add('hidden');
  editor.focus();
}

function findNext(backward = false) {
  const query = $('find-input').value;
  if (!query) return;
  const content = editorTextarea.value;
  let index = backward
    ? content.lastIndexOf(query, Math.max(0, state.findCursor - query.length - 1))
    : content.indexOf(query, state.findCursor);
  if (index < 0) index = backward ? content.lastIndexOf(query) : content.indexOf(query);
  if (index < 0) return;
  editorTextarea.focus();
  editorTextarea.setSelectionRange(index, index + query.length);
  state.findCursor = backward ? index : index + query.length;
  updateCursor();
}

function replaceOne() {
  const query = $('find-input').value;
  if (!query) return;
  const replacement = $('replace-input').value;
  const start = editorTextarea.selectionStart;
  const end = editorTextarea.selectionEnd;
  if (editorTextarea.value.slice(start, end) !== query) return findNext();
  const updated = editorTextarea.value.slice(0, start) + replacement + editorTextarea.value.slice(end);
  editor.setValue(updated);
  editorTextarea.setSelectionRange(start, start + replacement.length);
  state.findCursor = start + replacement.length;
  markDirty();
}

function replaceAll() {
  const query = $('find-input').value;
  if (!query || !editorTextarea.value.includes(query)) return;
  editor.setValue(editorTextarea.value.split(query).join($('replace-input').value));
  state.findCursor = 0;
  markDirty();
}

function configureCommandPalette() {
  commandPalette.setCommands([
    { label: 'New file', shortcut: 'Ctrl+N', run: openNewFileModal },
    { label: 'Save', shortcut: 'Ctrl+S', run: saveFile },
    { label: 'Run file', shortcut: 'F5', run: runCurrentFile },
    { label: 'Find and replace', shortcut: 'Ctrl+F', run: openFind },
    { label: 'Browse files', run: () => { switchSidebarTab('files'); toggleSidebar(true); } },
    { label: 'Open settings', run: () => { switchSidebarTab('settings'); toggleSidebar(true); } },
    { label: 'Toggle auto save', run: () => { settings.autoSave = !settings.autoSave; $('set-auto-save').checked = settings.autoSave; persistSettings(); } },
    { label: 'Focus terminal', shortcut: 'Ctrl+`', run: () => switchPanel('terminal') },
  ]);
}

function bindEvents() {
  document.querySelectorAll('[data-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.modal)));
  document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', event => { if (event.target === overlay) overlay.classList.add('hidden'); }));

  $('context-menu').addEventListener('click', async event => {
    const item = event.target.closest('li');
    const target = state.contextTarget;
    if (!item || !target) return;
    hideContextMenu();
    const action = item.dataset.action;
    if (action === 'open' && !target.isDir) return openFile(target.path);
    if (action === 'rename') return openRenameModal(target);
    if (action === 'copy') { state.clipboard = { action: 'copy', path: target.path }; return toast(t('copied')); }
    if (action === 'cut') { state.clipboard = { action: 'cut', path: target.path }; return toast(t('cutDone')); }
    if (action === 'paste') return pasteClipboard(target);
    if (action === 'download') return downloadFile(target.path);
    if (action === 'delete') openDeleteModal(target);
  });
  document.addEventListener('click', event => { if (!$('context-menu').contains(event.target)) hideContextMenu(); });

  $('btn-new').addEventListener('click', openNewFileModal);
  $('welcome-new').addEventListener('click', openNewFileModal);
  $('ft-new-file').addEventListener('click', openNewFileModal);
  $('ft-new-folder').addEventListener('click', openNewFolderModal);
  $('new-file-location').addEventListener('click', () => openLocationPicker('file'));
  $('new-folder-location').addEventListener('click', () => openLocationPicker('folder'));
  $('btn-new-file-confirm').addEventListener('click', createFile);
  $('btn-new-folder-confirm').addEventListener('click', createFolder);
  $('new-file-name').addEventListener('keydown', event => { if (event.key === 'Enter') createFile(); });
  $('new-folder-name').addEventListener('keydown', event => { if (event.key === 'Enter') createFolder(); });

  $('btn-save').addEventListener('click', saveFile);
  $('btn-run').addEventListener('click', runCurrentFile);
  $('btn-run-with-stdin').addEventListener('click', runCurrentFile);
  $('btn-command').addEventListener('click', () => commandPalette.open());
  $('btn-settings-open').addEventListener('click', () => { switchSidebarTab('settings'); toggleSidebar(true); });
  $('btn-sidebar-toggle').addEventListener('click', () => toggleSidebar());
  $('welcome-open').addEventListener('click', () => { switchSidebarTab('files'); toggleSidebar(true); });
  $('ft-refresh').addEventListener('click', async () => { await filetree.refresh(); toast(t('refreshed'), 'success'); });
  $('ft-upload').addEventListener('click', () => $('upload-input').click());
  $('upload-input').addEventListener('change', uploadFiles);

  document.querySelectorAll('.stab').forEach(tab => tab.addEventListener('click', () => switchSidebarTab(tab.dataset.tab)));
  document.querySelectorAll('.ptab').forEach(tab => tab.addEventListener('click', () => switchPanel(tab.dataset.ptab)));
  $('btn-panel-toggle').addEventListener('click', () => state.panelCollapsed ? expandPanel() : collapsePanel());
  $('btn-panel-clear').addEventListener('click', () => { terminal.clear(); $('output-display').innerHTML = `<div class="output-empty"><span>${t('runHint')}</span></div>`; });

  bindSettings();
  bindFind();
  bindShortcuts();
  bindPanelResize();
  editorTextarea.addEventListener('input', markDirty);
  editorTextarea.addEventListener('keyup', updateCursor);
  editorTextarea.addEventListener('click', updateCursor);
}

async function uploadFiles(event) {
  const destination = filetree.getSelectedDirectory() || state.roots[0]?.path;
  if (!destination) return;
  for (const file of [...event.target.files]) {
    const form = new FormData();
    form.append('file', file);
    form.append('path', destination);
    const data = await (await fetch('/api/upload', { method: 'POST', body: form })).json();
    if (data.error) toast(data.error, 'error');
  }
  if (event.target.files.length) { toast(`${event.target.files.length} ✓`, 'success'); filetree.refresh(); }
  event.target.value = '';
}

function bindSettings() {
  const numeric = (id, property, target, formatter = value => `${value}px`) => {
    $(id).addEventListener('input', event => {
      settings[property] = +event.target.value;
      $(target).textContent = formatter(settings[property]);
      persistSettings();
    });
  };
  numeric('set-font-size', 'fontSize', 'set-font-size-val');
  $('set-font-size').addEventListener('input', () => editor.setFontSize(settings.fontSize));
  numeric('set-term-font-size', 'termFontSize', 'set-term-font-size-val');
  $('set-term-font-size').addEventListener('input', () => { $('terminal-output').style.fontSize = `${settings.termFontSize}px`; });
  $('set-tab-size').addEventListener('change', event => { settings.tabSize = +event.target.value; editor.setTabSize(settings.tabSize); persistSettings(); });
  $('set-word-wrap').addEventListener('change', event => { settings.wordWrap = event.target.checked; editor.setWordWrap(settings.wordWrap); persistSettings(); });
  $('set-auto-bracket').addEventListener('change', event => { settings.autoBracket = event.target.checked; editor.autoBracket = settings.autoBracket; persistSettings(); });
  $('set-auto-save').addEventListener('change', event => { settings.autoSave = event.target.checked; persistSettings(); });
  $('set-language').addEventListener('change', event => { settings.locale = event.target.value; persistSettings(); applyLocale(); });
}

function bindFind() {
  $('find-close').addEventListener('click', closeFind);
  $('find-next').addEventListener('click', () => findNext());
  $('find-prev').addEventListener('click', () => findNext(true));
  $('replace-one').addEventListener('click', replaceOne);
  $('replace-all').addEventListener('click', replaceAll);
  $('find-input').addEventListener('input', () => { state.findCursor = 0; findNext(); });
  $('find-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); findNext(event.shiftKey); } });
}

function bindShortcuts() {
  document.addEventListener('keydown', event => {
    const control = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (control && key === 's') { event.preventDefault(); saveFile(); }
    if (control && key === 'n') { event.preventDefault(); openNewFileModal(); }
    if (control && key === 'f') { event.preventDefault(); openFind(); }
    if (control && key === 'h') { event.preventDefault(); openFind(true); }
    if (control && key === 'p') { event.preventDefault(); commandPalette.open(); }
    if (control && key === 'i') { event.preventDefault(); $('stdin-row').classList.toggle('hidden'); }
    if (event.key === 'F5') { event.preventDefault(); runCurrentFile(); }
    if (event.key === 'Escape') { hideContextMenu(); closeFind(); document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.add('hidden')); }
  });
}

function bindPanelResize() {
  let dragging = false;
  let startY = 0;
  let startHeight = 0;
  $('panel-resize-handle').addEventListener('mousedown', event => { dragging = true; startY = event.clientY; startHeight = $('bottom-panel').offsetHeight; });
  document.addEventListener('mousemove', event => {
    if (!dragging) return;
    const height = Math.max(38, Math.min(window.innerHeight * 0.6, startHeight + startY - event.clientY));
    $('bottom-panel').style.height = `${height}px`;
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}

async function init() {
  applySettings();
  $('set-font-size-val').textContent = `${settings.fontSize}px`;
  $('set-term-font-size-val').textContent = `${settings.termFontSize}px`;
  bindEvents();
  configureCommandPalette();
  try {
    const response = await apiPost('/api/cmd', { cmd: 'python --version' });
    $('si-python').removeAttribute('data-i18n');
    $('si-python').textContent = (response.stdout || response.stderr || '').trim() || '—';
  } catch {
    $('si-python').removeAttribute('data-i18n');
    $('si-python').textContent = '—';
  }
  await loadRoots();
  terminal.printInfo('PyIDE Termux Pro · Ready');
}

init();
