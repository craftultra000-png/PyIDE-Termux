/** A lightweight, keyboard-first command palette without dependencies. */
export class CommandPalette {
  /** @param {{ getElement: (id: string) => HTMLElement, openModal: (id: string) => void, closeModal: (id: string) => void }} options */
  constructor({ getElement, openModal, closeModal }) {
    this.$ = getElement;
    this.openModal = openModal;
    this.closeModal = closeModal;
    this.commands = [];
    this.$('command-input').addEventListener('input', event => this.render(event.target.value));
  }

  /** @param {{ label: string, shortcut?: string, run: () => void }[]} commands */
  setCommands(commands) { this.commands = commands; }

  open() {
    this.openModal('modal-command');
    this.$('command-input').value = '';
    this.render('');
    setTimeout(() => this.$('command-input').focus(), 40);
  }

  /** @param {string} query */
  render(query) {
    const term = query.toLowerCase();
    const list = this.$('command-list');
    const commands = this.commands.filter(command => command.label.toLowerCase().includes(term));
    list.replaceChildren(...commands.map(command => this.makeCommandButton(command)));
  }

  /** @param {{ label: string, shortcut?: string, run: () => void }} command */
  makeCommandButton(command) {
    const button = document.createElement('button');
    button.className = 'command-item';
    button.innerHTML = `<span>${command.label}</span><small>${command.shortcut || ''}</small>`;
    button.addEventListener('click', () => { this.closeModal('modal-command'); command.run(); });
    return button;
  }
}
