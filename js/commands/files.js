/**
 * Comandos de archivos y directorios.
 * @module commands/files
 */
import { command, getopts, errMessage, lsDate, byteLength } from './util.js';
import { can, modeString, walkTree } from '../core/filesystem.js';
import { basename, join } from '../core/path.js';
import { globToRegExp } from '../core/parser.js';
import { style } from '../core/ansi.js';
import { UsageError } from '../core/errors.js';

const isExec = (node) => node.type === 'file' && (node.mode & 0o111) !== 0;

function decorate(name, node, tty) {
  if (!tty) return name;
  if (node.type === 'dir') return style.dir(name);
  if (isExec(node)) return style.exec(name);
  return name;
}

const ls = command({
  name: 'ls',
  category: 'navegación',
  summary: 'lista el contenido de un directorio',
  usage: 'ls [-l] [-a] [ruta...]',
  description: [
    'Muestra los archivos y directorios. Sin argumentos, lista el directorio actual.',
    '-a  muestra también los archivos ocultos (los que empiezan con punto).',
    '-l  formato largo: permisos, dueño, tamaño y fecha.',
    'Los directorios aparecen en azul y los ejecutables en verde.',
  ],
  examples: ['ls', 'ls -la', 'ls -l /etc', 'ls ~/expedicion'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'laA1hFR');
    const targets = operands.length ? operands : ['.'];
    const showAll = flags.a || flags.A;
    let code = 0;
    const files = [];
    const dirs = [];
    for (const t of targets) {
      try {
        const node = ctx.fs.stat(ctx.resolve(t), ctx.user);
        (node.type === 'dir' ? dirs : files).push({ name: t, node, path: ctx.resolve(t) });
      } catch (e) {
        ctx.error(`ls: cannot access '${t}': ${errMessage(e)}`);
        code = 2;
      }
    }

    const render = (entries) => {
      if (!entries.length) return;
      if (flags.l) {
        const width = Math.max(...entries.map((e) => String(sizeOf(e.node)).length));
        for (const e of entries) {
          const size = String(sizeOf(e.node)).padStart(width);
          ctx.print(`${modeString(e.node)} 1 ${e.node.owner.padEnd(8)} ${e.node.owner.padEnd(8)} ${size} ${lsDate(e.node.mtime)} ${decorate(e.name, e.node, ctx.isTTY)}`);
        }
      } else if (flags['1'] || !ctx.isTTY) {
        for (const e of entries) ctx.print(decorate(e.name, e.node, ctx.isTTY));
      } else {
        ctx.print(entries.map((e) => decorate(e.name, e.node, true)).join('  '));
      }
    };

    render(files);
    dirs.forEach((d, i) => {
      let names;
      try {
        names = ctx.fs.readdir(d.path, ctx.user);
      } catch (e) {
        ctx.error(`ls: cannot open directory '${d.name}': ${errMessage(e)}`);
        code = 2;
        return;
      }
      if (targets.length > 1) {
        if (i > 0 || files.length) ctx.print('');
        ctx.print(`${d.name}:`);
      }
      const entries = names
        .filter((n) => showAll || !n.startsWith('.'))
        .map((n) => ({ name: n, node: d.node.children[n] }));
      if (flags.a) {
        const parent = ctx.fs.get(join(d.path, '..')) ?? d.node;
        entries.unshift({ name: '.', node: d.node }, { name: '..', node: parent });
      }
      if (flags.l) ctx.print(`total ${entries.length * 4}`);
      render(entries);
    });
    return code;
  },
});

const sizeOf = (node) => (node.type === 'dir' ? 4096 : byteLength(node.content));

const cd = command({
  name: 'cd',
  category: 'navegación',
  summary: 'cambia de directorio',
  usage: 'cd [directorio]',
  description: [
    'Te mueve a otro directorio. Sin argumentos, vuelve a tu home (~).',
    'cd ..  sube un nivel.   cd -  vuelve al directorio anterior.',
    'Rutas absolutas empiezan con / ; las relativas parten de donde estás.',
  ],
  examples: ['cd mapa', 'cd ..', 'cd ~/expedicion', 'cd /etc', 'cd -'],
  run(ctx) {
    const target = ctx.args[0] ?? ctx.home;
    const path = target === '-' ? (ctx.world.session.prevCwd ?? ctx.cwd) : ctx.resolve(target);
    try {
      const node = ctx.fs.stat(path, ctx.user);
      if (node.type !== 'dir') {
        ctx.error(`bash: cd: ${target}: Not a directory`);
        return 1;
      }
      if (!can(node, ctx.user, 'x')) {
        ctx.error(`bash: cd: ${target}: Permission denied`);
        return 1;
      }
    } catch (e) {
      ctx.error(`bash: cd: ${target}: ${errMessage(e)}`);
      return 1;
    }
    ctx.world.session.prevCwd = ctx.cwd;
    ctx.world.cwd = path;
    if (target === '-') ctx.print(path);
    return 0;
  },
});

const pwd = command({
  name: 'pwd',
  category: 'navegación',
  summary: 'muestra el directorio actual',
  usage: 'pwd',
  description: ['Print Working Directory: imprime la ruta absoluta de donde estás parado.'],
  examples: ['pwd'],
  run(ctx) {
    ctx.print(ctx.cwd);
    return 0;
  },
});

const mkdir = command({
  name: 'mkdir',
  category: 'archivos',
  summary: 'crea directorios',
  usage: 'mkdir [-p] directorio...',
  description: [
    'Crea uno o más directorios.',
    '-p  crea también los directorios intermedios que falten y no falla si ya existe.',
  ],
  examples: ['mkdir expedicion', 'mkdir -p a/b/c'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'pv');
    if (!operands.length) throw new UsageError('missing operand');
    let code = 0;
    for (const o of operands) {
      try {
        ctx.fs.mkdir(ctx.resolve(o), ctx.user, { parents: Boolean(flags.p) });
      } catch (e) {
        ctx.error(`mkdir: cannot create directory '${o}': ${errMessage(e)}`);
        code = 1;
      }
    }
    return code;
  },
});

const touch = command({
  name: 'touch',
  category: 'archivos',
  summary: 'crea archivos vacíos o actualiza su fecha',
  usage: 'touch archivo...',
  description: ['Si el archivo no existe, lo crea vacío. Si existe, actualiza su fecha de modificación.'],
  examples: ['touch inventario.txt', 'touch a.txt b.txt'],
  run(ctx) {
    if (!ctx.args.length) throw new UsageError('missing file operand');
    let code = 0;
    for (const o of ctx.args) {
      try {
        ctx.fs.touch(ctx.resolve(o), ctx.user);
      } catch (e) {
        ctx.error(`touch: cannot touch '${o}': ${errMessage(e)}`);
        code = 1;
      }
    }
    return code;
  },
});

const rm = command({
  name: 'rm',
  category: 'archivos',
  summary: 'elimina archivos o directorios',
  usage: 'rm [-r] [-f] archivo...',
  description: [
    'Elimina archivos. ¡No hay papelera de reciclaje!',
    '-r  elimina directorios y todo su contenido (recursivo).',
    '-f  no pregunta ni se queja si el archivo no existe.',
    'Combinalo con comodines: rm *.tmp borra todos los .tmp del directorio actual.',
  ],
  examples: ['rm trampa.txt', 'rm *.tmp', 'rm -r carpeta'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'rRfiv');
    const recursive = flags.r || flags.R;
    if (!operands.length) {
      if (flags.f) return 0;
      throw new UsageError('missing operand');
    }
    let code = 0;
    for (const o of operands) {
      const path = ctx.resolve(o);
      if (path === '/') {
        ctx.error("rm: it is dangerous to operate recursively on '/'");
        code = 1;
        continue;
      }
      try {
        const node = ctx.fs.stat(path, ctx.user);
        if (node.type === 'dir' && !recursive) {
          ctx.error(`rm: cannot remove '${o}': Is a directory`);
          code = 1;
          continue;
        }
        ctx.fs.remove(path, ctx.user, { recursive: true });
        if (path === ctx.cwd || ctx.cwd.startsWith(path + '/')) ctx.world.cwd = ctx.home;
      } catch (e) {
        if (flags.f && e.code === 'ENOENT') continue;
        ctx.error(`rm: cannot remove '${o}': ${errMessage(e)}`);
        code = 1;
      }
    }
    return code;
  },
});

const rmdir = command({
  name: 'rmdir',
  category: 'archivos',
  summary: 'elimina directorios vacíos',
  usage: 'rmdir directorio...',
  description: ['Elimina directorios solo si están vacíos. Es la forma segura de borrar carpetas.'],
  examples: ['rmdir barril_vacio'],
  run(ctx) {
    if (!ctx.args.length) throw new UsageError('missing operand');
    let code = 0;
    for (const o of ctx.args) {
      try {
        ctx.fs.rmdir(ctx.resolve(o), ctx.user);
      } catch (e) {
        ctx.error(`rmdir: failed to remove '${o}': ${errMessage(e)}`);
        code = 1;
      }
    }
    return code;
  },
});

/** Calcula el destino final de cp/mv (si el destino es un directorio, va adentro). */
function targetPath(ctx, src, destPath, destIsDir) {
  return destIsDir ? join(destPath, basename(ctx.resolve(src))) : destPath;
}

const cp = command({
  name: 'cp',
  category: 'archivos',
  summary: 'copia archivos y directorios',
  usage: 'cp [-r] origen... destino',
  description: [
    'Copia archivos. El original queda en su lugar.',
    'Si el destino es un directorio, la copia se guarda adentro con el mismo nombre.',
    '-r  copia directorios completos (recursivo).',
  ],
  examples: ['cp brujula.txt ~/expedicion/', 'cp a.txt b.txt', 'cp -r carpeta copia'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'rRfvpa');
    const recursive = flags.r || flags.R || flags.a;
    if (operands.length === 0) throw new UsageError('missing file operand');
    if (operands.length === 1) throw new UsageError(`missing destination file operand after '${operands[0]}'`);
    const sources = operands.slice(0, -1);
    const dest = operands[operands.length - 1];
    const destPath = ctx.resolve(dest);
    const destIsDir = ctx.fs.isDir(destPath);
    if (sources.length > 1 && !destIsDir) {
      ctx.error(`cp: target '${dest}' is not a directory`);
      return 1;
    }
    let code = 0;
    for (const src of sources) {
      const srcPath = ctx.resolve(src);
      const finalPath = targetPath(ctx, src, destPath, destIsDir);
      try {
        const node = ctx.fs.stat(srcPath, ctx.user);
        if (node.type === 'dir' && !recursive) {
          ctx.error(`cp: -r not specified; omitting directory '${src}'`);
          code = 1;
          continue;
        }
        if (srcPath === finalPath) {
          ctx.error(`cp: '${src}' and '${dest}' are the same file`);
          code = 1;
          continue;
        }
        if (node.type === 'dir' && (finalPath + '/').startsWith(srcPath + '/')) {
          ctx.error(`cp: cannot copy a directory, '${src}', into itself, '${dest}'`);
          code = 1;
          continue;
        }
        ctx.fs.importNode(finalPath, ctx.fs.exportNode(srcPath, ctx.user), ctx.user);
        if (node.type === 'file') ctx.world.markRead(ctx.host, srcPath);
      } catch (e) {
        ctx.error(`cp: cannot copy '${src}': ${errMessage(e)}`);
        code = 1;
      }
    }
    return code;
  },
});

const mv = command({
  name: 'mv',
  category: 'archivos',
  summary: 'mueve o renombra archivos',
  usage: 'mv origen... destino',
  description: [
    'Mueve archivos o directorios. El original desaparece de su lugar.',
    'También sirve para renombrar: mv viejo.txt nuevo.txt',
    'Si el destino es un directorio existente, el archivo se mueve adentro.',
  ],
  examples: ['mv catalejo.txt ~/expedicion/', 'mv mapa_rasgado.txt mapa.txt'],
  run(ctx) {
    const { operands } = getopts(ctx.args, 'fivn');
    if (operands.length === 0) throw new UsageError('missing file operand');
    if (operands.length === 1) throw new UsageError(`missing destination file operand after '${operands[0]}'`);
    const sources = operands.slice(0, -1);
    const dest = operands[operands.length - 1];
    const destPath = ctx.resolve(dest);
    const destIsDir = ctx.fs.isDir(destPath);
    if (sources.length > 1 && !destIsDir) {
      ctx.error(`mv: target '${dest}' is not a directory`);
      return 1;
    }
    let code = 0;
    for (const src of sources) {
      try {
        const srcPath = ctx.resolve(src);
        ctx.fs.stat(srcPath, ctx.user);
        ctx.fs.rename(srcPath, targetPath(ctx, src, destPath, destIsDir), ctx.user);
      } catch (e) {
        const msg = e.code === 'EINVAL' ? `cannot move '${src}' to a subdirectory of itself` : `cannot move '${src}': ${errMessage(e)}`;
        ctx.error(`mv: ${msg}`);
        code = 1;
      }
    }
    return code;
  },
});

function parseMode(spec, current) {
  if (/^[0-7]{3,4}$/.test(spec)) return parseInt(spec, 8) & 0o777;
  let mode = current;
  for (const part of spec.split(',')) {
    const m = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(part);
    if (!m) return null;
    const who = m[1] || 'a';
    let bits = 0;
    for (const p of m[3]) bits |= { r: 4, w: 2, x: 1 }[p];
    let mask = 0;
    let clear = 0;
    for (const w of who === 'a' ? 'ugo' : who) {
      const shift = { u: 6, g: 3, o: 0 }[w];
      mask |= bits << shift;
      clear |= 7 << shift;
    }
    if (m[2] === '+') mode |= mask;
    else if (m[2] === '-') mode &= ~mask;
    else mode = (mode & ~clear) | mask;
  }
  return mode & 0o777;
}

const chmod = command({
  name: 'chmod',
  category: 'permisos',
  summary: 'cambia los permisos de un archivo',
  usage: 'chmod MODO archivo...',
  description: [
    'Cambia permisos de lectura (r), escritura (w) y ejecución (x).',
    'Modo simbólico: u (dueño), g (grupo), o (otros), a (todos) con + - =',
    '   chmod +x script.sh     agrega ejecución para todos',
    '   chmod u-w notas.txt    quita escritura al dueño',
    'Modo octal: r=4 w=2 x=1, un dígito por dueño/grupo/otros.',
    '   chmod 755 script.sh  → rwxr-xr-x      chmod 600 secreto → rw-------',
  ],
  examples: ['chmod +x decodificador.sh', 'chmod 644 notas.txt', 'ls -l'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'Rv');
    if (operands.length < 2) throw new UsageError(operands.length ? `missing operand after '${operands[0]}'` : 'missing operand');
    const [spec, ...files] = operands;
    let code = 0;
    for (const f of files) {
      try {
        const path = ctx.resolve(f);
        const apply = (p, node) => {
          const mode = parseMode(spec, node.mode);
          if (mode === null) throw new UsageError(`invalid mode: '${spec}'`);
          ctx.fs.chmod(p, mode, ctx.user);
          if (flags.R && node.type === 'dir') {
            for (const [n, child] of Object.entries(node.children)) apply(join(p, n), child);
          }
        };
        apply(path, ctx.fs.stat(path, ctx.user));
      } catch (e) {
        if (e instanceof UsageError) throw e;
        ctx.error(`chmod: changing permissions of '${f}': ${errMessage(e)}`);
        code = 1;
      }
    }
    return code;
  },
});

const find = command({
  name: 'find',
  category: 'búsqueda',
  summary: 'busca archivos en un árbol de directorios',
  usage: 'find [ruta...] [-name PATRÓN] [-iname PATRÓN] [-type f|d] [-maxdepth N] [-user U]',
  description: [
    'Recorre directorios recursivamente y muestra lo que coincide. Encuentra también archivos ocultos.',
    '-name "*.key"   por nombre (usá comillas para que el shell no expanda el *)',
    '-iname          igual que -name pero sin distinguir mayúsculas',
    '-type f / d     solo archivos / solo directorios',
    '-maxdepth N     no baja más de N niveles',
    'Tip: los errores "Permission denied" se pueden ocultar con 2>/dev/null',
  ],
  examples: ['find ~/laberinto -name "*.key"', 'find / -name "*.bak" 2>/dev/null', 'find . -type d'],
  run(ctx) {
    const paths = [];
    let i = 0;
    while (i < ctx.args.length && !ctx.args[i].startsWith('-')) paths.push(ctx.args[i++]);
    const tests = [];
    let maxDepth = Infinity;
    let minDepth = 0;
    while (i < ctx.args.length) {
      const opt = ctx.args[i++];
      const val = ctx.args[i];
      const needVal = () => {
        if (val === undefined) throw new UsageError(`missing argument to \`${opt}'`);
        i++;
        return val;
      };
      switch (opt) {
        case '-name': { const re = globToRegExp(needVal()); tests.push((n, name) => re.test(name)); break; }
        case '-iname': { const re = new RegExp(globToRegExp(needVal()).source, 'i'); tests.push((n, name) => re.test(name)); break; }
        case '-type': {
          const t = needVal();
          if (!['f', 'd'].includes(t)) throw new UsageError(`Unknown argument to -type: ${t}`);
          tests.push((n) => (t === 'f' ? n.type === 'file' : n.type === 'dir'));
          break;
        }
        case '-user': { const u = needVal(); tests.push((n) => n.owner === u); break; }
        case '-maxdepth': maxDepth = Number(needVal()); break;
        case '-mindepth': minDepth = Number(needVal()); break;
        case '-empty': tests.push((n) => (n.type === 'dir' ? !Object.keys(n.children).length : !n.content)); break;
        case '-print': break;
        default: throw new UsageError(`unknown predicate \`${opt}'`);
      }
    }
    if (!paths.length) paths.push('.');
    let code = 0;
    for (const p of paths) {
      const abs = ctx.resolve(p);
      let node;
      try {
        node = ctx.fs.stat(abs, ctx.user);
      } catch (e) {
        ctx.error(`find: '${p}': ${errMessage(e)}`);
        code = 1;
        continue;
      }
      walkTree(node, {
        display: p,
        abs,
        user: ctx.user,
        visit: (n, display, absPath, depth) => {
          if (depth > maxDepth) return false;
          const name = depth === 0 ? basename(absPath) : basename(display);
          if (depth >= minDepth && tests.every((t) => t(n, name))) ctx.print(display);
          return depth < maxDepth;
        },
        onDenied: (display) => {
          ctx.error(`find: '${display}': Permission denied`);
          code = 1;
        },
      });
    }
    return code;
  },
});

const tree = command({
  name: 'tree',
  category: 'navegación',
  summary: 'muestra un árbol de directorios',
  usage: 'tree [-a] [-L N] [ruta]',
  description: ['Dibuja la estructura de directorios. -a incluye ocultos, -L limita la profundidad.'],
  examples: ['tree', 'tree -L 2 ~/mapa'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'aL:d');
    const target = operands[0] ?? '.';
    const limit = flags.L ? Number(flags.L) : Infinity;
    let root;
    try {
      root = ctx.fs.stat(ctx.resolve(target), ctx.user);
    } catch (e) {
      ctx.error(`${target} [error opening dir]`);
      return 2;
    }
    let dirs = 0;
    let files = 0;
    ctx.print(decorate(target, root, ctx.isTTY));
    const draw = (node, prefix, depth) => {
      if (depth >= limit || node.type !== 'dir') return;
      if (!can(node, ctx.user, 'r')) return;
      const names = Object.keys(node.children).sort()
        .filter((n) => flags.a || !n.startsWith('.'))
        .filter((n) => !flags.d || node.children[n].type === 'dir');
      names.forEach((n, idx) => {
        const last = idx === names.length - 1;
        const child = node.children[n];
        if (child.type === 'dir') dirs++; else files++;
        ctx.print(`${prefix}${last ? '└── ' : '├── '}${decorate(n, child, ctx.isTTY)}`);
        draw(child, prefix + (last ? '    ' : '│   '), depth + 1);
      });
    };
    draw(root, '', 0);
    ctx.print(`\n${dirs} directories, ${files} files`);
    return 0;
  },
});

const file = command({
  name: 'file',
  category: 'archivos',
  summary: 'indica el tipo de un archivo',
  usage: 'file archivo...',
  description: ['Adivina qué tipo de contenido tiene un archivo.'],
  examples: ['file decodificador.sh', 'file transmision.b64'],
  run(ctx) {
    let code = 0;
    for (const f of ctx.args) {
      try {
        const node = ctx.fs.stat(ctx.resolve(f), ctx.user);
        let kind;
        if (node.type === 'dir') kind = 'directory';
        else if (!node.content) kind = 'empty';
        else if (node.content.startsWith('\x7fELF')) kind = 'ELF 64-bit LSB pie executable, x86-64';
        else if (node.content.startsWith('#!')) kind = 'Bourne-Again shell script, UTF-8 text executable';
        else if (/^[A-Za-z0-9+/=\s]+$/.test(node.content) && node.content.length > 40) kind = 'ASCII text (¿base64?)';
        else kind = /[^\x00-\x7f]/.test(node.content) ? 'UTF-8 Unicode text' : 'ASCII text';
        ctx.print(`${f}: ${kind}`);
      } catch (e) {
        ctx.print(`${f}: cannot open \`${f}' (${errMessage(e)})`);
        code = 1;
      }
    }
    return code;
  },
});

export default [ls, cd, pwd, mkdir, touch, rm, rmdir, cp, mv, chmod, find, tree, file];
