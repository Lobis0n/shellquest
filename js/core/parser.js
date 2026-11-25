/**
 * Tokenizador y parser de un subconjunto de bash:
 *  - comillas simples/dobles y escapes con \
 *  - variables $VAR, ${VAR}, $?
 *  - expansión de ~ al inicio de una palabra
 *  - comodines * y ? (se marcan para expandir luego)
 *  - operadores |  &&  ||  ;  >  >>  <  2>  2>>
 *  - comentarios con #
 * @module core/parser
 */
import { ParseError } from './errors.js';

/**
 * @typedef {{type:'word', value:string, glob:boolean}} WordToken
 * @typedef {{type:'op', value:string}} OpToken
 * @typedef {{args: WordToken[], redirects: {op:string, target:string}[]}} SimpleCommand
 * @typedef {{pipeline: SimpleCommand[], next: (string|null)}} ListItem
 */

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n';
const BREAKS = new Set([' ', '\t', '\n', '|', '&', ';', '>', '<']);

function readVar(input, i, env) {
  const next = input[i + 1];
  if (next === '{') {
    const end = input.indexOf('}', i + 2);
    if (end < 0) throw new ParseError('bad substitution');
    const name = input.slice(i + 2, end);
    return { value: env[name] ?? '', end: end + 1 };
  }
  if (next === '?') return { value: env['?'] ?? '0', end: i + 2 };
  const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i + 1));
  if (!m) return null;
  return { value: env[m[0]] ?? '', end: i + 1 + m[0].length };
}

/**
 * @param {string} input
 * @param {Object<string,string>} [env]
 * @returns {(WordToken|OpToken)[]}
 */
export function tokenize(input, env = {}) {
  const tokens = [];
  let cur = null;
  let i = 0;
  const len = input.length;

  const ensure = () => { if (!cur) cur = { type: 'word', value: '', glob: false }; };
  const push = () => { if (cur) { tokens.push(cur); cur = null; } };
  const op = (value, size) => { push(); tokens.push({ type: 'op', value }); i += size; };

  while (i < len) {
    const c = input[i];

    if (isSpace(c)) { push(); i++; continue; }
    if (c === '#' && !cur) break;

    if (c === '|') { input[i + 1] === '|' ? op('||', 2) : op('|', 1); continue; }
    if (c === '&' && input[i + 1] === '&') { op('&&', 2); continue; }
    if (c === '&') throw new ParseError("los procesos en segundo plano (&) no están soportados");
    if (c === ';') { op(';', 1); continue; }
    if (c === '>') { input[i + 1] === '>' ? op('>>', 2) : op('>', 1); continue; }
    if (c === '<') { op('<', 1); continue; }
    if (c === '2' && !cur && input[i + 1] === '>') {
      if (input[i + 2] === '&' && input[i + 3] === '1') { op('2>&1', 4); continue; }
      input[i + 2] === '>' ? op('2>>', 3) : op('2>', 2);
      continue;
    }

    if (c === "'") {
      ensure();
      const end = input.indexOf("'", i + 1);
      if (end < 0) throw new ParseError("unexpected EOF while looking for matching `''");
      cur.value += input.slice(i + 1, end);
      i = end + 1;
      continue;
    }

    if (c === '"') {
      ensure();
      i++;
      while (i < len && input[i] !== '"') {
        const ch = input[i];
        if (ch === '\\' && i + 1 < len && '"\\$`'.includes(input[i + 1])) {
          cur.value += input[i + 1];
          i += 2;
          continue;
        }
        if (ch === '$') {
          const v = readVar(input, i, env);
          if (v) { cur.value += v.value; i = v.end; continue; }
        }
        cur.value += ch;
        i++;
      }
      if (i >= len) throw new ParseError('unexpected EOF while looking for matching `"\'');
      i++;
      continue;
    }

    if (c === '\\') {
      ensure();
      if (i + 1 < len) cur.value += input[i + 1];
      i += 2;
      continue;
    }

    if (c === '$') {
      const v = readVar(input, i, env);
      if (v) { ensure(); cur.value += v.value; i = v.end; continue; }
    }

    if (c === '~' && !cur && (i + 1 === len || input[i + 1] === '/' || BREAKS.has(input[i + 1]))) {
      ensure();
      cur.value += env.HOME ?? '~';
      i++;
      continue;
    }

    ensure();
    if (c === '*' || c === '?' || c === '[') cur.glob = true;
    cur.value += c;
    i++;
  }
  push();
  return tokens;
}

const REDIRECTS = new Set(['>', '>>', '<', '2>', '2>>']);

/**
 * Convierte tokens en una lista de pipelines unidos por ; && ||
 * @returns {ListItem[]}
 */
export function parse(tokens) {
  const list = [];
  let pipeline = [];
  let cmd = { args: [], redirects: [] };
  const isEmpty = (c) => !c.args.length && !c.redirects.length;

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type === 'word') { cmd.args.push(t); continue; }

    if (REDIRECTS.has(t.value)) {
      const target = tokens[k + 1];
      if (!target || target.type !== 'word') {
        throw new ParseError(`syntax error near unexpected token \`${target ? target.value : 'newline'}'`);
      }
      cmd.redirects.push({ op: t.value, target: target.value });
      k++;
      continue;
    }
    if (t.value === '2>&1') { cmd.redirects.push({ op: '2>&1', target: '' }); continue; }

    if (t.value === '|') {
      if (isEmpty(cmd)) throw new ParseError("syntax error near unexpected token `|'");
      pipeline.push(cmd);
      cmd = { args: [], redirects: [] };
      continue;
    }

    // ; && ||
    if (isEmpty(cmd)) {
      if (t.value === ';' && !pipeline.length && !list.length) {
        throw new ParseError("syntax error near unexpected token `;'");
      }
      if (t.value !== ';' || pipeline.length) {
        throw new ParseError(`syntax error near unexpected token \`${t.value}'`);
      }
      continue;
    }
    pipeline.push(cmd);
    list.push({ pipeline, next: t.value });
    pipeline = [];
    cmd = { args: [], redirects: [] };
  }

  if (!isEmpty(cmd)) pipeline.push(cmd);
  else if (pipeline.length) throw new ParseError('syntax error: unexpected end of file');
  if (pipeline.length) list.push({ pipeline, next: null });
  if (list.length && list[list.length - 1].next && list[list.length - 1].next !== ';') {
    throw new ParseError('syntax error: unexpected end of file');
  }
  return list;
}

/** Convierte un patrón glob (*, ?, [abc]) en RegExp anclada. */
export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end < 0) { re += '\\['; continue; }
      let cls = pattern.slice(i + 1, end);
      if (cls.startsWith('!')) cls = '^' + cls.slice(1);
      re += `[${cls.replace(/\\/g, '\\\\')}]`;
      i = end;
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
