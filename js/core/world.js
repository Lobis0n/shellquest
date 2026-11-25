/**
 * El "mundo": una red de máquinas, cada una con su sistema de archivos y
 * usuarios, más la pila de sesiones (ssh / su) del jugador.
 * @module core/world
 */
import { FileSystem } from './filesystem.js';

/** Reglas de acceso de red (firewalls) registradas por el juego. */
const gates = new Map();

/** @param {string} name @param {(world: World) => boolean} fn */
export function registerGate(name, fn) {
  gates.set(name, fn);
}

/**
 * @typedef {Object} Machine
 * @property {string} hostname
 * @property {string} ip
 * @property {string} [os]
 * @property {Object<string,string>} ports   puerto -> servicio
 * @property {Object<string,{password:string, home:string, uid:number}>} users
 * @property {string} [gate]   nombre de la regla que debe cumplirse para conectar
 * @property {string} [motd]
 * @property {FileSystem} fs
 */

export class World {
  constructor() {
    /** @type {Object<string, Machine>} */
    this.machines = {};
    /** @type {{host:string, user:string, cwd:string, prevCwd?:string, vars:Object<string,string>}[]} */
    this.sessions = [];
    this.readLog = new Set();
    this.editLog = new Set();
    this.history = [];
  }

  /** @param {Omit<Machine,'fs'> & {fs?: FileSystem}} def */
  addMachine(def) {
    const machine = { ports: {}, users: {}, os: 'Ubuntu 24.04 LTS', ...def, fs: def.fs ?? new FileSystem() };
    this.machines[machine.hostname] = machine;
    return machine;
  }

  get session() { return this.sessions[this.sessions.length - 1]; }
  get machine() { return this.machines[this.session.host]; }
  get fs() { return this.machine.fs; }
  get user() { return this.session.user; }
  get home() { return this.machine.users[this.user]?.home ?? '/'; }
  get cwd() { return this.session.cwd; }
  set cwd(path) { this.session.cwd = path; }

  login(host, user, { cwd } = {}) {
    const machine = this.machines[host];
    const home = machine.users[user]?.home ?? '/';
    this.sessions.push({ host, user, cwd: cwd ?? (machine.fs.isDir(home) ? home : '/'), vars: {} });
  }

  logout() {
    if (this.sessions.length <= 1) return null;
    return this.sessions.pop();
  }

  machineByIp(ip) {
    return Object.values(this.machines).find((m) => m.ip === ip) ?? null;
  }

  /** Resuelve un nombre usando el /etc/hosts de la máquina actual (o una IP). */
  resolveHost(name, from = this.machine) {
    if (name === 'localhost' || name === '127.0.0.1') return from;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return this.machineByIp(name);
    const hosts = from.fs.get('/etc/hosts');
    if (!hosts || hosts.type !== 'file') return null;
    for (const line of hosts.content.split('\n')) {
      const [ip, ...names] = line.replace(/#.*/, '').trim().split(/\s+/);
      if (ip && names.includes(name)) return this.machineByIp(ip);
    }
    return null;
  }

  /** Nombre con el que la máquina `target` aparece en el /etc/hosts de `from`. */
  knownName(target, from = this.machine) {
    const hosts = from.fs.get('/etc/hosts');
    if (!hosts || hosts.type !== 'file') return null;
    for (const line of hosts.content.split('\n')) {
      const [ip, name] = line.replace(/#.*/, '').trim().split(/\s+/);
      if (ip === target.ip && name) return name;
    }
    return null;
  }

  gateOpen(machine) {
    if (!machine.gate) return true;
    const fn = gates.get(machine.gate);
    return fn ? Boolean(fn(this)) : true;
  }

  markRead(host, path) { this.readLog.add(`${host}:${path}`); }
  wasRead(host, path) { return this.readLog.has(`${host}:${path}`); }
  markEdit(host, path) { this.editLog.add(`${host}:${path}`); }
  wasEdited(host, path) { return this.editLog.has(`${host}:${path}`); }

  // Helpers de construcción ------------------------------------------------
  seed(host, path, content, opts) { return this.machines[host].fs.seed(path, content, opts); }
  seedDir(host, path, opts) { return this.machines[host].fs.seedDir(path, opts); }
  read(host, path) {
    const node = this.machines[host]?.fs.get(path);
    return node?.type === 'file' ? node.content : null;
  }

  toJSON() {
    const machines = {};
    for (const [name, m] of Object.entries(this.machines)) {
      machines[name] = { ...m, fs: m.fs.toJSON() };
    }
    return {
      machines,
      sessions: this.sessions,
      readLog: [...this.readLog],
      editLog: [...this.editLog],
      history: this.history.slice(-300),
    };
  }

  static fromJSON(data) {
    const world = new World();
    for (const m of Object.values(data.machines)) {
      world.addMachine({ ...m, fs: FileSystem.fromJSON(m.fs) });
    }
    world.sessions = data.sessions;
    world.readLog = new Set(data.readLog);
    world.editLog = new Set(data.editLog);
    world.history = data.history ?? [];
    return world;
  }
}
