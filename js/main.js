/**
 * Punto de entrada: conecta el motor del juego, el shell y la interfaz.
 */
import { Game } from './game/game.js';
import { LocalStorage } from './game/storage.js';
import { Shell } from './core/shell.js';
import { createRegistry } from './commands/index.js';
import { prettify } from './core/path.js';
import { style } from './core/ansi.js';
import { Terminal } from './ui/terminal.js';
import { Sidebar } from './ui/sidebar.js';
import { complete } from './ui/completion.js';
import { el } from './ui/dom.js';

const LOGO = String.raw`
   _____ __         ____   ____                  __
  / ___// /_  ___  / / /  / __ \__  _____  _____/ /_
  \__ \/ __ \/ _ \/ / /  / / / / / / / _ \/ ___/ __/
 ___/ / / / /  __/ / /  / /_/ / /_/ /  __(__  ) /_
/____/_/ /_/\___/_/_/   \___\_\__,_/\___/____/\__/
`;

const $ = (sel) => document.querySelector(sel);

const game = new Game({ storage: new LocalStorage('shellquest:save:v1') });
const loaded = game.start();
const registry = createRegistry();

let shell;
const terminal = new Terminal($('#terminal'), {
  prompt: () => {
    const w = shell.world;
    const sigil = w.user === 'root' ? '#' : '$';
    const userColor = w.user === 'root' ? '1;31' : '1;32';
    return `\x1b[${userColor}m${w.user}@${w.machine.hostname}\x1b[0m:\x1b[1;34m${prettify(w.cwd, w.home)}\x1b[0m${sigil} `;
  },
  history: () => shell.world.history,
  complete: (line) => complete(line, { world: shell.world, registry }),
  onCommand: async (line) => {
    await shell.run(line);
    game.state.stats.commands++;
    game.evaluate();
    game.save();
    updateHeader();
  },
});

shell = new Shell({ world: game.world, registry, io: terminal, game });

const sidebar = new Sidebar($('#panel'), {
  game,
  onRunCommand: (cmd) => runFromUi(cmd),
  onJump: (index) => {
    if (index === game.index) return;
    confirmDialog(`¿Ir al nivel ${index + 1}? El mundo se reconstruye como al comienzo de ese nivel.`, () => game.goTo(index));
  },
});

/** Ejecuta un comando como si el jugador lo hubiera escrito. */
async function runFromUi(cmd) {
  if (terminal.busy || terminal.editor) return;
  terminal.input.value = cmd;
  await terminal.submit();
}

function updateHeader() {
  $('[data-header-level]').textContent = `Nivel ${game.index + 1}/20`;
  $('[data-header-host]').textContent = `${shell.world.user}@${shell.world.machine.hostname}`;
  const pct = Math.round(((game.state.finished ? 20 : game.index) / game.levels.length) * 100);
  $('[data-progress]').style.setProperty('--progress', `${pct}%`);
  $('[data-progress]').setAttribute('aria-valuenow', String(pct));
}

function announceLevel({ restarted = false } = {}) {
  if (restarted) terminal.system(style.yellow('↺ Nivel reiniciado: el mundo volvió a su estado inicial.'));
  terminal.system(game.describeLevel());
  sidebar.render();
  updateHeader();
}

function banner(text, sub) {
  const node = el('div', 'term__banner');
  node.innerHTML = `<div class="term__banner-title">${text}</div>${sub ? `<div class="term__banner-sub">${sub}</div>` : ''}`;
  terminal.block(node);
}

// ------------------------------------------------------------ eventos
game.on('worldchange', (world) => { shell.world = world; });
game.on('levelchange', ({ restarted }) => {
  terminal.clear();
  announceLevel({ restarted });
  terminal.showPrompt();
});
game.on('progress', (status) => sidebar.renderObjectives(status));
game.on('levelcomplete', ({ completed, completedIndex }) => {
  banner(`★ NIVEL ${completedIndex + 1} SUPERADO ★`, completed.title);
  announceLevel();
});
game.on('victory', ({ stats }) => {
  banner('★ ¡ENCONTRASTE EL TESORO! ★', 'La Hermandad del Prompt te da la bienvenida, capitán/a.');
  sidebar.render();
  updateHeader();
  showVictory(stats);
});

// ------------------------------------------------------------ diálogos
function confirmDialog(message, onConfirm) {
  const dialog = $('#confirm');
  dialog.querySelector('[data-message]').textContent = message;
  dialog.showModal();
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') onConfirm();
    terminal.focus();
  }, { once: true });
}

function showVictory(stats) {
  const dialog = $('#victory');
  const treasure = (game.world.read('base', '/home/recluta/TESORO.txt') ?? '')
    .split('\n').filter((l) => !l.includes('PIEZA')).join('\n');
  dialog.querySelector('[data-treasure]').textContent = treasure;
  const minutes = Math.max(1, Math.round(((stats.finishedAt ?? Date.now()) - stats.startedAt) / 60000));
  dialog.querySelector('[data-stats]').innerHTML = `
    <li><strong>${stats.commands}</strong> comandos ejecutados</li>
    <li><strong>${stats.hints}</strong> pistas usadas</li>
    <li><strong>${minutes}</strong> minutos de aventura</li>`;
  dialog.showModal();
}

$('#btn-restart').addEventListener('click', () => {
  confirmDialog('¿Reiniciar el nivel actual? Se pierden los cambios hechos en este nivel.', () => game.restartLevel());
});
$('#btn-reset').addEventListener('click', () => {
  confirmDialog('¿Borrar TODO el progreso y empezar desde el nivel 1?', () => game.reset());
});
$('#btn-help').addEventListener('click', () => runFromUi('help'));
$('#victory [data-replay]').addEventListener('click', () => {
  $('#victory').close();
  game.reset();
});

// ------------------------------------------------------------ arranque
terminal.system(style.gold(LOGO));
terminal.system(`${style.bold('ShellQuest')} — una búsqueda del tesoro para aprender ${style.green('Bash')}, ${style.green('Vim')} y hacking ético.`);
terminal.system(style.gray('Todo ocurre en una red simulada dentro de tu navegador. Nada sale de esta pestaña.\n'));
if (loaded) terminal.system(style.cyan('↻ Partida recuperada. ¡Bienvenido de vuelta!\n'));
if (game.state.finished) {
  terminal.system(style.gold('Ya encontraste el tesoro. Podés rejugar cualquier nivel con "nivel N" o desde el mapa.'));
  sidebar.render();
  updateHeader();
} else {
  announceLevel();
}
terminal.showPrompt();
terminal.focus();
