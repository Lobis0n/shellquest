/**
 * Editores: vim/vi (funcional) y nano (redirige a vim).
 * @module commands/editor
 */
import { command, errMessage, splitLines, byteLength } from './util.js';
import { can } from '../core/filesystem.js';
import { style } from '../core/ansi.js';

const vim = command({
  name: 'vim',
  aliases: ['vi'],
  category: 'editor',
  summary: 'editor de texto modal',
  usage: 'vim [archivo]',
  description: [
    'Vim tiene MODOS. Lo más importante para sobrevivir:',
    '  Esc           → vuelve al modo NORMAL (ante la duda, Esc)',
    '  i             → modo INSERTAR (escribir texto) · a: insertar después del cursor',
    '  :w            → guardar          :q  → salir          :wq  → guardar y salir',
    '  :q!           → salir SIN guardar (descarta cambios)',
    '',
    'Moverse (modo normal):',
    '  h ← j ↓ k ↑ l →     w/b palabra siguiente/anterior     0 / $ inicio/fin de línea',
    '  gg primera línea    G última línea    :15 ir a la línea 15',
    '',
    'Editar (modo normal):',
    '  x borrar carácter   dd borrar línea   3dd borrar 3 líneas   dw borrar palabra',
    '  yy copiar línea     p pegar debajo    u deshacer            Ctrl+r rehacer',
    '  o nueva línea abajo O nueva línea arriba   r<c> reemplazar un carácter',
    '',
    'Buscar y reemplazar:',
    '  /texto  buscar (n siguiente, N anterior)',
    '  :s/viejo/nuevo/       en la línea actual',
    '  :%s/viejo/nuevo/g     en TODO el archivo, todas las apariciones',
    '  :set nu               mostrar números de línea',
  ],
  examples: ['vim juramento.txt', 'vim ~/herramientas/tunel.conf', 'vimtutor (en tu Linux real)'],
  async run(ctx) {
    const fileArg = ctx.args.find((a) => !a.startsWith('-') && !a.startsWith('+'));
    let path = fileArg ? ctx.resolve(fileArg) : null;
    let content = '';
    let isNew = true;
    let readonly = false;
    if (path) {
      const node = ctx.fs.get(path);
      if (node) {
        try {
          ctx.fs.stat(path, ctx.user);
          if (node.type === 'dir') {
            ctx.error(`vim: "${fileArg}" es un directorio`);
            return 1;
          }
          content = ctx.fs.readFile(path, ctx.user);
          ctx.world.markRead(ctx.host, path);
          isNew = false;
          readonly = !can(node, ctx.user, 'w');
        } catch (e) {
          ctx.error(`vim: "${fileArg}" [${errMessage(e)}]`);
          return 1;
        }
      }
    }
    const fs = ctx.fs;
    const user = ctx.user;
    const host = ctx.host;
    const world = ctx.world;
    let label = fileArg ?? '';
    await ctx.io.openEditor({
      filename: label,
      content,
      isNew,
      readonly,
      save(text, name) {
        const target = name ? ctx.resolve(name) : path;
        if (!target) return { error: 'E32: No file name' };
        try {
          fs.writeFile(target, text, user);
        } catch (e) {
          return { error: `"${name ?? label}" E212: Can't open file for writing (${errMessage(e)})` };
        }
        world.markEdit(host, target);
        if (!path || name) {
          path = target;
          label = name ?? label;
        }
        return { ok: true, info: `${splitLines(text).length}L, ${byteLength(text)}B` };
      },
    });
    return 0;
  },
});

const nano = command({
  name: 'nano',
  aliases: ['emacs', 'code', 'pico'],
  category: 'editor',
  summary: 'otros editores (no instalados)',
  usage: 'nano archivo',
  description: ['En la bóveda de la Capitana solo hay vim. ¡Es la oportunidad perfecta para aprenderlo!'],
  examples: ['vim archivo'],
  run(ctx) {
    ctx.error(`bash: ${ctx.name}: command not found`);
    ctx.print(style.yellow('En el Archipiélago solo hay vim. Probá: vim ' + (ctx.args[0] ?? 'archivo.txt') + '   (y man vim para la chuleta)'));
    return 127;
  },
});

export default [vim, nano];
