/**
 * Utilidades de rutas estilo POSIX (sin dependencias del navegador).
 * @module core/path
 */

/** Normaliza una ruta absoluta: resuelve `.`, `..` y barras repetidas. */
export function normalize(path) {
  const parts = [];
  for (const seg of String(path).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return '/' + parts.join('/');
}

/**
 * Resuelve `path` relativo a `cwd`, expandiendo `~` al `home` dado.
 * @param {string} cwd
 * @param {string} path
 * @param {string} [home]
 */
export function resolve(cwd, path, home = '/') {
  let p = String(path);
  if (p === '~' || p.startsWith('~/')) p = home + p.slice(1);
  if (!p.startsWith('/')) p = `${cwd}/${p}`;
  return normalize(p);
}

export function dirname(path) {
  const n = normalize(path);
  const i = n.lastIndexOf('/');
  return i <= 0 ? '/' : n.slice(0, i);
}

export function basename(path) {
  const n = normalize(path);
  return n.slice(n.lastIndexOf('/') + 1) || '/';
}

export function join(...parts) {
  return normalize(parts.join('/'));
}

/** Muestra una ruta absoluta acortando el home a `~`. */
export function prettify(path, home) {
  if (home && home !== '/' && (path === home || path.startsWith(home + '/'))) {
    return '~' + path.slice(home.length);
  }
  return path;
}
