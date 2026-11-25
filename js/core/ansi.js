/**
 * Colores ANSI mínimos. Los comandos emiten secuencias reales (\x1b[..m)
 * y la terminal las convierte en estilos.
 * @module core/ansi
 */

export const paint = (code, text) => `\x1b[${code}m${text}\x1b[0m`;

export const style = Object.freeze({
  bold: (s) => paint('1', s),
  dim: (s) => paint('2', s),
  red: (s) => paint('31', s),
  green: (s) => paint('32', s),
  yellow: (s) => paint('33', s),
  blue: (s) => paint('34', s),
  magenta: (s) => paint('35', s),
  cyan: (s) => paint('36', s),
  gray: (s) => paint('90', s),
  gold: (s) => paint('1;33', s),
  dir: (s) => paint('1;34', s),
  exec: (s) => paint('1;32', s),
  match: (s) => paint('1;31', s),
});

export const stripAnsi = (text) => String(text).replace(/\x1b\[[0-9;]*m/g, '');
