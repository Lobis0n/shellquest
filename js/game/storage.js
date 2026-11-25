/**
 * Persistencia del progreso en localStorage (con fallback en memoria).
 * @module game/storage
 */
export class LocalStorage {
  constructor(key = 'shellquest:save') {
    this.key = key;
  }

  load() {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  save(data) {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify(data));
    } catch {
      /* almacenamiento lleno o bloqueado: el juego sigue en memoria */
    }
  }

  clear() {
    try {
      globalThis.localStorage?.removeItem(this.key);
    } catch {
      /* ignorar */
    }
  }
}

export class MemoryStorage {
  constructor() { this.data = null; }
  load() { return this.data ? JSON.parse(this.data) : null; }
  save(data) { this.data = JSON.stringify(data); }
  clear() { this.data = null; }
}
