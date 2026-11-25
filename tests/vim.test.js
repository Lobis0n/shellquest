import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VimEngine, parseKeys } from '../js/editor/vim-engine.js';

const vim = (content, keys) => {
  let saved = null;
  const e = new VimEngine({ content, filename: 'f.txt', save: (t) => { saved = t; return { ok: true }; } });
  e.feed(keys);
  return { e, saved: () => saved };
};

test('parseKeys entiende la notación <Esc> <CR> <C-r>', () => {
  assert.deepEqual(parseKeys('ia<Esc>:w<CR><C-r>'), ['i', 'a', 'Escape', ':', 'w', 'Enter', 'C-r']);
});

test('insertar, guardar y salir', () => {
  const { e, saved } = vim('', 'iHola mundo<Esc>:wq<CR>');
  assert.equal(saved(), 'Hola mundo\n');
  assert.equal(e.closed, true);
});

test(':q con cambios sin guardar avisa y :q! sale', () => {
  const { e } = vim('a\n', 'ddx:q<CR>');
  assert.match(e.message, /E37/);
  assert.equal(e.closed, false);
  e.feed(':q!<CR>');
  assert.equal(e.closed, true);
});

test('dd con conteo, u y Ctrl-r', () => {
  const { e } = vim('1\n2\n3\n4\n', '2dd');
  assert.deepEqual(e.lines, ['3', '4']);
  e.feed('u');
  assert.deepEqual(e.lines, ['1', '2', '3', '4']);
  e.feed('<C-r>');
  assert.deepEqual(e.lines, ['3', '4']);
});

test('movimientos de palabra y dw / cw', () => {
  const { e } = vim('uno dos tres\n', 'wdw');
  assert.equal(e.lines[0], 'uno tres');
  e.feed('cwCUATRO<Esc>');
  assert.equal(e.lines[0], 'uno CUATRO');
});

test('yy y p duplican una línea', () => {
  const { e } = vim('a\nb\n', 'yyjp');
  assert.deepEqual(e.lines, ['a', 'b', 'a']);
});

test(':%s reemplaza en todo el archivo', () => {
  const { e } = vim('x=IP\ny=IP IP\n', ':%s/IP/10.0.0.66/g<CR>');
  assert.deepEqual(e.lines, ['x=10.0.0.66', 'y=10.0.0.66 10.0.0.66']);
  assert.match(e.message, /3 substitutions on 2 lines/);
});

test(':s sin g reemplaza solo la primera aparición de la línea actual', () => {
  const { e } = vim('a a\na a\n', ':s/a/b/<CR>');
  assert.deepEqual(e.lines, ['b a', 'a a']);
});

test('búsqueda con / y n, con vuelta al principio', () => {
  const { e } = vim('foo\nbar\nfoo\n', '/foo<CR>');
  assert.equal(e.row, 2);
  e.feed('n');
  assert.equal(e.row, 0);
  assert.match(e.message, /BOTTOM/);
});

test('o, O, A, x, r y G', () => {
  const { e } = vim('medio\n', 'oabajo<Esc>Oentre<Esc>ggAfin<Esc>Gx0rZ');
  assert.deepEqual(e.lines, ['mediofin', 'entre', 'Zajo']);
});
