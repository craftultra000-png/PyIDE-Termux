/**
 * Application coordinator for PyIDE Termux Pro.
 * Design contract: UI follows its locale; code, file paths, line numbers and
 * terminal text remain LTR regardless of the selected interface language.
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
const settings = {
  fontSize: 14,
  termFontSize: 13,
  tabSize: 4,
  wordWrap: false,
  autoBracket: true,
  autoSave: false,
  locale: 'ar',
  theme: 'midnight',
  ...savedPreferences,
};

const LANGUAGE_NAMES = { ar: 'العربية', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', tr: 'Türkçe', ru: 'Русский', hi: 'हिन्दी' };
const t = key => translate(settings.locale, key);
const filetree = new FileTree($('filetree'), openFile, showContextMenu);
const locationPicker = new LocationPicker({ getElement: $, api, t });
const commandPalette = new CommandPalette({ getElement: $, openModal, closeModal });

function persistSettings() { localStorage.setItem('pyide.settings', JSON.stringify(settings)); }

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
function isMobile() { return window.innerWidth <= 700; }

function updateSaveStatus() {
  $('status-save').textContent = state.isDirty ? t('changed') : t('ready');
  $('status-save').style.color = state.isDirty ? '#ffc75d' : '';
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
  $('set-language-value').textContent = LANGUAGE_NAMES[settings.locale] || settings.locale;
  updateSaveStatus();
}

function applyTheme() {
  const theme = ['midnight', 'paper', 'termux'].includes(settings.theme) ? settings.theme : 'midnight';
  settings.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'paper' ? '#f4f7fb' : theme === 'termux' ? '#071a19' : '#10151d');
  document.querySelectorAll('.theme-choice').forEach(choice => {
    const active = choice.dataset.theme === theme;
    choice.classList.toggle('active', active);
    choice.setAttribute('aria-checked', String(active));
  });
}

function applySettings() {
  editor.setFontSize(settings.fontSize);
  editor.setTabSize(settings.tabSize);
  editor.setWordWrap(settings.wordWrap);
  editor.autoBracket = settings.autoBracket;
  $('terminal-output').style.fontSize = `${settings.termFontSize}px`;
  $('set-font-size').value = settings.fontSize;
  $('set-font-size-val').textContent = `${settings.fontSize}px`;
  $('set-term-font-size').value = settings.termFontSize;
  $('set-term-font-size-val').textContent = `${settings.termFontSize}px`;
  $('set-tab-size-value').textContent = settings.tabSize;
  $('set-word-wrap').checked = settings.wordWrap;
  $('set-auto-bracket').checked = settings.autoBracket;
  $('set-auto-save').checked = settings.autoSave;
  applyTheme();
  applyLocale();
}

function setWorkspaceView(view) {
  const showSettings = view === 'settings';
  const showEditor = view === 'editor';
  $('settings-page').classList.toggle('hidden', !showSettings);
  $('editor-container').classList.toggle('hidden', !showEditor);
  $('welcome-screen').classList.toggle('hidden', view !== 'welcome');
  $('statusbar').classList.toggle('hidden', showSettings);
  if (showSettings) $('findbar').classList.add('hidden');
}

/** @param {string} path */
async function openFile(path) {
  try {
    const data = await api(`/api/file?path=${encodeURIComponent(path)}`);
    if (data.error) return toast(data.error, 'error');
    state.currentFile = data.path || path;
    state.isDirty = false;
    editor.setValue(data.content || '');
    setWorkspaceView('editor');
    $('current-path-display').removeAttribute('data-i18n');
    $('status-file').removeAttribute('data-i18n');
    $('current-path-display').textContent = state.currentFile;
    $('status-file').textContent = state.currentFile.split('/').pop();
    filetree.setActive(state.currentFile);
    updateSaveStatus();
    updateCursor();
    hideSidebar();
    requestAnimationFrame(() => editor.focus());
  } catch (error) {
    toast(error.message || t('loadingError'), 'error');
  }
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

function codeNeedsInput() { return /\binput\s*\(/.test(editor.getValue()); }

async function runCurrentFile() {
  if (!state.currentFile) return toast(t('openFileFirst'), 'error');
  switchPanel('output');
  const stdin = $('stdin-input').value;
  if (codeNeedsInput() && !stdin.trim()) {
    $('stdin-row').classList.remove('hidden');
    $('output-content').innerHTML = `<div class="out-info">${t('inputNeeded')}</div>`;
    toast(t('inputNeeded'), 'info');
    $('stdin-input').focus();
    return;
  }
  await saveFile({ silent: true });
  $('stdin-row').classList.add('hidden');
  $('output-content').innerHTML = `<div class="out-info">${t('run')}…</div>`;
  renderOutput(await apiPost('/api/run', { path: state.currentFile, stdin }));
}

/** @param {{ error?: string, stdout?: string, stderr?: string, returncode?: number }} data */
function renderOutput(data) {
  const output = $('output-content');
  output.replaceChildren();
  output.className = 'output-content';
  if (data.error) { output.classList.add('out-stderr'); output.textContent = data.error; return; }
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
      if (type === 'file') { state.newFileDir = path; $('new-file-dir').textContent = path; }
      else { state.newFolderDir = path; $('new-folder-dir').textContent = path; }
      toast(t('locationSelected'), 'success');
    });
  } catch (error) { toast(error.message, 'error'); }
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

function openRenameModal(entry) {
  $('rename-value').value = entry.name;
  openModal('modal-rename');
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
  setWorkspaceView('welcome');
  $('current-path-display').setAttribute('data-i18n', 'noFile');
  $('status-file').setAttribute('data-i18n', 'noFile');
  $('current-path-display').textContent = t('noFile');
  $('status-file').textContent = t('noFile');
  updateSaveStatus();
}

function showSettings({ focusPackages = false } = {}) {
  setWorkspaceView('settings');
  hideSidebar();
  loadPackageList();
  if (focusPackages) requestAnimationFrame(() => $('pkg-name').focus());
}

function sidebarIsOpen() {
  return isMobile() ? $('sidebar').classList.contains('open') : !$('sidebar').classList.contains('collapsed');
}

function openSidebar() {
  $('sidebar').classList.remove('collapsed');
  $('sidebar').classList.add('open');
  $('sidebar-backdrop').classList.add('visible');
}

function hideSidebar() {
  // Never rely on a viewport measurement alone: removing both visual state
  // classes guarantees the drawer is gone after opening a file or pressing X.
  $('sidebar').classList.remove('open');
  $('sidebar-backdrop').classList.remove('visible');
  if (!isMobile()) $('sidebar').classList.add('collapsed');
}

function toggleSidebar(force) {
  const shouldOpen = force ?? !sidebarIsOpen();
  if (shouldOpen) openSidebar();
  else hideSidebar();
}

function switchPanel(name) {
  document.querySelectorAll('.ptab').forEach(tab => tab.classList.toggle('active', tab.dataset.ptab === name));
  document.querySelectorAll('.panel-body').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${name}`));
  if (state.panelCollapsed) expandPanel();
}

function expandPanel() { $('bottom-panel').classList.remove('collapsed'); state.panelCollapsed = false; }
function collapsePanel() { $('bottom-panel').classList.add('collapsed'); state.panelCollapsed = true; }

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
  if (data.error || !data.packages) { list.textContent = data.error || t('loadingError'); return; }
  list.replaceChildren(...data.packages.map(pkg => {
    const row = document.createElement('div');
    row.className = 'pkg-item';
    row.innerHTML = `<span>${pkg.name}</span><span class="pkg-version">${pkg.version}</span>`;
    return row;
  }));
}

async function installPackage() {
  const packageName = $('pkg-name').value.trim();
  const manager = document.querySelector('input[name="mgr"]:checked')?.value || 'auto';
  if (!packageName) return;
  switchPanel('terminal');
  terminal.printInfo(`${t('install')} ${packageName} (${manager})…`);
  const data = await apiPost('/api/install', { package: packageName, manager });
  if (data.error) return terminal.printErr(data.error);
  terminal.printOut(data.stdout);
  terminal.printErr(data.stderr);
  $('pkg-name').value = '';
  loadPackageList();
}

function openFind(focusReplace = false) {
  if (!state.currentFile) return toast(t('openFileFirst'), 'error');
  setWorkspaceView('editor');
  $('findbar').classList.remove('hidden');
  const selected = editorTextarea.value.slice(editorTextarea.selectionStart, editorTextarea.selectionEnd);
  if (selected) $('find-input').value = selected;
  (focusReplace ? $('replace-input') : $('find-input')).focus();
  state.findCursor = editorTextarea.selectionEnd;
}

function closeFind() { $('findbar').classList.add('hidden'); editor.focus(); }

function findNext(backward = false) {
  const query = $('find-input').value;
  if (!query) return;
  const content = editorTextarea.value;
  let index = backward ? content.lastIndexOf(query, Math.max(0, state.findCursor - query.length - 1)) : content.indexOf(query, state.findCursor);
  if (index < 0) index = backward ? content.lastIndexOf(query) : content.indexOf(query);
  if (index < 0) return;
  editorTextarea.focus(); editorTextarea.setSelectionRange(index, index + query.length);
  state.findCursor = backward ? index : index + query.length;
  updateCursor();
}

function replaceOne() {
  const query = $('find-input').value;
  if (!query) return;
  const replacement = $('replace-input').value;
  const start = editorTextarea.selectionStart; const end = editorTextarea.selectionEnd;
  if (editorTextarea.value.slice(start, end) !== query) return findNext();
  editor.setValue(editorTextarea.value.slice(0, start) + replacement + editorTextarea.value.slice(end));
  editorTextarea.setSelectionRange(start, start + replacement.length);
  state.findCursor = start + replacement.length; markDirty();
}

function replaceAll() {
  const query = $('find-input').value;
  if (!query || !editorTextarea.value.includes(query)) return;
  editor.setValue(editorTextarea.value.split(query).join($('replace-input').value));
  state.findCursor = 0; markDirty();
}

function configureCommandPalette() {
  commandPalette.setCommands([
    { label: 'New file', shortcut: 'Ctrl+N', run: openNewFileModal },
    { label: 'Save', shortcut: 'Ctrl+S', run: saveFile },
    { label: 'Run file', shortcut: 'F5', run: runCurrentFile },
    { label: 'Find and replace', shortcut: 'Ctrl+F', run: openFind },
    { label: 'Browse files', run: () => toggleSidebar(true) },
    { label: 'Open settings', run: showSettings },
    { label: 'Install package', run: () => showSettings({ focusPackages: true }) },
    { label: 'Toggle auto save', run: () => { settings.autoSave = !settings.autoSave; $('set-auto-save').checked = settings.autoSave; persistSettings(); } },
    { label: 'Focus terminal', shortcut: 'Ctrl+`', run: () => switchPanel('terminal') },
  ]);
}

function bindDropdown(dropdownId, triggerId, menuId, onSelect) {
  const dropdown = $(dropdownId); const trigger = $(triggerId); const menu = $(menuId);
  trigger.addEventListener('click', event => { event.stopPropagation(); document.querySelectorAll('.settings-dropdown.open').forEach(el => { if (el !== dropdown) el.classList.remove('open'); }); dropdown.classList.toggle('open'); });
  menu.addEventListener('click', event => {
    const option = event.target.closest('button[data-value]');
    if (!option) return;
    dropdown.classList.remove('open');
    onSelect(option.dataset.value, option.textContent.trim());
  });
}

function bindEvents() {
  document.querySelectorAll('[data-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.modal)));
  document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', event => { if (event.target === overlay) overlay.classList.add('hidden'); }));
  document.addEventListener('click', event => { if (!$('context-menu').contains(event.target)) hideContextMenu(); document.querySelectorAll('.settings-dropdown.open').forEach(dropdown => { if (!dropdown.contains(event.target)) dropdown.classList.remove('open'); }); });

  $('context-menu').addEventListener('click', async event => {
    const item = event.target.closest('li'); const target = state.contextTarget;
    if (!item || !target) return;
    hideContextMenu();
    if (item.dataset.action === 'open' && !target.isDir) return openFile(target.path);
    if (item.dataset.action === 'rename') return openRenameModal(target);
    if (item.dataset.action === 'copy') { state.clipboard = { action: 'copy', path: target.path }; return toast(t('copied')); }
    if (item.dataset.action === 'cut') { state.clipboard = { action: 'cut', path: target.path }; return toast(t('cutDone')); }
    if (item.dataset.action === 'paste') return pasteClipboard(target);
    if (item.dataset.action === 'download') return downloadFile(target.path);
    if (item.dataset.action === 'delete') openDeleteModal(target);
  });

  $('btn-new').addEventListener('click', openNewFileModal); $('welcome-new').addEventListener('click', openNewFileModal);
  $('ft-new-file').addEventListener('click', openNewFileModal); $('ft-new-folder').addEventListener('click', openNewFolderModal);
  $('new-file-location').addEventListener('click', () => openLocationPicker('file')); $('new-folder-location').addEventListener('click', () => openLocationPicker('folder'));
  $('btn-new-file-confirm').addEventListener('click', createFile); $('btn-new-folder-confirm').addEventListener('click', createFolder);
  $('new-file-name').addEventListener('keydown', event => { if (event.key === 'Enter') createFile(); }); $('new-folder-name').addEventListener('keydown', event => { if (event.key === 'Enter') createFolder(); });
  $('btn-save').addEventListener('click', saveFile); $('btn-run').addEventListener('click', runCurrentFile); $('btn-run-with-stdin').addEventListener('click', runCurrentFile);
  $('btn-command').addEventListener('click', () => commandPalette.open()); $('btn-sidebar-toggle').addEventListener('click', () => toggleSidebar()); $('btn-sidebar-close').addEventListener('click', hideSidebar); $('sidebar-backdrop').addEventListener('click', hideSidebar);
  $('btn-settings-open').addEventListener('click', showSettings); $('btn-install-open').addEventListener('click', () => showSettings({ focusPackages: true })); $('btn-settings-back').addEventListener('click', () => state.currentFile ? setWorkspaceView('editor') : setWorkspaceView('welcome'));
  $('welcome-open').addEventListener('click', () => toggleSidebar(true)); $('ft-refresh').addEventListener('click', async () => { await filetree.refresh(); toast(t('refreshed'), 'success'); });
  $('ft-upload').addEventListener('click', () => $('upload-input').click()); $('upload-input').addEventListener('change', uploadFiles);
  document.querySelectorAll('.ptab').forEach(tab => tab.addEventListener('click', () => switchPanel(tab.dataset.ptab)));
  $('btn-panel-toggle').addEventListener('click', () => state.panelCollapsed ? expandPanel() : collapsePanel());
  $('btn-panel-clear').addEventListener('click', () => { terminal.clear(); $('output-content').innerHTML = `<div class="output-empty"><span>${t('runHint')}</span></div>`; $('stdin-row').classList.add('hidden'); });
  $('stdin-input').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); runCurrentFile(); } });

  bindSettings(); bindFind(); bindShortcuts(); bindPanelResize();
  editorTextarea.addEventListener('input', markDirty); editorTextarea.addEventListener('keyup', updateCursor); editorTextarea.addEventListener('click', updateCursor);
}

async function uploadFiles(event) {
  const destination = filetree.getSelectedDirectory() || state.roots[0]?.path;
  if (!destination) return;
  const files = [...event.target.files];
  for (const file of files) { const form = new FormData(); form.append('file', file); form.append('path', destination); const data = await (await fetch('/api/upload', { method: 'POST', body: form })).json(); if (data.error) toast(data.error, 'error'); }
  if (files.length) { toast(`${files.length} ✓`, 'success'); filetree.refresh(); }
  event.target.value = '';
}

function bindSettings() {
  $('set-font-size').addEventListener('input', event => { settings.fontSize = +event.target.value; $('set-font-size-val').textContent = `${settings.fontSize}px`; editor.setFontSize(settings.fontSize); persistSettings(); });
  $('set-term-font-size').addEventListener('input', event => { settings.termFontSize = +event.target.value; $('set-term-font-size-val').textContent = `${settings.termFontSize}px`; $('terminal-output').style.fontSize = `${settings.termFontSize}px`; persistSettings(); });
  $('set-word-wrap').addEventListener('change', event => { settings.wordWrap = event.target.checked; editor.setWordWrap(settings.wordWrap); persistSettings(); });
  $('set-auto-bracket').addEventListener('change', event => { settings.autoBracket = event.target.checked; editor.autoBracket = settings.autoBracket; persistSettings(); });
  $('set-auto-save').addEventListener('change', event => { settings.autoSave = event.target.checked; persistSettings(); });
  $('theme-options').addEventListener('click', event => { const choice = event.target.closest('.theme-choice'); if (!choice) return; settings.theme = choice.dataset.theme; applyTheme(); persistSettings(); });
  bindDropdown('language-dropdown', 'set-language-trigger', 'set-language-menu', value => { settings.locale = value; persistSettings(); applyLocale(); });
  bindDropdown('tab-size-dropdown', 'set-tab-size-trigger', 'set-tab-size-menu', value => { settings.tabSize = +value; $('set-tab-size-value').textContent = value; editor.setTabSize(settings.tabSize); persistSettings(); });
  $('btn-pkg-install').addEventListener('click', installPackage); $('pkg-name').addEventListener('keydown', event => { if (event.key === 'Enter') installPackage(); });
}

function bindFind() {
  $('find-close').addEventListener('click', closeFind); $('find-next').addEventListener('click', () => findNext()); $('find-prev').addEventListener('click', () => findNext(true));
  $('replace-one').addEventListener('click', replaceOne); $('replace-all').addEventListener('click', replaceAll);
  $('find-input').addEventListener('input', () => { state.findCursor = 0; findNext(); });
  $('find-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); findNext(event.shiftKey); } });
}

function bindShortcuts() {
  document.addEventListener('keydown', event => {
    const control = event.ctrlKey || event.metaKey; const key = event.key.toLowerCase();
    if (control && key === 's') { event.preventDefault(); saveFile(); }
    if (control && key === 'n') { event.preventDefault(); openNewFileModal(); }
    if (control && key === 'f') { event.preventDefault(); openFind(); }
    if (control && key === 'h') { event.preventDefault(); openFind(true); }
    if (control && key === 'p') { event.preventDefault(); commandPalette.open(); }
    if (control && key === 'i') { event.preventDefault(); switchPanel('output'); $('stdin-row').classList.toggle('hidden'); }
    if (event.key === 'F5') { event.preventDefault(); runCurrentFile(); }
    if (event.key === 'Escape') { hideContextMenu(); closeFind(); hideSidebar(); document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.add('hidden')); }
  });
}

function bindPanelResize() {
  let dragging = false; let startY = 0; let startHeight = 0;
  $('panel-resize-handle').addEventListener('mousedown', event => { dragging = true; startY = event.clientY; startHeight = $('bottom-panel').offsetHeight; });
  document.addEventListener('mousemove', event => { if (!dragging) return; const height = Math.max(38, Math.min(window.innerHeight * 0.6, startHeight + startY - event.clientY)); $('bottom-panel').style.height = `${height}px`; });
  document.addEventListener('mouseup', () => { dragging = false; });
}

async function init() {
  applySettings(); bindEvents(); configureCommandPalette();
  try { const response = await apiPost('/api/cmd', { cmd: 'python --version' }); $('si-python').removeAttribute('data-i18n'); $('si-python').textContent = (response.stdout || response.stderr || '').trim() || '—'; } catch { $('si-python').textContent = '—'; }
  await loadRoots(); terminal.printInfo('PyIDE Termux Pro · Ready');
}

init();
