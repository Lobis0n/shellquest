/**
 * Motor de Vim sin DOM: recibe teclas (strings) y mantiene el estado del
 * buffer. La vista (ui/vim-view.js) solo lo dibuja. Esto permite testearlo
 * en Node y reproducir soluciones de niveles.
 *
 * Soportado:
 *  Normal:  h j k l  w b e  0 ^ $  gg G  NG  i a I A o O  x X  r  ~  J
 *           dd cc yy  dw cw yw  d$ D C  p P  u Ctrl-r  / ? n N  ZZ ZQ  conteos (3dd, 5j)
 *  Insert:  texto, Enter, Backspace, Delete, Tab, flechas, Esc
 *  Ex (:):  w q q! wq x  w nombre  N (ir a línea)  set nu/nonu  s/// %s/// N,Ms///
 * @module editor/vim-engine
 */

const isWordChar = (c) => /[\p{L}\p{N}_]/u.test(c);
const charClass = (c) => (c === undefined ? -1 : /\s/.test(c) ? 0 : isWordChar(c) ? 1 : 2);
const bytes = (s) => new TextEncoder().encode(s).length;

/** Convierte una regex de Vim (modo "magic") a RegExp de JS. */
export function vimRegex(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      const n = pattern[++i];
      if (n === '<' || n === '>') out += '\\b';
      else if ('()|+?{}'.includes(n)) out += n;
      else out += `\\${n}`;
    } else if ('()|+?{}'.includes(c)) out += `\\${c}`;
    else out += c;
  }
  return out;
}

/** Convierte un reemplazo de Vim (& y \1) al formato de String.replace. */
function vimReplacement(rep) {
  let out = '';
  for (let i = 0; i < rep.length; i++) {
    const c = rep[i];
    if (c === '\\' && i + 1 < rep.length) {
      const n = rep[++i];
      if (/\d/.test(n)) out += `$${n}`;
      else if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else out += n === '$' ? '$$' : n;
    } else if (c === '&') out += '$&';
    else if (c === '$') out += '$$';
    else out += c;
  }
  return out;
}

export class VimEngine {
  /**
   * @param {{content?:string, filename?:string, isNew?:boolean, readonly?:boolean,
   *   save?:(text:string, name:string|null)=>{ok?:boolean,error?:string,name?:string},
   *   onQuit?:()=>void}} opts
   */
  constructor({ content = '', filename = '', isNew = false, readonly = false, save, onQuit } = {}) {
    this.lines = content === '' ? [''] : content.replace(/\n$/, '').split('\n');
    this.filename = filename;
    this.readonly = readonly;
    this.saveFn = save ?? (() => ({ ok: true }));
    this.onQuit = onQuit ?? (() => {});
    this.row = 0;
    this.col = 0;
    this.mode = 'normal';
    this.cmdline = '';
    this.cmdPrefix = ':';
    this.pending = '';
    this.count = '';
    this.opCount = 1;
    this.register = { text: '', linewise: false };
    this.undoStack = [];
    this.redoStack = [];
    this.insertSnapPending = false;
    this.modified = false;
    this.showNumbers = false;
    this.lastSearch = null;
    this.searchDir = 1;
    this.closed = false;
    this.scrollTop = 0;
    this.messageIsError = false;
    const label = filename ? `"${filename}"` : '[No Name]';
    if (isNew) this.message = `${label} [New]`;
    else this.message = `${label}${readonly ? ' [readonly]' : ''} ${this.lines.length}L, ${bytes(content)}B`;
  }

  get text() { return `${this.lines.join('\n')}\n`; }
  get line() { return this.lines[this.row]; }
  set line(v) { this.lines[this.row] = v; }

  firstNonBlank(row = this.row) {
    const m = /\S/.exec(this.lines[row]);
    return m ? m.index : 0;
  }

  info(msg) { this.message = msg; this.messageIsError = false; }
  error(msg) { this.message = msg; this.messageIsError = true; }

  clamp() {
    this.row = Math.max(0, Math.min(this.row, this.lines.length - 1));
    const max = this.mode === 'insert' ? this.line.length : Math.max(0, this.line.length - 1);
    this.col = Math.max(0, Math.min(this.col, max));
  }

  ensureVisible(height) {
    if (this.row < this.scrollTop) this.scrollTop = this.row;
    if (this.row >= this.scrollTop + height) this.scrollTop = this.row - height + 1;
    this.scrollTop = Math.max(0, this.scrollTop);
  }

  snapshot() {
    this.undoStack.push({ lines: [...this.lines], row: this.row, col: this.col, modified: this.modified });
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Registra un cambio: guarda estado para deshacer y marca modificado. */
  change() {
    this.snapshot();
    this.modified = true;
  }

  // ------------------------------------------------------------------ teclas
  /** @param {string} key  'a', 'Escape', 'Enter', 'Backspace', 'ArrowLeft', 'C-r'... */
  key(key) {
    if (this.closed) return;
    if (key === 'C-[') key = 'Escape';
    switch (this.mode) {
      case 'insert': this.insertKey(key); break;
      case 'command': this.commandKey(key); break;
      default: this.normalKey(key);
    }
    if (!this.closed) this.clamp();
  }

  /** Envía una secuencia en notación `iHola<Esc>:wq<CR>`. */
  feed(sequence) {
    for (const k of parseKeys(sequence)) this.key(k);
  }

  startInsert() {
    this.snapshot();
    this.insertSnapPending = true;
    this.mode = 'insert';
    this.info('-- INSERT --');
  }

  touchInsert() {
    if (this.insertSnapPending) {
      this.insertSnapPending = false;
      this.modified = true;
    }
  }

  normalKey(k) {
    if (this.pending === 'r') {
      this.pending = '';
      if (k.length === 1 && this.line.length) {
        const n = Math.min(this.opCount, this.line.length - this.col);
        this.change();
        this.line = this.line.slice(0, this.col) + k.repeat(n) + this.line.slice(this.col + n);
        this.col += n - 1;
      }
      return;
    }

    if (/^[1-9]$/.test(k) || (k === '0' && this.count)) {
      this.count += k;
      return;
    }
    const hasCount = Boolean(this.count);
    const n = hasCount ? parseInt(this.count, 10) : 1;
    this.count = '';

    if (this.pending === 'g') {
      this.pending = '';
      if (k === 'g') {
        this.row = this.gCount ? this.gCount - 1 : 0;
        this.col = this.firstNonBlank();
      }
      return;
    }
    if (this.pending === 'Z') {
      this.pending = '';
      if (k === 'Z') this.ex('x');
      else if (k === 'Q') this.ex('q!');
      return;
    }
    if (['d', 'c', 'y'].includes(this.pending)) {
      const op = this.pending;
      this.pending = '';
      this.operator(op, k, this.opCount * n);
      return;
    }

    switch (k) {
      case 'h': case 'ArrowLeft': case 'Backspace': this.col = Math.max(0, this.col - n); break;
      case 'l': case 'ArrowRight': case ' ': this.col = Math.min(this.col + n, Math.max(0, this.line.length - 1)); break;
      case 'j': case 'ArrowDown': case 'Enter': case '+': this.row += n; if (k === 'Enter' || k === '+') this.col = this.firstNonBlank(Math.min(this.row, this.lines.length - 1)); break;
      case 'k': case 'ArrowUp': case '-': this.row -= n; break;
      case '0': case 'Home': this.col = 0; break;
      case '^': this.col = this.firstNonBlank(); break;
      case '$': case 'End': this.col = this.line.length - 1; break;
      case 'w': case 'W': for (let i = 0; i < n; i++) this.wordForward(); break;
      case 'b': case 'B': for (let i = 0; i < n; i++) this.wordBackward(); break;
      case 'e': case 'E': for (let i = 0; i < n; i++) this.wordEnd(); break;
      case 'G': this.row = hasCount ? n - 1 : this.lines.length - 1; this.clamp(); this.col = this.firstNonBlank(); break;
      case 'g': this.pending = 'g'; this.gCount = hasCount ? n : 0; break;
      case 'i': case 'Insert': this.startInsert(); break;
      case 'a': this.startInsert(); this.col = Math.min(this.col + 1, this.line.length); break;
      case 'I': this.startInsert(); this.col = this.firstNonBlank(); break;
      case 'A': this.startInsert(); this.col = this.line.length; break;
      case 'o':
        this.change();
        this.lines.splice(this.row + 1, 0, '');
        this.row++;
        this.col = 0;
        this.mode = 'insert';
        this.info('-- INSERT --');
        break;
      case 'O':
        this.change();
        this.lines.splice(this.row, 0, '');
        this.col = 0;
        this.mode = 'insert';
        this.info('-- INSERT --');
        break;
      case 'x': case 'Delete':
        if (!this.line.length) break;
        this.change();
        this.register = { text: this.line.slice(this.col, this.col + n), linewise: false };
        this.line = this.line.slice(0, this.col) + this.line.slice(this.col + n);
        break;
      case 'X':
        if (this.col === 0) break;
        this.change();
        {
          const from = Math.max(0, this.col - n);
          this.register = { text: this.line.slice(from, this.col), linewise: false };
          this.line = this.line.slice(0, from) + this.line.slice(this.col);
          this.col = from;
        }
        break;
      case 'D': case 'C':
        this.change();
        this.register = { text: this.line.slice(this.col), linewise: false };
        this.line = this.line.slice(0, this.col);
        if (k === 'C') { this.mode = 'insert'; this.info('-- INSERT --'); }
        break;
      case 's':
        this.change();
        this.line = this.line.slice(0, this.col) + this.line.slice(this.col + n);
        this.mode = 'insert';
        this.info('-- INSERT --');
        break;
      case 'S': this.operator('c', 'c', n); break;
      case 'd': case 'c': case 'y': this.pending = k; this.opCount = n; break;
      case 'Y': this.operator('y', 'y', n); break;
      case 'p': case 'P': this.paste(k === 'p', n); break;
      case 'J':
        if (this.row >= this.lines.length - 1) break;
        this.change();
        {
          const left = this.line.replace(/\s+$/, '');
          const right = this.lines[this.row + 1].replace(/^\s+/, '');
          this.line = right ? `${left} ${right}` : left;
          this.lines.splice(this.row + 1, 1);
          this.col = left.length;
        }
        break;
      case 'r': this.pending = 'r'; this.opCount = n; break;
      case '~':
        if (!this.line.length) break;
        this.change();
        {
          const c = this.line[this.col];
          const t = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
          this.line = this.line.slice(0, this.col) + t + this.line.slice(this.col + 1);
          this.col++;
        }
        break;
      case 'u': for (let i = 0; i < n; i++) this.undo(); break;
      case 'C-r': for (let i = 0; i < n; i++) this.redo(); break;
      case ':': this.mode = 'command'; this.cmdPrefix = ':'; this.cmdline = hasCount ? `.,.+${n - 1}` : ''; this.message = ''; break;
      case '/': case '?': this.mode = 'command'; this.cmdPrefix = k; this.cmdline = ''; this.message = ''; break;
      case 'n': this.searchNext(this.searchDir); break;
      case 'N': this.searchNext(-this.searchDir); break;
      case 'Z': this.pending = 'Z'; break;
      case 'v': case 'V': case 'C-v': this.error('El modo visual no está disponible en ShellQuest (usá dd, yy, dw...)'); break;
      case 'Escape': this.pending = ''; break;
      default: break;
    }
  }

  wordForward() {
    let { row, col } = this;
    let line = this.lines[row];
    const start = charClass(line[col]);
    if (start > 0) while (col < line.length && charClass(line[col]) === start) col++;
    for (;;) {
      while (col < line.length && charClass(line[col]) === 0) col++;
      if (col < line.length) break;
      if (row >= this.lines.length - 1) { col = Math.max(0, line.length - 1); break; }
      row++;
      line = this.lines[row];
      col = 0;
      if (!line.length) break;
    }
    this.row = row;
    this.col = col;
  }

  wordBackward() {
    let { row } = this;
    let col = this.col - 1;
    let line = this.lines[row];
    for (;;) {
      while (col >= 0 && charClass(line[col]) === 0) col--;
      if (col >= 0) break;
      if (row === 0) { this.row = 0; this.col = 0; return; }
      row--;
      line = this.lines[row];
      col = line.length - 1;
      if (!line.length) { this.row = row; this.col = 0; return; }
    }
    const cls = charClass(line[col]);
    while (col > 0 && charClass(line[col - 1]) === cls) col--;
    this.row = row;
    this.col = col;
  }

  wordEnd() {
    let { row } = this;
    let col = this.col + 1;
    let line = this.lines[row];
    for (;;) {
      while (col < line.length && charClass(line[col]) === 0) col++;
      if (col < line.length) break;
      if (row >= this.lines.length - 1) { this.row = row; this.col = Math.max(0, line.length - 1); return; }
      row++;
      line = this.lines[row];
      col = 0;
    }
    const cls = charClass(line[col]);
    while (col < line.length - 1 && charClass(line[col + 1]) === cls) col++;
    this.row = row;
    this.col = col;
  }

  operator(op, k, n) {
    if (k === 'Escape') return;
    if (k === op) {
      const end = Math.min(this.lines.length, this.row + n);
      const taken = this.lines.slice(this.row, end);
      this.register = { text: taken.join('\n'), linewise: true };
      if (op === 'y') {
        if (taken.length > 2) this.info(`${taken.length} lines yanked`);
        return;
      }
      this.change();
      if (op === 'd') {
        this.lines.splice(this.row, taken.length);
        if (!this.lines.length) this.lines = [''];
        if (this.row >= this.lines.length) this.row = this.lines.length - 1;
        this.col = this.firstNonBlank();
        if (taken.length > 2) this.info(`${taken.length} fewer lines`);
      } else {
        this.lines.splice(this.row, taken.length, '');
        this.col = 0;
        this.mode = 'insert';
        this.info('-- INSERT --');
      }
      return;
    }

    const start = { row: this.row, col: this.col };
    const line = this.lines[start.row];
    let from = start.col;
    let to;
    switch (k) {
      case 'w': case 'W':
        if (op === 'c' && charClass(line[from]) > 0) {
          for (let i = 0; i < n; i++) this.wordEnd();
          to = this.row === start.row ? this.col + 1 : line.length;
        } else {
          for (let i = 0; i < n; i++) this.wordForward();
          to = this.row === start.row ? this.col : line.length;
          if (this.row === start.row && this.col === line.length - 1 && to <= from) to = line.length;
        }
        break;
      case 'e': case 'E':
        for (let i = 0; i < n; i++) this.wordEnd();
        to = this.row === start.row ? this.col + 1 : line.length;
        break;
      case 'b': case 'B':
        for (let i = 0; i < n; i++) this.wordBackward();
        to = from;
        from = this.row === start.row ? this.col : 0;
        break;
      case '$': case 'End': to = line.length; break;
      case '0': case 'Home': to = from; from = 0; break;
      case '^': to = from; from = this.firstNonBlank(); break;
      case 'h': case 'ArrowLeft': to = from; from = Math.max(0, from - n); break;
      case 'l': case 'ArrowRight': case ' ': to = Math.min(line.length, from + n); break;
      case 'j': case 'k': case 'G': {
        // operaciones por líneas hacia abajo/arriba
        const target = k === 'j' ? start.row + n : k === 'k' ? start.row - n : this.lines.length - 1;
        const a = Math.max(0, Math.min(start.row, target));
        const b = Math.min(this.lines.length - 1, Math.max(start.row, target));
        this.row = a;
        this.operator(op, op, b - a + 1);
        return;
      }
      default:
        return;
    }
    this.row = start.row;
    this.col = start.col;
    if (to < from) [from, to] = [to, from];
    this.register = { text: line.slice(from, to), linewise: false };
    if (op === 'y') {
      this.col = from;
      return;
    }
    this.change();
    this.lines[start.row] = line.slice(0, from) + line.slice(to);
    this.col = from;
    if (op === 'c') {
      this.mode = 'insert';
      this.info('-- INSERT --');
    }
  }

  paste(after, n) {
    const { text, linewise } = this.register;
    if (!text && !linewise) return;
    this.change();
    if (linewise) {
      const block = [];
      for (let i = 0; i < n; i++) block.push(...text.split('\n'));
      const at = after ? this.row + 1 : this.row;
      this.lines.splice(at, 0, ...block);
      this.row = at;
      this.col = this.firstNonBlank();
      return;
    }
    const chunk = text.repeat(n);
    const at = after && this.line.length ? this.col + 1 : this.col;
    const pieces = chunk.split('\n');
    if (pieces.length === 1) {
      this.line = this.line.slice(0, at) + chunk + this.line.slice(at);
      this.col = at + chunk.length - 1;
    } else {
      const rest = this.line.slice(at);
      this.line = this.line.slice(0, at) + pieces[0];
      const middle = pieces.slice(1);
      middle[middle.length - 1] += rest;
      this.lines.splice(this.row + 1, 0, ...middle);
    }
  }

  undo() {
    const state = this.undoStack.pop();
    if (!state) {
      this.info('Already at oldest change');
      return;
    }
    this.redoStack.push({ lines: [...this.lines], row: this.row, col: this.col, modified: this.modified });
    this.lines = state.lines;
    this.row = state.row;
    this.col = state.col;
    this.modified = state.modified || this.undoStack.length > 0;
    this.info('1 change; before #' + (this.undoStack.length + 1));
  }

  redo() {
    const state = this.redoStack.pop();
    if (!state) {
      this.info('Already at newest change');
      return;
    }
    this.undoStack.push({ lines: [...this.lines], row: this.row, col: this.col, modified: this.modified });
    this.lines = state.lines;
    this.row = state.row;
    this.col = state.col;
    this.modified = true;
    this.info('1 change; after #' + this.undoStack.length);
  }

  insertKey(k) {
    if (k === 'Escape' || k === 'C-c') {
      if (this.insertSnapPending) {
        this.undoStack.pop();
        this.insertSnapPending = false;
      }
      this.mode = 'normal';
      this.col = Math.max(0, this.col - 1);
      this.message = '';
      return;
    }
    const line = this.line;
    switch (k) {
      case 'Enter': {
        this.touchInsert();
        const indent = /^\s*/.exec(line)[0];
        this.line = line.slice(0, this.col);
        this.lines.splice(this.row + 1, 0, line.slice(this.col));
        this.row++;
        this.col = 0;
        void indent;
        break;
      }
      case 'Backspace':
        if (this.col > 0) {
          this.touchInsert();
          this.line = line.slice(0, this.col - 1) + line.slice(this.col);
          this.col--;
        } else if (this.row > 0) {
          this.touchInsert();
          const prev = this.lines[this.row - 1];
          this.lines[this.row - 1] = prev + line;
          this.lines.splice(this.row, 1);
          this.row--;
          this.col = prev.length;
        }
        break;
      case 'Delete':
        if (this.col < line.length) {
          this.touchInsert();
          this.line = line.slice(0, this.col) + line.slice(this.col + 1);
        } else if (this.row < this.lines.length - 1) {
          this.touchInsert();
          this.line = line + this.lines[this.row + 1];
          this.lines.splice(this.row + 1, 1);
        }
        break;
      case 'Tab': this.insertText('    '); break;
      case 'ArrowLeft': this.col = Math.max(0, this.col - 1); break;
      case 'ArrowRight': this.col = Math.min(line.length, this.col + 1); break;
      case 'ArrowUp': this.row = Math.max(0, this.row - 1); break;
      case 'ArrowDown': this.row = Math.min(this.lines.length - 1, this.row + 1); break;
      case 'Home': this.col = 0; break;
      case 'End': this.col = line.length; break;
      default:
        if ([...k].length === 1) this.insertText(k);
    }
  }

  insertText(text) {
    this.touchInsert();
    this.line = this.line.slice(0, this.col) + text + this.line.slice(this.col);
    this.col += text.length;
  }

  commandKey(k) {
    if (k === 'Escape' || k === 'C-c') {
      this.mode = 'normal';
      this.cmdline = '';
      return;
    }
    if (k === 'Enter') {
      const input = this.cmdline;
      const prefix = this.cmdPrefix;
      this.mode = 'normal';
      this.cmdline = '';
      if (prefix === ':') this.ex(input);
      else this.search(input, prefix === '/' ? 1 : -1);
      return;
    }
    if (k === 'Backspace') {
      if (!this.cmdline) this.mode = 'normal';
      else this.cmdline = this.cmdline.slice(0, -1);
      return;
    }
    if ([...k].length === 1) this.cmdline += k;
  }

  // -------------------------------------------------------------- comandos :
  ex(raw) {
    const c = raw.trim().replace(/^:+/, '');
    if (!c) return;
    if (/^\d+$/.test(c)) {
      this.row = parseInt(c, 10) - 1;
      this.clamp();
      this.col = this.firstNonBlank();
      return;
    }
    if (c === '$') {
      this.row = this.lines.length - 1;
      this.col = this.firstNonBlank();
      return;
    }
    const sub = /^(%|\.,\.\+\d+|\d+,\d+|\d+|\.|\$|)s(?:ubstitute)?([^\w\s])(.*)$/.exec(c);
    if (sub) {
      this.substitute(sub[1], sub[2], sub[3]);
      return;
    }
    const m = /^([a-zA-Z]+)(!?)\s*(.*)$/.exec(c);
    if (!m) {
      this.error(`E492: Not an editor command: ${c}`);
      return;
    }
    const [, name, bang, arg] = m;
    switch (name) {
      case 'w': case 'write':
        this.write(arg, Boolean(bang));
        break;
      case 'q': case 'quit': case 'qa': case 'qall':
        if (this.modified && !bang) {
          this.error('E37: No write since last change (add ! to override)');
          return;
        }
        this.quit();
        break;
      case 'wq': case 'wqa': case 'x': case 'xit': case 'exit':
        if ((name === 'x' || name === 'xit' || name === 'exit') && !this.modified && !arg) {
          this.quit();
          return;
        }
        if (this.write(arg, Boolean(bang))) this.quit();
        break;
      case 'set': case 'se':
        this.setOption(arg);
        break;
      case 'noh': case 'nohlsearch':
        break;
      case 'h': case 'help':
        this.info('Ayuda: salí con :q y escribí "man vim" en la terminal.');
        break;
      case 'e': case 'edit':
        this.error('E37: :e no está soportado en ShellQuest. Salí y abrí otro archivo con vim archivo');
        break;
      default:
        this.error(`E492: Not an editor command: ${c}`);
    }
  }

  setOption(arg) {
    const opt = arg.trim();
    if (['nu', 'number'].includes(opt)) this.showNumbers = true;
    else if (['nonu', 'nonumber'].includes(opt)) this.showNumbers = false;
    else if (['nu!', 'number!', 'invnumber', 'invnu'].includes(opt)) this.showNumbers = !this.showNumbers;
    else if (!opt) this.info(this.showNumbers ? '  number' : '  nonumber');
    else this.error(`E518: Unknown option: ${opt}`);
  }

  write(name, force) {
    if (this.readonly && !force) {
      this.error("E45: 'readonly' option is set (add ! to override)");
      return false;
    }
    const target = name || this.filename;
    if (!target) {
      this.error('E32: No file name');
      return false;
    }
    const result = this.saveFn(this.text, name || null) ?? {};
    if (result.error) {
      this.error(result.error);
      return false;
    }
    if (!this.filename || name) this.filename = target;
    this.modified = false;
    this.info(`"${target}" ${this.lines.length}L, ${bytes(this.text)}B written`);
    return true;
  }

  quit() {
    this.closed = true;
    this.onQuit();
  }

  substitute(range, delim, rest) {
    const parts = [];
    let cur = '';
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (ch === '\\' && rest[i + 1] === delim) { cur += delim; i++; continue; }
      if (ch === '\\' && i + 1 < rest.length) { cur += ch + rest[++i]; continue; }
      if (ch === delim && parts.length < 2) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    let [pattern, replacement = '', flags = ''] = parts;
    if (!pattern) pattern = this.lastSearch ?? '';
    if (!pattern) {
      this.error('E35: No previous regular expression');
      return;
    }
    this.lastSearch = pattern;

    let first = this.row;
    let last = this.row;
    if (range === '%') { first = 0; last = this.lines.length - 1; }
    else if (range === '$') { first = last = this.lines.length - 1; }
    else if (/^\.,\.\+\d+$/.test(range)) { last = Math.min(this.lines.length - 1, this.row + Number(range.split('+')[1])); }
    else if (/^\d+,\d+$/.test(range)) {
      [first, last] = range.split(',').map((x) => Number(x) - 1);
    } else if (/^\d+$/.test(range)) { first = last = Number(range) - 1; }
    first = Math.max(0, first);
    last = Math.min(this.lines.length - 1, last);
    if (first > last) {
      this.error('E493: Backwards range given');
      return;
    }

    let re;
    try {
      const ignore = flags.includes('i') || (!flags.includes('I') && /\\c/.test(pattern));
      re = new RegExp(vimRegex(pattern.replace(/\\c/g, '')), `${flags.includes('g') ? 'g' : ''}${ignore ? 'i' : ''}`);
    } catch {
      this.error(`E486: Pattern not found: ${pattern}`);
      return;
    }
    const rep = vimReplacement(replacement);
    let count = 0;
    let linesChanged = 0;
    let lastRow = this.row;
    const next = [...this.lines];
    for (let r = first; r <= last; r++) {
      const before = next[r];
      let n = 0;
      const after = before.replace(re, (...args) => {
        n++;
        const match = args[0];
        const groups = args.slice(1, -2);
        return rep.replace(/\$(\$|&|\d)/g, (_, g) => (g === '$' ? '$' : g === '&' ? match : groups[Number(g) - 1] ?? ''));
      });
      if (n) {
        count += n;
        linesChanged++;
        lastRow = r;
        next[r] = after;
      }
    }
    if (!count) {
      this.error(`E486: Pattern not found: ${pattern}`);
      return;
    }
    this.change();
    this.lines = next.flatMap((l) => l.split('\n'));
    this.row = lastRow;
    this.col = this.firstNonBlank();
    this.info(`${count} substitution${count > 1 ? 's' : ''} on ${linesChanged} line${linesChanged > 1 ? 's' : ''}`);
  }

  search(pattern, dir) {
    if (pattern) this.lastSearch = pattern;
    this.searchDir = dir;
    this.searchNext(dir, true);
  }

  searchNext(dir, fresh = false) {
    if (!this.lastSearch) {
      this.error('E35: No previous regular expression');
      return;
    }
    let re;
    try {
      re = new RegExp(vimRegex(this.lastSearch), 'g');
    } catch {
      this.error(`E486: Pattern not found: ${this.lastSearch}`);
      return;
    }
    void fresh;
    const total = this.lines.length;
    const matchesIn = (r) => [...this.lines[r].matchAll(re)].map((m) => m.index);
    // Orden de búsqueda: resto de la línea actual, siguientes líneas y luego vuelta.
    const plan = [{ r: this.row, wrap: false, filter: (c) => (dir > 0 ? c > this.col : c < this.col) }];
    for (let step = 1; step < total; step++) {
      const raw = this.row + dir * step;
      plan.push({ r: (raw + total) % total, wrap: raw < 0 || raw >= total, filter: () => true });
    }
    plan.push({ r: this.row, wrap: true, filter: (c) => (dir > 0 ? c <= this.col : c >= this.col) });
    for (const { r, wrap, filter } of plan) {
      const cols = matchesIn(r).filter(filter);
      if (!cols.length) continue;
      this.row = r;
      this.col = dir > 0 ? cols[0] : cols[cols.length - 1];
      if (wrap) this.error(dir > 0 ? 'search hit BOTTOM, continuing at TOP' : 'search hit TOP, continuing at BOTTOM');
      else this.info(`${dir > 0 ? '/' : '?'}${this.lastSearch}`);
      return;
    }
    this.error(`E486: Pattern not found: ${this.lastSearch}`);
  }
}

/** Parsea la notación de teclas: `ihola<Esc>:wq<CR>`, `<C-r>`, `<BS>`. */
export function parseKeys(sequence) {
  const names = {
    esc: 'Escape', cr: 'Enter', enter: 'Enter', bs: 'Backspace', tab: 'Tab', del: 'Delete',
    left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', space: ' ', lt: '<',
  };
  const keys = [];
  for (let i = 0; i < sequence.length; i++) {
    if (sequence[i] === '<') {
      const end = sequence.indexOf('>', i);
      if (end > i) {
        const tag = sequence.slice(i + 1, end);
        const lower = tag.toLowerCase();
        if (names[lower]) { keys.push(names[lower]); i = end; continue; }
        if (/^c-.$/i.test(tag)) { keys.push(`C-${tag[2].toLowerCase()}`); i = end; continue; }
      }
    }
    keys.push(sequence[i]);
  }
  return keys;
}
