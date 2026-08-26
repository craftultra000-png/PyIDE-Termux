/**
 * terminal.js
 * Terminal panel: command history (Up/Down), ANSI colour stripping,
 * output rendering (stdout / stderr).
 */

export class Terminal {
  /** @param {HTMLElement} outputEl - scrollable terminal stream */
  constructor(outputEl) {
    this.out    = outputEl;
    this.input  = null;
    this.cwd    = null;    // updated after `cd` commands
    this.history = [];
    this.histIdx = -1;
    this._pendingLine = '';
    this.executing = false;
    this.sessionId = null;

    this._appendInput();
    this.out.addEventListener('click', event => {
      if (event.target !== this.out || this.executing) return;
      requestAnimationFrame(() => this.focus());
    });
  }

  // ── Public ──────────────────────────────────────────────────

  /** Set the working-directory label (used in API calls) */
  setCwd(cwd) { this.cwd = cwd; }

  /** Print a command echo line */
  printCmd(cmd) {
    this._appendLine(`$ ${cmd}`, 'term-cmd');
  }

  /** Print stdout */
  printOut(text) {
    if (!text) return;
    this._appendLines(text, 'term-out');
  }

  /** Print stderr */
  printErr(text) {
    if (!text) return;
    this._appendLines(text, 'term-err');
  }

  /** Print an informational (italic) line */
  printInfo(text) {
    this._appendLine(text, 'term-info');
  }

  /** Clear output */
  clear() {
    this.out.innerHTML = '';
    if (!this.executing) this._appendInput();
  }

  /** Focus the inline input when the terminal page opens. */
  focus() { this.input?.focus(); }

  /** Update the non-visual accessible label after a UI language change. */
  setPlaceholder(value) { if (this.input) this.input.setAttribute('aria-label', value); }

  /** Stop an active shell process when leaving Terminal or interrupting work. */
  async stopActiveCommand() {
    const session = this.sessionId;
    if (!session) return;
    this.sessionId = null;
    this.executing = false;
    try {
      await fetch('/api/cmd/session/stop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session }),
      });
    } catch { /* A stopped server must not block navigation. */ }
    if (!this.input) this._appendInput();
  }

  // ── Input & History ─────────────────────────────────────────

  _appendInput() {
    this._removeInput();
    const row = document.createElement('div');
    row.className = 'term-inline-input';
    const prompt = document.createElement('span');
    prompt.className = 'term-prompt';
    prompt.textContent = '$';
    const input = document.createElement('input');
    input.className = 'terminal-inline-editor';
    input.setAttribute('aria-label', 'Type a command and press Enter');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.autocapitalize = 'none';
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('inputmode', 'text');
    input.setAttribute('enterkeyhint', 'enter');
    let isComposing = false;
    const submit = event => {
      event?.preventDefault();
      if (isComposing || this.executing) return;
      const cmd = input.value.trim();
      if (!cmd) return;
      this.history.unshift(cmd);
      if (this.history.length > 200) this.history.pop();
      this.histIdx = -1;
      this._execute(cmd);
    };
    input.addEventListener('compositionstart', () => { isComposing = true; });
    input.addEventListener('compositionend', () => { isComposing = false; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (!e.isComposing) submit(e);
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.histIdx < this.history.length - 1) {
          this.histIdx++;
          input.value = this.history[this.histIdx];
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.histIdx > 0) {
          this.histIdx--;
          input.value = this.history[this.histIdx];
        } else {
          this.histIdx = -1;
          input.value = '';
        }
      }
    });
    input.addEventListener('beforeinput', e => { if (e.inputType === 'insertLineBreak') submit(e); });
    input.addEventListener('focus', () => requestAnimationFrame(() => row.scrollIntoView({ block: 'nearest' })));
    row.addEventListener('click', event => {
      if (event.target !== input && !this.executing) requestAnimationFrame(() => input.focus({ preventScroll: true }));
    });
    row.append(prompt, input);
    this.out.append(row);
    this.input = input;
    this._scrollBottom();
  }

  _removeInput() {
    this.input?.closest('.term-inline-input')?.remove();
    this.input = null;
  }

  async _execute(cmd) {
    if (this.executing) return;
    this.executing = true;
    this._removeInput();
    this.printCmd(cmd);
    try {
      // Client-side `clear`
      if (cmd === 'clear' || cmd === 'cls') {
        this.clear();
        return;
      }

      // Client-side `cd`
      if (cmd.startsWith('cd ')) {
        const dir = cmd.slice(3).trim();
        const resp = await fetch(`/api/files?path=${encodeURIComponent(
          dir.startsWith('/') ? dir : (this.cwd || '~') + '/' + dir
        )}`);
        const data = await resp.json();
        if (data.error) this.printErr(`cd: ${data.error}`);
        else { this.cwd = data.path; this.printInfo(`→ ${this.cwd}`); }
        return;
      }

      const body = { cmd, cwd: this.cwd || undefined };
      const resp = await fetch('/api/cmd/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (data.error) {
        this.printErr(data.error);
      } else {
        this.sessionId = data.session;
        this._appendSessionOutput(data.output);
        if (data.done) this._finishCommand();
        else void this._pollSession();
      }
    } catch (err) {
      this.printErr(String(err));
      this._finishCommand();
    }
  }

  async _pollSession() {
    while (this.executing && this.sessionId) {
      await new Promise(resolve => setTimeout(resolve, 180));
      const session = this.sessionId;
      try {
        const response = await fetch('/api/cmd/session/poll', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session }),
        });
        const data = await response.json();
        if (session !== this.sessionId) return;
        if (data.error) { this.printErr(data.error); this._finishCommand(); return; }
        this._appendSessionOutput(data.output);
        if (data.done) { this._finishCommand(); return; }
      } catch (err) {
        if (session === this.sessionId) { this.printErr(String(err)); this._finishCommand(); }
        return;
      }
    }
  }

  _appendSessionOutput(output) {
    if (output) this.printOut(output);
  }

  _finishCommand() {
    this.sessionId = null;
    this.executing = false;
    if (!this.input) this._appendInput();
    this._scrollBottom();
  }

  // ── Rendering ────────────────────────────────────────────────

  _stripAnsi(text) {
    // Remove ANSI escape sequences
    return text.replace(/\x1B\[[0-9;]*[mGKHFABCDJh]/g, '');
  }

  _appendLines(text, cls) {
    const clean = this._stripAnsi(text);
    clean.split('\n').forEach((line, i, arr) => {
      // Don't append trailing empty line if text already ends with \n
      if (i === arr.length - 1 && line === '') return;
      this._appendLine(line, cls);
    });
  }

  _appendLine(text, cls) {
    const p = document.createElement('p');
    p.className = `term-line ${cls}`;
    p.textContent = text;
    this.out.appendChild(p);
    this._scrollBottom();
  }

  _scrollBottom() {
    requestAnimationFrame(() => {
      this.out.scrollTop = this.out.scrollHeight;
    });
  }
}
