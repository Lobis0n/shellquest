import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.js';
import { WALKTHROUGH } from './fixtures/walkthrough.js';
import { LEVELS } from '../js/game/levels.js';
import { Game } from '../js/game/game.js';

test('hay exactamente 20 niveles con historia, objetivos y pistas', () => {
  assert.equal(LEVELS.length, 20);
  assert.equal(WALKTHROUGH.length, 20);
  for (const lvl of LEVELS) {
    assert.ok(lvl.title && lvl.story.length && lvl.objectives.length && lvl.hints.length >= 3, lvl.id);
  }
});

test('ningún nivel está resuelto al empezar', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const world = Game.buildWorld(i);
    const allDone = LEVELS[i].objectives.every((o) => o.done(world));
    assert.equal(allDone, false, `el nivel ${i + 1} (${LEVELS[i].id}) arranca resuelto`);
  }
});

test('la partida completa se puede terminar de punta a punta', async () => {
  const h = createHarness();
  let victory = false;
  h.game.on('victory', () => { victory = true; });

  for (let i = 0; i < WALKTHROUGH.length; i++) {
    assert.equal(h.game.index, i, `debería estar en el nivel ${i + 1}`);
    for (const step of WALKTHROUGH[i]) await h.step(step);
    const pending = h.game.state.finished ? [] : h.game.objectiveStatus().filter((o) => !o.done);
    assert.ok(i === WALKTHROUGH.length - 1 ? victory : h.game.index === i + 1,
      `el nivel ${i + 1} (${LEVELS[i].id}) no se completó. Pendiente: ${pending.map((p) => p.text).join(' | ')}\nÚltima salida:\n${h.output}`);
  }
  assert.ok(victory, 'no se disparó la victoria');
  const treasure = h.world.read('base', '/home/recluta/TESORO.txt');
  assert.match(treasure, /FLAG\{sh3ll_qu3st_r00t_c0mpl3t4\}/);
});

test('cada nivel se puede jugar aislado desde un mundo reconstruido', async () => {
  for (let i = 0; i < WALKTHROUGH.length; i++) {
    const h = createHarness({ level: i });
    // Algunos niveles empiezan donde terminó el anterior (dentro de otra máquina).
    if (i === 14) await h.step({ cmd: 'ssh guardian@faro', answers: ['luz-en-la-niebla'] });
    if (i === 19) {
      await h.step({ cmd: 'ssh intruso@10.0.0.66', answers: ['puerta-trasera'] });
      await h.step({ cmd: 'su', answers: ['corona-de-hierro'] });
    }
    let done = false;
    h.game.on('levelcomplete', () => { done = true; });
    h.game.on('victory', () => { done = true; });
    for (const step of WALKTHROUGH[i]) await h.step(step);
    assert.ok(done, `el nivel ${i + 1} no se completa en forma aislada.\n${h.output}`);
  }
});

test('el progreso sobrevive a guardar y cargar', async () => {
  const h = createHarness();
  for (const step of WALKTHROUGH[0]) await h.step(step);
  assert.equal(h.game.index, 1);
  const storage = h.game.storage;
  const loaded = new Game({ storage });
  assert.equal(loaded.load(), true);
  assert.equal(loaded.index, 1);
  assert.ok(loaded.world.wasRead('base', '/home/recluta/LEEME.txt'));
});
