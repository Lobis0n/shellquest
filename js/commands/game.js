/**
 * Comandos propios del juego (en español): mision, pista, niveles...
 * @module commands/game
 */
import { command } from './util.js';
import { style } from '../core/ansi.js';

const mision = command({
  name: 'mision',
  aliases: ['misión', 'objetivo', 'mission'],
  category: 'juego',
  summary: 'muestra la historia y los objetivos del nivel',
  usage: 'mision',
  description: ['Repite el objetivo del nivel actual y marca los que ya cumpliste.'],
  examples: ['mision'],
  run(ctx) {
    if (!ctx.game) return 1;
    ctx.out(ctx.game.describeLevel({ story: true }));
    return 0;
  },
});

const pista = command({
  name: 'pista',
  aliases: ['hint'],
  category: 'juego',
  summary: 'revela la siguiente pista del nivel',
  usage: 'pista',
  description: ['Cada nivel tiene pistas progresivas: la última casi siempre es la solución.'],
  examples: ['pista'],
  run(ctx) {
    if (!ctx.game) return 1;
    const { hint, index, total } = ctx.game.revealHint();
    if (!hint) {
      ctx.print(style.yellow('No hay más pistas para este nivel. ¡Vos podés!'));
      return 0;
    }
    ctx.print(`${style.gold(`💡 Pista ${index}/${total}:`)} ${hint}`);
    return 0;
  },
});

const niveles = command({
  name: 'niveles',
  aliases: ['progreso', 'levels'],
  category: 'juego',
  summary: 'muestra tu progreso en los 20 niveles',
  usage: 'niveles',
  description: ['Lista los niveles. Los ya superados se pueden rejugar con: nivel N'],
  examples: ['niveles', 'nivel 3'],
  run(ctx) {
    if (!ctx.game) return 1;
    const g = ctx.game;
    g.levels.forEach((lvl, i) => {
      const mark = i < g.state.level || g.state.finished ? style.green('✔') : i === g.state.level ? style.gold('➤') : style.gray('·');
      const unlocked = i <= g.state.unlocked;
      const title = unlocked ? lvl.title : style.gray('???');
      ctx.print(` ${mark} ${String(i + 1).padStart(2)}. ${title}`);
    });
    return 0;
  },
});

const nivel = command({
  name: 'nivel',
  aliases: ['level'],
  category: 'juego',
  summary: 'salta a un nivel ya desbloqueado',
  usage: 'nivel N',
  description: ['Reconstruye el mundo al comienzo del nivel N (solo niveles desbloqueados).'],
  examples: ['nivel 6'],
  run(ctx) {
    if (!ctx.game) return 1;
    const n = Number(ctx.args[0]);
    if (!Number.isInteger(n) || n < 1 || n > ctx.game.levels.length) {
      ctx.error('Uso: nivel N   (N entre 1 y 20)');
      return 1;
    }
    if (n - 1 > ctx.game.state.unlocked) {
      ctx.error(`El nivel ${n} todavía está bloqueado. ¡Seguí avanzando!`);
      return 1;
    }
    ctx.game.goTo(n - 1);
    return 0;
  },
});

const reiniciar = command({
  name: 'reiniciar',
  aliases: ['restart'],
  category: 'juego',
  summary: 'reinicia el nivel actual',
  usage: 'reiniciar',
  description: ['Vuelve a construir el mundo como estaba al empezar este nivel. Útil si borraste algo importante.'],
  examples: ['reiniciar'],
  run(ctx) {
    if (!ctx.game) return 1;
    ctx.game.restartLevel();
    return 0;
  },
});

export default [mision, pista, niveles, nivel, reiniciar];
