<div align="center">

# ⚓ ShellQuest

### El tesoro de la Capitana Root

**Un juego de navegador para aprender Bash, Vim y fundamentos de hacking ético, en forma de búsqueda del tesoro de 20 niveles.**

[![CI](https://github.com/Lobis0n/shellquest/actions/workflows/ci.yml/badge.svg)](https://github.com/Lobis0n/shellquest/actions/workflows/ci.yml)
![HTML5](https://img.shields.io/badge/HTML5-vanilla-e34f26)
![CSS3](https://img.shields.io/badge/CSS3-vanilla-1572b6)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022%20modules-f7df1e)
![Sin dependencias](https://img.shields.io/badge/dependencias-0-success)
![Licencia MIT](https://img.shields.io/badge/licencia-MIT-blue)

</div>

---

## 🎮 ¿De qué se trata?

La Capitana Root escondió su tesoro en algún rincón de la red `10.0.0.0/24`. Empezás como un recluta en tu barco (la máquina `base`) y, comando a comando, vas a navegar directorios, crear y editar archivos con **Vim**, procesar registros con **tuberías**, decodificar transmisiones, saltar entre máquinas con **SSH**, exfiltrar archivos con **SCP**, escanear la red con **nmap** y escalar privilegios hasta **root** para reconstruir el tesoro.

Todo corre **100 % en el navegador**: un sistema de archivos virtual con permisos, un intérprete de comandos tipo Bash, un editor Vim funcional y una red simulada de cinco máquinas. Nada sale de la pestaña.

## ✨ Características

- **Shell realista**: tuberías `|`, redirecciones `>` `>>` `<` `2>/dev/null`, `&&` `||` `;`, comillas, variables (`$HOME`, `$USER`), comodines `*` `?` `[]`, historial (↑ ↓) y autocompletado con **Tab**.
- **+50 comandos**: `ls cd pwd cat echo mkdir touch rm rmdir cp mv chmod find tree file grep head tail wc sort uniq cut tr rev base64 diff ssh scp ping nmap ip su sudo whoami id history man help`…
- **Vim de verdad (simulado)**: modos normal/insertar/comando, `hjkl`, `w b e`, `gg G`, `dd yy p`, `dw cw`, conteos (`3dd`), `u` / `Ctrl+r`, búsqueda `/ n N`, `:%s///g`, `:set nu`, `:wq :q!`, `ZZ`.
- **Permisos UNIX**: lectura/escritura/ejecución por dueño y otros, `chmod` octal y simbólico, `su`, directorios protegidos.
- **Red simulada**: `/etc/hosts`, SSH con contraseña, SCP en ambos sentidos, firewall, nmap con puertos `open`/`filtered`.
- **`man` en español** para cada comando, con ejemplos.
- **Progreso guardado** en `localStorage`, mapa de 20 niveles, objetivos que se marcan en vivo y pistas progresivas.
- **Accesible y responsive**, sin frameworks ni dependencias.

## 🗺️ Los 20 niveles

| # | Nivel | Aprendés |
|---|-------|----------|
| 1 | Despertar en cubierta | `pwd`, `ls`, `cat` |
| 2 | Bolsillos ocultos | `cd`, rutas, archivos ocultos `ls -a` |
| 3 | Montar el campamento | `mkdir`, `touch`, `echo`, redirección `>` |
| 4 | Provisiones | `cp`, `mv`, renombrar |
| 5 | Limpiar la cubierta | `rm`, `rm -r`, `rmdir`, comodines |
| 6 | El juramento (Vim I) | modos de Vim, `i`, `Esc`, `:wq`, `:q!` |
| 7 | Coordenadas corruptas (Vim II) | `dd`, `x`, `/buscar`, `n`, `u` |
| 8 | La bitácora interminable | `head`, `tail`, `wc -l` |
| 9 | Aguja en el pajar | `grep -r -i -n` |
| 10 | El laberinto | `find -name -type` |
| 11 | Rastro de visitas | tuberías, `cut`, `sort`, `uniq -c` |
| 12 | Herramientas oxidadas | `ls -l`, `chmod +x`, scripts |
| 13 | Mensaje cifrado | Base64 |
| 14 | Rumbo al faro | `ssh`, `whoami`, `hostname`, `exit` |
| 15 | Botín del faro | `scp` remoto → local |
| 16 | Correo para el archivista | `scp` local → remoto |
| 17 | La isla que no está en el mapa | `nmap`, `/etc/hosts`, reconocimiento |
| 18 | Abrir el túnel (Vim III) | `:%s/viejo/nuevo/g`, regex `^` |
| 19 | Dentro de la bóveda | `find /`, `2>/dev/null`, ROT13 con `tr`, `su` |
| 20 | El tesoro de la Capitana Root | `cat a b c > d`, orden de piezas, `scp` final |

> ¿Trabado? Dentro del juego: `mision`, `pista`, `man <comando>`. Las soluciones completas están en [`docs/SOLUCIONES.md`](docs/SOLUCIONES.md) (spoilers).

## 🚀 Cómo jugar

El juego usa **módulos ES**, así que hay que servirlo por HTTP (abrir `index.html` con doble clic no funciona por las políticas CORS del navegador).

```bash
git clone https://github.com/Lobis0n/shellquest.git
cd shellquest

# Opción 1: Python (viene instalado en casi todos lados)
python3 -m http.server 8080

# Opción 2: Node
npm start
```

Abrí <http://localhost:8080>.

### Publicarlo en GitHub Pages

El repositorio incluye el workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml). En tu repo: **Settings → Pages → Source: GitHub Actions**. Cada push a `main` publica el juego en `https://Lobis0n.github.io/shellquest/`.

## 🧪 Tests

Requiere Node.js 18 o superior. No hay dependencias que instalar.

```bash
npm test
```

La suite incluye una **partida completa automatizada**: juega los 20 niveles con la solución de [`tests/fixtures/walkthrough.js`](tests/fixtures/walkthrough.js) (incluyendo las teclas de Vim y las contraseñas de SSH) y verifica que se llegue al tesoro. También juega cada nivel por separado desde un mundo reconstruido, y prueba el parser, el shell y el motor de Vim.

## 🏗️ Estructura del proyecto

```
shellquest/
├── index.html                 # Interfaz
├── css/                       # base · layout · terminal · vim · panel
├── js/
│   ├── main.js                # Punto de entrada: conecta juego, shell y UI
│   ├── core/                  # Motor sin DOM (testeable en Node)
│   │   ├── filesystem.js      #   Sistema de archivos virtual con permisos
│   │   ├── parser.js          #   Tokenizador y parser de Bash
│   │   ├── shell.js           #   Intérprete: pipelines, redirecciones, scripts
│   │   ├── world.js           #   Máquinas, sesiones ssh/su, firewall
│   │   ├── path.js · ansi.js · errors.js
│   ├── commands/              # Un módulo por familia de comandos
│   ├── editor/vim-engine.js   # Motor de Vim (sin DOM)
│   ├── game/                  # Niveles, contenido, progreso y guardado
│   └── ui/                    # Terminal, vista de Vim, panel, autocompletado
├── tests/                     # node:test — unitarios + partida completa
├── scripts/                   # Generador de docs/SOLUCIONES.md
└── docs/                      # Arquitectura, cómo crear niveles, soluciones
```

Más detalles en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## 🧩 Crear tus propios niveles

Un nivel es un objeto con historia, objetivos verificables y un `setup` que agrega archivos al mundo:

```js
{
  id: 'mi-nivel',
  chapter: 'Capítulo VI · Extras',
  title: 'Mi nivel',
  story: ['Texto de la historia. Admite <code>código</code>.'],
  objectives: [
    { text: 'Creá <code>~/hola.txt</code>', done: (w) => w.read('base', '/home/recluta/hola.txt') !== null },
  ],
  commands: ['touch'],
  hints: ['Pista 1', 'Pista 2', 'Solución'],
  setup(w) { w.seed('base', '/home/recluta/LEEME.txt', '¡Hola!\n', { owner: 'recluta' }); },
}
```

Agregalo a `js/game/levels.js`, sumá su solución en `tests/fixtures/walkthrough.js` y corré `npm test`. Ver [`CONTRIBUTING.md`](CONTRIBUTING.md).

## ⚖️ Uso ético

ShellQuest enseña técnicas usadas en pentesting (reconocimiento, movimiento lateral, escalada de privilegios) **dentro de una red ficticia**. En el mundo real, aplicalas **solo** sobre sistemas propios o con autorización expresa y por escrito. Para seguir practicando de forma legal: [OverTheWire Bandit](https://overthewire.org/wargames/bandit/), [Hack The Box](https://www.hackthebox.com/), [TryHackMe](https://tryhackme.com/) y `vimtutor`.

## 📄 Licencia

[MIT](LICENSE)
