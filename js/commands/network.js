/**
 * Comandos de red: ssh, scp, ping, nmap, ip.
 * @module commands/network
 */
import { command, getopts, errMessage, sleep, byteLength } from './util.js';
import { authenticate } from './system.js';
import { normalize, basename, join } from '../core/path.js';
import { style } from '../core/ansi.js';

const ssh = command({
  name: 'ssh',
  category: 'red',
  summary: 'abre una sesión remota en otra máquina',
  usage: 'ssh [usuario@]host',
  description: [
    'Secure SHell: te conecta a otra máquina para trabajar en su terminal.',
    'El host puede ser un nombre (si figura en /etc/hosts) o una IP.',
    'Te va a pedir la contraseña del usuario remoto (no se ve mientras escribís).',
    'Para volver a tu máquina: exit',
  ],
  examples: ['ssh guardian@faro', 'ssh intruso@10.0.0.66', 'exit'],
  async run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'p:l:vqtTA');
    if (!operands.length) {
      ctx.error('usage: ssh [-l login_name] [-p port] [user@]hostname');
      return 255;
    }
    const target = operands[0];
    let user = flags.l || ctx.user;
    let host = target;
    const at = target.lastIndexOf('@');
    if (at >= 0) {
      user = target.slice(0, at);
      host = target.slice(at + 1);
    }
    const machine = ctx.world.resolveHost(host);
    if (!machine) {
      ctx.error(`ssh: Could not resolve hostname ${host}: Name or service not known`);
      return 255;
    }
    const port = flags.p ? String(flags.p) : '22';
    if (!machine.ports[port]) {
      ctx.error(`ssh: connect to host ${host} port ${port}: Connection refused`);
      return 255;
    }
    await sleep(ctx, 250);
    if (!ctx.world.gateOpen(machine)) {
      ctx.error(`ssh: connect to host ${host} port ${port}: Connection timed out`);
      return 255;
    }
    const ok = await authenticate(ctx, machine, user, `${user}@${host}'s password: `);
    if (!ok) {
      ctx.error(`${user}@${host}: Permission denied (publickey,password).`);
      return 255;
    }
    ctx.world.login(machine.hostname, user);
    ctx.print(`Welcome to ${machine.os} (GNU/Linux 6.8.0 x86_64)`);
    if (machine.motd) ctx.print(`\n${machine.motd}`);
    ctx.print(style.gray(`\n(Estás en ${machine.hostname} como ${user}. Escribí exit para volver.)`));
    return 0;
  },
});

/** Interpreta `[user@]host:ruta`. */
function parseEndpoint(spec) {
  const m = /^(?:([^@:/]+)@)?([^:/]+):(.*)$/.exec(spec);
  if (!m) return { remote: false, path: spec, raw: spec };
  return { remote: true, user: m[1], host: m[2], path: m[3], raw: spec };
}

const scp = command({
  name: 'scp',
  category: 'red',
  summary: 'copia archivos entre máquinas por SSH',
  usage: 'scp [-r] origen... destino      (un extremo puede ser usuario@host:ruta)',
  description: [
    'Secure CoPy: como cp, pero entre máquinas. Uno de los lados es remoto: usuario@host:ruta',
    'Si la ruta remota es relativa (o vacía), parte del home del usuario remoto.',
    '',
    'Descargar (remoto → local):  scp guardian@faro:fragmento_1.txt ~/expedicion/',
    'Subir     (local → remoto):  scp archivo.txt cartero@archivo:/srv/buzon/',
    '-r  copia directorios completos.',
  ],
  examples: ['scp guardian@faro:fragmento_1.txt .', 'scp notas.txt recluta@base:expedicion/', 'scp -r carpeta usuario@host:'],
  async run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'rpqvCP:');
    if (operands.length < 2) {
      ctx.error('usage: scp [-r] source ... target');
      return 1;
    }
    const specs = operands.map(parseEndpoint);
    const dst = specs[specs.length - 1];
    const srcs = specs.slice(0, -1);
    if (dst.remote && srcs.some((s) => s.remote)) {
      ctx.error('scp: la copia remoto → remoto no está soportada en ShellQuest. Pasá por tu máquina.');
      return 1;
    }

    const auth = new Map();
    const endpoint = async (spec) => {
      if (!spec.remote) {
        return { machine: ctx.world.machine, user: ctx.user, path: ctx.resolve(spec.path || '.'), label: spec.raw };
      }
      const machine = ctx.world.resolveHost(spec.host);
      if (!machine) {
        ctx.error(`ssh: Could not resolve hostname ${spec.host}: Name or service not known`);
        return null;
      }
      if (!machine.ports['22']) {
        ctx.error(`ssh: connect to host ${spec.host} port 22: Connection refused`);
        return null;
      }
      if (!ctx.world.gateOpen(machine)) {
        ctx.error(`ssh: connect to host ${spec.host} port 22: Connection timed out`);
        return null;
      }
      const user = spec.user || ctx.user;
      const key = `${user}@${machine.hostname}`;
      if (!auth.has(key)) {
        const ok = await authenticate(ctx, machine, user, `${user}@${spec.host}'s password: `);
        auth.set(key, ok);
        if (!ok) ctx.error(`${user}@${spec.host}: Permission denied (publickey,password).`);
      }
      if (!auth.get(key)) return null;
      const home = machine.users[user]?.home ?? '/';
      let p = spec.path;
      if (!p || p === '~') p = home;
      else if (p.startsWith('~/')) p = home + p.slice(1);
      else if (!p.startsWith('/')) p = `${home}/${p}`;
      return { machine, user, path: normalize(p), label: spec.raw };
    };

    let code = 0;
    for (const s of srcs) {
      const src = await endpoint(s);
      if (!src) return 1;
      const dest = await endpoint(dst);
      if (!dest) return 1;
      let node;
      try {
        node = src.machine.fs.stat(src.path, src.user);
        if (node.type === 'dir' && !flags.r) {
          ctx.error(`scp: ${s.path || src.path}: not a regular file`);
          code = 1;
          continue;
        }
        const exported = src.machine.fs.exportNode(src.path, src.user);
        const destNode = dest.machine.fs.get(dest.path);
        const finalPath = destNode?.type === 'dir' ? join(dest.path, basename(src.path)) : dest.path;
        dest.machine.fs.importNode(finalPath, exported, dest.user);
        if (node.type === 'file') ctx.world.markRead(src.machine.hostname, src.path);
      } catch (e) {
        const where = node ? dst.raw : s.raw;
        ctx.error(`scp: ${where}: ${errMessage(e)}`);
        code = 1;
        continue;
      }
      const size = node.type === 'file' ? byteLength(node.content) : 4096;
      await sleep(ctx, 300);
      ctx.print(`${basename(src.path).padEnd(32)} 100%  ${String(size).padStart(5)}     ${(size / 1024 / 0.3).toFixed(1)}KB/s   00:00`);
    }
    return code;
  },
});

const ping = command({
  name: 'ping',
  category: 'red',
  summary: 'comprueba si una máquina responde',
  usage: 'ping [-c N] host',
  description: ['Envía paquetes ICMP y espera respuesta. Si no responde, puede estar apagada o detrás de un firewall.'],
  examples: ['ping faro', 'ping -c 2 10.0.0.23'],
  async run(ctx) {
    const { flags, operands } = getopts(ctx.args, 'c:qW:i:');
    const host = operands[0];
    if (!host) {
      ctx.error('ping: usage error: Destination address required');
      return 1;
    }
    const machine = ctx.world.resolveHost(host);
    if (!machine) {
      ctx.error(`ping: ${host}: Name or service not known`);
      return 2;
    }
    const count = Math.min(Number(flags.c ?? 4) || 4, 10);
    const up = ctx.world.gateOpen(machine);
    ctx.print(`PING ${host} (${machine.ip}) 56(84) bytes of data.`);
    const times = [];
    for (let i = 1; i <= count; i++) {
      await sleep(ctx, 220);
      if (up) {
        const t = (0.3 + ((i * 37 + machine.ip.length * 11) % 50) / 100).toFixed(3);
        times.push(Number(t));
        ctx.print(`64 bytes from ${machine.ip}: icmp_seq=${i} ttl=64 time=${t} ms`);
      }
    }
    ctx.print('');
    ctx.print(`--- ${host} ping statistics ---`);
    const received = up ? count : 0;
    ctx.print(`${count} packets transmitted, ${received} received, ${up ? 0 : 100}% packet loss, time ${count * 1001}ms`);
    if (up) {
      const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3);
      ctx.print(`rtt min/avg/max = ${Math.min(...times).toFixed(3)}/${avg}/${Math.max(...times).toFixed(3)} ms`);
    }
    return up ? 0 : 1;
  },
});

function ipToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function matchTargets(world, spec) {
  const all = Object.values(world.machines);
  const cidr = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(spec);
  if (cidr) {
    const bits = Number(cidr[2]);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    const net = ipToInt(cidr[1]) & mask;
    return { hosts: all.filter((m) => (ipToInt(m.ip) & mask) === net), scanned: 2 ** (32 - bits) };
  }
  const range = /^(\d+\.\d+\.\d+\.)(\d+)-(\d+)$/.exec(spec);
  if (range) {
    const [, prefix, a, b] = range;
    return {
      hosts: all.filter((m) => m.ip.startsWith(prefix) && Number(m.ip.split('.')[3]) >= Number(a) && Number(m.ip.split('.')[3]) <= Number(b)),
      scanned: Number(b) - Number(a) + 1,
    };
  }
  const m = world.resolveHost(spec);
  return { hosts: m ? [m] : [], scanned: 1, unresolved: !m && !/^\d+\.\d+\.\d+\.\d+$/.test(spec) };
}

const nmap = command({
  name: 'nmap',
  category: 'red',
  summary: 'escanea máquinas y puertos de la red',
  usage: 'nmap objetivo        (IP, nombre, rango 10.0.0.1-50 o red 10.0.0.0/24)',
  description: [
    'Network MAPper: descubre qué máquinas están vivas y qué puertos (servicios) tienen abiertos.',
    'Estados de un puerto: open (abierto), closed (cerrado), filtered (un firewall lo bloquea).',
    'Escanear una red entera: nmap 10.0.0.0/24',
    '⚠ En la vida real, escaneá SOLO redes propias o con autorización por escrito.',
  ],
  examples: ['nmap 10.0.0.0/24', 'nmap faro', 'nmap 10.0.0.60-70'],
  async run(ctx) {
    const { operands } = getopts(ctx.args, 'sSVTPnvAO:p:');
    const spec = operands[0];
    if (!spec) {
      ctx.print('Nmap 7.94 ( https://nmap.org )\nUsage: nmap [Scan Type(s)] [Options] {target specification}');
      return 0;
    }
    const { hosts, scanned, unresolved } = matchTargets(ctx.world, spec);
    ctx.print(`Starting Nmap 7.94 ( https://nmap.org ) at ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
    if (unresolved) {
      ctx.print(`Failed to resolve "${spec}".`);
      ctx.print('WARNING: No targets were specified, so 0 hosts scanned.');
      return 0;
    }
    await sleep(ctx, 600);
    const sorted = [...hosts].sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip));
    for (const m of sorted) {
      const name = ctx.world.knownName(m);
      const open = ctx.world.gateOpen(m);
      ctx.print(`Nmap scan report for ${name ? `${name} (${m.ip})` : m.ip}`);
      ctx.print(`Host is up (0.00${(ipToInt(m.ip) % 90) + 10}s latency).`);
      ctx.print('PORT     STATE    SERVICE');
      for (const [port, service] of Object.entries(m.ports)) {
        const state = open ? 'open' : 'filtered';
        const line = `${`${port}/tcp`.padEnd(8)} ${state.padEnd(8)} ${service}`;
        ctx.print(ctx.isTTY ? (open ? style.green(line) : style.yellow(line)) : line);
      }
      ctx.print('');
      await sleep(ctx, 120);
    }
    ctx.print(`Nmap done: ${scanned} IP address${scanned === 1 ? '' : 'es'} (${sorted.length} host${sorted.length === 1 ? '' : 's'} up) scanned in ${(1.2 + sorted.length * 0.4).toFixed(2)} seconds`);
    return 0;
  },
});

const ip = command({
  name: 'ip',
  aliases: ['ifconfig'],
  category: 'red',
  summary: 'muestra tu dirección IP',
  usage: 'ip a   |   ifconfig',
  description: ['Muestra las interfaces de red y la IP de la máquina en la que estás.'],
  examples: ['ip a', 'ifconfig'],
  run(ctx) {
    const m = ctx.world.machine;
    ctx.print('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536');
    ctx.print('    inet 127.0.0.1/8 scope host lo');
    ctx.print('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500');
    ctx.print(`    inet ${style.bold(m.ip)}/24 brd 10.0.0.255 scope global eth0`);
    return 0;
  },
});

export default [ssh, scp, ping, nmap, ip];
