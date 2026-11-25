/**
 * Terminal en el DOM: salida con colores ANSI, línea de entrada con
 * historial, autocompletado, preguntas (contraseñas) y el editor vim.
 * @module ui/terminal
 */
import { el, ansiToFragment } from './dom.js';
import { VimView } from './vim-view.js';

export class Terminal {
  /**
   * @param {HTMLElement} root
   * @param {{onCommand:(line:string)=>Promise<void>, prompt:()=>string,
   *   complete?:(line:string)=>{line:string, options:string[]}, history?:()=>string[]}} opts
   */
  constructor(root, { onCommand, prompt, complete, history }) {
    this.root = root;
    this.onCommand = onCommand;
    this.prompt = prompt;
    this.complete = complete;
    this.getHistory = history ?? (() => []);
    this.histIndex = null;
    this.draft = '';
    this.busy = false;
    this.pendingAsk = null;
    this.editor = null;
    this.atLineStart = true;

    this.output = el('div', 'term__output', { role: 'log', 'aria-live': 'polite' });
    this.line = el('div', 'term__line');
    this.promptEl = el('span', 'term__prompt');
    this.input = el('input', 'term__input', {
      type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      'aria-label': 'Línea de comandos',
    });
    this.line.append(this.promptEl, this.input);
    this.screen = el('div', 'term__screen');
    this.screen.append(this.output, this.line);
    root.append(this.screen);

    this.input.addEventListener('keydown', (e) => this.onKeyDown(e));
    root.addEventListener('click', () => {
      if (this.editor) return this.editor.focus();
      if (!window.getSelection()?.toString()) this.focus();
      return undefined;
    });
    this.line.hidden = true; // main.js llama a showPrompt() cuando el shell está listo
  }

  focus() {
    if (this.editor) this.editor.focus();
    else this.input.focus({ preventScroll: true });
  }

  scroll() {
    this.screen.scrollTop = this.screen.scrollHeight;
  }

  write(text, cls = '') {
    if (!text) return;
    this.output.appendChild(ansiToFragment(text, cls));
    this.atLineStart = text.endsWith('\n');
    this.scroll();
  }

  out = (text) => this.write(text);

  err = (text) => this.write(text, 'term__err');

  /** Bloque de texto del sistema del juego (siempre en una línea nueva). */
  system(text, cls = 'term__system') {
    this.ensureNewline();
    this.write(text.endsWith('\n') ? text : `${text}\n`, cls);
  }

  /** Inserta un nodo HTML arbitrario (banners). */
  block(node) {
    this.ensureNewline();
    this.output.appendChild(node);
    this.atLineStart = true;
    this.scroll();
  }

  ensureNewline() {
    if (!this.atLineStart) this.write('\n');
  }

  clear = () => {
    this.output.innerHTML = '';
    this.atLineStart = true;
  };

  sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  showPrompt() {
    this.promptEl.replaceChildren(ansiToFragment(this.prompt()));
    this.input.type = 'text';
    this.line.hidden = false;
    this.scroll();
  }

  setBusy(busy) {
    this.busy = busy;
    this.line.hidden = busy && !this.pendingAsk;
  }

  /** Pregunta interactiva (contraseñas incluidas). */
  ask = (question, { secret = false } = {}) => new Promise((resolve) => {
    this.ensureNewline();
    this.pendingAsk = { question, secret, resolve };
    this.promptEl.replaceChildren(ansiToFragment(question));
    this.input.value = '';
    this.input.type = secret ? 'password' : 'text';
    this.line.hidden = false;
    this.line.classList.toggle('term__line--secret', secret);
    this.focus();
    this.scroll();
  });

  finishAsk(value) {
    const { question, secret, resolve } = this.pendingAsk;
    this.pendingAsk = null;
    this.write(`${question}${secret || value === null ? '' : value}${value === null ? '^C' : ''}\n`);
    this.input.value = '';
    this.input.type = 'text';
    this.line.classList.remove('term__line--secret');
    this.line.hidden = true;
    resolve(value);
  }

  openEditor = (opts) => {
    this.line.hidden = true;
    this.root.classList.add('is-editing');
    this.editor = new VimView(this.root, opts);
    return this.editor.done.then((engine) => {
      this.editor = null;
      this.root.classList.remove('is-editing');
      return engine;
    });
  };

  async submit() {
    const value = this.input.value;
    this.input.value = '';
    this.histIndex = null;
    this.write(`${this.prompt()}${value}\n`);
    if (!value.trim()) {
      this.showPrompt();
      return;
    }
    this.setBusy(true);
    try {
      await this.onCommand(value);
    } catch (e) {
      this.err(`error interno: ${e.message}\n`);
      console.error(e);
    }
    this.setBusy(false);
    this.ensureNewline();
    this.showPrompt();
    this.focus();
  }

  onKeyDown(e) {
    if (this.pendingAsk) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.finishAsk(this.input.value);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        this.finishAsk(null);
      }
      return;
    }
    if (this.busy) {
      e.preventDefault();
      return;
    }
    const history = this.getHistory();
    switch (true) {
      case e.key === 'Enter':
        e.preventDefault();
        this.submit();
        break;
      case e.key === 'ArrowUp':
        e.preventDefault();
        if (!history.length) break;
        if (this.histIndex === null) {
          this.draft = this.input.value;
          this.histIndex = history.length;
        }
        this.histIndex = Math.max(0, this.histIndex - 1);
        this.setInput(history[this.histIndex]);
        break;
      case e.key === 'ArrowDown':
        e.preventDefault();
        if (this.histIndex === null) break;
        this.histIndex++;
        if (this.histIndex >= history.length) {
          this.histIndex = null;
          this.setInput(this.draft);
        } else this.setInput(history[this.histIndex]);
        break;
      case e.key === 'Tab': {
        e.preventDefault();
        if (!this.complete) break;
        const before = this.input.value.slice(0, this.input.selectionStart ?? this.input.value.length);
        const after = this.input.value.slice(before.length);
        const { line, options } = this.complete(before);
        if (options.length > 1) {
          this.write(`${this.prompt()}${this.input.value}\n`);
          this.write(`${options.join('  ')}\n`);
        }
        this.setInput(line + after, line.length);
        break;
      }
      case e.ctrlKey && e.key.toLowerCase() === 'l':
        e.preventDefault();
        this.clear();
        break;
      case e.ctrlKey && e.key.toLowerCase() === 'c':
        if (this.input.selectionStart !== this.input.selectionEnd) break;
        e.preventDefault();
        this.write(`${this.prompt()}${this.input.value}^C\n`);
        this.input.value = '';
        break;
      case e.ctrlKey && e.key.toLowerCase() === 'u':
        e.preventDefault();
        this.input.value = '';
        break;
      default:
    }
  }

  setInput(value, caret = value.length) {
    this.input.value = value;
    requestAnimationFrame(() => this.input.setSelectionRange(caret, caret));
  }
}
