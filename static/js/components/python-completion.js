/* Local-only Python completion: no source code leaves the device. */

const KEYWORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'case', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'match', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  'with', 'yield',
];

const BUILTINS = [
  'abs', 'all', 'any', 'bool', 'breakpoint', 'bytes', 'callable', 'chr',
  'dict', 'dir', 'enumerate', 'filter', 'float', 'format', 'getattr', 'help',
  'input', 'int', 'isinstance', 'iter', 'len', 'list', 'map', 'max', 'min',
  'next', 'object', 'open', 'print', 'range', 'repr', 'reversed', 'round',
  'set', 'sorted', 'str', 'sum', 'super', 'tuple', 'type', 'zip',
];

const MODULES = [
  'argparse', 'asyncio', 'collections', 'csv', 'dataclasses', 'datetime',
  'functools', 'itertools', 'json', 'math', 'os', 'pathlib', 'random',
  're', 'statistics', 'string', 'subprocess', 'sys', 'time', 'typing',
];

export class PythonCompletion {
  /** @param {HTMLTextAreaElement} textarea @param {HTMLElement} popup */
  constructor(textarea, popup) {
    this.textarea = textarea;
    this.popup = popup;
    this.items = [];
    this.selected = 0;
    this.prefixStart = 0;
    this.enabled = false;
    this._bind();
  }

  _bind() {
    this.textarea.addEventListener('input', () => this.refresh());
    this.textarea.addEventListener('keydown', event => this._handleKey(event), true);
    this.textarea.addEventListener('blur', () => setTimeout(() => this.hide(), 120));
    this.popup.addEventListener('mousedown', event => {
      const option = event.target.closest('[data-completion]');
      if (!option) return;
      event.preventDefault();
      this.apply(Number(option.dataset.completion));
    });
  }

  _handleKey(event) {
    const visible = !this.popup.classList.contains('hidden');
    if ((event.ctrlKey || event.metaKey) && event.key === ' ') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.refresh({ force: true });
      return;
    }
    if (!visible) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault(); event.stopImmediatePropagation();
      this.selected = (this.selected + 1) % this.items.length; this.render();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault(); event.stopImmediatePropagation();
      this.selected = (this.selected - 1 + this.items.length) % this.items.length; this.render();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation(); this.apply(this.selected);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); this.hide();
    }
  }

  refresh({ force = false } = {}) {
    if (!this.enabled) { this.hide(); return; }
    const before = this.textarea.value.slice(0, this.textarea.selectionStart);
    const match = before.match(/[A-Za-z_][A-Za-z0-9_]*$/);
    const prefix = match?.[0] || '';
    this.prefixStart = this.textarea.selectionStart - prefix.length;
    if ((!force && prefix.length < 2) || this.textarea.selectionStart !== this.textarea.selectionEnd) {
      this.hide();
      return;
    }
    const known = new Set([...KEYWORDS, ...BUILTINS, ...MODULES]);
    const identifiers = this.textarea.value.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
    identifiers.forEach(identifier => known.add(identifier));
    const folded = prefix.casefold ? prefix.casefold() : prefix.toLowerCase();
    this.items = [...known]
      .filter(item => item !== prefix && item.toLowerCase().startsWith(folded))
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .slice(0, 8);
    if (!this.items.length) { this.hide(); return; }
    this.selected = 0;
    this.render();
  }

  render() {
    this.popup.replaceChildren();
    this.items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.completion = String(index);
      button.className = index === this.selected ? 'completion-option active' : 'completion-option';
      button.textContent = item;
      this.popup.append(button);
    });
    this.popup.classList.remove('hidden');
  }

  apply(index) {
    const value = this.items[index];
    if (!value) return;
    const start = this.prefixStart;
    const end = this.textarea.selectionStart;
    const source = this.textarea.value;
    this.textarea.value = source.slice(0, start) + value + source.slice(end);
    const cursor = start + value.length;
    this.textarea.selectionStart = cursor;
    this.textarea.selectionEnd = cursor;
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    this.hide();
    this.textarea.focus();
  }

  hide() {
    this.items = [];
    this.popup.classList.add('hidden');
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.hide();
  }
}
