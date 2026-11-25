# Cómo contribuir

¡Gracias por querer mejorar ShellQuest! 🏴‍☠️

## Entorno

```bash
git clone https://github.com/Lobis0n/shellquest.git
cd shellquest
npm test                     # Node 18+; no hay dependencias
python3 -m http.server 8080  # o: npm start
```

## Agregar un comando

1. Elegí el módulo de `js/commands/` que corresponda (o creá uno nuevo y registralo en `js/commands/index.js`).
2. Definilo con `command({...})` completando `summary`, `usage`, `description` y `examples`: esa información alimenta `man` y `help`.
3. Imitá la salida y los mensajes de error de GNU/Linux.
4. Agregá un test en `tests/shell.test.js`.

## Agregar o modificar un nivel

1. Editá `js/game/levels.js`. Los objetivos deben verificarse **sobre el estado del mundo** (archivos, sesiones, lecturas), no sobre el texto del comando: así se acepta cualquier solución válida.
2. El `setup()` solo debe **agregar** recursos y tiene que ser idempotente.
3. Agregá la solución en `tests/fixtures/walkthrough.js`.
4. `npm test` (verifica que el nivel no arranque resuelto y que se pueda completar) y `npm run docs:solutions`.

## Estilo

- JavaScript moderno (ES2022), módulos ES, sin dependencias.
- 2 espacios, comillas simples, punto y coma (ver `.editorconfig`).
- Comentarios y textos del juego en español; los mensajes de los comandos, en inglés como en Linux.

## Commits

Mensajes cortos en imperativo, por ejemplo: `Agrega comando sed`, `Corrige cw al final de línea`.
