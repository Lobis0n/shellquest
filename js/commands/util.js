/**
 * Helpers compartidos por los comandos.
 * @module commands/util
 */
import { UsageError, FSError } from '../core/errors.js';

/**
 * Parser de opciones estilo getopt. `spec` lista las letras válidas;
 * una letra seguida de ':' recibe valor (ej: 'lan:').
 * @returns {{flags: Object<string, string|true>, operands: string[]}}
 */
export function getopts(args, spec = '') {
  const flags = {};
  const operands = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        const idx = spec.indexOf(ch);
        if (idx < 0) throw new UsageError(`invalid option -- '${ch}'`);
        if (spec[idx + 1] === ':') {
          const value = a.slice(j + 1) || args[++i];
          if (value === undefined) throw new UsageError(`option requires an argument -- '${ch}'`);
          flags[ch] = value;
          break;
        }
        flags[ch] = true;
      }
      continue;
    }
    operands.push(a);
  }
  return { flags, operands };
}

export const errMessage = (e) => (e instanceof FSError ? e.message : String(e?.message ?? e));

/** Divide texto en líneas descartando el salto final. */
export function splitLines(text) {
  if (!text) return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export const joinLines = (lines) => (lines.length ? `${lines.join('\n')}\n` : '');

export const byteLength = (s) => new TextEncoder().encode(s).length;

/**
 * Lee las entradas de un comando de texto: archivos o stdin.
 * Marca los archivos como leídos (lo usan los niveles).
 */
export function readInputs(ctx, operands, cmd) {
  if (!operands.length) return { inputs: [{ name: '-', content: ctx.stdin ?? '' }], code: 0 };
  const inputs = [];
  let code = 0;
  for (const name of operands) {
    if (name === '-') {
      inputs.push({ name, content: ctx.stdin ?? '' });
      continue;
    }
    try {
      const path = ctx.resolve(name);
      const content = ctx.fs.readFile(path, ctx.user);
      ctx.world.markRead(ctx.host, path);
      inputs.push({ name, content, path });
    } catch (e) {
      ctx.error(`${cmd}: ${name}: ${errMessage(e)}`);
      code = 1;
    }
  }
  return { inputs, code };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function lsDate(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${hh}:${mm}`;
}

export const sleep = (ctx, ms) => (ctx.io.sleep ? ctx.io.sleep(ms) : Promise.resolve());

/** Define un comando con su documentación (usada por `man` y `help`). */
export const command = (def) => ({ category: 'otros', aliases: [], examples: [], ...def });
