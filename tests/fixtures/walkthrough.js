/**
 * Solución completa de los 20 niveles. La usa el test de integración
 * (garantiza que el juego se puede terminar) y el generador de
 * docs/SOLUCIONES.md.
 *
 * Notación de teclas de vim: <Esc>, <CR> (Enter), <BS>, <C-r>.
 */
export const WALKTHROUGH = [
  /* 1 */ ['pwd', 'ls', 'cat LEEME.txt'],
  /* 2 */ ['cd mapa', 'ls', 'cd este/cueva', 'ls -a', 'cat .nota_oculta', 'cd'],
  /* 3 */ ['mkdir expedicion', 'touch expedicion/inventario.txt', 'echo "Día 1: comienza la búsqueda" > expedicion/diario.txt'],
  /* 4 */ ['cp bodega/brujula.txt expedicion/', 'mv bodega/catalejo.txt expedicion/', 'mv bodega/mapa_rasgado.txt expedicion/mapa.txt'],
  /* 5 */ ['cd ~/cubierta', 'rm *.tmp', 'rmdir barril_vacio', 'rm -r bodega_podrida', 'ls', 'cd'],
  /* 6 */ [{ cmd: 'vim ~/expedicion/juramento.txt', keys: 'iJuro encontrar el tesoro<Esc>:wq<CR>' }],
  /* 7 */ [{ cmd: 'vim ~/expedicion/coordenadas.txt', keys: '/BASURA<CR>ddnddndd' + 'G$x:wq<CR>' }],
  /* 8 */ ['wc -l ~/registros/bitacora.log > ~/expedicion/lineas.txt', 'tail -n 1 ~/registros/bitacora.log > ~/expedicion/clave.txt'],
  /* 9 */ ['grep -ri tesoro ~/registros/puertos', 'echo ANCLA-7731 > ~/expedicion/codigo.txt'],
  /* 10 */ ['find ~/laberinto -name "*.key"', 'cp ~/laberinto/pasillo_c/sala_2/grieta/.escondite/llave_de_bronce.key ~/expedicion/'],
  /* 11 */ ['cut -d" " -f3 ~/registros/accesos.log | sort | uniq -c | sort -nr | head -1 > ~/expedicion/objetivo.txt'],
  /* 12 */ ['cd ~/herramientas', 'ls -l', 'chmod +x decodificador.sh', './decodificador.sh', 'cd'],
  /* 13 */ ['base64 -d ~/registros/transmision.b64 > ~/expedicion/transmision.txt'],
  /* 14 */ [{ cmd: 'ssh guardian@faro', answers: ['luz-en-la-niebla'] }, 'whoami', 'cat bitacora_del_faro.txt'],
  /* 15 */ ['exit', { cmd: 'scp guardian@faro:fragmento_1.txt ~/expedicion/', answers: ['luz-en-la-niebla'] }],
  /* 16 */ [
    { cmd: 'ssh guardian@faro', answers: ['luz-en-la-niebla'] },
    'cat nota_para_el_archivo.txt',
    'exit',
    'echo "Firmado: recluta" > ~/expedicion/salvoconducto.txt',
    { cmd: 'scp ~/expedicion/salvoconducto.txt cartero@archivo:/srv/buzon/', answers: ['sobre-lacrado'] },
  ],
  /* 17 */ ['cat ~/carta_del_archivista.txt', 'nmap 10.0.0.0/24', 'echo 10.0.0.66 > ~/expedicion/boveda.txt'],
  /* 18 */ [{ cmd: 'vim ~/herramientas/tunel.conf', keys: ':%s/IP_BOVEDA/10.0.0.66/g<CR>/^activo<CR>:s/no/si/<CR>:wq<CR>' }, 'ping -c 1 10.0.0.66'],
  /* 19 */ [
    { cmd: 'ssh intruso@10.0.0.66', answers: ['puerta-trasera'] },
    'cat LEEME.txt',
    'find / -name "*.bak" 2>/dev/null',
    "tr 'A-Za-z' 'N-ZA-Mn-za-m' < /var/backups/.root_pass.bak",
    { cmd: 'su', answers: ['corona-de-hierro'] },
  ],
  /* 20 */ [
    'cd /boveda/cofre',
    'cat LEEME_ROOT.txt',
    'head -n 1 pieza_*',
    'cat pieza_rubi.txt pieza_ambar.txt pieza_esmeralda.txt > /tmp/TESORO.txt',
    { cmd: 'scp /tmp/TESORO.txt recluta@base:TESORO.txt', answers: ['brujula'] },
  ],
];
