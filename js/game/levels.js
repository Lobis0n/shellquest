/**
 * Los 20 niveles de ShellQuest.
 *
 * Cada nivel define:
 *  - setup(world): agrega al mundo los recursos que el nivel necesita.
 *    El mundo del nivel N = mundo base + setup(1..N), así se puede
 *    reconstruir cualquier nivel desde cero.
 *  - objectives: condiciones verificables sobre el estado del mundo.
 *    El nivel se supera cuando TODAS se cumplen.
 * @module game/levels
 */
import { HOME, BOVEDA_IP, tunnelReady } from './world-setup.js';
import {
  LEEME, bitacora, puertos, laberinto, accesos, DECODIFICADOR, TRANSMISION, TUNEL_CONF, CHEST, PIECE_MARKERS,
} from './content.js';

const B = 'base';
const EXP = `${HOME}/expedicion`;
const mine = { owner: 'recluta', dirOwner: 'recluta' };

// ---------------------------------------------------------------- helpers
const loose = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hasLoose = (text, needle) => text != null && loose(text).includes(loose(needle));
const exists = (w, host, path) => w.machines[host].fs.exists(path);
const isDir = (w, host, path) => w.machines[host].fs.isDir(path);
const ipsIn = (text) => String(text ?? '').match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [];
const onlyIp = (text, ip) => {
  const found = ipsIn(text);
  return found.length > 0 && found.every((x) => x === ip);
};
const ensureExpedition = (w) => w.seedDir(B, EXP, { owner: 'recluta' });
const visited = (w, host, user) => w.sessions.some((s) => s.host === host && (!user || s.user === user));
const btoa64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).match(/.{1,76}/g).join('\n') + '\n';
};

/**
 * @typedef {Object} Level
 * @property {string} id
 * @property {string} title
 * @property {string} chapter
 * @property {string[]} story      párrafos (admiten <code>)
 * @property {{text:string, done:(w:any)=>boolean}[]} objectives
 * @property {string[]} commands   comandos que introduce
 * @property {string[]} hints
 * @property {(w:any)=>void} setup
 */

/** @type {Level[]} */
export const LEVELS = [
  // ===================================================== CAPÍTULO I
  {
    id: 'despertar',
    chapter: 'Capítulo I · El barco',
    title: 'Despertar en cubierta',
    story: [
      'Te despertás en la cubierta de un barco. Una pantalla verde parpadea: es una <b>terminal</b>. Todo lo que hagas acá será escribiendo comandos.',
      'Primero ubicate: <code>pwd</code> te dice en qué directorio estás. <code>ls</code> lista lo que hay. <code>cat archivo</code> muestra el contenido de un archivo.',
    ],
    objectives: [
      { text: 'Leé el archivo <code>LEEME.txt</code> que está en tu directorio personal', done: (w) => w.wasRead(B, `${HOME}/LEEME.txt`) },
    ],
    commands: ['pwd', 'ls', 'cat'],
    hints: [
      'Escribí <code>ls</code> y apretá Enter para ver qué archivos hay.',
      'Los nombres distinguen mayúsculas: es <code>LEEME.txt</code>, no leeme.txt. Probá la tecla Tab para autocompletar.',
      'Solución: <code>cat LEEME.txt</code>',
    ],
    setup(w) {
      w.seed(B, `${HOME}/LEEME.txt`, LEEME, mine);
    },
  },
  {
    id: 'bolsillos',
    chapter: 'Capítulo I · El barco',
    title: 'Bolsillos ocultos',
    story: [
      'Encontrás un <code>mapa</code> lleno de carpetas. Para entrar en un directorio se usa <code>cd nombre</code>; para volver al anterior, <code>cd ..</code>; y <code>cd</code> solo te lleva a casa (~).',
      'Dicen que la Capitana escondía notas en archivos <b>ocultos</b>: en Linux, cualquier archivo que empieza con punto (.) no aparece con un simple <code>ls</code>.',
    ],
    objectives: [
      { text: 'Encontrá y leé el archivo oculto escondido en algún lugar de <code>~/mapa</code>', done: (w) => w.wasRead(B, `${HOME}/mapa/este/cueva/.nota_oculta`) },
    ],
    commands: ['cd', 'ls -a', 'cd ..'],
    hints: [
      'Entrá con <code>cd mapa</code> y explorá cada dirección: <code>ls</code>, <code>cd norte</code>, <code>cd ..</code>...',
      'El eco de la cueva sabe algo. <code>ls -a</code> muestra los archivos ocultos.',
      'Solución: <code>cd ~/mapa/este/cueva</code> y luego <code>cat .nota_oculta</code>',
    ],
    setup(w) {
      w.seed(B, `${HOME}/mapa/norte/glaciar.txt`, 'Solo hielo y viento. Aquí no hay nada.\nPista: no todo lo que existe se ve con un simple ls.\n', mine);
      w.seed(B, `${HOME}/mapa/sur/desierto.txt`, 'Arena hasta el horizonte.\nVolvé atrás con: cd ..\n', mine);
      w.seedDir(B, `${HOME}/mapa/oeste`, { owner: 'recluta' });
      w.seed(B, `${HOME}/mapa/este/cueva/eco.txt`, 'Eco... eco... ¿probaste ls -a? ...ls -a... -a...\n', mine);
      w.seed(B, `${HOME}/mapa/este/cueva/.nota_oculta`, '¡Bien hecho! Los archivos que empiezan con punto están ocultos.\nSolo "ls -a" los muestra.\n\nNota de la Capitana: "Un buen pirata siempre arma su campamento."\n', mine);
    },
  },
  {
    id: 'campamento',
    chapter: 'Capítulo I · El barco',
    title: 'Montar el campamento',
    story: [
      'Toda expedición necesita un lugar donde guardar lo que encuentra. Vas a crear tu carpeta de trabajo.',
      '<code>mkdir</code> crea directorios, <code>touch</code> crea archivos vacíos y <code>echo "texto" &gt; archivo</code> escribe texto en un archivo (el <code>&gt;</code> es una <b>redirección</b>: manda la salida a un archivo en vez de a la pantalla).',
    ],
    objectives: [
      { text: 'Creá el directorio <code>~/expedicion</code>', done: (w) => isDir(w, B, EXP) },
      { text: 'Creá un archivo vacío <code>~/expedicion/inventario.txt</code>', done: (w) => w.machines[B].fs.isFile(`${EXP}/inventario.txt`) },
      { text: 'Escribí <code>Día 1: comienza la búsqueda</code> dentro de <code>~/expedicion/diario.txt</code>', done: (w) => hasLoose(w.read(B, `${EXP}/diario.txt`), 'comienza la busqueda') },
    ],
    commands: ['mkdir', 'touch', 'echo', '>'],
    hints: [
      'Asegurate de estar en tu home: <code>cd</code>. Después: <code>mkdir expedicion</code>',
      '<code>touch expedicion/inventario.txt</code> crea el archivo vacío.',
      'Solución: <code>echo "Día 1: comienza la búsqueda" &gt; expedicion/diario.txt</code>',
    ],
    setup() {},
  },
  {
    id: 'provisiones',
    chapter: 'Capítulo I · El barco',
    title: 'Provisiones',
    story: [
      'En la <code>~/bodega</code> hay equipo útil. Hay que llevarlo a la expedición, pero con criterio:',
      '<code>cp origen destino</code> <b>copia</b> (el original queda). <code>mv origen destino</code> <b>mueve</b> (el original desaparece) y también sirve para <b>renombrar</b>.',
    ],
    objectives: [
      { text: 'Copiá <code>bodega/brujula.txt</code> a <code>~/expedicion/</code> (el original debe quedar en la bodega)', done: (w) => exists(w, B, `${HOME}/bodega/brujula.txt`) && exists(w, B, `${EXP}/brujula.txt`) },
      { text: 'Mové <code>bodega/catalejo.txt</code> a <code>~/expedicion/</code>', done: (w) => !exists(w, B, `${HOME}/bodega/catalejo.txt`) && exists(w, B, `${EXP}/catalejo.txt`) },
      { text: 'Mové y renombrá <code>bodega/mapa_rasgado.txt</code> como <code>~/expedicion/mapa.txt</code>', done: (w) => !exists(w, B, `${HOME}/bodega/mapa_rasgado.txt`) && hasLoose(w.read(B, `${EXP}/mapa.txt`), 'marca el faro') },
    ],
    commands: ['cp', 'mv'],
    hints: [
      'Si el destino es un directorio, el archivo va adentro con el mismo nombre: <code>cp bodega/brujula.txt expedicion/</code>',
      '<code>mv bodega/catalejo.txt expedicion/</code>',
      'Mover y renombrar en un paso: <code>mv bodega/mapa_rasgado.txt expedicion/mapa.txt</code>',
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed(B, `${HOME}/bodega/brujula.txt`, 'BRÚJULA\nSiempre apunta hacia el próximo secreto.\n', mine);
      w.seed(B, `${HOME}/bodega/catalejo.txt`, 'CATALEJO\nPermite ver islas lejanas... algún día.\n', mine);
      w.seed(B, `${HOME}/bodega/mapa_rasgado.txt`, 'MAPA (rasgado)\n     N\n  O  +  E     La X marca el faro.\n     S\n', mine);
      w.seed(B, `${HOME}/bodega/ron.txt`, 'Un barril de ron. Mejor dejarlo acá.\n', mine);
    },
  },
  {
    id: 'limpieza',
    chapter: 'Capítulo I · El barco',
    title: 'Limpiar la cubierta',
    story: [
      'Las ratas invadieron <code>~/cubierta</code>. Hay que limpiar antes de zarpar.',
      '<code>rm</code> borra archivos (<b>¡no hay papelera!</b>), <code>rm -r</code> borra directorios con todo su contenido y <code>rmdir</code> borra directorios vacíos. El comodín <code>*</code> coincide con cualquier texto: <code>rm *.tmp</code> borra todos los .tmp.',
      'Cuidado: si borrás la soga, vas a tener que usar <code>reiniciar</code>.',
    ],
    objectives: [
      { text: 'Borrá todos los archivos <code>.tmp</code> de <code>~/cubierta</code>', done: (w) => isDir(w, B, `${HOME}/cubierta`) && !Object.keys(w.machines[B].fs.get(`${HOME}/cubierta`).children).some((n) => n.endsWith('.tmp')) },
      { text: 'Eliminá el directorio vacío <code>barril_vacio</code> con <code>rmdir</code>', done: (w) => !exists(w, B, `${HOME}/cubierta/barril_vacio`) },
      { text: 'Eliminá <code>bodega_podrida</code> con todo su contenido', done: (w) => !exists(w, B, `${HOME}/cubierta/bodega_podrida`) },
      { text: 'Conservá <code>~/cubierta/soga.txt</code>', done: (w) => exists(w, B, `${HOME}/cubierta/soga.txt`) },
    ],
    commands: ['rm', 'rm -r', 'rmdir', '*'],
    hints: [
      'Entrá con <code>cd ~/cubierta</code> y mirá con <code>ls</code>.',
      '<code>rm *.tmp</code> borra solo los que terminan en .tmp. <code>rmdir barril_vacio</code> para el vacío.',
      'Solución: <code>rm *.tmp</code> · <code>rmdir barril_vacio</code> · <code>rm -r bodega_podrida</code>',
    ],
    setup(w) {
      for (let i = 1; i <= 7; i++) w.seed(B, `${HOME}/cubierta/ratas_0${i}.tmp`, 'squeak\n', mine);
      w.seed(B, `${HOME}/cubierta/soga.txt`, 'Una soga resistente. ¡No la tires!\n', mine);
      w.seedDir(B, `${HOME}/cubierta/barril_vacio`, { owner: 'recluta' });
      w.seed(B, `${HOME}/cubierta/bodega_podrida/pescado.txt`, 'Huele horrible.\n', mine);
      w.seed(B, `${HOME}/cubierta/bodega_podrida/queso.txt`, 'Tiene vida propia.\n', mine);
      w.seed(B, `${HOME}/cubierta/bodega_podrida/gusanos/larva.txt`, 'ewww\n', mine);
    },
  },

  // ===================================================== CAPÍTULO II
  {
    id: 'juramento',
    chapter: 'Capítulo II · El editor',
    title: 'El juramento (Vim I)',
    story: [
      'Todo miembro de la Hermandad escribe su juramento con <b>Vim</b>, el editor que está en todos los servidores del mundo.',
      'Vim tiene <b>modos</b>. Arranca en modo NORMAL (las teclas son comandos). Con <code>i</code> pasás a modo INSERTAR y escribís texto. Con <code>Esc</code> volvés a NORMAL. Ahí, <code>:wq</code> + Enter guarda y sale.',
      '¿Atascado? <code>Esc</code> y después <code>:q!</code> sale sin guardar. Tenés la chuleta en el panel lateral.',
    ],
    objectives: [
      { text: 'Con <code>vim</code>, creá <code>~/expedicion/juramento.txt</code> con el texto <code>Juro encontrar el tesoro</code>', done: (w) => w.wasEdited(B, `${EXP}/juramento.txt`) && hasLoose(w.read(B, `${EXP}/juramento.txt`), 'juro encontrar el tesoro') },
    ],
    commands: ['vim', 'i', 'Esc', ':wq', ':q!'],
    hints: [
      'Abrí el editor: <code>vim ~/expedicion/juramento.txt</code> (si no existe, se crea al guardar).',
      'Apretá <code>i</code>, escribí la frase, apretá <code>Esc</code>.',
      'Para guardar y salir escribí <code>:wq</code> y Enter. Si algo sale mal: <code>Esc</code>, <code>:q!</code> y volvé a intentar.',
    ],
    setup: ensureExpedition,
  },
  {
    id: 'coordenadas',
    chapter: 'Capítulo II · El editor',
    title: 'Coordenadas corruptas (Vim II)',
    story: [
      'Una tormenta corrompió <code>~/expedicion/coordenadas.txt</code>: tiene líneas de basura y un error de tipeo.',
      'En modo NORMAL te movés con <code>h j k l</code> (o flechas). <code>dd</code> borra la línea entera, <code>x</code> borra el carácter bajo el cursor y <code>u</code> deshace. <code>/texto</code> busca y <code>n</code> salta al siguiente.',
    ],
    objectives: [
      { text: 'Con vim, eliminá las 3 líneas que contienen <code>##BASURA##</code>', done: (w) => w.wasEdited(B, `${EXP}/coordenadas.txt`) && !String(w.read(B, `${EXP}/coordenadas.txt`)).includes('BASURA') },
      { text: 'Corregí <code>faroo</code> para que diga <code>faro</code>', done: (w) => /^DESTINO: faro\s*$/m.test(w.read(B, `${EXP}/coordenadas.txt`) ?? '') },
      { text: 'Mantené intactas las líneas de LATITUD, LONGITUD y ESTADO', done: (w) => ['LATITUD: 34.6S', 'LONGITUD: 58.4O', 'ESTADO: encendido'].every((l) => (w.read(B, `${EXP}/coordenadas.txt`) ?? '').split('\n').includes(l)) },
    ],
    commands: ['dd', 'x', 'u', '/buscar', 'n'],
    hints: [
      '<code>vim ~/expedicion/coordenadas.txt</code>. Movete con <code>j</code> hasta una línea de basura y apretá <code>dd</code>.',
      'Para encontrar la basura rápido: <code>/BASURA</code> Enter, <code>dd</code>, <code>n</code>, <code>dd</code>...',
      'Andá a la última línea con <code>G</code>, llevá el cursor a una de las "o" del final con <code>$</code> y apretá <code>x</code>. Luego <code>:wq</code>.',
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed(B, `${EXP}/coordenadas.txt`, '# Coordenadas del faro\nLATITUD: 34.6S\n##BASURA## 0x00ff 0x13 0x37\nLONGITUD: 58.4O\n##BASURA## ruido estático\n##BASURA## ?????????\nESTADO: encendido\nDESTINO: faroo\n', mine);
    },
  },
  {
    id: 'bitacora',
    chapter: 'Capítulo II · El editor',
    title: 'La bitácora interminable',
    story: [
      'La bitácora del barco (<code>~/registros/bitacora.log</code>) tiene cientos de líneas. Abrirla entera es inútil.',
      '<code>head</code> muestra el principio, <code>tail</code> el final y <code>wc -l</code> cuenta líneas. Con <code>&gt;</code> podés guardar la salida de cualquier comando en un archivo.',
    ],
    objectives: [
      { text: 'Guardá la cantidad de líneas de <code>bitacora.log</code> en <code>~/expedicion/lineas.txt</code>', done: (w) => /(^|\D)347(\D|$)/.test(w.read(B, `${EXP}/lineas.txt`) ?? '') },
      { text: 'Guardá la última línea (la clave del día) en <code>~/expedicion/clave.txt</code>', done: (w) => hasLoose(w.read(B, `${EXP}/clave.txt`), 'marea-alta') },
    ],
    commands: ['head', 'tail', 'wc -l', '>'],
    hints: [
      'Probá <code>head ~/registros/bitacora.log</code> y <code>tail -n 3 ~/registros/bitacora.log</code> para espiar.',
      '<code>wc -l ~/registros/bitacora.log</code> cuenta las líneas. Agregá <code>&gt; ~/expedicion/lineas.txt</code> al final para guardarlo.',
      'Solución: <code>wc -l ~/registros/bitacora.log &gt; ~/expedicion/lineas.txt</code> y <code>tail -n 1 ~/registros/bitacora.log &gt; ~/expedicion/clave.txt</code>',
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed(B, `${HOME}/registros/bitacora.log`, bitacora(), mine);
    },
  },
  {
    id: 'pajar',
    chapter: 'Capítulo II · El editor',
    title: 'Aguja en el pajar',
    story: [
      'En <code>~/registros/puertos/</code> hay 24 registros de puertos con miles de líneas. Alguien mencionó un <b>tesoro</b> en una taberna...',
      '<code>grep patrón archivo</code> muestra solo las líneas que contienen el patrón. <code>-r</code> busca en carpetas enteras, <code>-i</code> ignora mayúsculas y <code>-n</code> muestra el número de línea.',
    ],
    objectives: [
      { text: 'Encontrá el código mencionado junto a la palabra "tesoro" y guardalo en <code>~/expedicion/codigo.txt</code>', done: (w) => hasLoose(w.read(B, `${EXP}/codigo.txt`), 'ANCLA-7731') },
    ],
    commands: ['grep', 'grep -r', 'grep -i'],
    hints: [
      '<code>grep tesoro ~/registros/puertos/*</code> no encuentra nada... ¿Y si alguien lo escribió con mayúsculas raras?',
      '<code>grep -ri tesoro ~/registros/puertos</code>. Ojo: "tesorero" también coincide.',
      'Solución: <code>echo ANCLA-7731 &gt; ~/expedicion/codigo.txt</code>',
    ],
    setup(w) {
      ensureExpedition(w);
      for (const [name, content] of Object.entries(puertos())) w.seed(B, `${HOME}/registros/puertos/${name}`, content, mine);
    },
  },
  {
    id: 'laberinto',
    chapter: 'Capítulo II · El editor',
    title: 'El laberinto',
    story: [
      'La llave de bronce está perdida en <code>~/laberinto</code>: 4 pasillos, 12 salas, 36 rincones... y hay llaves falsas.',
      '<code>find ruta -name "patrón"</code> recorre todos los subdirectorios (incluso los ocultos). Usá comillas en el patrón para que el shell no expanda el <code>*</code> antes de tiempo.',
    ],
    objectives: [
      { text: 'Encontrá <code>llave_de_bronce.key</code> y copiala a <code>~/expedicion/</code>', done: (w) => hasLoose(w.read(B, `${EXP}/llave_de_bronce.key`), 'BR-0451') },
    ],
    commands: ['find', '-name', '-type'],
    hints: [
      '<code>find ~/laberinto -name "*.key"</code> lista todas las llaves.',
      'Fijate la extensión: .key, no .txt. Y una ruta con <code>.escondite</code> suena prometedora.',
      'Solución: <code>cp ~/laberinto/pasillo_c/sala_2/grieta/.escondite/llave_de_bronce.key ~/expedicion/</code>',
    ],
    setup(w) {
      ensureExpedition(w);
      for (const [path, content] of Object.entries(laberinto())) w.seed(B, `${HOME}/laberinto/${path}`, content, mine);
    },
  },

  // ===================================================== CAPÍTULO III
  {
    id: 'tuberias',
    chapter: 'Capítulo III · Señales',
    title: 'Rastro de visitas',
    story: [
      'Alguien se conecta a tu barco sin parar. El registro <code>~/registros/accesos.log</code> tiene cientos de conexiones de distintas IPs.',
      'La <b>tubería</b> <code>|</code> conecta comandos: la salida de uno es la entrada del siguiente. Con <code>cut</code>, <code>sort</code>, <code>uniq -c</code> y <code>head</code> podés contar cuál se repite más.',
    ],
    objectives: [
      { text: 'Averiguá qué IP aparece MÁS veces en <code>accesos.log</code> y guardá esa IP en <code>~/expedicion/objetivo.txt</code>', done: (w) => onlyIp(w.read(B, `${EXP}/objetivo.txt`), '10.0.0.7') },
    ],
    commands: ['|', 'cut', 'sort', 'uniq -c', 'sort -nr'],
    hints: [
      'Mirá el formato: <code>head -3 ~/registros/accesos.log</code>. La IP es el 3er campo si separás por espacios.',
      '<code>cut -d" " -f3 ~/registros/accesos.log | sort | uniq -c | sort -nr | head -3</code>',
      'Solución: <code>cut -d" " -f3 ~/registros/accesos.log | sort | uniq -c | sort -nr | head -1 &gt; ~/expedicion/objetivo.txt</code> (o escribí la IP con echo)',
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed(B, `${HOME}/registros/accesos.log`, accesos(), mine);
    },
  },
  {
    id: 'herramientas',
    chapter: 'Capítulo III · Señales',
    title: 'Herramientas oxidadas',
    story: [
      'En <code>~/herramientas</code> hay un decodificador de señales, pero no arranca: perdió el permiso de <b>ejecución</b>.',
      '<code>ls -l</code> muestra los permisos (<code>rwx</code> = leer, escribir, ejecutar). <code>chmod +x archivo</code> lo vuelve ejecutable y <code>./archivo</code> lo ejecuta.',
    ],
    objectives: [
      { text: 'Dale permiso de ejecución a <code>~/herramientas/decodificador.sh</code>', done: (w) => ((w.machines[B].fs.get(`${HOME}/herramientas/decodificador.sh`)?.mode ?? 0) & 0o100) !== 0 },
      { text: 'Ejecutalo para obtener <code>~/expedicion/senal.txt</code>', done: (w) => hasLoose(w.read(B, `${EXP}/senal.txt`), 'FARO') },
    ],
    commands: ['ls -l', 'chmod', './script'],
    hints: [
      '<code>cd ~/herramientas</code> y <code>ls -l</code>: fijate que no tiene la <code>x</code>.',
      '<code>chmod +x decodificador.sh</code>',
      'Solución: <code>chmod +x decodificador.sh</code> y luego <code>./decodificador.sh</code>',
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed(B, `${HOME}/herramientas/decodificador.sh`, DECODIFICADOR, { ...mine, mode: 0o644 });
      w.seed(B, `${HOME}/herramientas/LEEME`, 'Las herramientas viejas pierden su permiso de ejecución con la sal del mar.\n', mine);
      w.seed(B, `${HOME}/registros/transmision.b64`, btoa64(TRANSMISION), mine);
    },
  },
  {
    id: 'transmision',
    chapter: 'Capítulo III · Señales',
    title: 'Mensaje cifrado',
    story: [
      'Interceptaste una transmisión del faro en <code>~/registros/transmision.b64</code>. Parece un montón de letras sin sentido.',
      'Es <b>Base64</b>: una codificación (no un cifrado) muy común en hacking. <code>base64 -d</code> la revierte.',
    ],
    objectives: [
      { text: 'Decodificá la transmisión y guardá el resultado en <code>~/expedicion/transmision.txt</code>', done: (w) => hasLoose(w.read(B, `${EXP}/transmision.txt`), 'luz-en-la-niebla') },
    ],
    commands: ['base64', 'base64 -d', 'file'],
    hints: [
      '<code>cat ~/registros/transmision.b64</code>: solo letras, números, + y /. Es Base64.',
      '<code>base64 -d ~/registros/transmision.b64</code> lo muestra decodificado.',
      'Solución: <code>base64 -d ~/registros/transmision.b64 &gt; ~/expedicion/transmision.txt</code>',
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed(B, `${HOME}/registros/transmision.b64`, btoa64(TRANSMISION), mine);
    },
  },
  {
    id: 'faro',
    chapter: 'Capítulo III · Señales',
    title: 'Rumbo al faro',
    story: [
      'Tenés usuario y contraseña del guardián del faro. Es hora de dejar el barco.',
      '<code>ssh usuario@host</code> abre una sesión en otra máquina (la contraseña no se ve al escribir: es normal). <code>whoami</code> y <code>hostname</code> te dicen quién y dónde sos. <code>exit</code> te devuelve a casa.',
    ],
    objectives: [
      { text: 'Conectate por SSH al <code>faro</code> como <code>guardian</code>', done: (w) => visited(w, 'faro', 'guardian') || w.wasRead('faro', '/home/guardian/bitacora_del_faro.txt') },
      { text: 'Leé <code>bitacora_del_faro.txt</code> en el home del guardián', done: (w) => w.wasRead('faro', '/home/guardian/bitacora_del_faro.txt') },
    ],
    commands: ['ssh', 'whoami', 'hostname', 'exit'],
    hints: [
      'La contraseña está en <code>~/expedicion/transmision.txt</code>.',
      '<code>ssh guardian@faro</code> y escribí la contraseña (no se ve mientras tipeás).',
      'Una vez dentro: <code>ls</code> y <code>cat bitacora_del_faro.txt</code>',
    ],
    setup(w) {
      w.seed('faro', '/home/guardian/bitacora_del_faro.txt', `BITÁCORA DEL GUARDIÁN DEL FARO
-------------------------------
Si estás leyendo esto, sos de la Hermandad. Bienvenido.

La Capitana me confió el primer fragmento del mapa: fragmento_1.txt
Llevalo a tu barco. Para copiar archivos entre máquinas se usa scp:

   scp usuario@host:ruta destino_local      (traer)
   scp archivo_local usuario@host:ruta      (llevar)

No te olvides: para volver a tu barco, exit.
`, { owner: 'guardian', dirOwner: 'guardian' });
      w.seed('faro', '/home/guardian/lampara.txt', 'Lámpara de 1000 W. Cambiar cada 6 meses.\n', { owner: 'guardian', dirOwner: 'guardian' });
    },
  },
  {
    id: 'botin',
    chapter: 'Capítulo III · Señales',
    title: 'Botín del faro',
    story: [
      'El primer fragmento del mapa está en el faro: <code>/home/guardian/fragmento_1.txt</code>. Hay que llevarlo a tu barco.',
      '<code>scp</code> copia archivos entre máquinas. Podés hacerlo desde tu barco (traerlo) o desde el faro (enviarlo a <code>recluta@base</code>, con la contraseña de tu LEEME).',
    ],
    objectives: [
      { text: 'Copiá <code>fragmento_1.txt</code> del faro a <code>~/expedicion/</code> en tu barco (base)', done: (w) => hasLoose(w.read(B, `${EXP}/fragmento_1.txt`), 'FRAGMENTO 1') },
    ],
    commands: ['scp', 'usuario@host:ruta'],
    hints: [
      'Si estás en el faro, volvé con <code>exit</code> (o hacelo desde allá, enviando el archivo).',
      'Desde tu barco: <code>scp guardian@faro:fragmento_1.txt ~/expedicion/</code> (la ruta remota relativa parte del home remoto).',
      'Alternativa desde el faro: <code>scp fragmento_1.txt recluta@base:expedicion/</code> (contraseña: brujula)',
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed('faro', '/home/guardian/fragmento_1.txt', `FRAGMENTO 1 DEL MAPA
====================
"La bóveda existe, pero no figura en ningún mapa.
 El archivista sabe cómo llegar.
 Él solo abre la puerta a quien deja un salvoconducto en su buzón."
                                      — C. Root
`, { owner: 'guardian', dirOwner: 'guardian' });
    },
  },

  // ===================================================== CAPÍTULO IV
  {
    id: 'buzon',
    chapter: 'Capítulo IV · La red',
    title: 'Correo para el archivista',
    story: [
      'El guardián dejó una nota en el faro: <code>/home/guardian/nota_para_el_archivo.txt</code>. Explica cómo contactar al archivista (servidor <code>archivo</code>).',
      'Esta vez el camino es al revés: vas a <b>subir</b> un archivo propio a otra máquina con <code>scp archivo usuario@host:/ruta/</code>.',
    ],
    objectives: [
      { text: 'Creá <code>~/expedicion/salvoconducto.txt</code> firmado con tu usuario (debe contener <code>recluta</code>)', done: (w) => hasLoose(w.read(B, `${EXP}/salvoconducto.txt`), 'recluta') },
      { text: 'Subilo al servidor <code>archivo</code> en <code>/srv/buzon/</code>', done: (w) => hasLoose(w.read('archivo', '/srv/buzon/salvoconducto.txt'), 'recluta') },
    ],
    commands: ['scp (subir)', 'ssh', 'cat'],
    hints: [
      'Leé la nota: <code>ssh guardian@faro</code> y <code>cat nota_para_el_archivo.txt</code>. Ahí está la contraseña de <code>cartero</code>.',
      'En tu barco: <code>echo "Firmado: recluta" &gt; ~/expedicion/salvoconducto.txt</code>',
      'Solución: <code>scp ~/expedicion/salvoconducto.txt cartero@archivo:/srv/buzon/</code>',
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed('faro', '/home/guardian/nota_para_el_archivo.txt', `Para el recluta:

El archivista vive en el servidor "archivo" (10.0.0.23).
No atiende visitas, pero revisa su buzón: /srv/buzon/
Dejá ahí un archivo llamado salvoconducto.txt, firmado
con tu nombre de usuario.

Credenciales del buzón:
   usuario:    cartero
   contraseña: sobre-lacrado
`, { owner: 'guardian', dirOwner: 'guardian' });
      w.seedDir('archivo', '/srv/buzon', { owner: 'cartero', mode: 0o755 });
      w.seed('archivo', '/home/cartero/LEEME.txt', 'Las cartas van en /srv/buzon/\n', { owner: 'cartero', dirOwner: 'cartero' });
    },
  },
  {
    id: 'escaneo',
    chapter: 'Capítulo IV · La red',
    title: 'La isla que no está en el mapa',
    story: [
      'Una paloma mensajera dejó <code>~/carta_del_archivista.txt</code> en tu barco. La bóveda no figura en <code>/etc/hosts</code>, pero sigue en la red.',
      '<code>nmap</code> escanea una red y muestra qué máquinas responden y qué puertos tienen. <code>nmap 10.0.0.0/24</code> revisa las 256 direcciones. (En la vida real, escaneá solo redes con autorización.)',
    ],
    objectives: [
      { text: 'Escaneá la red, identificá la bóveda y guardá su IP en <code>~/expedicion/boveda.txt</code>', done: (w) => onlyIp(w.read(B, `${EXP}/boveda.txt`), BOVEDA_IP) },
    ],
    commands: ['nmap', 'ping', '/etc/hosts'],
    hints: [
      '<code>cat /etc/hosts</code> muestra las máquinas conocidas. Las que aparezcan solo como IP en nmap son desconocidas.',
      '<code>nmap 10.0.0.0/24</code>. Hay dos IPs sin nombre: según la carta, la bóveda tiene SSH bloqueado por un firewall (filtered).',
      `Solución: <code>echo ${BOVEDA_IP} &gt; ~/expedicion/boveda.txt</code>`,
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed(B, `${HOME}/carta_del_archivista.txt`, `Recluta:

Recibí tu salvoconducto. Sos digno.

La bóveda de la Capitana NO figura en ningún mapa (no está
en /etc/hosts), pero sigue viva en la red 10.0.0.0/24.
Escaneala. La reconocerás porque su puerta SSH (puerto 22)
está protegida por un firewall: aparece como "filtered".

Cuando la encuentres, anotá su IP en ~/expedicion/boveda.txt

                                        — El Archivista
`, mine);
    },
  },
  {
    id: 'tunel',
    chapter: 'Capítulo IV · La red',
    title: 'Abrir el túnel (Vim III)',
    story: [
      'El firewall de la bóveda solo deja pasar a quien tenga un túnel configurado. La plantilla está en <code>~/herramientas/tunel.conf</code>, llena de <code>IP_BOVEDA</code>.',
      'Cambiarlas una por una es de novato. En Vim, <code>:%s/viejo/nuevo/g</code> reemplaza en todo el archivo de una vez. <code>:set nu</code> muestra números de línea.',
    ],
    objectives: [
      { text: 'Con vim, reemplazá TODAS las apariciones de <code>IP_BOVEDA</code> por la IP de la bóveda', done: (w) => w.wasEdited(B, `${HOME}/herramientas/tunel.conf`) && !String(w.read(B, `${HOME}/herramientas/tunel.conf`)).includes('IP_BOVEDA') && String(w.read(B, `${HOME}/herramientas/tunel.conf`)).split(BOVEDA_IP).length - 1 >= 6 },
      { text: 'Activá el túnel: <code>activo = no</code> → <code>activo = si</code>', done: (w) => /^\s*activo\s*=\s*s[ií]\s*$/m.test(w.read(B, `${HOME}/herramientas/tunel.conf`) ?? '') },
    ],
    commands: [':%s/a/b/g', ':s/a/b/', '/^texto', 'ping'],
    hints: [
      '<code>vim ~/herramientas/tunel.conf</code> y luego <code>:%s/IP_BOVEDA/10.0.0.66/g</code> Enter.',
      'Ojo: la palabra "activo" también aparece en los comentarios. <code>/^activo</code> busca solo al inicio de línea; ahí, <code>:s/no/si/</code> reemplaza en esa línea.',
      'Solución completa: <code>:%s/IP_BOVEDA/10.0.0.66/g</code> · <code>/^activo</code> · <code>:s/no/si/</code> · <code>:wq</code>. Después probá <code>ping 10.0.0.66</code>.',
    ],
    setup(w) {
      ensureExpedition(w);
      w.seed(B, `${HOME}/herramientas/tunel.conf`, TUNEL_CONF, mine);
    },
  },
  {
    id: 'boveda',
    chapter: 'Capítulo V · La bóveda',
    title: 'Dentro de la bóveda',
    story: [
      'El túnel está abierto. Al final de <code>tunel.conf</code> había un acceso de mantenimiento: usuario <code>intruso</code>. Pero el tesoro solo lo puede tocar <b>root</b>.',
      'Los administradores dejan copias de seguridad olvidadas (archivos <code>.bak</code>). Usá <code>find</code> para encontrarlas, <code>tr</code> para descifrar y <code>su</code> para convertirte en root.',
    ],
    objectives: [
      { text: 'Entrá a la bóveda por SSH como <code>intruso</code>', done: (w) => visited(w, 'boveda') },
      { text: 'Encontrá y leé el respaldo con la contraseña de root', done: (w) => w.wasRead('boveda', '/var/backups/.root_pass.bak') },
      { text: 'Convertite en <code>root</code> en la bóveda', done: (w) => w.session.host === 'boveda' && w.session.user === 'root' },
    ],
    commands: ['find /', '2>/dev/null', 'tr', 'su'],
    hints: [
      `<code>ssh intruso@${BOVEDA_IP}</code> (contraseña: <code>puerta-trasera</code>) y leé el LEEME del home.`,
      '<code>find / -name "*.bak" 2>/dev/null</code> busca respaldos ocultando los "Permission denied".',
      'La contraseña está en ROT13: <code>tr \'A-Za-z\' \'N-ZA-Mn-za-m\' &lt; /var/backups/.root_pass.bak</code>. Luego <code>su</code> y escribí la contraseña descifrada.',
    ],
    setup(w) {
      if (!tunnelReady(w)) {
        w.seed(B, `${HOME}/herramientas/tunel.conf`, TUNEL_CONF.replaceAll('IP_BOVEDA', BOVEDA_IP).replace(/^activo = no$/m, 'activo = si'), mine);
      }
      const bov = { owner: 'intruso', dirOwner: 'intruso' };
      w.seed('boveda', '/home/intruso/LEEME.txt', `Notas de mantenimiento
----------------------
- Los respaldos viejos viven donde siempre (/var/...).
- Algún descuidado guardó la contraseña de root en un .bak
  oculto. Por suerte la "cifró"... con ROT13. 🙄
- El cofre está en /boveda. Solo root puede abrirlo.
`, bov);
      w.seedDir('boveda', '/var/backups', { mode: 0o755 });
      w.seed('boveda', '/var/backups/sistema.bak', 'respaldo del sistema 2025-03-01: OK\n', { mode: 0o644 });
      w.seed('boveda', '/var/backups/config.bak', 'puerto=22\nfirewall=activo\n', { mode: 0o644 });
      w.seed('boveda', '/var/backups/.root_pass.bak', 'ebbg:pbeban-qr-uvreeb\n', { mode: 0o644 });
      w.seed('boveda', '/root/nota.txt', 'Si llegaste hasta acá, sos digno de la Hermandad.\n', { dirMode: 0o700 });
      w.seedDir('boveda', '/boveda', { mode: 0o700 });
    },
  },
  {
    id: 'tesoro',
    chapter: 'Capítulo V · La bóveda',
    title: 'El tesoro de la Capitana Root',
    story: [
      'Sos root. En <code>/boveda/cofre</code> hay tres piezas del tesoro: rubí, ámbar y esmeralda. Leé el <code>LEEME_ROOT.txt</code> del cofre.',
      'Para reconstruirlo, uní las piezas <b>en orden</b> con <code>cat</code> y <code>&gt;</code>. Ojo: el comodín <code>*</code> ordena alfabéticamente, no por número de pieza. Después llevá el tesoro a tu barco con <code>scp</code>.',
    ],
    objectives: [
      { text: 'Llevá <code>TESORO.txt</code> a tu barco: <code>/home/recluta/TESORO.txt</code> en base', done: (w) => exists(w, B, `${HOME}/TESORO.txt`) && PIECE_MARKERS.every((m) => (w.read(B, `${HOME}/TESORO.txt`) ?? '').includes(m)) },
      {
        text: 'Las tres piezas deben estar en orden: 1 → 2 → 3',
        done: (w) => {
          const t = w.read(B, `${HOME}/TESORO.txt`) ?? '';
          const idx = PIECE_MARKERS.map((m) => t.indexOf(m));
          return idx.every((i) => i >= 0) && idx[0] < idx[1] && idx[1] < idx[2];
        },
      },
    ],
    commands: ['cat a b c > d', 'scp', 'exit'],
    hints: [
      '<code>cd /boveda/cofre</code> y <code>head -1 pieza_*</code> para ver qué número es cada pieza.',
      '<code>cat pieza_rubi.txt pieza_ambar.txt pieza_esmeralda.txt &gt; /tmp/TESORO.txt</code>',
      'Solución: <code>scp /tmp/TESORO.txt recluta@base:TESORO.txt</code> (contraseña: brujula). ¡Después mirá tu barco!',
    ],
    setup(w) {
      const root = { owner: 'root', mode: 0o600, dirMode: 0o700 };
      w.seed('boveda', '/boveda/cofre/pieza_rubi.txt', CHEST.rubi, root);
      w.seed('boveda', '/boveda/cofre/pieza_ambar.txt', CHEST.ambar, root);
      w.seed('boveda', '/boveda/cofre/pieza_esmeralda.txt', CHEST.esmeralda, root);
      w.seed('boveda', '/boveda/cofre/LEEME_ROOT.txt', `Si estás leyendo esto, sos root. Felicitaciones.

El tesoro está partido en tres piezas. Unilas EN ORDEN
(pieza 1, luego 2, luego 3) en un archivo TESORO.txt
y llevalo a tu barco:  base:/home/recluta/TESORO.txt

Las gemas no siguen el orden del alfabeto. Leé cada pieza.
                                     — Capitana Root
`, root);
    },
  },
];

export const LEVEL_COUNT = LEVELS.length;
