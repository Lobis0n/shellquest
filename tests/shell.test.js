import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../js/core/world.js';
import { Shell } from '../js/core/shell.js';
import { createRegistry } from '../js/commands/index.js';
import { stripAnsi } from '../js/core/ansi.js';

function setup() {
  const world = new World();
  world.addMachine({
    hostname: 'base',
    ip: '10.0.0.2',
    ports: { 22: 'ssh' },
    users: { root: { password: 'r', home: '/root', uid: 0 }, ana: { password: 'x', home: '/home/ana', uid: 1000 } },
  });
  world.seedDir('base', '/home');
  world.seedDir('base', '/home/ana', { owner: 'ana' });
  world.seedDir('base', '/root', { mode: 0o700 });
  world.seed('base', '/root/secreto', 'top secret\n', { mode: 0o600 });
  world.seed('base', '/home/ana/frutas.txt', 'pera\nmanzana\npera\nbanana\npera\n', { owner: 'ana' });
  world.login('base', 'ana');
  let out = '';
  const io = {
    out: (s) => { out += s; },
    err: (s) => { out += s; },
    ask: async () => 'r',
    openEditor: async () => {},
  };
  const shell = new Shell({ world, registry: createRegistry(), io });
  return {
    world,
    async run(cmd) {
      out = '';
      const code = await shell.run(cmd);
      return { code, out: stripAnsi(out) };
    },
  };
}

test('tuberías y conteo', async () => {
  const s = setup();
  const { out } = await s.run('sort frutas.txt | uniq -c | sort -nr | head -1');
  assert.equal(out.trim(), '3 pera');
});

test('redirecciones > >> y <', async () => {
  const s = setup();
  await s.run('echo uno > n.txt');
  await s.run('echo dos >> n.txt');
  assert.equal(s.world.read('base', '/home/ana/n.txt'), 'uno\ndos\n');
  assert.equal((await s.run('wc -l < n.txt')).out.trim(), '2');
});

test('&& y || respetan el código de salida', async () => {
  const s = setup();
  assert.equal((await s.run('cat nada && echo si || echo no')).out.split('\n').at(-2), 'no');
  assert.equal((await s.run('true && echo si')).out.trim(), 'si');
});

test('permisos: un usuario no puede leer /root', async () => {
  const s = setup();
  const { out, code } = await s.run('cat /root/secreto');
  assert.match(out, /Permission denied/);
  assert.equal(code, 1);
});

test('su a root permite leer /root y exit vuelve', async () => {
  const s = setup();
  await s.run('su');
  assert.equal(s.world.user, 'root');
  assert.match((await s.run('cat /root/secreto')).out, /top secret/);
  await s.run('exit');
  assert.equal(s.world.user, 'ana');
});

test('chmod +x y ejecución de scripts', async () => {
  const s = setup();
  await s.run("echo 'echo desde el script' > s.sh");
  assert.match((await s.run('./s.sh')).out, /Permission denied/);
  await s.run('chmod +x s.sh');
  assert.equal((await s.run('./s.sh')).out.trim(), 'desde el script');
});

test('cp, mv y rm con comodines', async () => {
  const s = setup();
  await s.run('touch a.tmp b.tmp c.txt');
  await s.run('rm *.tmp');
  assert.deepEqual(s.world.fs.readdir('/home/ana', 'ana'), ['c.txt', 'frutas.txt']);
  await s.run('mkdir d && cp frutas.txt d/ && mv c.txt d/nuevo.txt');
  assert.deepEqual(s.world.fs.readdir('/home/ana/d', 'ana'), ['frutas.txt', 'nuevo.txt']);
});

test('comando inexistente devuelve 127', async () => {
  const s = setup();
  const { code, out } = await s.run('volar');
  assert.equal(code, 127);
  assert.match(out, /command not found/);
});
