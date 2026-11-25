/**
 * Vista DOM del editor Vim: dibuja el estado de VimEngine y le pasa teclas.
 * @module ui/vim-view
 */
import { VimEngine } from '../editor/vim-engine.js';
import { el, escapeHtml } from './dom.js';

const SPECIAL = new Set([
  'Escape', 'Enter', 'Backspace', 'Tab', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Insert',
]);

/** Traduce un KeyboardEvent a la notación del motor. */
export function keyFromEvent(e) {
  if (e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key === '[') return 'Escape';
    if (e.key.length === 1) return `C-${e.key.toLowerCase()}`;
    return null;
  }
  if (e.metaKey) return null;
  if (SPECIAL.has(e.key)) return e.key;
  if (e.key.length === 1) return e.key;
  return null;
}

export class VimView {
  /**
   * @param {HTMLElement} host  contenedor donde se monta el editor
   * @param {ConstructorParameters<typeof VimEngine>[0]} opts
   */
  constructor(host, opts) {
    this.host = host;
    this.done = new Promise((resolve) => { this.resolve = resolve; });
    this.engine = new VimEngine({ ...opts, onQuit: () => this.close() });

    this.root = el('div', 'vim', { role: 'application', 'aria-label': `Editor vim: ${opts.filename || 'sin nombre'}` });
    this.buffer = el('div', 'vim__buffer');
    this.statusBar = el('div', 'vim__status');
    this.cmdLine = el('div', 'vim__cmd');
    this.help = el('div', 'vim__help', {
      html: '<kbd>i</kbd> insertar · <kbd>Esc</kbd> modo normal · <kbd>:w</kbd> guardar · <kbd>:q</kbd> salir · <kbd>:wq</kbd> guardar y salir · <kbd>:q!</kbd> salir sin guardar · <kbd>u</kbd> deshacer',
    });
    this.keys = el('textarea', 'vim__keys', {
      'aria-label': 'Entrada de teclado del editor', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
    });
    this.root.append(this.buffer, this.statusBar, this.cmdLine, this.help, this.keys);
    host.appendChild(this.root);

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onInput = this.onInput.bind(this);
    this.keys.addEventListener('keydown', this.onKeyDown);
    this.keys.addEventListener('input', this.onInput);
    this.root.addEventListener('mousedown', (e) => { e.preventDefault(); this.focus(); });
    this.onResize = () => this.render();
    window.addEventListener('resize', this.onResize);

    this.render();
    this.focus();
  }

  focus() {
    this.keys.focus({ preventScroll: true });
  }

  onKeyDown(e) {
    if (e.isComposing || e.key === 'Unidentified' || e.key === 'Process') return;
    const key = keyFromEvent(e);
    if (!key) return;
    e.preventDefault();
    this.engine.key(key);
    if (!this.engine.closed) this.render();
  }

  /** Respaldo para teclados móviles que no envían keydown útiles. */
  onInput() {
    const value = this.keys.value;
    this.keys.value = '';
    if (!value) return;
    for (const ch of value) this.engine.key(ch === '\n' ? 'Enter' : ch);
    if (!this.engine.closed) this.render();
  }

  rows() {
    const lineHeight = parseFloat(getComputedStyle(this.buffer).lineHeight) || 20;
    return Math.max(3, Math.floor(this.buffer.clientHeight / lineHeight));
  }

  render() {
    const e = this.engine;
    const rows = this.rows();
    e.ensureVisible(rows);
    const gutter = String(e.lines.length).length + 1;
    const html = [];
    for (let i = 0; i < rows; i++) {
      const r = e.scrollTop + i;
      if (r >= e.lines.length) {
        html.push('<div class="vim__line vim__line--empty">~</div>');
        continue;
      }
      const text = e.lines[r];
      let content;
      if (r === e.row && e.mode !== 'command') {
        const chars = [...text];
        const before = escapeHtml(chars.slice(0, e.col).join(''));
        const at = chars[e.col] ?? ' ';
        const after = escapeHtml(chars.slice(e.col + 1).join(''));
        const cls = e.mode === 'insert' ? 'vim__cursor vim__cursor--bar' : 'vim__cursor';
        content = `${before}<span class="${cls}">${escapeHtml(at)}</span>${after}`;
      } else {
        content = escapeHtml(text) || ' ';
      }
      const num = e.showNumbers ? `<span class="vim__num">${String(r + 1).padStart(gutter)} </span>` : '';
      html.push(`<div class="vim__line${r === e.row ? ' vim__line--current' : ''}">${num}${content}</div>`);
    }
    this.buffer.innerHTML = html.join('');

    const name = e.filename || '[Sin nombre]';
    const flags = `${e.modified ? ' [+]' : ''}${e.readonly ? ' [RO]' : ''}`;
    const total = e.lines.length;
    const pct = total <= rows ? 'Todo' : e.scrollTop === 0 ? 'Arriba' : e.scrollTop + rows >= total ? 'Abajo' : `${Math.round((e.scrollTop / (total - rows)) * 100)}%`;
    const modeLabel = { normal: 'NORMAL', insert: 'INSERTAR', command: 'COMANDO' }[e.mode];
    this.statusBar.innerHTML = `<span class="vim__mode vim__mode--${e.mode}">${modeLabel}</span><span class="vim__file">${escapeHtml(name)}${flags}</span><span class="vim__pos">${e.row + 1},${e.col + 1}  ${pct}</span>`;

    if (e.mode === 'command') {
      this.cmdLine.className = 'vim__cmd';
      this.cmdLine.innerHTML = `${escapeHtml(e.cmdPrefix + e.cmdline)}<span class="vim__cursor vim__cursor--bar"> </span>`;
    } else {
      this.cmdLine.className = `vim__cmd${e.messageIsError ? ' vim__cmd--error' : ''}`;
      const pending = e.count || e.pending ? `<span class="vim__pending">${escapeHtml(e.count + e.pending)}</span>` : '';
      this.cmdLine.innerHTML = `${escapeHtml(e.message || '')}${pending}`;
    }
  }

  close() {
    window.removeEventListener('resize', this.onResize);
    this.keys.removeEventListener('keydown', this.onKeyDown);
    this.keys.removeEventListener('input', this.onInput);
    this.root.remove();
    this.resolve(this.engine);
  }
}
