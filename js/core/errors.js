/**
 * Errores del motor. Los mensajes imitan los de GNU/Linux para que el
 * jugador aprenda a reconocerlos en una terminal real.
 * @module core/errors
 */

export const ERRNO = Object.freeze({
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  EPERM: 'Operation not permitted',
  EISDIR: 'Is a directory',
  ENOTDIR: 'Not a directory',
  EEXIST: 'File exists',
  ENOTEMPTY: 'Directory not empty',
  EINVAL: 'Invalid argument',
});

export class FSError extends Error {
  /** @param {keyof ERRNO} code @param {string} [path] */
  constructor(code, path = '') {
    super(ERRNO[code] ?? code);
    this.name = 'FSError';
    this.code = code;
    this.path = path;
  }
}

/** Uso incorrecto de un comando (opción inválida, faltan argumentos...). */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/** Error de sintaxis de la línea de comandos. */
export class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}
