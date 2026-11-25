#!/usr/bin/env node
/**
 * Genera docs/SOLUCIONES.md a partir de los niveles y del walkthrough
 * verificado por los tests, así la guía nunca queda desactualizada.
 *
 *   npm run docs:solutions
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../js/game/levels.js';
import { WALKTHROUGH } from '../tests/fixtures/walkthrough.js';

const strip = (html) => html
  .replace(/<code>(.*?)<\/code>/g, '`$1`')
  .replace(/<b>(.*?)<\/b>/g, '**$1**')
  .replace(/<[^>]+>/g, '')
  .replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<')
  .replace(/&amp;/g, '&');

const lines = [
  '# Soluciones de ShellQuest',
  '',
  '> ⚠️ **Spoilers.** Intentá cada nivel primero: usá `pista` dentro del juego antes de mirar acá.',
  '>',
  '> Este archivo se genera automáticamente (`npm run docs:solutions`) a partir de',
  '> `tests/fixtures/walkthrough.js`, la misma solución que ejecutan los tests.',
  '',
  'Notación de teclas en Vim: `<Esc>` = Escape, `<CR>` = Enter. Cuando un comando pide contraseña, se indica en un comentario `# contraseña: ...`.',
  '',
];

LEVELS.forEach((lvl, i) => {
  lines.push(`## ${i + 1}. ${lvl.title}`, '', `*${lvl.chapter}* — conceptos: ${lvl.commands.map((c) => `\`${c}\``).join(', ')}`, '');
  lines.push('**Objetivos**', '');
  for (const o of lvl.objectives) lines.push(`- ${strip(o.text)}`);
  lines.push('', '**Solución**', '', '```bash');
  for (const step of WALKTHROUGH[i]) {
    const s = typeof step === 'string' ? { cmd: step } : step;
    let line = s.cmd;
    if (s.answers?.length) line += `        # contraseña: ${s.answers.join(', ')}`;
    lines.push(line);
    if (s.keys) lines.push(`#   dentro de vim teclear: ${s.keys}`);
  }
  lines.push('```', '');
});

const target = fileURLToPath(new URL('../docs/SOLUCIONES.md', import.meta.url));
writeFileSync(target, `${lines.join('\n')}\n`);
console.log(`✔ Escrito ${target}`);
