import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parse, globToRegExp } from '../js/core/parser.js';
import { ParseError } from '../js/core/errors.js';

const words = (line, env) => tokenize(line, env).map((t) => (t.type === 'word' ? t.value : `<${t.value}>`));

test('separa palabras y respeta comillas', () => {
  assert.deepEqual(words('echo "hola mundo" \'a b\' c'), ['echo', 'hola mundo', 'a b', 'c']);
  assert.deepEqual(words('echo a\\ b'), ['echo', 'a b']);
});

test('expande variables salvo en comillas simples', () => {
  const env = { USER: 'recluta', HOME: '/home/recluta' };
  assert.deepEqual(words('echo $USER "${USER}!" \'$USER\'', env), ['echo', 'recluta', 'recluta!', '$USER']);
  assert.deepEqual(words('cd ~/mapa', env), ['cd', '/home/recluta/mapa']);
  assert.deepEqual(words('echo a~b', env), ['echo', 'a~b']);
});

test('reconoce operadores', () => {
  assert.deepEqual(words('a | b && c || d ; e > f >> g < h 2>/dev/null'),
    ['a', '<|>', 'b', '<&&>', 'c', '<||>', 'd', '<;>', 'e', '<>>', 'f', '<>>>', 'g', '<<>', 'h', '<2>>', '/dev/null']);
});

test('marca comodines solo fuera de comillas', () => {
  const [, a, b] = tokenize('ls *.txt "*.key"');
  assert.equal(a.glob, true);
  assert.equal(b.glob, false);
});

test('parse arma pipelines y redirecciones', () => {
  const list = parse(tokenize('cat a | sort > out.txt && echo ok'));
  assert.equal(list.length, 2);
  assert.equal(list[0].pipeline.length, 2);
  assert.deepEqual(list[0].pipeline[1].redirects, [{ op: '>', target: 'out.txt' }]);
  assert.equal(list[0].next, '&&');
});

test('errores de sintaxis', () => {
  assert.throws(() => parse(tokenize('| ls')), ParseError);
  assert.throws(() => parse(tokenize('ls |')), ParseError);
  assert.throws(() => parse(tokenize('echo >')), ParseError);
  assert.throws(() => tokenize('echo "sin cerrar'), ParseError);
});

test('globToRegExp', () => {
  assert.ok(globToRegExp('*.tmp').test('ratas_01.tmp'));
  assert.ok(!globToRegExp('*.tmp').test('soga.txt'));
  assert.ok(globToRegExp('pieza_?.txt').test('pieza_1.txt'));
  assert.ok(globToRegExp('[ab]*').test('bote'));
});
