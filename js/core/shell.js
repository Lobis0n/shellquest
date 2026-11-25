/**
 * Intérprete de comandos: ejecuta listas, pipelines y redirecciones sobre
 * el mundo virtual. No depende del DOM: la E/S llega por el objeto `io`.
 * @module core/shell
 */
import { tokenize, parse, globToRegExp } from './parser.js';
import { resolve as resolvePath, basename } from './path.js';
import { FSError, ParseError, UsageError } from './errors.js';
import { can } from './filesystem.js';

/**
 * @typedef {Object} IO
 * @property {(text:string)=>void} out
 * @property {(text:string)=>void} err
 * @property {(question:string, opts?:{secret?:boolean})=>Promise<string|null>} ask
 * @property {(opts:Object)=>Promise<void>} openEditor
 * @property {()=>void} [clear]
 * @property {(ms:number)=>Promise<void>} [sleep]
 */

const MAX_SCRIPT_DEPTH = 8;

export class Shell {
  /**
   * @param {{world: import('./world.js').World, registry: Map<string, any>, io: IO, game?: any}} opts
   */
  constructor({ world, registry, io, game = null }) {
    this.world = world;
    this.registry = registry;
    this.io = io;
    this.game = game;
    this.lastCode = 0;
    this.depth = 0;
  }

  env() {
    const w = this.world;
    return {
      HOME: w.home,
      USER: w.user,
      LOGNAME: w.user,
      HOSTNAME: w.machine.hostname,
      PWD: w.cwd,
      SHELL: '/bin/bash',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      '?': String(this.lastCode),
      ...w.session.vars,
    };
  }

  resolve(path) {
    return resolvePath(this.world.cwd, path, this.world.home);
  }

  /** Ejecuta una línea completa. Devuelve el código de salida. */
  async run(line, { record = true } = {}) {
    const trimmed = String(line).trim();
    if (!trimmed) return this.lastCode;
    if (record) {
      this.world.history.push(trimmed);
      if (this.world.history.length > 500) this.world.history.shift();
    }

    let list;
    try {
      list = parse(tokenize(trimmed, this.env()));
    } catch (e) {
      if (e instanceof ParseError) {
        this.io.err(`bash: ${e.message}\n`);
        this.lastCode = 2;
        return 2;
      }
      throw e;
    }

    let code = 0;
    let prev = null;
    for (const item of list) {
      const skip = (prev === '&&' && code !== 0) || (prev === '||' && code === 0);
      if (!skip) {
        code = await this.runPipeline(item.pipeline);
        this.lastCode = code;
      }
      prev = item.next;
    }
    return code;
  }

  async runPipeline(pipeline) {
    let input = null;
    let code = 0;
    const io = this.io; // capturado: los scripts reemplazan this.io temporalmente
    for (let i = 0; i < pipeline.length; i++) {
      const last = i === pipeline.length - 1;
      let buffer = '';
      const sink = last
        ? { out: (s) => io.out(s), tty: true }
        : { out: (s) => { buffer += s; }, tty: false };
      code = await this.exec(pipeline[i], input, sink);
      input = buffer;
    }
    return code;
  }

  /** Expande comodines en la última parte de la ruta. */
  glob(pattern) {
    const slash = pattern.lastIndexOf('/');
    const dirPart = slash >= 0 ? pattern.slice(0, slash + 1) : '';
    const basePattern = pattern.slice(slash + 1);
    if (!/[*?[]/.test(basePattern)) return [pattern];
    let names;
    try {
      names = this.world.fs.readdir(this.resolve(dirPart || '.'), this.world.user);
    } catch {
      return [pattern];
    }
    const re = globToRegExp(basePattern);
    const matches = names.filter((n) => (basePattern.startsWith('.') || !n.startsWith('.')) && re.test(n));
    return matches.length ? matches.map((n) => dirPart + n) : [pattern];
  }

  expand(tokens) {
    return tokens.flatMap((t) => (t.glob ? this.glob(t.value) : [t.value]));
  }

  async exec(cmd, stdin, sink) {
    const words = this.expand(cmd.args);
    const shell = this;
    const world = this.world;

    // Asignaciones: VAR=valor
    if (words.length && words.every((w) => /^[A-Za-z_]\w*=/.test(w))) {
      for (const w of words) {
        const i = w.indexOf('=');
        world.session.vars[w.slice(0, i)] = w.slice(i + 1);
      }
      return 0;
    }

    // Preparar redirecciones antes de ejecutar (como bash).
    let outTarget = null;
    let errTarget = null;
    let errToOut = false;
    for (const r of cmd.redirects) {
      if (r.op === '2>&1') { errToOut = true; continue; }
      if (r.op === '<') {
        try {
          const path = this.resolve(r.target);
          stdin = world.fs.readFile(path, world.user);
          world.markRead(world.machine.hostname, path);
        } catch (e) {
          this.io.err(`bash: ${r.target}: ${e.message}\n`);
          return 1;
        }
        continue;
      }
      const target = { op: r.op, raw: r.target, path: this.resolve(r.target), fs: world.fs, user: world.user, data: '' };
      if (r.target !== '/dev/null' && !r.op.endsWith('>>')) {
        try {
          target.fs.writeFile(target.path, '', target.user);
        } catch (e) {
          this.io.err(`bash: ${r.target}: ${e.message}\n`);
          return 1;
        }
      }
      if (r.op.startsWith('2')) errTarget = target; else outTarget = target;
    }

    const flush = (t) => {
      if (!t || t.raw === '/dev/null') return;
      try {
        t.fs.writeFile(t.path, t.data, t.user, { append: true });
      } catch (e) {
        this.io.err(`bash: ${t.raw}: ${e.message}\n`);
      }
    };

    if (!words.length) {
      flush(outTarget);
      flush(errTarget);
      return 0;
    }

    const [name, ...args] = words;
    const out = (s) => { if (outTarget) outTarget.data += s; else sink.out(s); };
    const ctx = {
      name,
      args,
      stdin,
      shell,
      io: this.io,
      game: this.game,
      isTTY: sink.tty && !outTarget,
      out,
      err: (s) => {
        if (errTarget) errTarget.data += s;
        else if (errToOut) out(s);
        else this.io.err(s);
      },
      print(line = '') { this.out(`${line}\n`); },
      error(line) { this.err(`${line}\n`); },
      resolve: (p) => this.resolve(p),
      get world() { return shell.world; },
      get fs() { return shell.world.fs; },
      get user() { return shell.world.user; },
      get cwd() { return shell.world.cwd; },
      get home() { return shell.world.home; },
      get host() { return shell.world.machine.hostname; },
    };

    let code;
    try {
      const entry = this.registry.get(name);
      if (entry) code = await entry.run(ctx);
      else if (name.includes('/')) code = await this.execFile(name, args, ctx);
      else {
        ctx.error(`bash: ${name}: command not found`);
        if (/^[a-záéíóúñ]+$/i.test(name)) ctx.error(`\x1b[90m(Escribí 'help' para ver los comandos disponibles)\x1b[0m`);
        code = 127;
      }
    } catch (e) {
      if (e instanceof UsageError) {
        ctx.error(`${name}: ${e.message}`);
        code = 2;
      } else if (e instanceof FSError) {
        ctx.error(`${name}: ${e.path}: ${e.message}`);
        code = 1;
      } else {
        throw e;
      }
    }

    flush(outTarget);
    flush(errTarget);
    return code ?? 0;
  }

  /** Ejecuta un archivo (./script.sh o /ruta/absoluta). */
  async execFile(file, args, ctx) {
    const path = this.resolve(file);
    let node;
    try {
      node = this.world.fs.stat(path, this.world.user);
    } catch (e) {
      ctx.error(`bash: ${file}: ${e.message}`);
      return 127;
    }
    if (node.type === 'dir') {
      ctx.error(`bash: ${file}: Is a directory`);
      return 126;
    }
    if (!can(node, this.world.user, 'x') || !can(node, this.world.user, 'r')) {
      ctx.error(`bash: ${file}: Permission denied`);
      return 126;
    }
    if (node.content.startsWith('\x7fELF')) {
      const builtin = this.registry.get(basename(path));
      if (builtin) return builtin.run({ ...ctx, name: basename(path), args });
      ctx.error(`bash: ${file}: cannot execute binary file`);
      return 126;
    }
    return this.runScript(node.content, ctx, path);
  }

  /** Ejecuta un script línea por línea, redirigiendo su salida al contexto. */
  async runScript(content, ctx, path = '') {
    if (this.depth >= MAX_SCRIPT_DEPTH) {
      ctx.error('bash: demasiados scripts anidados');
      return 1;
    }
    this.world.markRead(this.world.machine.hostname, path);
    const saved = this.io;
    const proxy = Object.create(saved);
    proxy.out = (s) => ctx.out(s);
    proxy.err = (s) => ctx.err(s);
    this.io = proxy;
    this.depth++;
    let code = 0;
    try {
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        code = await this.run(trimmed, { record: false });
        if (trimmed === 'exit' || trimmed.startsWith('exit ')) break;
      }
    } finally {
      this.depth--;
      this.io = saved;
    }
    return code;
  }
}
