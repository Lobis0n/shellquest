/**
 * Motor del juego: progreso, verificación de objetivos y guardado.
 * No depende del DOM; la UI escucha sus eventos.
 * @module game/game
 */
import { World } from '../core/world.js';
import { createBaseWorld } from './world-setup.js';
import { LEVELS } from './levels.js';
import { style, stripAnsi } from '../core/ansi.js';

export const SAVE_VERSION = 1;

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    return () => this.handlers.get(event).delete(fn);
  }
  emit(event, payload) {
    this.handlers.get(event)?.forEach((fn) => fn(payload));
  }
}

/** Quita etiquetas HTML para mostrar textos en la terminal. */
export const htmlToText = (html) => String(html)
  .replace(/<code>(.*?)<\/code>/g, '\x1b[36m$1\x1b[0m')
  .replace(/<b>(.*?)<\/b>/g, '\x1b[1m$1\x1b[0m')
  .replace(/<[^>]+>/g, '')
  .replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<')
  .replace(/&amp;/g, '&');

export class Game extends Emitter {
  /** @param {{storage?: {load():any, save(data:any):void, clear():void}, levels?: typeof LEVELS}} [opts] */
  constructor({ storage = null, levels = LEVELS } = {}) {
    super();
    this.storage = storage;
    this.levels = levels;
    this.state = null;
    this.world = null;
  }

  static buildWorld(levelIndex, levels = LEVELS) {
    const world = createBaseWorld();
    for (let i = 0; i <= levelIndex; i++) levels[i].setup(world);
    return world;
  }

  /** Carga una partida guardada o empieza una nueva. Devuelve true si cargó. */
  start() {
    if (this.load()) return true;
    this.newGame();
    return false;
  }

  newGame() {
    this.state = {
      level: 0,
      unlocked: 0,
      finished: false,
      hints: {},
      stats: { commands: 0, hints: 0, startedAt: Date.now(), finishedAt: null },
    };
    this.world = Game.buildWorld(0, this.levels);
    this.save();
    this.emit('worldchange', this.world);
    this.emit('levelchange', { level: this.level, index: 0 });
  }

  load() {
    const data = this.storage?.load();
    if (!data || data.version !== SAVE_VERSION || !data.state || !data.world) return false;
    try {
      this.state = data.state;
      this.world = World.fromJSON(data.world);
      return true;
    } catch {
      return false;
    }
  }

  save() {
    this.storage?.save({ version: SAVE_VERSION, state: this.state, world: this.world.toJSON() });
  }

  reset() {
    this.storage?.clear();
    this.newGame();
  }

  get level() { return this.levels[this.state.level]; }
  get index() { return this.state.level; }

  objectiveStatus() {
    return this.level.objectives.map((o) => {
      let done = false;
      try { done = Boolean(o.done(this.world)); } catch { done = false; }
      return { text: o.text, done };
    });
  }

  /** Verifica el nivel actual tras cada comando. Devuelve true si se superó. */
  evaluate() {
    if (this.state.finished) return false;
    const status = this.objectiveStatus();
    this.emit('progress', status);
    if (!status.every((s) => s.done)) return false;
    this.complete();
    return true;
  }

  complete() {
    const completed = this.level;
    const completedIndex = this.state.level;
    if (completedIndex === this.levels.length - 1) {
      this.state.finished = true;
      this.state.unlocked = completedIndex;
      this.state.stats.finishedAt ??= Date.now();
      this.save();
      this.emit('victory', { level: completed, index: completedIndex, stats: this.state.stats });
      return;
    }
    this.state.level++;
    this.state.unlocked = Math.max(this.state.unlocked, this.state.level);
    this.level.setup(this.world);
    this.save();
    this.emit('levelcomplete', { completed, completedIndex, next: this.level, index: this.state.level });
  }

  restartLevel() {
    this.world = Game.buildWorld(this.state.level, this.levels);
    this.state.hints[this.level.id] = this.state.hints[this.level.id] ?? 0;
    this.save();
    this.emit('worldchange', this.world);
    this.emit('levelchange', { level: this.level, index: this.state.level, restarted: true });
  }

  goTo(index) {
    if (index < 0 || index > this.state.unlocked) return false;
    this.state.level = index;
    this.state.finished = false;
    this.world = Game.buildWorld(index, this.levels);
    this.save();
    this.emit('worldchange', this.world);
    this.emit('levelchange', { level: this.level, index });
    return true;
  }

  hintsShown() {
    return this.state.hints[this.level.id] ?? 0;
  }

  revealHint() {
    const lvl = this.level;
    const shown = this.hintsShown();
    if (shown >= lvl.hints.length) return { hint: null, index: shown, total: lvl.hints.length };
    this.state.hints[lvl.id] = shown + 1;
    this.state.stats.hints++;
    this.save();
    this.emit('hint', { index: shown + 1 });
    return { hint: htmlToText(lvl.hints[shown]), html: lvl.hints[shown], index: shown + 1, total: lvl.hints.length };
  }

  /** Texto (con ANSI) que describe el nivel actual para la terminal. */
  describeLevel({ story = true } = {}) {
    const lvl = this.level;
    const n = this.state.level + 1;
    const bar = '━'.repeat(56);
    const lines = [
      style.gold(bar),
      style.gold(` NIVEL ${n}/${this.levels.length} · ${lvl.title}`) + style.gray(`   ${lvl.chapter}`),
      style.gold(bar),
    ];
    if (story) for (const p of lvl.story) lines.push(htmlToText(p), '');
    lines.push(style.bold('Objetivos:'));
    for (const o of this.objectiveStatus()) {
      lines.push(`  ${o.done ? style.green('✔') : style.yellow('○')} ${htmlToText(o.text)}`);
    }
    lines.push(style.gray("\n(escribí 'pista' si te trabás · 'mision' para repetir esto)"));
    return `${lines.join('\n')}\n`;
  }

  /** Línea de texto plano, útil para tests y lectores de pantalla. */
  plainDescription() {
    return stripAnsi(this.describeLevel());
  }
}
