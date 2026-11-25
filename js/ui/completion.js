/**
 * Autocompletado con Tab: comandos (primera palabra) y rutas (el resto).
 * @module ui/completion
 */
import { resolve } from '../core/path.js';

const commonPrefix = (words) => words.reduce((acc, w) => {
  let i = 0;
  while (i < acc.length && i < w.length && acc[i] === w[i]) i++;
  return acc.slice(0, i);
});

/**
 * @param {string} line  texto a la izquierda del cursor
 * @param {{world: import('../core/world.js').World, registry: Map<string, any>}} ctx
 * @returns {{line: string, options: string[]}}
 */
export function complete(line, { world, registry }) {
  const match = /(\S*)$/.exec(line);
  const word = match[1];
  const head = line.slice(0, line.length - word.length);
  const isCommand = !head.trim() || /[|;&]\s*$/.test(head);

  let candidates;
  if (isCommand && !word.includes('/')) {
    candidates = [...new Set(registry.keys())].filter((n) => n.startsWith(word)).sort().map((n) => ({ text: n, suffix: ' ' }));
  } else {
    const remote = /^([^@:/]+@)?[^:/]+:/.exec(word);
    if (remote) return { line, options: [] };
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    const prefix = word.slice(slash + 1);
    const dirPath = resolve(world.cwd, dirPart || '.', world.home);
    let names = [];
    try {
      names = world.fs.readdir(dirPath, world.user);
    } catch {
      return { line, options: [] };
    }
    const node = world.fs.get(dirPath);
    candidates = names
      .filter((n) => n.startsWith(prefix) && (prefix.startsWith('.') || !n.startsWith('.')))
      .map((n) => ({ text: dirPart + n, display: n, suffix: node.children[n].type === 'dir' ? '/' : ' ' }));
  }

  if (!candidates.length) return { line, options: [] };
  if (candidates.length === 1) {
    const [c] = candidates;
    return { line: head + c.text + c.suffix, options: [] };
  }
  const prefix = commonPrefix(candidates.map((c) => c.text));
  return {
    line: head + (prefix.length > word.length ? prefix : word),
    options: candidates.map((c) => (c.display ?? c.text) + (c.suffix === '/' ? '/' : '')),
  };
}
