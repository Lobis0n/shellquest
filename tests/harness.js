/**
 * Arnés sin navegador: conecta Game + Shell con una E/S simulada.
 * - Las respuestas a contraseñas se toman de una cola.
 * - El editor se maneja con secuencias de teclas (VimEngine.feed).
 */
import { Game } from '../js/game/game.js';
import { Shell } from '../js/core/shell.js';
import { createRegistry } from '../js/commands/index.js';
import { MemoryStorage } from '../js/game/storage.js';
import { VimEngine } from '../js/editor/vim-engine.js';
import { stripAnsi } from '../js/core/ansi.js';

export function createHarness({ level = 0 } = {}) {
  const game = new Game({ storage: new MemoryStorage() });
  game.newGame();
  if (level) {
    game.state.unlocked = level;
    game.goTo(level);
  }
  const answers = [];
  const keyQueue = [];
  let output = '';
  const io = {
    out: (s) => { output += s; },
    err: (s) => { output += s; },
    ask: async (q) => {
      output += q;
      if (!answers.length) throw new Error(`Pregunta sin respuesta: ${q}`);
      const a = answers.shift();
      output += '\n';
      return a;
    },
    openEditor: async (opts) => {
      const keys = keyQueue.shift();
      if (keys === undefined) throw new Error('Se abrió vim sin teclas preparadas');
      const engine = new VimEngine({ ...opts });
      engine.feed(keys);
      if (!engine.closed) throw new Error(`vim no se cerró. Mensaje: ${engine.message}`);
      return engine;
    },
    clear: () => {},
  };
  const shell = new Shell({ world: game.world, registry: createRegistry(), io, game });
  game.on('worldchange', (w) => { shell.world = w; });

  return {
    game,
    shell,
    get world() { return game.world; },
    get output() { return stripAnsi(output); },
    resetOutput() { output = ''; },
    /**
     * @param {string|{cmd:string, answers?:string[], keys?:string}} step
     */
    async step(step) {
      const s = typeof step === 'string' ? { cmd: step } : step;
      answers.push(...(s.answers ?? []));
      if (s.keys !== undefined) keyQueue.push(s.keys);
      output = '';
      await shell.run(s.cmd);
      game.evaluate();
      return stripAnsi(output);
    },
  };
}
