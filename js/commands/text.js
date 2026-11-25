/**
 * Comandos de procesamiento de texto (filtros de tubería).
 * @module commands/text
 */
import { command, getopts, readInputs, splitLines, joinLines, byteLength, errMessage } from './util.js';
import { UsageError } from '../core/errors.js';
import { walkTree, can } from '../core/filesystem.js';
import { style } from '../core/ansi.js';

const cat = command({
  name: 'cat',
  aliases: ['less', 'more'],
  category: 'texto',
  summary: 'muestra (y concatena) el contenido de archivos',
  usage: 'cat [-n] [archivo...]',
  description: [
    'Imprime el contenido de uno o más archivos, uno detrás del otro.',
    'Con > podés unir varios archivos en uno: cat a.txt b.txt > ab.txt',
    '-n  numera las líneas.',
    '(En este simulador, less y more se comportan como cat.)',
  ],
  examples: ['cat LEEME.txt', 'cat -n bitacora.log', 'cat parte1 parte2 > completo.txt'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'nAE');
    const { inputs, code } = readInputs(ctx, operands, ctx.name);
    let n = 0;
    for (const input of inputs) {
      if (!flags.n) {
        ctx.out(input.content);
        continue;
      }
      for (const line of splitLines(input.content)) ctx.print(`${String(++n).padStart(6)}\t${line}`);
    }
    return code;
  },
});

const echo = command({
  name: 'echo',
  category: 'texto',
  summary: 'imprime texto',
  usage: 'echo [-n] [-e] [texto...]',
  description: [
    'Imprime sus argumentos. Muy útil junto a las redirecciones:',
    '   echo "hola" > archivo.txt    crea/sobrescribe el archivo',
    '   echo "más" >> archivo.txt    agrega al final',
    '-n  sin salto de línea final.  -e  interpreta \\n y \\t.',
  ],
  examples: ['echo "Día 1: comienza la búsqueda" > diario.txt', 'echo $HOME', 'echo "línea" >> notas.txt'],
  run(ctx) {
    const args = [...ctx.args];
    let newline = true;
    let escapes = false;
    while (args.length && /^-[neE]+$/.test(args[0])) {
      const f = args.shift();
      if (f.includes('n')) newline = false;
      if (f.includes('e')) escapes = true;
    }
    let text = args.join(' ');
    if (escapes) text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    ctx.out(text + (newline ? '\n' : ''));
    return 0;
  },
});

/** Normaliza -5 a -n 5 (atajo clásico de head/tail). */
const numericShortcut = (args) => args.flatMap((a) => (/^-\d+$/.test(a) ? ['-n', a.slice(1)] : [a]));

function headTail(which) {
  return command({
    name: which,
    category: 'texto',
    summary: which === 'head' ? 'muestra las primeras líneas' : 'muestra las últimas líneas',
    usage: `${which} [-n N] [archivo...]`,
    description: [
      `Muestra las ${which === 'head' ? 'primeras' : 'últimas'} 10 líneas (o N con -n).`,
      which === 'tail' ? 'tail -n +N  muestra desde la línea N hasta el final.' : 'Ideal para espiar archivos enormes sin abrirlos enteros.',
    ],
    examples: which === 'head'
      ? ['head bitacora.log', 'head -n 3 bitacora.log', 'sort datos | head -1']
      : ['tail bitacora.log', 'tail -n 1 bitacora.log', 'tail -1 bitacora.log'],
    run(ctx) {
      const { flags, operands } = getopts(numericShortcut(ctx.args), 'n:qv');
      const raw = flags.n ?? '10';
      const fromStart = which === 'tail' && String(raw).startsWith('+');
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) throw new UsageError(`invalid number of lines: '${raw}'`);
      const { inputs, code } = readInputs(ctx, operands, which);
      inputs.forEach((input, i) => {
        if (inputs.length > 1) ctx.print(`${i ? '\n' : ''}==> ${input.name} <==`);
        const lines = splitLines(input.content);
        let selected;
        if (which === 'head') selected = n >= 0 ? lines.slice(0, n) : lines.slice(0, n);
        else if (fromStart) selected = lines.slice(Math.max(0, n - 1));
        else selected = n === 0 ? [] : lines.slice(-Math.abs(n));
        ctx.out(joinLines(selected));
      });
      return code;
    },
  });
}

const wc = command({
  name: 'wc',
  category: 'texto',
  summary: 'cuenta líneas, palabras y bytes',
  usage: 'wc [-l] [-w] [-c] [archivo...]',
  description: [
    'Sin opciones muestra: líneas, palabras y bytes.',
    '-l  solo líneas   -w  solo palabras   -c  solo bytes',
    'Tip: wc -l < archivo  imprime solo el número, sin el nombre.',
  ],
  examples: ['wc -l bitacora.log', 'wc -l < bitacora.log', 'ls | wc -l'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'lwcm');
    const { inputs, code } = readInputs(ctx, operands, 'wc');
    const show = flags.l || flags.w || flags.c || flags.m
      ? ['l', 'w', 'c'].filter((k) => flags[k] || (k === 'c' && flags.m))
      : ['l', 'w', 'c'];
    const rows = inputs.map((i) => ({
      name: i.name === '-' ? '' : i.name,
      l: (i.content.match(/\n/g) ?? []).length,
      w: i.content.split(/\s+/).filter(Boolean).length,
      c: byteLength(i.content),
    }));
    if (rows.length > 1) {
      rows.push(rows.reduce((t, r) => ({ name: 'total', l: t.l + r.l, w: t.w + r.w, c: t.c + r.c }), { l: 0, w: 0, c: 0 }));
    }
    const single = show.length === 1 && rows.length === 1;
    const width = single ? 0 : Math.max(...rows.flatMap((r) => show.map((k) => String(r[k]).length)));
    for (const r of rows) {
      const nums = show.map((k) => String(r[k]).padStart(width)).join(' ');
      ctx.print(r.name ? `${nums} ${r.name}` : nums);
    }
    return code;
  },
});

const grep = command({
  name: 'grep',
  category: 'búsqueda',
  summary: 'busca líneas que coinciden con un patrón',
  usage: 'grep [-i] [-r] [-n] [-v] [-c] [-l] [-o] PATRÓN [archivo...]',
  description: [
    'Imprime las líneas que contienen el PATRÓN (una expresión regular).',
    '-i  ignora mayúsculas/minúsculas     -n  muestra el número de línea',
    '-r  busca recursivamente en carpetas -v  invierte: líneas que NO coinciden',
    '-c  cuenta coincidencias             -l  solo nombres de archivo',
    '-o  imprime solo la parte que coincide',
    'Sin archivos, lee de la entrada estándar (ideal tras un |).',
  ],
  examples: ['grep -ri tesoro ~/registros', 'grep -n ERROR log.txt', 'cat accesos.log | grep 10.0.0.7'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'ivnrRclLwEFohHsq');
    if (!operands.length) {
      ctx.error('Usage: grep [OPTION]... PATTERNS [FILE]...');
      return 2;
    }
    const [pattern, ...files] = operands;
    let source = flags.F ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern;
    if (flags.w) source = `\\b(?:${source})\\b`;
    let tester;
    try {
      tester = new RegExp(source, flags.i ? 'i' : '');
    } catch {
      tester = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.i ? 'i' : '');
    }
    const global = new RegExp(tester.source, flags.i ? 'gi' : 'g');
    const recursive = flags.r || flags.R;

    /** @type {{name:string, content:string}[]} */
    let inputs = [];
    let code = 0;
    if (recursive) {
      const targets = files.length ? files : ['.'];
      for (const t of targets) {
        const abs = ctx.resolve(t);
        let root;
        try {
          root = ctx.fs.stat(abs, ctx.user);
        } catch (e) {
          if (!flags.s) ctx.error(`grep: ${t}: ${errMessage(e)}`);
          code = 2;
          continue;
        }
        walkTree(root, {
          display: t,
          abs,
          user: ctx.user,
          visit: (node, display, absPath) => {
            if (node.type !== 'file') return;
            if (!can(node, ctx.user, 'r')) {
              if (!flags.s) ctx.error(`grep: ${display}: Permission denied`);
              return;
            }
            ctx.world.markRead(ctx.host, absPath);
            const name = files.length ? display : display.replace(/^\.\//, '');
            inputs.push({ name, content: node.content });
          },
          onDenied: (display) => { if (!flags.s) ctx.error(`grep: ${display}: Permission denied`); },
        });
      }
    } else {
      const r = readInputs(ctx, files, 'grep');
      inputs = r.inputs;
      if (r.code) code = 2;
    }

    const multi = (recursive || inputs.length > 1) && !flags.h;
    let matched = false;
    const tty = ctx.isTTY;
    const highlight = (line) => (tty ? line.replace(global, (m) => style.match(m)) : line);
    for (const input of inputs) {
      let count = 0;
      const prefixName = multi || flags.H ? `${tty ? style.magenta(input.name) : input.name}${tty ? style.cyan(':') : ':'}` : '';
      splitLines(input.content).forEach((line, idx) => {
        const hit = tester.test(line) !== Boolean(flags.v);
        if (!hit) return;
        count++;
        matched = true;
        if (flags.c || flags.l || flags.q) return;
        const num = flags.n ? `${tty ? style.green(String(idx + 1)) : idx + 1}${tty ? style.cyan(':') : ':'}` : '';
        if (flags.o && !flags.v) {
          for (const m of line.match(global) ?? []) ctx.print(`${prefixName}${num}${tty ? style.match(m) : m}`);
        } else {
          ctx.print(`${prefixName}${num}${flags.v ? line : highlight(line)}`);
        }
      });
      if (flags.c && !flags.q) ctx.print(`${prefixName}${count}`);
      if (flags.l && count && !flags.q) ctx.print(input.name);
    }
    if (code === 2 && !matched) return 2;
    return matched ? 0 : 1;
  },
});

const sort = command({
  name: 'sort',
  category: 'texto',
  summary: 'ordena líneas',
  usage: 'sort [-n] [-r] [-u] [archivo...]',
  description: [
    'Ordena las líneas alfabéticamente.',
    '-n  orden numérico   -r  orden inverso   -u  elimina repetidas',
    'Combo clásico para contar repeticiones: sort | uniq -c | sort -nr',
  ],
  examples: ['sort nombres.txt', 'sort -nr numeros.txt', 'cut -d" " -f3 accesos.log | sort | uniq -c | sort -nr'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'nrufbk:t:');
    const { inputs, code } = readInputs(ctx, operands, 'sort');
    let lines = inputs.flatMap((i) => splitLines(i.content));
    const key = (s) => (flags.f ? s.toLowerCase() : s);
    const byText = (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
    const num = (s) => {
      const v = parseFloat(s.trim());
      return Number.isNaN(v) ? 0 : v;
    };
    lines.sort(flags.n ? (a, b) => num(a) - num(b) || byText(a, b) : byText);
    if (flags.r) lines.reverse();
    if (flags.u) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
    ctx.out(joinLines(lines));
    return code;
  },
});

const uniq = command({
  name: 'uniq',
  category: 'texto',
  summary: 'colapsa líneas repetidas consecutivas',
  usage: 'uniq [-c] [-d] [-u] [archivo]',
  description: [
    'Junta líneas IGUALES y CONSECUTIVAS en una sola. Por eso casi siempre va después de sort.',
    '-c  antepone cuántas veces aparecía cada línea',
    '-d  muestra solo las repetidas   -u  solo las únicas',
  ],
  examples: ['sort lista.txt | uniq', 'sort ips.txt | uniq -c'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'cdui');
    const { inputs, code } = readInputs(ctx, operands.slice(0, 1), 'uniq');
    const lines = inputs.flatMap((i) => splitLines(i.content));
    const groups = [];
    const eq = (a, b) => (flags.i ? a.toLowerCase() === b.toLowerCase() : a === b);
    for (const line of lines) {
      const last = groups[groups.length - 1];
      if (last && eq(last.line, line)) last.count++;
      else groups.push({ line, count: 1 });
    }
    for (const g of groups) {
      if (flags.d && g.count < 2) continue;
      if (flags.u && g.count > 1) continue;
      ctx.print(flags.c ? `${String(g.count).padStart(7)} ${g.line}` : g.line);
    }
    return code;
  },
});

function parseRanges(spec) {
  return spec.split(',').map((part) => {
    const m = /^(\d*)-?(\d*)$/.exec(part);
    if (!m || part === '' || part === '-') throw new UsageError(`invalid field value '${part}'`);
    if (!part.includes('-')) return [Number(m[1]), Number(m[1])];
    return [m[1] ? Number(m[1]) : 1, m[2] ? Number(m[2]) : Infinity];
  });
}

const cut = command({
  name: 'cut',
  category: 'texto',
  summary: 'extrae columnas de cada línea',
  usage: 'cut -d DELIM -f CAMPOS [archivo]   |   cut -c POSICIONES',
  description: [
    'Corta cada línea en campos separados por DELIM y se queda con los pedidos.',
    '-d " "   delimitador (un carácter)   -f 1,3  campos 1 y 3   -f 2-4  del 2 al 4',
    '-c 1-5   caracteres del 1 al 5',
  ],
  examples: ["cut -d' ' -f3 accesos.log", 'cut -d: -f1 /etc/passwd', 'cut -c1-10 archivo'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'd:f:c:s');
    if (!flags.f && !flags.c) throw new UsageError('you must specify a list of bytes, characters, or fields');
    const delim = flags.d ?? '\t';
    if (flags.d !== undefined && [...delim].length !== 1) throw new UsageError('the delimiter must be a single character');
    const ranges = parseRanges(flags.f ?? flags.c);
    const inRange = (n) => ranges.some(([a, b]) => n >= a && n <= b);
    const { inputs, code } = readInputs(ctx, operands, 'cut');
    for (const line of inputs.flatMap((i) => splitLines(i.content))) {
      if (flags.c) {
        ctx.print([...line].filter((_, i) => inRange(i + 1)).join(''));
        continue;
      }
      if (!line.includes(delim)) {
        if (!flags.s) ctx.print(line);
        continue;
      }
      ctx.print(line.split(delim).filter((_, i) => inRange(i + 1)).join(delim));
    }
    return code;
  },
});

function expandSet(set) {
  const chars = [...set.replace(/\\n/g, '\n').replace(/\\t/g, '\t')];
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i + 1] === '-' && chars[i + 2] !== undefined) {
      const a = chars[i].codePointAt(0);
      const b = chars[i + 2].codePointAt(0);
      for (let c = a; c <= b; c++) out.push(String.fromCodePoint(c));
      i += 2;
    } else out.push(chars[i]);
  }
  return out;
}

const tr = command({
  name: 'tr',
  category: 'texto',
  summary: 'traduce o borra caracteres',
  usage: 'tr CONJUNTO1 CONJUNTO2   |   tr -d CONJUNTO',
  description: [
    'Reemplaza cada carácter del CONJUNTO1 por el de la misma posición en CONJUNTO2.',
    'Acepta rangos: a-z, A-Z, 0-9. Lee SIEMPRE de la entrada estándar (usá < o |).',
    '-d  borra los caracteres del conjunto.',
    'ROT13 (cifrado César de 13 posiciones): tr \'A-Za-z\' \'N-ZA-Mn-za-m\'',
  ],
  examples: ["echo hola | tr a-z A-Z", "tr 'A-Za-z' 'N-ZA-Mn-za-m' < secreto.txt", "tr -d '-' < archivo"],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'ds');
    const input = ctx.stdin ?? '';
    if (flags.d) {
      if (!operands[0]) throw new UsageError('missing operand');
      const del = new Set(expandSet(operands[0]));
      ctx.out([...input].filter((c) => !del.has(c)).join(''));
      return 0;
    }
    if (operands.length < 2) throw new UsageError(operands.length ? `missing operand after '${operands[0]}'` : 'missing operand');
    const from = expandSet(operands[0]);
    const to = expandSet(operands[1]);
    const map = new Map();
    from.forEach((c, i) => map.set(c, to[Math.min(i, to.length - 1)]));
    let out = [...input].map((c) => map.get(c) ?? c).join('');
    if (flags.s) out = out.replace(/(.)\1+/g, (m, c) => (to.includes(c) ? c : m));
    ctx.out(out);
    return 0;
  },
});

const rev = command({
  name: 'rev',
  category: 'texto',
  summary: 'invierte cada línea',
  usage: 'rev [archivo...]',
  description: ['Da vuelta los caracteres de cada línea: "hola" → "aloh".'],
  examples: ['echo oro | rev'],
  run(ctx) {
    const { inputs, code } = readInputs(ctx, ctx.args, 'rev');
    for (const line of inputs.flatMap((i) => splitLines(i.content))) ctx.print([...line].reverse().join(''));
    return code;
  },
});

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
};
const fromBase64 = (b64) => {
  const bin = atob(b64);
  return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const base64 = command({
  name: 'base64',
  category: 'texto',
  summary: 'codifica o decodifica en Base64',
  usage: 'base64 [-d] [archivo]',
  description: [
    'Base64 representa datos con letras, números, + y /. NO es cifrado: cualquiera lo revierte.',
    'Sin opciones codifica; con -d decodifica.',
    'Reconocerlo: solo [A-Za-z0-9+/] y a veces termina en = o ==.',
  ],
  examples: ['echo hola | base64', 'base64 -d transmision.b64', 'base64 -d mensaje.b64 > mensaje.txt'],
  run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'diw:');
    const { inputs, code } = readInputs(ctx, operands.slice(0, 1), 'base64');
    if (code) return code;
    const data = inputs[0].content;
    if (flags.d) {
      const clean = data.replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) {
        ctx.error('base64: invalid input');
        return 1;
      }
      try {
        ctx.out(fromBase64(clean));
      } catch {
        ctx.error('base64: invalid input');
        return 1;
      }
      return 0;
    }
    const encoded = toBase64(data);
    const wrap = flags.w !== undefined ? Number(flags.w) : 76;
    ctx.print(wrap > 0 ? encoded.match(new RegExp(`.{1,${wrap}}`, 'g'))?.join('\n') ?? '' : encoded);
    return 0;
  },
});

const diff = command({
  name: 'diff',
  category: 'texto',
  summary: 'compara dos archivos línea por línea',
  usage: 'diff archivo1 archivo2',
  description: ['Muestra las líneas que difieren: < del primero, > del segundo. Sin salida = iguales.'],
  examples: ['diff original.txt copia.txt'],
  run(ctx) {
    if (ctx.args.length !== 2) throw new UsageError(`missing operand after '${ctx.args[0] ?? 'diff'}'`);
    const { inputs, code } = readInputs(ctx, ctx.args, 'diff');
    if (code) return 2;
    const [a, b] = inputs.map((i) => splitLines(i.content));
    // LCS simple (archivos chicos)
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
    let i = 0;
    let j = 0;
    let differ = false;
    while (i < m || j < n) {
      if (i < m && j < n && a[i] === b[j]) { i++; j++; continue; }
      differ = true;
      if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) ctx.print(`> ${b[j++]}`);
      else ctx.print(`< ${a[i++]}`);
    }
    return differ ? 1 : 0;
  },
});

export default [cat, echo, headTail('head'), headTail('tail'), wc, grep, sort, uniq, cut, tr, rev, base64, diff];
