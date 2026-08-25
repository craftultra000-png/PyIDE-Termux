/**
 * editor.js
 * Code editor with line numbers, syntax highlighting (Python),
 * Tab handling, auto-bracket, and keyboard shortcuts.
 */

export class Editor {
  /**
   * @param {HTMLTextAreaElement} textarea
   * @param {HTMLElement} gutter
   * @param {HTMLElement} overlay
   */
  constructor(textarea, gutter, overlay) {
    this.ta       = textarea;
    this.gutter   = gutter;
    this.overlay  = overlay;
    this.tabSize  = 4;
    this.wordWrap = false;
    this.autoBracket = true;

    this._setupEvents();
    this._updateAll();
  }

  // ── Public API ────────────────────────────────────────────────

  getValue()       { return this.ta.value; }
  setValue(text)   { this.ta.value = text; this._updateAll(); }
  setFontSize(px)  {
    const s = `${px}px`;
    this.ta.style.fontSize = s;
    this.overlay.style.fontSize = s;
    this.gutter.style.fontSize = s;
    this._updateGutter();
  }
  setTabSize(n) {
    this.tabSize = n;
    this.ta.style.tabSize = n;
    this.overlay.style.tabSize = n;
    this.ta.setAttribute('style', this.ta.getAttribute('style'));
  }
  setWordWrap(on) {
    this.wordWrap = on;
    const mode = on ? 'pre-wrap' : 'pre';
    this.ta.style.whiteSpace = mode;
    this.overlay.style.whiteSpace = mode;
  }
  focus() { this.ta.focus(); }

  // ── Events ───────────────────────────────────────────────────

  _setupEvents() {
    this.ta.addEventListener('input',   () => this._updateAll());
    this.ta.addEventListener('scroll',  () => this._syncScroll());
    this.ta.addEventListener('keydown', (e) => this._onKeyDown(e));
  }

  _onKeyDown(e) {
    const { key, ctrlKey, metaKey, shiftKey } = e;

    // Tab → spaces
    if (key === 'Tab') {
      e.preventDefault();
      const spaces = ' '.repeat(this.tabSize);
      if (shiftKey) {
        this._unindentSelection(spaces);
      } else {
        this._insertText(spaces);
      }
      return;
    }

    // Enter → auto-indent
    if (key === 'Enter') {
      const indent = this._currentIndent();
      const before = this.ta.value.slice(0, this.ta.selectionStart);
      if (before.trimEnd().endsWith(':')) {
        e.preventDefault();
        this._insertText('\n' + indent + ' '.repeat(this.tabSize));
        return;
      }
      if (indent) {
        e.preventDefault();
        this._insertText('\n' + indent);
        return;
      }
    }

    // Auto-bracket pairs
    if (this.autoBracket) {
      const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
      if (pairs[key]) {
        const close = pairs[key];
        const sel = this.ta.value.slice(this.ta.selectionStart, this.ta.selectionEnd);
        if (sel) {
          e.preventDefault();
          this._insertText(key + sel + close);
          return;
        }
        // Only wrap if next char isn't the same
        const next = this.ta.value[this.ta.selectionStart];
        if (next !== close) {
          e.preventDefault();
          this._insertText(key + close);
          this.ta.selectionStart -= 1;
          this.ta.selectionEnd   -= 1;
          this._updateAll();
          return;
        }
      }
      // Skip over closing bracket if already there
      const closers = new Set([')', ']', '}', '"', "'"]);
      if (closers.has(key)) {
        const next = this.ta.value[this.ta.selectionStart];
        if (next === key) {
          e.preventDefault();
          this.ta.selectionStart += 1;
          this.ta.selectionEnd   += 1;
          this._updateAll();
          return;
        }
      }
    }
  }

  // ── Text helpers ──────────────────────────────────────────────

  _insertText(text) {
    const s = this.ta.selectionStart;
    const e = this.ta.selectionEnd;
    const val = this.ta.value;
    this.ta.value = val.slice(0, s) + text + val.slice(e);
    this.ta.selectionStart = this.ta.selectionEnd = s + text.length;
    this._updateAll();
  }

  _currentIndent() {
    const pos   = this.ta.selectionStart;
    const lines = this.ta.value.slice(0, pos).split('\n');
    const line  = lines[lines.length - 1];
    return line.match(/^(\s*)/)[1];
  }

  _unindentSelection(spaces) {
    const s = this.ta.selectionStart;
    const e = this.ta.selectionEnd;
    const val = this.ta.value;
    const before = val.slice(0, s);
    const lineStart = before.lastIndexOf('\n') + 1;
    const chunk = val.slice(lineStart, e);
    const replaced = chunk.replace(new RegExp(`^${spaces}`, 'gm'), '');
    this.ta.value = val.slice(0, lineStart) + replaced + val.slice(e);
    this.ta.selectionStart = lineStart;
    this.ta.selectionEnd   = lineStart + replaced.length;
    this._updateAll();
  }

  // ── Gutter ────────────────────────────────────────────────────

  _updateGutter() {
    const lines = this.ta.value.split('\n');
    this.gutter.innerHTML = lines
      .map((_, i) => `<div>${i + 1}</div>`)
      .join('');
  }

  // ── Scroll sync ───────────────────────────────────────────────

  _syncScroll() {
    this.overlay.scrollTop  = this.ta.scrollTop;
    this.overlay.scrollLeft = this.ta.scrollLeft;
    this.gutter.scrollTop   = this.ta.scrollTop;
  }

  // ── Syntax highlight ─────────────────────────────────────────

  _highlight(code) {
    // Escape HTML first
    const esc = (s) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const KEYWORDS = new Set([
      'False','None','True','and','as','assert','async','await',
      'break','class','continue','def','del','elif','else','except',
      'finally','for','from','global','if','import','in','is',
      'lambda','nonlocal','not','or','pass','raise','return','try',
      'while','with','yield',
    ]);
    const BUILTINS = new Set([
      'abs','all','any','bin','bool','bytes','callable','chr',
      'compile','complex','dict','dir','divmod','enumerate','eval',
      'exec','filter','float','format','frozenset','getattr','globals',
      'hasattr','hash','help','hex','id','input','int','isinstance',
      'issubclass','iter','len','list','locals','map','max','min',
      'next','object','oct','open','ord','pow','print','property',
      'range','repr','reversed','round','set','setattr','slice',
      'sorted','staticmethod','str','sum','super','tuple','type',
      'vars','zip','__name__','__file__','__doc__',
    ]);

    const result = [];
    let i = 0;
    const raw = code;

    while (i < raw.length) {
      // Comment
      if (raw[i] === '#') {
        const end = raw.indexOf('\n', i);
        const chunk = end === -1 ? raw.slice(i) : raw.slice(i, end);
        result.push(`<span class="tok-comment">${esc(chunk)}</span>`);
        i += chunk.length;
        continue;
      }

      // Triple-quoted string
      if (raw.startsWith('"""', i) || raw.startsWith("'''", i)) {
        const q = raw.slice(i, i + 3);
        const end = raw.indexOf(q, i + 3);
        const chunk = end === -1 ? raw.slice(i) : raw.slice(i, end + 3);
        result.push(`<span class="tok-str">${esc(chunk)}</span>`);
        i += chunk.length;
        continue;
      }

      // Single-quoted string
      if (raw[i] === '"' || raw[i] === "'") {
        const q = raw[i];
        let j = i + 1;
        while (j < raw.length && raw[j] !== q && raw[j] !== '\n') {
          if (raw[j] === '\\') j++;
          j++;
        }
        const chunk = raw.slice(i, j + 1);
        result.push(`<span class="tok-str">${esc(chunk)}</span>`);
        i += chunk.length;
        continue;
      }

      // Number
      if (/[0-9]/.test(raw[i]) || (raw[i] === '.' && /[0-9]/.test(raw[i + 1] || ''))) {
        let j = i;
        while (j < raw.length && /[\w.]/.test(raw[j])) j++;
        result.push(`<span class="tok-num">${esc(raw.slice(i, j))}</span>`);
        i = j;
        continue;
      }

      // Decorator
      if (raw[i] === '@') {
        let j = i + 1;
        while (j < raw.length && /[\w.]/.test(raw[j])) j++;
        result.push(`<span class="tok-deco">${esc(raw.slice(i, j))}</span>`);
        i = j;
        continue;
      }

      // Identifier / keyword / builtin
      if (/[A-Za-z_]/.test(raw[i])) {
        let j = i;
        while (j < raw.length && /[\w]/.test(raw[j])) j++;
        const word = raw.slice(i, j);

        if (word === 'self' || word === 'cls') {
          result.push(`<span class="tok-self">${esc(word)}</span>`);
        } else if (KEYWORDS.has(word)) {
          // def ClassName / def fn_name
          if (word === 'def') {
            result.push(`<span class="tok-kw">${esc(word)}</span>`);
            i = j;
            // skip whitespace
            while (i < raw.length && raw[i] === ' ') { result.push(' '); i++; }
            let k = i;
            while (k < raw.length && /[\w]/.test(raw[k])) k++;
            result.push(`<span class="tok-fn">${esc(raw.slice(i, k))}</span>`);
            i = k;
            continue;
          }
          if (word === 'class') {
            result.push(`<span class="tok-kw">${esc(word)}</span>`);
            i = j;
            while (i < raw.length && raw[i] === ' ') { result.push(' '); i++; }
            let k = i;
            while (k < raw.length && /[\w]/.test(raw[k])) k++;
            result.push(`<span class="tok-cls">${esc(raw.slice(i, k))}</span>`);
            i = k;
            continue;
          }
          result.push(`<span class="tok-kw">${esc(word)}</span>`);
        } else if (BUILTINS.has(word)) {
          result.push(`<span class="tok-builtin">${esc(word)}</span>`);
        } else {
          result.push(esc(word));
        }
        i = j;
        continue;
      }

      // Operators
      if (/[+\-*/%&|^~<>=!]/.test(raw[i])) {
        result.push(`<span class="tok-op">${esc(raw[i])}</span>`);
        i++;
        continue;
      }

      // Default
      result.push(esc(raw[i]));
      i++;
    }

    return result.join('');
  }

  // ── Update all ────────────────────────────────────────────────

  _updateAll() {
    this._updateGutter();
    this.overlay.innerHTML = this._highlight(this.ta.value);
    this._syncScroll();
  }
}
