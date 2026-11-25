/**
 * Comandos de sistema, sesión y ayuda.
 * @module commands/system
 */
import { command, getopts, errMessage } from './util.js';
import { style } from '../core/ansi.js';
import { UsageError } from '../core/errors.js';

/** Pide contraseña hasta 3 veces. Devuelve true si es correcta. */
export async function authenticate(ctx, machine, user, prompt, { failMsg } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await ctx.io.ask(prompt, { secret: true });
    if (answer === null) return false;
    if (machine.users[user] && machine.users[user].password === answer) return true;
    if (attempt < 2) ctx.error(failMsg ?? 'Permission denied, please try again.');
  }
  return false;
}

const whoami = command({
  name: 'whoami',
  category: 'sistema',
  summary: 'muestra tu usuario actual',
  usage: 'whoami',
  description: ['Imprime con qué usuario estás trabajando. Clave cuando saltás entre máquinas y usuarios.'],
  examples: ['whoami'],
  run(ctx) { ctx.print(ctx.user); return 0; },
});

const id = command({
  name: 'id',
  category: 'sistema',
  summary: 'muestra uid y grupos',
  usage: 'id',
  description: ['Muestra el identificador numérico de tu usuario. root siempre es uid=0.'],
  examples: ['id'],
  run(ctx) {
    const uid = ctx.world.machine.users[ctx.user]?.uid ?? 1000;
    ctx.print(`uid=${uid}(${ctx.user}) gid=${uid}(${ctx.user}) groups=${uid}(${ctx.user})`);
    return 0;
  },
});

const hostname = command({
  name: 'hostname',
  category: 'sistema',
  summary: 'muestra el nombre de la máquina',
  usage: 'hostname [-I]',
  description: ['Imprime el nombre de la máquina en la que estás. -I muestra su IP.'],
  examples: ['hostname', 'hostname -I'],
  run(ctx) {
    const { flags } = getopts(ctx.args, 'Ii');
    ctx.print(flags.I || flags.i ? ctx.world.machine.ip : ctx.host);
    return 0;
  },
});

const uname = command({
  name: 'uname',
  category: 'sistema',
  summary: 'información del sistema',
  usage: 'uname [-a]',
  description: ['Muestra el sistema operativo. -a muestra todo.'],
  examples: ['uname -a'],
  run(ctx) {
    const { flags } = getopts(ctx.args, 'asnrmo');
    ctx.print(flags.a ? `Linux ${ctx.host} 6.8.0-shellquest #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux` : 'Linux');
    return 0;
  },
});

const date = command({
  name: 'date',
  category: 'sistema',
  summary: 'muestra la fecha y hora',
  usage: 'date',
  description: ['Imprime la fecha y hora actuales.'],
  examples: ['date'],
  run(ctx) { ctx.print(new Date().toString().replace(/ GMT.*/, '')); return 0; },
});

const clear = command({
  name: 'clear',
  aliases: ['reset'],
  category: 'sistema',
  summary: 'limpia la pantalla',
  usage: 'clear',
  description: ['Borra la pantalla de la terminal. Atajo: Ctrl+L.'],
  examples: ['clear'],
  run(ctx) { ctx.io.clear?.(); return 0; },
});

const history = command({
  name: 'history',
  category: 'sistema',
  summary: 'muestra los comandos que escribiste',
  usage: 'history [N]',
  description: ['Lista tus comandos anteriores. Con ↑ y ↓ los recorrés; con Tab autocompletás.'],
  examples: ['history', 'history 5', 'history | grep ssh'],
  run(ctx) {
    const all = ctx.world.history;
    const n = ctx.args[0] ? Number(ctx.args[0]) : all.length;
    const start = Math.max(0, all.length - n);
    all.slice(start).forEach((c, i) => ctx.print(`${String(start + i + 1).padStart(5)}  ${c}`));
    return 0;
  },
});

const env = command({
  name: 'env',
  aliases: ['printenv'],
  category: 'sistema',
  summary: 'muestra las variables de entorno',
  usage: 'env',
  description: ['Lista las variables de entorno. Usalas con $: echo $HOME'],
  examples: ['env', 'echo $USER'],
  run(ctx) {
    const vars = ctx.shell.env();
    delete vars['?'];
    if (ctx.args[0]) {
      if (vars[ctx.args[0]] === undefined) return 1;
      ctx.print(vars[ctx.args[0]]);
      return 0;
    }
    for (const [k, v] of Object.entries(vars)) ctx.print(`${k}=${v}`);
    return 0;
  },
});

const exportCmd = command({
  name: 'export',
  category: 'sistema',
  summary: 'define variables de entorno',
  usage: 'export NOMBRE=valor',
  description: ['Crea o cambia una variable: export DESTINO=faro  →  echo $DESTINO'],
  examples: ['export IP=10.0.0.7', 'echo $IP'],
  run(ctx) {
    for (const a of ctx.args) {
      const i = a.indexOf('=');
      if (i > 0) ctx.world.session.vars[a.slice(0, i)] = a.slice(i + 1);
    }
    return 0;
  },
});

const exit = command({
  name: 'exit',
  aliases: ['logout'],
  category: 'red',
  summary: 'cierra la sesión actual (ssh o su)',
  usage: 'exit',
  description: [
    'Cierra la sesión actual y vuelve a la anterior: si entraste con ssh, volvés a tu máquina;',
    'si usaste su, volvés a tu usuario anterior.',
  ],
  examples: ['exit'],
  run(ctx) {
    if (ctx.shell.depth > 0) return Number(ctx.args[0] ?? 0);
    const closing = ctx.world.session;
    const prevHost = ctx.world.sessions[ctx.world.sessions.length - 2]?.host;
    if (!ctx.world.logout()) {
      ctx.print(style.yellow('Estás en tu barco (base): no hay ninguna sesión remota que cerrar.'));
      return 0;
    }
    ctx.print('logout');
    if (prevHost !== closing.host) ctx.print(`Connection to ${closing.host} closed.`);
    return 0;
  },
});

const su = command({
  name: 'su',
  category: 'permisos',
  summary: 'cambia de usuario (por defecto a root)',
  usage: 'su [-] [usuario]',
  description: [
    'Switch User: abre una sesión como otro usuario en la MISMA máquina. Pide la contraseña de ese usuario.',
    'Sin usuario, intenta ser root (el superusuario, que puede todo).',
    'Con - (o -l) además te lleva al home del nuevo usuario. Con exit volvés.',
  ],
  examples: ['su', 'su -', 'su guardian'],
  async run(ctx) {
    const args = ctx.args.filter((a) => a !== '-' && a !== '-l');
    const login = ctx.args.includes('-') || ctx.args.includes('-l');
    const user = args[0] ?? 'root';
    const machine = ctx.world.machine;
    if (!machine.users[user]) {
      ctx.error(`su: user ${user} does not exist or the user entry does not contain all the required fields`);
      return 1;
    }
    if (ctx.user !== 'root') {
      const ok = await authenticate(ctx, machine, user, 'Password: ', { failMsg: 'su: Authentication failure' });
      if (!ok) {
        ctx.error('su: Authentication failure');
        return 1;
      }
    }
    const cwd = login ? machine.users[user].home : ctx.cwd;
    ctx.world.login(machine.hostname, user, { cwd });
    return 0;
  },
});

const sudo = command({
  name: 'sudo',
  category: 'permisos',
  summary: 'ejecuta un comando como root (si tenés permiso)',
  usage: 'sudo comando',
  description: ['Ejecuta un comando como root, pero solo si tu usuario está en el archivo sudoers. En ShellQuest nadie lo está: usá su.'],
  examples: ['sudo ls /root'],
  async run(ctx) {
    if (ctx.user === 'root') return ctx.shell.run(ctx.args.join(' '), { record: false });
    await ctx.io.ask(`[sudo] password for ${ctx.user}: `, { secret: true });
    ctx.error(`${ctx.user} is not in the sudoers file.  This incident will be reported.`);
    return 1;
  },
});

const which = command({
  name: 'which',
  category: 'sistema',
  summary: 'indica dónde está un comando',
  usage: 'which comando',
  description: ['Muestra la ruta del ejecutable de un comando.'],
  examples: ['which ls'],
  run(ctx) {
    let code = 0;
    for (const a of ctx.args) {
      if (ctx.shell.registry.has(a)) ctx.print(`/usr/bin/${a}`);
      else code = 1;
    }
    return code;
  },
});

const bash = command({
  name: 'bash',
  aliases: ['sh'],
  category: 'permisos',
  summary: 'ejecuta un script',
  usage: 'bash script.sh',
  description: ['Ejecuta un script aunque no tenga permiso de ejecución (solo necesita lectura).'],
  examples: ['bash decodificador.sh'],
  async run(ctx) {
    if (!ctx.args.length) {
      ctx.print(style.gray('(Ya estás en bash 🙂 — para ejecutar un script: bash archivo.sh)'));
      return 0;
    }
    if (ctx.args[0] === '-c') return ctx.shell.run(ctx.args.slice(1).join(' '), { record: false });
    try {
      const path = ctx.resolve(ctx.args[0]);
      const content = ctx.fs.readFile(path, ctx.user);
      return ctx.shell.runScript(content, ctx, path);
    } catch (e) {
      ctx.error(`bash: ${ctx.args[0]}: ${errMessage(e)}`);
      return 127;
    }
  },
});

const sleepCmd = command({
  name: 'sleep',
  category: 'sistema',
  summary: 'espera N segundos',
  usage: 'sleep N',
  description: ['Pausa la ejecución (en el juego, como mucho 3 segundos).'],
  examples: ['sleep 1'],
  async run(ctx) {
    const s = Number(ctx.args[0]);
    if (Number.isNaN(s)) throw new UsageError(`invalid time interval '${ctx.args[0] ?? ''}'`);
    if (ctx.io.sleep) await ctx.io.sleep(Math.min(s, 3) * 1000);
    return 0;
  },
});

const trueCmd = command({ name: 'true', category: 'sistema', summary: 'no hace nada, con éxito', usage: 'true', description: ['Devuelve 0.'], run: () => 0 });
const falseCmd = command({ name: 'false', category: 'sistema', summary: 'no hace nada, con error', usage: 'false', description: ['Devuelve 1.'], run: () => 1 });

const CATEGORY_ORDER = ['navegación', 'archivos', 'texto', 'búsqueda', 'permisos', 'red', 'editor', 'sistema', 'juego'];

const help = command({
  name: 'help',
  aliases: ['ayuda'],
  category: 'juego',
  summary: 'lista los comandos disponibles',
  usage: 'help',
  description: ['Muestra todos los comandos agrupados por categoría.'],
  examples: ['help', 'man ls'],
  run(ctx) {
    const groups = new Map();
    const seen = new Set();
    for (const entry of ctx.shell.registry.values()) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      if (!groups.has(entry.category)) groups.set(entry.category, []);
      groups.get(entry.category).push(entry);
    }
    ctx.print(style.gold('Comandos de ShellQuest') + style.gray('  —  man <comando> para ver el manual de cada uno'));
    for (const cat of CATEGORY_ORDER) {
      const entries = groups.get(cat);
      if (!entries) continue;
      ctx.print('');
      ctx.print(style.cyan(cat.toUpperCase()));
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const names = [e.name, ...e.aliases].join(', ');
        ctx.print(`  ${style.bold(names.padEnd(16))} ${e.summary}`);
      }
    }
    ctx.print('');
    ctx.print(style.gray('Operadores: | (tubería)  > (sobrescribir)  >> (agregar)  < (entrada)  && (si funcionó)  ; (secuencia)'));
    ctx.print(style.gray('Atajos: ↑↓ historial · Tab autocompletar · Ctrl+L limpiar · Ctrl+C cancelar'));
    return 0;
  },
});

const man = command({
  name: 'man',
  category: 'juego',
  summary: 'muestra el manual de un comando',
  usage: 'man comando',
  description: ['Muestra la página de manual (en español) de un comando, con ejemplos.'],
  examples: ['man ls', 'man vim', 'man scp'],
  run(ctx) {
    const name = ctx.args[0];
    if (!name) {
      ctx.print('What manual page do you want?\nFor example, try \'man ls\'.');
      return 1;
    }
    const e = ctx.shell.registry.get(name);
    if (!e) {
      ctx.error(`No manual entry for ${name}`);
      return 16;
    }
    const indent = (s) => `    ${s}`;
    ctx.print(style.bold(`${e.name.toUpperCase()}(1)`) + style.gray('                 Manual de ShellQuest'));
    ctx.print('');
    ctx.print(style.bold('NOMBRE'));
    ctx.print(indent(`${[e.name, ...e.aliases].join(', ')} — ${e.summary}`));
    ctx.print('');
    ctx.print(style.bold('USO'));
    ctx.print(indent(style.green(e.usage)));
    ctx.print('');
    ctx.print(style.bold('DESCRIPCIÓN'));
    for (const line of e.description) ctx.print(indent(line));
    if (e.examples.length) {
      ctx.print('');
      ctx.print(style.bold('EJEMPLOS'));
      for (const ex of e.examples) ctx.print(indent(style.cyan(`$ ${ex}`)));
    }
    return 0;
  },
});

export default [whoami, id, hostname, uname, date, clear, history, env, exportCmd, exit, su, sudo, which, bash, sleepCmd, trueCmd, falseCmd, help, man];
