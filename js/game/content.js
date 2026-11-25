/**
 * Contenido generado de los niveles (archivos grandes y textos largos).
 * Todo es determinista para que las soluciones sean reproducibles.
 * @module game/content
 */
import { createRng } from './rng.js';

export const LEEME = `+----------------------------------------------+
|         BIENVENIDO A BORDO, RECLUTA          |
+----------------------------------------------+

La Capitana Root, la hacker más temida del Archipiélago,
escondió su tesoro en algún rincón de la red 10.0.0.0/24.
Nadie lo encontró jamás... hasta hoy.

Este barco (la máquina "base") es tu hogar.
Tu usuario es "recluta" y tu contraseña es: brujula
Anotala: la vas a necesitar cuando quieras volver
a casa desde otras islas.

Escribí "mision" para recordar tu objetivo,
"pista" si te trabás y "help" para ver los comandos.

                          — La Hermandad del Prompt
`;

/** Bitácora de 347 líneas: la clave está en la última. */
export function bitacora() {
  const rng = createRng(8);
  const vientos = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const mares = ['mar calmo', 'marejada', 'mar picado', 'niebla espesa', 'lluvia fina', 'cielo despejado'];
  const eventos = [
    'sin novedades', 'gaviotas a babor', 'se avistó una boya', 'la tripulación canta', 'se remendó una vela',
    'ruido extraño en la bodega', 'el cocinero quemó el guiso', 'delfines a estribor', 'el loro dijo "sudo"',
  ];
  const lines = ['BITÁCORA DEL BARCO — Hermandad del Prompt'];
  for (let i = 2; i < 347; i++) {
    const day = String(1 + Math.floor(i / 12)).padStart(2, '0');
    const hh = String((i * 7) % 24).padStart(2, '0');
    lines.push(`[${String(i).padStart(4, '0')}] 2026-10-${day} ${hh}:00 viento ${rng.pick(vientos)}, ${rng.pick(mares)}, ${rng.pick(eventos)}`);
  }
  lines.push('[0347] CLAVE DEL DÍA: marea-alta');
  return `${lines.join('\n')}\n`;
}

/** 24 registros de puerto; uno esconde el código junto a "tesoro". */
export function puertos() {
  const rng = createRng(9);
  const frases = [
    'Llegó un cargamento de especias', 'Se vendieron tres barriles de ron', 'El capitán Pérez pagó sus deudas',
    'Pelea en la taberna, nadie herido', 'Se reparó el muelle norte', 'Un loro escapó de su jaula',
    'Marineros jugando a los dados', 'Se cargaron cuerdas y velas', 'Rumores de tormenta al sur',
    'La guardia cambió de turno', 'Un mercader ofrece mapas falsos', 'Se perdió un ancla en el puerto',
  ];
  const files = {};
  for (let f = 1; f <= 24; f++) {
    const lines = [];
    for (let l = 1; l <= 60; l++) {
      const hh = String(rng.int(0, 23)).padStart(2, '0');
      const mm = String(rng.int(0, 59)).padStart(2, '0');
      lines.push(`[${hh}:${mm}] ${rng.pick(frases)}`);
    }
    files[`puerto_${String(f).padStart(2, '0')}.log`] = lines;
  }
  files['puerto_05.log'][13] = '[11:20] El tesorero del puerto cobró los impuestos';
  files['puerto_11.log'][50] = '[23:02] El TESORERO se quejó del ron aguado';
  files['puerto_17.log'][41] = '[03:12] Susurro en la taberna: el TeSoRo del faro se abre con ANCLA-7731';
  const out = {};
  for (const [name, lines] of Object.entries(files)) out[name] = `${lines.join('\n')}\n`;
  return out;
}

/** Laberinto de directorios con la llave escondida (y señuelos). */
export function laberinto() {
  const rng = createRng(10);
  const pasillos = ['pasillo_a', 'pasillo_b', 'pasillo_c', 'pasillo_d'];
  const salas = ['sala_1', 'sala_2', 'sala_3'];
  const rincones = ['grieta', 'columna', 'pozo'];
  const objetos = ['piedra.txt', 'hueso.txt', 'telarana.txt', 'antorcha.txt', 'eco.txt'];
  const textos = ['Nada útil por aquí.', 'Solo polvo.', 'Un murciélago te mira.', 'Huele a humedad.', 'Sigue buscando...'];
  const files = {};
  for (const p of pasillos) for (const s of salas) for (const r of rincones) {
    const dir = `${p}/${s}/${r}`;
    for (const o of rng.shuffle(objetos).slice(0, 2)) files[`${dir}/${o}`] = `${rng.pick(textos)}\n`;
  }
  files['pasillo_a/sala_3/pozo/llave_de_plata.key'] = 'LLAVE FALSA — imitación barata. Seguí buscando.\n';
  files['pasillo_b/sala_1/columna/llave_de_bronce.txt'] = 'Esto es una nota, no una llave. Buscá la extensión correcta.\n';
  files['pasillo_d/sala_2/grieta/llave_oxidada.key'] = 'LLAVE OXIDADA — se rompió al tocarla.\n';
  files['pasillo_c/sala_2/grieta/.escondite/llave_de_bronce.key'] = 'LLAVE DE BRONCE — número de serie BR-0451\nAbre: el baúl del faro.\n';
  return files;
}

/** Registro de accesos: 10.0.0.7 es la IP más frecuente (por poco). */
export function accesos() {
  const rng = createRng(11);
  const counts = {
    '10.0.0.7': 64, '10.0.0.31': 61, '10.0.0.12': 59, '10.0.0.23': 47,
    '10.0.0.45': 40, '10.0.0.2': 33, '10.0.0.99': 21, '10.0.0.71': 18,
  };
  const entries = [];
  for (const [ip, n] of Object.entries(counts)) for (let i = 0; i < n; i++) entries.push(ip);
  const shuffled = rng.shuffle(entries);
  const lines = shuffled.map((ip, i) => {
    const day = String(1 + Math.floor(i / 40)).padStart(2, '0');
    const t = `${String(rng.int(0, 23)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}`;
    const estado = rng.next() < 0.5 ? 'ACEPTADO' : 'RECHAZADO';
    return `[2026-11-${day} ${t}] ${ip} -> base:22 ${estado}`;
  });
  return `${lines.join('\n')}\n`;
}

export const DECODIFICADOR = `#!/bin/bash
# Decodificador de señales — Hermandad del Prompt
echo "[*] Sintonizando la frecuencia 10.0.0.7..."
echo "[*] Señal recibida. Decodificando..."
echo "DESTINO CONFIRMADO: FARO (10.0.0.7)" > ~/expedicion/senal.txt
echo "La transmisión completa está en ~/registros/transmision.b64" >> ~/expedicion/senal.txt
echo "[+] Listo. Revisá ~/expedicion/senal.txt"
`;

export const TRANSMISION = `=== TRANSMISIÓN INTERCEPTADA ===
Origen:     faro (10.0.0.7)
Usuario:    guardian
Contraseña: luz-en-la-niebla
Mensaje:    "Si sos de la Hermandad, entrá por SSH.
             El primer fragmento del mapa duerme en mi casa."
`;

export const TUNEL_CONF = `# ===================================================
#  Configuración del túnel hacia la BÓVEDA
#  Instrucciones de la Capitana:
#   1) Reemplazá CADA aparición de IP_BOVEDA por la IP real.
#   2) Activá el túnel cambiando "activo = no" por "activo = si".
# ===================================================

[tunel]
activo = no
origen = 10.0.0.2
destino = IP_BOVEDA
puerto = 22

[ruta_norte]
salto = 10.0.0.7
siguiente = IP_BOVEDA

[ruta_sur]
salto = 10.0.0.23
siguiente = IP_BOVEDA

[firewall]
permitir_entrada = IP_BOVEDA
permitir_salida = IP_BOVEDA
registro = /var/log/tunel.log

[vigia]
comprobar_cada = 30s
host = IP_BOVEDA

# Acceso de mantenimiento a la bóveda:
#   usuario: intruso    contraseña: puerta-trasera
`;

export const CHEST = {
  rubi: `~~~~~~~~~~~~~~~ PIEZA 1 DE 3 ~~~~~~~~~~~~~~~
          .-=========================-.
         /  *   *   *   *   *   *   *  \\
        /_______________________________\\
`,
  ambar: `~~~~~~~~~~~~~~~ PIEZA 2 DE 3 ~~~~~~~~~~~~~~~
        |  ___________________________  |
        | |  $  ORO  $  PLATA  $  ORO | |
`,
  esmeralda: `~~~~~~~~~~~~~~~ PIEZA 3 DE 3 ~~~~~~~~~~~~~~~
        | |____________[o]____________| |
        |_______________________________|

          EL TESORO DE LA CAPITANA ROOT
  "El verdadero tesoro es saber usar la terminal."

           FLAG{sh3ll_qu3st_r00t_c0mpl3t4}
`,
};

export const PIECE_MARKERS = ['PIEZA 1 DE 3', 'PIEZA 2 DE 3', 'PIEZA 3 DE 3'];
