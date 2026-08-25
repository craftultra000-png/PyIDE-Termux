/**
 * terminal.js
 * Terminal panel: command history (Up/Down), ANSI colour stripping,
 * output rendering (stdout / stderr).
 */

export class Terminal {
  /**
   * @param {HTMLElement} outputEl - scrollable output div
   * @param {HTMLInputElement} inputEl - command input
   */
  constructor(outputEl, inputEl) {
    this.out    = outputEl;
    this.input  = inputEl;
    this.cwd    = null;    // updated after `cd` commands
    this.history = [];
    this.histIdx = -1;
    this._pendingLine = '';

    this._setupInput();
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
  }

  // ── Input & History ─────────────────────────────────────────

  _setupInput() {
    this.input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const cmd = this.input.value.trim();
        if (!cmd) return;
        this.input.value = '';
        this.history.unshift(cmd);
        if (this.history.length > 200) this.history.pop();
        this.histIdx = -1;
        await this._execute(cmd);
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.histIdx < this.history.length - 1) {
          this.histIdx++;
          this.input.value = this.history[this.histIdx];
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.histIdx > 0) {
          this.histIdx--;
          this.input.value = this.history[this.histIdx];
        } else {
          this.histIdx = -1;
          this.input.value = '';
        }
      }
    });
  }

  async _execute(cmd) {
    this.printCmd(cmd);

    // Client-side `clear`
    if (cmd === 'clear' || cmd === 'cls') {
      this.clear();
      return;
    }

    // Client-side `cd`
    if (cmd.startsWith('cd ')) {
      const dir = cmd.slice(3).trim();
      // Try to update cwd via a ls call to validate
      const resp = await fetch(`/api/files?path=${encodeURIComponent(
        dir.startsWith('/') ? dir : (this.cwd || '~') + '/' + dir
      )}`);
      const data = await resp.json();
      if (data.error) {
        this.printErr(`cd: ${data.error}`);
      } else {
        this.cwd = data.path;
        this.printInfo(`→ ${this.cwd}`);
      }
      this._scrollBottom();
      return;
    }

    try {
      const body = { cmd, cwd: this.cwd || undefined };
      const resp = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (data.error) {
        this.printErr(data.error);
      } else {
        this.printOut(data.stdout);
        this.printErr(data.stderr);
      }
    } catch (err) {
      this.printErr(String(err));
    }
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
