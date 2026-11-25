/**
 * Construye el Archipiélago: la red 10.0.0.0/24 con sus máquinas.
 *
 *   base     10.0.0.2   tu barco (recluta)
 *   faro     10.0.0.7   el guardián
 *   archivo  10.0.0.23  el archivista
 *   boveda   10.0.0.66  la bóveda de la Capitana Root (no figura en /etc/hosts)
 *   boya     10.0.0.99  señuelo: boya meteorológica
 * @module game/world-setup
 */
import { World, registerGate } from '../core/world.js';

export const HOME = '/home/recluta';
export const PASSWORDS = Object.freeze({
  recluta: 'brujula',
  guardian: 'luz-en-la-niebla',
  cartero: 'sobre-lacrado',
  intruso: 'puerta-trasera',
  bovedaRoot: 'corona-de-hierro',
});

export const BOVEDA_IP = '10.0.0.66';

/** Regla del firewall: la bóveda solo es accesible con el túnel configurado. */
export function tunnelReady(world) {
  const conf = world.read('base', `${HOME}/herramientas/tunel.conf`);
  if (!conf) return false;
  const ipCount = conf.split(BOVEDA_IP).length - 1;
  return !conf.includes('IP_BOVEDA') && ipCount >= 6 && /^\s*activo\s*=\s*s[ií]\s*$/m.test(conf);
}
registerGate('tunel', tunnelReady);

const BINARIES = [
  'ls', 'cd', 'pwd', 'cat', 'echo', 'mkdir', 'touch', 'rm', 'rmdir', 'cp', 'mv', 'chmod', 'find',
  'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr', 'base64', 'ssh', 'scp', 'ping', 'nmap',
  'vim', 'su', 'whoami', 'hostname', 'bash',
];

function hostsFile(extra = '') {
  return [
    '127.0.0.1   localhost',
    '10.0.0.2    base',
    '10.0.0.7    faro',
    '10.0.0.23   archivo',
    extra,
  ].filter(Boolean).join('\n') + '\n';
}

function baseSystem(world, host, users) {
  const fs = world.machines[host].fs;
  fs.seedDir('/home');
  fs.seedDir('/tmp', { mode: 0o777 });
  fs.seedDir('/var/log');
  fs.seedDir('/root', { mode: 0o700 });
  fs.seedDir('/usr/bin');
  for (const bin of BINARIES) fs.seed(`/usr/bin/${bin}`, '\x7fELF binario', { mode: 0o755 });
  fs.seed('/etc/hosts', hostsFile());
  fs.seed('/etc/hostname', `${host}\n`);
  fs.seed('/etc/passwd', Object.entries(world.machines[host].users)
    .map(([u, d]) => `${u}:x:${d.uid}:${d.uid}::${d.home}:/bin/bash`).join('\n') + '\n');
  for (const [user, data] of Object.entries(users)) {
    if (user === 'root') continue;
    fs.seedDir(data.home, { owner: user, mode: 0o755 });
    fs.seed(`${data.home}/.bashrc`, "# ~/.bashrc\nalias ll='ls -la'\nexport PS1='\\u@\\h:\\w\\$ '\n", { owner: user });
  }
}

/** Mundo inicial, antes de cualquier nivel. */
export function createBaseWorld() {
  const world = new World();

  const machines = [
    {
      hostname: 'base',
      ip: '10.0.0.2',
      ports: { 22: 'ssh' },
      users: {
        root: { password: 'nunca-la-sabras', home: '/root', uid: 0 },
        recluta: { password: PASSWORDS.recluta, home: HOME, uid: 1000 },
      },
      motd: '⚓ Bienvenido de vuelta al barco de la Hermandad.',
    },
    {
      hostname: 'faro',
      ip: '10.0.0.7',
      ports: { 22: 'ssh', 80: 'http' },
      users: {
        root: { password: 'faro-root-2019', home: '/root', uid: 0 },
        guardian: { password: PASSWORDS.guardian, home: '/home/guardian', uid: 1001 },
      },
      motd: '🗼 FARO DEL ARCHIPIÉLAGO — La luz nunca se apaga.\nUso exclusivo del guardián.',
    },
    {
      hostname: 'archivo',
      ip: '10.0.0.23',
      ports: { 21: 'ftp', 22: 'ssh' },
      users: {
        root: { password: 'archivo-root-77', home: '/root', uid: 0 },
        cartero: { password: PASSWORDS.cartero, home: '/home/cartero', uid: 1002 },
      },
      motd: '📜 ARCHIVO GENERAL — Todo lo escrito, aquí queda.',
    },
    {
      hostname: 'boveda',
      ip: BOVEDA_IP,
      ports: { 22: 'ssh', 443: 'https' },
      gate: 'tunel',
      users: {
        root: { password: PASSWORDS.bovedaRoot, home: '/root', uid: 0 },
        intruso: { password: PASSWORDS.intruso, home: '/home/intruso', uid: 1003 },
      },
      motd: '🔒 BÓVEDA — Propiedad de la Capitana Root.\nToda actividad es registrada. Los curiosos serán arrojados por la borda.',
    },
    {
      hostname: 'boya',
      ip: '10.0.0.99',
      ports: { 80: 'http' },
      users: { root: { password: 'boya', home: '/root', uid: 0 } },
    },
  ];

  for (const def of machines) {
    world.addMachine(def);
    baseSystem(world, def.hostname, def.users);
  }

  world.seed('base', '/etc/motd', 'Barco de la Hermandad del Prompt\n');
  world.login('base', 'recluta');
  return world;
}
