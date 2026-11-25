/**
 * Sistema de archivos virtual en memoria con permisos UNIX simplificados
 * (propietario / otros; los grupos se ignoran). Serializable a JSON.
 * @module core/filesystem
 */
import { normalize, dirname, basename } from './path.js';
import { FSError } from './errors.js';

/**
 * @typedef {{type:'dir', owner:string, mode:number, mtime:number, children:Object<string, FSNode>}} DirNode
 * @typedef {{type:'file', owner:string, mode:number, mtime:number, content:string}} FileNode
 * @typedef {DirNode|FileNode} FSNode
 */

const now = () => Date.now();

export const makeDir = (owner = 'root', mode = 0o755) => ({
  type: 'dir', owner, mode, mtime: now(), children: {},
});

export const makeFile = (content = '', owner = 'root', mode = 0o644) => ({
  type: 'file', owner, mode, mtime: now(), content,
});

const BITS = { r: [0o400, 0o004], w: [0o200, 0o002], x: [0o100, 0o001] };

/**
 * ¿Puede `user` hacer `perm` (r|w|x) sobre `node`?
 * root puede todo, salvo ejecutar archivos sin ningún bit x.
 */
export function can(node, user, perm) {
  if (user === 'root') {
    return perm !== 'x' || node.type === 'dir' || (node.mode & 0o111) !== 0;
  }
  const [ownerBit, otherBit] = BITS[perm];
  return (node.owner === user ? node.mode & ownerBit : node.mode & otherBit) !== 0;
}

/** Representación `drwxr-xr-x` de un nodo. */
export function modeString(node) {
  const triad = (shift) => {
    const b = (node.mode >> shift) & 7;
    return (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-');
  };
  return (node.type === 'dir' ? 'd' : '-') + triad(6) + triad(3) + triad(0);
}

const clone = (node) => JSON.parse(JSON.stringify(node));

export class FileSystem {
  /** @param {DirNode} [root] */
  constructor(root = makeDir('root', 0o755)) {
    this.root = root;
  }

  static fromJSON(data) {
    return new FileSystem(data);
  }

  toJSON() {
    return this.root;
  }

  _parts(path) {
    return normalize(path).split('/').filter(Boolean);
  }

  /** Busca un nodo SIN comprobar permisos (uso interno del juego). */
  get(path) {
    let node = this.root;
    for (const part of this._parts(path)) {
      if (node.type !== 'dir') return null;
      node = node.children[part];
      if (!node) return null;
    }
    return node;
  }

  exists(path) { return Boolean(this.get(path)); }
  isDir(path) { return this.get(path)?.type === 'dir'; }
  isFile(path) { return this.get(path)?.type === 'file'; }

  /** Busca un nodo comprobando permiso de travesía (x) en cada directorio. */
  stat(path, user) {
    let node = this.root;
    for (const part of this._parts(path)) {
      if (node.type !== 'dir') throw new FSError('ENOTDIR', path);
      if (!can(node, user, 'x')) throw new FSError('EACCES', path);
      node = node.children[part];
      if (!node) throw new FSError('ENOENT', path);
    }
    return node;
  }

  _parent(path, user) {
    const parent = this.stat(dirname(path), user);
    if (parent.type !== 'dir') throw new FSError('ENOTDIR', path);
    return { parent, name: basename(path) };
  }

  readdir(path, user) {
    const node = this.stat(path, user);
    if (node.type !== 'dir') throw new FSError('ENOTDIR', path);
    if (!can(node, user, 'r')) throw new FSError('EACCES', path);
    return Object.keys(node.children).sort();
  }

  readFile(path, user) {
    const node = this.stat(path, user);
    if (node.type === 'dir') throw new FSError('EISDIR', path);
    if (!can(node, user, 'r')) throw new FSError('EACCES', path);
    return node.content;
  }

  writeFile(path, content, user, { append = false } = {}) {
    const { parent, name } = this._parent(path, user);
    const existing = parent.children[name];
    if (existing) {
      if (existing.type === 'dir') throw new FSError('EISDIR', path);
      if (!can(existing, user, 'w')) throw new FSError('EACCES', path);
      existing.content = append ? existing.content + content : content;
      existing.mtime = now();
      return existing;
    }
    if (!can(parent, user, 'w')) throw new FSError('EACCES', path);
    const file = makeFile(content, user);
    parent.children[name] = file;
    parent.mtime = now();
    return file;
  }

  touch(path, user) {
    const node = this.get(path);
    if (node) {
      this.stat(path, user);
      node.mtime = now();
      return node;
    }
    return this.writeFile(path, '', user);
  }

  mkdir(path, user, { parents = false } = {}) {
    if (parents) {
      let cur = '';
      for (const part of this._parts(path)) {
        cur += '/' + part;
        const node = this.get(cur);
        if (node) {
          if (node.type !== 'dir') throw new FSError('ENOTDIR', cur);
          continue;
        }
        this.mkdir(cur, user);
      }
      return;
    }
    const { parent, name } = this._parent(path, user);
    if (parent.children[name]) throw new FSError('EEXIST', path);
    if (!can(parent, user, 'w')) throw new FSError('EACCES', path);
    parent.children[name] = makeDir(user);
    parent.mtime = now();
  }

  remove(path, user, { recursive = false } = {}) {
    if (normalize(path) === '/') throw new FSError('EPERM', path);
    const { parent, name } = this._parent(path, user);
    const node = parent.children[name];
    if (!node) throw new FSError('ENOENT', path);
    if (node.type === 'dir' && !recursive) throw new FSError('EISDIR', path);
    if (!can(parent, user, 'w')) throw new FSError('EACCES', path);
    delete parent.children[name];
    parent.mtime = now();
  }

  rmdir(path, user) {
    const node = this.stat(path, user);
    if (node.type !== 'dir') throw new FSError('ENOTDIR', path);
    if (Object.keys(node.children).length) throw new FSError('ENOTEMPTY', path);
    this.remove(path, user, { recursive: true });
  }

  /** Renombra/mueve dentro del mismo sistema de archivos. */
  rename(src, dst, user) {
    const s = this._parent(src, user);
    const node = s.parent.children[s.name];
    if (!node) throw new FSError('ENOENT', src);
    if (!can(s.parent, user, 'w')) throw new FSError('EACCES', src);
    const d = this._parent(dst, user);
    if (!can(d.parent, user, 'w')) throw new FSError('EACCES', dst);
    const a = normalize(src);
    const b = normalize(dst);
    if (a === b) return;
    if (node.type === 'dir' && (b + '/').startsWith(a + '/')) throw new FSError('EINVAL', dst);
    const existing = d.parent.children[d.name];
    if (existing?.type === 'dir') throw new FSError('EISDIR', dst);
    delete s.parent.children[s.name];
    d.parent.children[d.name] = node;
    node.mtime = now();
  }

  /** Copia profunda de un nodo comprobando permisos de lectura. */
  exportNode(path, user) {
    const root = this.stat(path, user);
    const copy = (node, p) => {
      if (!can(node, user, 'r')) throw new FSError('EACCES', p);
      if (node.type === 'file') return { ...node };
      const out = { ...node, children: {} };
      for (const [name, child] of Object.entries(node.children)) {
        out.children[name] = copy(child, `${p}/${name}`);
      }
      return out;
    };
    return copy(root, normalize(path));
  }

  /** Inserta un nodo exportado (posiblemente de otra máquina) como `user`. */
  importNode(path, node, user) {
    const { parent, name } = this._parent(path, user);
    const existing = parent.children[name];
    if (existing) {
      if (existing.type === 'dir' && node.type !== 'dir') throw new FSError('EISDIR', path);
      if (existing.type === 'file' && node.type === 'dir') throw new FSError('ENOTDIR', path);
      if (!can(existing, user, 'w')) throw new FSError('EACCES', path);
      if (existing.type === 'file') {
        existing.content = node.content;
        existing.mtime = now();
        return;
      }
      for (const [childName, child] of Object.entries(node.children)) {
        this.importNode(`${normalize(path)}/${childName}`, child, user);
      }
      return;
    }
    if (!can(parent, user, 'w')) throw new FSError('EACCES', path);
    const retag = (n) => {
      n.owner = user;
      n.mtime = now();
      if (n.type === 'dir') Object.values(n.children).forEach(retag);
      return n;
    };
    parent.children[name] = retag(clone(node));
  }

  chmod(path, mode, user) {
    const node = this.stat(path, user);
    if (user !== 'root' && node.owner !== user) throw new FSError('EPERM', path);
    node.mode = mode & 0o777;
    node.mtime = now();
  }

  // ---------------------------------------------------------------------
  // Helpers para construir el mundo (ignoran permisos).
  // ---------------------------------------------------------------------

  seedDir(path, { owner = 'root', mode = 0o755 } = {}) {
    let node = this.root;
    for (const part of this._parts(path)) {
      if (!node.children[part]) node.children[part] = makeDir(owner, mode);
      node = node.children[part];
    }
    return node;
  }

  seed(path, content, { owner = 'root', mode = 0o644, dirOwner, dirMode = 0o755 } = {}) {
    const dir = this.seedDir(dirname(path), { owner: dirOwner ?? owner, mode: dirMode });
    dir.children[basename(path)] = makeFile(content, owner, mode);
    return dir.children[basename(path)];
  }
}

/**
 * Recorre un árbol en preorden. `visit` puede devolver `false` para podar.
 * @param {FSNode} node
 * @param {{display:string, abs:string, user:string, depth?:number,
 *   visit:(node:FSNode, display:string, abs:string, depth:number)=>boolean|void,
 *   onDenied?:(display:string)=>void, showHidden?:boolean}} opts
 */
export function walkTree(node, opts) {
  const { display, abs, user, visit, onDenied, depth = 0 } = opts;
  if (visit(node, display, abs, depth) === false) return;
  if (node.type !== 'dir') return;
  if (!can(node, user, 'r') || !can(node, user, 'x')) {
    onDenied?.(display);
    return;
  }
  for (const name of Object.keys(node.children).sort()) {
    const join = (base) => (base === '/' ? `/${name}` : `${base.replace(/\/$/, '')}/${name}`);
    walkTree(node.children[name], {
      ...opts, display: join(display), abs: join(abs), depth: depth + 1,
    });
  }
}
