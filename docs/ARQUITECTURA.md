# Arquitectura de ShellQuest

ShellQuest está dividido en capas. Las de abajo **no conocen el DOM**, por eso se pueden testear con `node --test` y reutilizar.

```
┌──────────────────────────────────────────────────────────┐
│  ui/        Terminal · VimView · Sidebar · completion    │  ← DOM
├──────────────────────────────────────────────────────────┤
│  main.js    conecta Game + Shell + UI y escucha eventos  │
├──────────────────────────────────────────────────────────┤
│  game/      Game (progreso, guardado) · levels · content │
├──────────────────────────────────────────────────────────┤
│  commands/  ls, grep, ssh, vim...  (registro de comandos)│
├──────────────────────────────────────────────────────────┤
│  core/      parser · shell · world · filesystem          │  ← sin DOM
│  editor/    vim-engine                                   │
└──────────────────────────────────────────────────────────┘
```

## core/

| Módulo | Responsabilidad |
|--------|-----------------|
| `filesystem.js` | Árbol de nodos `{type, owner, mode, mtime, content|children}` serializable a JSON. Aplica permisos `rwx` (dueño / otros) y genera errores con los mensajes de GNU (`No such file or directory`, `Permission denied`...). |
| `world.js` | Conjunto de máquinas (hostname, IP, puertos, usuarios, FS) y la **pila de sesiones**: cada `ssh` o `su` apila una sesión y `exit` la desapila. También registra qué archivos se leyeron/editaron (los niveles lo usan) y las "compuertas" de firewall (`registerGate`). |
| `parser.js` | Tokenizador (comillas, escapes, `$VAR`, `~`, comodines) y parser a lista de pipelines con operadores `; && ||` y redirecciones. |
| `shell.js` | Ejecuta la lista: pipelines (la salida de un comando es el `stdin` del siguiente), redirecciones (truncado previo como en bash), expansión de globs, asignaciones `VAR=x`, ejecución de scripts y `command not found`. |

### Contrato de un comando

```js
command({
  name: 'grep',
  aliases: [],
  category: 'búsqueda',          // agrupa en `help`
  summary, usage, description, examples,   // alimentan `man`
  async run(ctx) {
    ctx.args      // argumentos ya expandidos
    ctx.stdin     // string | null (tubería o <)
    ctx.print(s)  // stdout con salto de línea   · ctx.out(s) sin salto
    ctx.error(s)  // stderr
    ctx.fs / ctx.user / ctx.cwd / ctx.resolve(path) / ctx.world
    ctx.io.ask(pregunta, { secret })  // contraseñas
    ctx.isTTY     // false si la salida va a una tubería o archivo (sin colores)
    return 0;     // código de salida
  },
})
```

## editor/vim-engine.js

Máquina de estados pura: `engine.key('dd')` → modifica `lines`, `row`, `col`, `mode`. `engine.feed('iHola<Esc>:wq<CR>')` permite escribir tests y soluciones reproducibles. La vista (`ui/vim-view.js`) solo dibuja el estado y traduce eventos de teclado.

## game/

- `world-setup.js` crea la red base: `base`, `faro`, `archivo`, `boveda` (detrás de firewall) y `boya` (señuelo).
- `levels.js` define los 20 niveles. **El mundo del nivel N = mundo base + `setup()` de los niveles 1..N**, así cualquier nivel se puede reiniciar o rejugar desde cero.
- `content.js` genera archivos grandes con un PRNG con semilla fija (`rng.js`): siempre son idénticos, por lo que las soluciones son estables.
- `game.js` evalúa los objetivos después de cada comando, avanza de nivel, guarda en `localStorage` y emite eventos (`levelcomplete`, `victory`, `progress`, `worldchange`).

## Flujo de un comando

```
Enter en la terminal
  → Terminal.submit()
  → Shell.run(línea)        tokenize → parse → pipelines → comandos
  → Game.evaluate()         ¿se cumplen todos los objetivos?
      ├─ no: emite 'progress' (el panel marca ✔ en vivo)
      └─ sí: setup() del siguiente nivel, emite 'levelcomplete'
  → Game.save()             localStorage
```

## Decisiones

- **Vanilla JS + módulos ES**: cero dependencias, carga directa en GitHub Pages.
- **Mensajes de error en inglés, textos del juego en español**: así el jugador reconoce los errores reales de Linux.
- **Determinismo**: nada aleatorio en tiempo de juego; los tests juegan la partida completa.
