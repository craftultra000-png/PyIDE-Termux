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
const terminal = new Terminal($('terminal-output'));

const state = {
  currentFile: null,
  clipboard: null,
  contextTarget: null,
  roots: [],
  newFileDir: null,
  newFolderDir: null,
  isDirty: false,
  findCursor: 0,
  autoSaveTimer: null,
  runSession: null,
  runPollTimer: null,
  runtimeSubmitting: false,
  runtimeFocusRequested: false,
  quickSession: null,
  quickPollTimer: null,
  quickSubmitting: false,
  quickInputRow: null,
  quickInput: null,
  packages: [],
  settingsTab: 'general',
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
  terminal.setPlaceholder(t('commandPlaceholder'));
  $('command-input').placeholder = t('commandPlaceholder');
  $('runtime-input')?.setAttribute('aria-label', t('runtimePlaceholder'));
  $('quick-python-input')?.setAttribute('placeholder', t('quickPythonPlaceholder'));
  $('quick-python-input')?.setAttribute('aria-label', t('quickPythonPlaceholder'));
  $('package-filter')?.setAttribute('placeholder', t('searchPackages'));
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
  document.documentElement.style.setProperty('--console-font-size', `${settings.termFontSize}px`);
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
  if (view !== 'execution' && state.runSession) void stopExecutionSession();
  if (view !== 'quick' && state.quickSession) void stopQuickPythonSession();
  const showSettings = view === 'settings';
  const showEditor = view === 'editor';
  const showExecution = view === 'execution';
  const showTerminal = view === 'terminal';
  const showQuickPython = view === 'quick';
  $('settings-page').classList.toggle('hidden', !showSettings);
  $('editor-container').classList.toggle('hidden', !showEditor);
  $('execution-page').classList.toggle('hidden', !showExecution);
  $('terminal-page').classList.toggle('hidden', !showTerminal);
  $('quick-python-page').classList.toggle('hidden', !showQuickPython);
  $('welcome-screen').classList.toggle('hidden', view !== 'welcome');
  $('statusbar').classList.toggle('hidden', showSettings || showExecution || showTerminal || showQuickPython);
  if (!showEditor) $('findbar').classList.add('hidden');
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
    const currentPathDisplay = $('current-path-display');
    currentPathDisplay.removeAttribute('data-i18n');
    $('status-file').removeAttribute('data-i18n');
    currentPathDisplay.textContent = state.currentFile.split('/').pop();
    currentPathDisplay.title = state.currentFile;
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

async function runCurrentFile() {
  if (!state.currentFile) return toast(t('openFileFirst'), 'error');
  setWorkspaceView('execution');
  $('execution-file-label').textContent = state.currentFile;
  await saveFile({ silent: true });
  await stopExecutionSession();
  $('output-content').innerHTML = `<div class="out-info">${t('run')}…</div>`;
  handleRunSession(await apiPost('/api/run/session/start', { path: state.currentFile }));
}

function appendRunOutput(text, className = 'out-stdout') {
  if (!text) return;
  if (state.runtimeInputRow?.isConnected) {
    state.runtimeInputRow.remove();
    state.runtimeFocusRequested = false;
  }
  const line = document.createElement('pre');
  line.className = className;
  line.textContent = text;
  $('output-content').append(line);
  $('output-content').scrollTop = $('output-content').scrollHeight;
}

function stopRunPolling() { clearTimeout(state.runPollTimer); state.runPollTimer = null; }

async function stopExecutionSession() {
  const sessionId = state.runSession;
  if (!sessionId) return;
  stopRunPolling();
  state.runSession = null;
  state.runtimeSubmitting = false;
  state.runtimeFocusRequested = false;
  setRuntimeInputVisible(false);
  try { await apiPost('/api/run/session/stop', { session: sessionId }); } catch { /* navigation must remain immediate */ }
}

function setRuntimeInputVisible(visible, { focus = false } = {}) {
  if (!state.runtimeInputRow) return;
  if (!visible) state.runtimeInputRow.remove();
  else {
    const output = $('output-content');
    output.querySelectorAll('.console-prompt-fragment').forEach(line => line.classList.remove('console-prompt-fragment'));
    state.runtimeInputRow.classList.remove('runtime-input-row--inline');
    if (state.runtimeInputRow.parentElement !== output) output.append(state.runtimeInputRow);
    if (focus && !state.runtimeFocusRequested) {
      state.runtimeFocusRequested = true;
      requestAnimationFrame(() => {
        if (!state.runSession || !state.runtimeInputRow?.isConnected || document.activeElement === state.runtimeInput) return;
        state.runtimeInput?.focus({ preventScroll: true });
      });
    }
  }
}

function finishRunSession(returncode) {
  stopRunPolling();
  state.runSession = null;
  state.runtimeSubmitting = false;
  state.runtimeFocusRequested = false;
  setRuntimeInputVisible(false);
  const result = document.createElement('div');
  result.className = returncode === 0 ? 'out-rc-ok' : 'out-rc-err';
  result.textContent = `[exit ${returncode}]`;
  $('output-content').append(result);
}

function clearExecution() {
  $('output-content').replaceChildren();
  if (state.runSession) setRuntimeInputVisible(true);
  else $('output-content').innerHTML = `<div class="output-empty"><span>${t('runHint')}</span></div>`;
}

function showTerminalPage() {
  setWorkspaceView('terminal');
  hideSidebar();
  requestAnimationFrame(() => terminal.focus());
}

function appendQuickPythonOutput(text, className = 'term-out') {
  if (!text) return;
  const line = document.createElement('pre');
  line.className = className;
  line.textContent = text.replace(/(?:>>> |\.\.\. )$/, '');
  if (line.textContent) $('quick-python-output').append(line);
  $('quick-python-output').scrollTop = $('quick-python-output').scrollHeight;
}

function stopQuickPythonPolling() { clearTimeout(state.quickPollTimer); state.quickPollTimer = null; }

async function stopQuickPythonSession() {
  const sessionId = state.quickSession;
  if (!sessionId) return false;
  stopQuickPythonPolling();
  state.quickSession = null;
  state.quickSubmitting = false;
  state.quickInputRow?.remove();
  try { await apiPost('/api/run/session/stop', { session: sessionId }); } catch { /* leaving the page must remain immediate */ }
  return true;
}

function setQuickPythonInputVisible(visible, { focus = false } = {}) {
  if (!state.quickInputRow) return;
  if (!visible) { state.quickInputRow.remove(); return; }
  const output = $('quick-python-output');
  if (state.quickInputRow.parentElement !== output) output.append(state.quickInputRow);
  if (focus) requestAnimationFrame(() => state.quickSession && state.quickInput?.focus({ preventScroll: true }));
}

function finishQuickPythonSession(returncode) {
  stopQuickPythonPolling();
  state.quickSession = null;
  state.quickSubmitting = false;
  setQuickPythonInputVisible(false);
  appendQuickPythonOutput(`[exit ${returncode}]`, returncode === 0 ? 'out-rc-ok' : 'out-rc-err');
}

function handleQuickPythonSession(data) {
  if (data.error) { appendQuickPythonOutput(data.error, 'term-err'); finishQuickPythonSession(-1); return; }
  appendQuickPythonOutput(data.output || '');
  if (data.done) { finishQuickPythonSession(data.returncode); return; }
  state.quickSession = data.session;
  setQuickPythonInputVisible(true, { focus: true });
  scheduleQuickPythonPoll();
}

function scheduleQuickPythonPoll() {
  stopQuickPythonPolling();
  if (!state.quickSession) return;
  const sessionId = state.quickSession;
  state.quickPollTimer = setTimeout(async () => {
    const data = await apiPost('/api/run/session/poll', { session: sessionId });
    if (state.quickSession !== sessionId) return;
    if (data.error) { appendQuickPythonOutput(data.error, 'term-err'); finishQuickPythonSession(-1); return; }
    appendQuickPythonOutput(data.output || '');
    if (data.done) finishQuickPythonSession(data.returncode);
    else { setQuickPythonInputVisible(true); scheduleQuickPythonPoll(); }
  }, 180);
}

async function sendQuickPythonInput() {
  if (!state.quickSession || state.quickSubmitting) return;
  state.quickSubmitting = true;
  const sessionId = state.quickSession;
  const value = state.quickInput.value;
  state.quickInput.value = '';
  state.quickInputRow.remove();
  appendQuickPythonOutput(`>>> ${value}`, 'quick-python-echo');
  stopQuickPythonPolling();
  const data = await apiPost('/api/run/session/input', { session: sessionId, value });
  if (state.quickSession !== sessionId) { state.quickSubmitting = false; return; }
  if (data.error) { appendQuickPythonOutput(data.error, 'term-err'); finishQuickPythonSession(-1); return; }
  appendQuickPythonOutput(data.output || '');
  if (data.done) finishQuickPythonSession(data.returncode);
  else { state.quickSubmitting = false; setQuickPythonInputVisible(true, { focus: true }); scheduleQuickPythonPoll(); }
}

async function showQuickPythonPage() {
  setWorkspaceView('quick');
  hideSidebar();
  if (state.quickSession) { setQuickPythonInputVisible(true, { focus: true }); return; }
  $('quick-python-output').replaceChildren();
  appendQuickPythonOutput(t('startingPython'), 'term-info');
  handleQuickPythonSession(await apiPost('/api/repl/session/start', {}));
}

function clearQuickPython() {
  $('quick-python-output').replaceChildren();
  if (state.quickSession) setQuickPythonInputVisible(true);
}

function closeKebabMenu() {
  const kebab = $('kebab');
  const wasOpen = kebab.classList.contains('kebab--open');
  kebab.classList.remove('kebab--open');
  $('btn-kebab-toggle').setAttribute('aria-expanded', 'false');
  // The document click listener calls this for every outside click. Only blur
  // when a real open menu is being dismissed; otherwise it immediately steals
  // the focus restored by Execution/Terminal prompt rows on Android.
  if (wasOpen) document.activeElement?.blur?.();
}

function toggleKebabMenu() {
  const open = $('kebab').classList.toggle('kebab--open');
  $('btn-kebab-toggle').setAttribute('aria-expanded', String(open));
}

async function disconnectAndCloseSession() {
  closeKebabMenu();
  const hadExecution = Boolean(state.runSession);
  const hadQuickPython = Boolean(state.quickSession);
  await stopExecutionSession();
  await stopQuickPythonSession();
  if (hadExecution || hadQuickPython) setWorkspaceView(state.currentFile ? 'editor' : 'welcome');
  toast(t('sessionClosed'), hadExecution || hadQuickPython ? 'success' : 'info');
}

/** @param {{ error?: string, output?: string, session?: string, done?: boolean, returncode?: number }} data */
function handleRunSession(data) {
  if (data.error) { appendRunOutput(data.error, 'out-stderr'); finishRunSession(-1); return; }
  $('output-content').replaceChildren();
  appendRunOutput(data.output || '');
  if (data.done) { finishRunSession(data.returncode); return; }
  state.runSession = data.session;
  setRuntimeInputVisible(true, { focus: true });
  scheduleRunPoll();
}

function scheduleRunPoll() {
  stopRunPolling();
  if (!state.runSession) return;
  const sessionId = state.runSession;
  state.runPollTimer = setTimeout(async () => {
    const data = await apiPost('/api/run/session/poll', { session: sessionId });
    if (state.runSession !== sessionId) return;
    if (data.error) { appendRunOutput(data.error, 'out-stderr'); finishRunSession(-1); return; }
    appendRunOutput(data.output || '');
    if (data.done) finishRunSession(data.returncode);
    else { setRuntimeInputVisible(true, { focus: true }); scheduleRunPoll(); }
  }, 180);
}

async function sendRuntimeInput() {
  const input = state.runtimeInput;
  if (!state.runSession || state.runtimeSubmitting) return;
  state.runtimeSubmitting = true;
  const sessionId = state.runSession;
  const value = input.value;
  input.value = '';
  state.runtimeFocusRequested = false;
  state.runtimeInputRow.remove();
  const echo = document.createElement('span');
  echo.className = 'out-stdin runtime-echo';
  echo.textContent = value;
  $('output-content').append(echo, document.createElement('br'));
  stopRunPolling();
  const data = await apiPost('/api/run/session/input', { session: sessionId, value });
  if (state.runSession !== sessionId) { state.runtimeSubmitting = false; return; }
  if (data.error) { appendRunOutput(data.error, 'out-stderr'); finishRunSession(-1); return; }
  appendRunOutput(data.output || '');
  if (data.done) finishRunSession(data.returncode);
  else { state.runtimeSubmitting = false; setRuntimeInputVisible(true, { focus: true }); scheduleRunPoll(); }
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
  $('current-path-display').removeAttribute('title');
  $('status-file').textContent = t('noFile');
  updateSaveStatus();
}

function showSettings({ focusPackages = false } = {}) {
  setWorkspaceView('settings');
  hideSidebar();
  activateSettingsTab(focusPackages ? 'libraries' : state.settingsTab);
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
  state.packages = data.packages;
  renderPackageList();
}

function renderPackageList() {
  const list = $('pkg-list');
  const query = ($('package-filter')?.value || '').trim().toLowerCase();
  const packages = state.packages.filter(pkg => pkg.name.toLowerCase().includes(query));
  $('settings-package-count').textContent = state.packages.length ? `(${state.packages.length})` : '';
  if (!packages.length) { list.innerHTML = `<div class="pkg-loading">${query ? t('noMatchingPackages') : '—'}</div>`; return; }
  list.replaceChildren(...packages.map(pkg => {
    const row = document.createElement('div');
    row.className = 'pkg-item';
    row.innerHTML = `<span>${pkg.name}</span><span class="pkg-version">${pkg.version}</span>`;
    return row;
  }));
}

function prepareRuntimeInput() {
  const row = document.createElement('div');
  row.className = 'runtime-input-row';
  row.dir = 'ltr';
  const prompt = document.createElement('span');
  prompt.className = 'runtime-prompt';
  prompt.textContent = '›';
  const input = document.createElement('input');
  input.id = 'runtime-input';
  input.className = 'runtime-input';
  input.setAttribute('aria-label', t('runtimePlaceholder'));
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.autocapitalize = 'none';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('inputmode', 'text');
  input.setAttribute('enterkeyhint', 'enter');
  let isComposing = false;
  const submit = event => { event?.preventDefault(); if (!isComposing) sendRuntimeInput(); };
  input.addEventListener('compositionstart', () => { isComposing = true; });
  input.addEventListener('compositionend', () => { isComposing = false; });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) submit(event); });
  input.addEventListener('beforeinput', event => { if (event.inputType === 'insertLineBreak') submit(event); });
  const restoreRuntimeFocus = () => {
    if (!state.runSession || state.runtimeSubmitting || !state.runtimeInputRow?.isConnected) return;
    // Run after the document click handler. This is click-driven recovery only,
    // not a poll-loop, so Android receives one stable focus request per tap.
    requestAnimationFrame(() => {
      if (!state.runSession || state.runtimeSubmitting || !state.runtimeInputRow?.isConnected) return;
      input.focus({ preventScroll: true });
    });
  };
  row.addEventListener('click', event => {
    if (event.target !== input) restoreRuntimeFocus();
  });
  $('output-content').addEventListener('click', event => {
    if (event.target === $('output-content')) restoreRuntimeFocus();
  });
  row.append(prompt, input);
  state.runtimeInputRow = row;
  state.runtimeInput = input;
}

function prepareQuickPythonInput() {
  const row = document.createElement('div');
  row.className = 'term-inline-input';
  row.dir = 'ltr';
  const prompt = document.createElement('span');
  prompt.className = 'term-prompt';
  prompt.textContent = '›';
  const input = document.createElement('input');
  input.id = 'quick-python-input';
  input.className = 'terminal-inline-editor';
  input.placeholder = t('quickPythonPlaceholder');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.autocapitalize = 'none';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('inputmode', 'text');
  input.setAttribute('enterkeyhint', 'enter');
  let isComposing = false;
  const submit = event => { event?.preventDefault(); if (!isComposing) sendQuickPythonInput(); };
  input.addEventListener('compositionstart', () => { isComposing = true; });
  input.addEventListener('compositionend', () => { isComposing = false; });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) submit(event); });
  input.addEventListener('beforeinput', event => { if (event.inputType === 'insertLineBreak') submit(event); });
  const restorePromptFocus = () => {
    if (!state.quickSession || state.quickSubmitting || !state.quickInputRow?.isConnected) return;
    requestAnimationFrame(() => {
      if (state.quickSession && !state.quickSubmitting && state.quickInputRow?.isConnected) input.focus({ preventScroll: true });
    });
  };
  row.addEventListener('click', event => {
    if (event.target !== input) restorePromptFocus();
  });
  $('quick-python-output').addEventListener('click', event => {
    if (event.target === $('quick-python-output')) restorePromptFocus();
  });
  row.append(prompt, input);
  state.quickInputRow = row;
  state.quickInput = input;
}

function prepareSettingsTabs() {
  const grid = document.querySelector('.settings-grid');
  const libraryCard = $('pkg-list').closest('.settings-card');
  const tabs = document.createElement('nav');
  tabs.className = 'settings-tabs';
  tabs.innerHTML = '<button class="settings-tab active" data-settings-tab="general" type="button" data-i18n="generalSettings">General settings</button><button class="settings-tab" data-settings-tab="libraries" type="button"><span data-i18n="libraries">Libraries</span> <span id="settings-package-count"></span></button>';
  grid.before(tabs);
  const tools = document.createElement('div');
  tools.className = 'library-tools';
  tools.innerHTML = '<input id="package-filter" class="pkg-input" data-i18n-placeholder="searchPackages" placeholder="Search installed packages" type="search"/><button class="btn-secondary" id="btn-pkg-refresh" data-i18n="refreshList" type="button">Refresh list</button>';
  libraryCard.querySelector('.pkg-list-header').before(tools);
  tabs.addEventListener('click', event => { const tab = event.target.closest('.settings-tab'); if (tab) activateSettingsTab(tab.dataset.settingsTab); });
  $('package-filter').addEventListener('input', renderPackageList);
  $('btn-pkg-refresh').addEventListener('click', loadPackageList);
}

function activateSettingsTab(tab) {
  state.settingsTab = tab === 'libraries' ? 'libraries' : 'general';
  const libraryCard = $('pkg-list').closest('.settings-card');
  document.querySelectorAll('.settings-grid > .settings-card').forEach(card => { card.hidden = state.settingsTab === 'libraries' ? card !== libraryCard : card === libraryCard; });
  document.querySelector('.settings-grid').classList.toggle('libraries-active', state.settingsTab === 'libraries');
  document.querySelectorAll('.settings-tab').forEach(button => button.classList.toggle('active', button.dataset.settingsTab === state.settingsTab));
  if (state.settingsTab === 'libraries') loadPackageList();
}

async function installPackage() {
  const packageName = $('pkg-name').value.trim();
  const manager = document.querySelector('input[name="mgr"]:checked')?.value || 'auto';
  if (!packageName) return;
  showTerminalPage();
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
    { label: 'Open terminal', shortcut: 'Ctrl+`', run: showTerminalPage },
    { label: 'Quick Python', run: showQuickPythonPage },
    { label: 'Disconnect Python session', run: disconnectAndCloseSession },
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
  document.addEventListener('click', event => { if (!$('context-menu').contains(event.target)) hideContextMenu(); if (!$('kebab').contains(event.target)) closeKebabMenu(); document.querySelectorAll('.settings-dropdown.open').forEach(dropdown => { if (!dropdown.contains(event.target)) dropdown.classList.remove('open'); }); });

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

  $('btn-kebab-toggle').addEventListener('click', event => { event.stopPropagation(); toggleKebabMenu(); });
  $('btn-new').addEventListener('click', () => { closeKebabMenu(); openNewFileModal(); }); $('welcome-new').addEventListener('click', openNewFileModal);
  $('ft-new-file').addEventListener('click', openNewFileModal); $('ft-new-folder').addEventListener('click', openNewFolderModal);
  $('new-file-location').addEventListener('click', () => openLocationPicker('file')); $('new-folder-location').addEventListener('click', () => openLocationPicker('folder'));
  $('btn-new-file-confirm').addEventListener('click', createFile); $('btn-new-folder-confirm').addEventListener('click', createFolder);
  $('new-file-name').addEventListener('keydown', event => { if (event.key === 'Enter') createFile(); }); $('new-folder-name').addEventListener('keydown', event => { if (event.key === 'Enter') createFolder(); });
  $('btn-save').addEventListener('click', () => { closeKebabMenu(); saveFile(); }); $('btn-run').addEventListener('click', runCurrentFile);
  $('btn-command').addEventListener('click', () => { closeKebabMenu(); commandPalette.open(); }); $('btn-sidebar-toggle').addEventListener('click', () => toggleSidebar()); $('btn-menu-files').addEventListener('click', () => { closeKebabMenu(); toggleSidebar(true); }); $('btn-sidebar-close').addEventListener('click', hideSidebar); $('sidebar-backdrop').addEventListener('click', hideSidebar);
  $('btn-settings-open').addEventListener('click', () => { closeKebabMenu(); showSettings(); }); $('btn-terminal-open').addEventListener('click', () => { closeKebabMenu(); showTerminalPage(); }); $('btn-quick-python-open').addEventListener('click', () => { closeKebabMenu(); showQuickPythonPage(); }); $('btn-disconnect').addEventListener('click', disconnectAndCloseSession); $('btn-settings-back').addEventListener('click', () => state.currentFile ? setWorkspaceView('editor') : setWorkspaceView('welcome'));
  $('btn-execution-back').addEventListener('click', () => state.currentFile ? setWorkspaceView('editor') : setWorkspaceView('welcome')); $('btn-terminal-back').addEventListener('click', () => state.currentFile ? setWorkspaceView('editor') : setWorkspaceView('welcome')); $('btn-quick-python-back').addEventListener('click', () => state.currentFile ? setWorkspaceView('editor') : setWorkspaceView('welcome'));
  $('welcome-open').addEventListener('click', () => toggleSidebar(true)); $('ft-refresh').addEventListener('click', async () => { await filetree.refresh(); toast(t('refreshed'), 'success'); });
  $('ft-upload').addEventListener('click', () => $('upload-input').click()); $('upload-input').addEventListener('change', uploadFiles);
  $('btn-execution-clear').addEventListener('click', clearExecution); $('btn-terminal-clear').addEventListener('click', () => terminal.clear()); $('btn-quick-python-clear').addEventListener('click', clearQuickPython);

  bindSettings(); bindFind(); bindShortcuts();
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
  $('set-term-font-size').addEventListener('input', event => { settings.termFontSize = +event.target.value; $('set-term-font-size-val').textContent = `${settings.termFontSize}px`; document.documentElement.style.setProperty('--console-font-size', `${settings.termFontSize}px`); persistSettings(); });
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
    if (control && key === 'i' && state.runSession) { event.preventDefault(); setWorkspaceView('execution'); setRuntimeInputVisible(true); }
    if (event.key === 'F5') { event.preventDefault(); runCurrentFile(); }
    if (event.key === 'Escape') { hideContextMenu(); closeKebabMenu(); closeFind(); hideSidebar(); document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.add('hidden')); }
  });
}

async function init() {
  prepareRuntimeInput(); prepareQuickPythonInput(); prepareSettingsTabs(); applySettings(); bindEvents(); configureCommandPalette();
  try { const response = await apiPost('/api/cmd', { cmd: 'python --version' }); $('si-python').removeAttribute('data-i18n'); $('si-python').textContent = (response.stdout || response.stderr || '').trim() || '—'; } catch { $('si-python').textContent = '—'; }
  await loadRoots(); terminal.printInfo('PyIDE Termux Pro · Ready');
}

init();
