# Soluciones de ShellQuest

> ⚠️ **Spoilers.** Intentá cada nivel primero: usá `pista` dentro del juego antes de mirar acá.
>
> Este archivo se genera automáticamente (`npm run docs:solutions`) a partir de
> `tests/fixtures/walkthrough.js`, la misma solución que ejecutan los tests.

Notación de teclas en Vim: `<Esc>` = Escape, `<CR>` = Enter. Cuando un comando pide contraseña, se indica en un comentario `# contraseña: ...`.

## 1. Despertar en cubierta

*Capítulo I · El barco* — conceptos: `pwd`, `ls`, `cat`

**Objetivos**

- Leé el archivo `LEEME.txt` que está en tu directorio personal

**Solución**

```bash
pwd
ls
cat LEEME.txt
```

## 2. Bolsillos ocultos

*Capítulo I · El barco* — conceptos: `cd`, `ls -a`, `cd ..`

**Objetivos**

- Encontrá y leé el archivo oculto escondido en algún lugar de `~/mapa`

**Solución**

```bash
cd mapa
ls
cd este/cueva
ls -a
cat .nota_oculta
cd
```

## 3. Montar el campamento

*Capítulo I · El barco* — conceptos: `mkdir`, `touch`, `echo`, `>`

**Objetivos**

- Creá el directorio `~/expedicion`
- Creá un archivo vacío `~/expedicion/inventario.txt`
- Escribí `Día 1: comienza la búsqueda` dentro de `~/expedicion/diario.txt`

**Solución**

```bash
mkdir expedicion
touch expedicion/inventario.txt
echo "Día 1: comienza la búsqueda" > expedicion/diario.txt
```

## 4. Provisiones

*Capítulo I · El barco* — conceptos: `cp`, `mv`

**Objetivos**

- Copiá `bodega/brujula.txt` a `~/expedicion/` (el original debe quedar en la bodega)
- Mové `bodega/catalejo.txt` a `~/expedicion/`
- Mové y renombrá `bodega/mapa_rasgado.txt` como `~/expedicion/mapa.txt`

**Solución**

```bash
cp bodega/brujula.txt expedicion/
mv bodega/catalejo.txt expedicion/
mv bodega/mapa_rasgado.txt expedicion/mapa.txt
```

## 5. Limpiar la cubierta

*Capítulo I · El barco* — conceptos: `rm`, `rm -r`, `rmdir`, `*`

**Objetivos**

- Borrá todos los archivos `.tmp` de `~/cubierta`
- Eliminá el directorio vacío `barril_vacio` con `rmdir`
- Eliminá `bodega_podrida` con todo su contenido
- Conservá `~/cubierta/soga.txt`

**Solución**

```bash
cd ~/cubierta
rm *.tmp
rmdir barril_vacio
rm -r bodega_podrida
ls
cd
```

## 6. El juramento (Vim I)

*Capítulo II · El editor* — conceptos: `vim`, `i`, `Esc`, `:wq`, `:q!`

**Objetivos**

- Con `vim`, creá `~/expedicion/juramento.txt` con el texto `Juro encontrar el tesoro`

**Solución**

```bash
vim ~/expedicion/juramento.txt
#   dentro de vim teclear: iJuro encontrar el tesoro<Esc>:wq<CR>
```

## 7. Coordenadas corruptas (Vim II)

*Capítulo II · El editor* — conceptos: `dd`, `x`, `u`, `/buscar`, `n`

**Objetivos**

- Con vim, eliminá las 3 líneas que contienen `##BASURA##`
- Corregí `faroo` para que diga `faro`
- Mantené intactas las líneas de LATITUD, LONGITUD y ESTADO

**Solución**

```bash
vim ~/expedicion/coordenadas.txt
#   dentro de vim teclear: /BASURA<CR>ddnddnddG$x:wq<CR>
```

## 8. La bitácora interminable

*Capítulo II · El editor* — conceptos: `head`, `tail`, `wc -l`, `>`

**Objetivos**

- Guardá la cantidad de líneas de `bitacora.log` en `~/expedicion/lineas.txt`
- Guardá la última línea (la clave del día) en `~/expedicion/clave.txt`

**Solución**

```bash
wc -l ~/registros/bitacora.log > ~/expedicion/lineas.txt
tail -n 1 ~/registros/bitacora.log > ~/expedicion/clave.txt
```

## 9. Aguja en el pajar

*Capítulo II · El editor* — conceptos: `grep`, `grep -r`, `grep -i`

**Objetivos**

- Encontrá el código mencionado junto a la palabra "tesoro" y guardalo en `~/expedicion/codigo.txt`

**Solución**

```bash
grep -ri tesoro ~/registros/puertos
echo ANCLA-7731 > ~/expedicion/codigo.txt
```

## 10. El laberinto

*Capítulo II · El editor* — conceptos: `find`, `-name`, `-type`

**Objetivos**

- Encontrá `llave_de_bronce.key` y copiala a `~/expedicion/`

**Solución**

```bash
find ~/laberinto -name "*.key"
cp ~/laberinto/pasillo_c/sala_2/grieta/.escondite/llave_de_bronce.key ~/expedicion/
```

## 11. Rastro de visitas

*Capítulo III · Señales* — conceptos: `|`, `cut`, `sort`, `uniq -c`, `sort -nr`

**Objetivos**

- Averiguá qué IP aparece MÁS veces en `accesos.log` y guardá esa IP en `~/expedicion/objetivo.txt`

**Solución**

```bash
cut -d" " -f3 ~/registros/accesos.log | sort | uniq -c | sort -nr | head -1 > ~/expedicion/objetivo.txt
```

## 12. Herramientas oxidadas

*Capítulo III · Señales* — conceptos: `ls -l`, `chmod`, `./script`

**Objetivos**

- Dale permiso de ejecución a `~/herramientas/decodificador.sh`
- Ejecutalo para obtener `~/expedicion/senal.txt`

**Solución**

```bash
cd ~/herramientas
ls -l
chmod +x decodificador.sh
./decodificador.sh
cd
```

## 13. Mensaje cifrado

*Capítulo III · Señales* — conceptos: `base64`, `base64 -d`, `file`

**Objetivos**

- Decodificá la transmisión y guardá el resultado en `~/expedicion/transmision.txt`

**Solución**

```bash
base64 -d ~/registros/transmision.b64 > ~/expedicion/transmision.txt
```

## 14. Rumbo al faro

*Capítulo III · Señales* — conceptos: `ssh`, `whoami`, `hostname`, `exit`

**Objetivos**

- Conectate por SSH al `faro` como `guardian`
- Leé `bitacora_del_faro.txt` en el home del guardián

**Solución**

```bash
ssh guardian@faro        # contraseña: luz-en-la-niebla
whoami
cat bitacora_del_faro.txt
```

## 15. Botín del faro

*Capítulo III · Señales* — conceptos: `scp`, `usuario@host:ruta`

**Objetivos**

- Copiá `fragmento_1.txt` del faro a `~/expedicion/` en tu barco (base)

**Solución**

```bash
exit
scp guardian@faro:fragmento_1.txt ~/expedicion/        # contraseña: luz-en-la-niebla
```

## 16. Correo para el archivista

*Capítulo IV · La red* — conceptos: `scp (subir)`, `ssh`, `cat`

**Objetivos**

- Creá `~/expedicion/salvoconducto.txt` firmado con tu usuario (debe contener `recluta`)
- Subilo al servidor `archivo` en `/srv/buzon/`

**Solución**

```bash
ssh guardian@faro        # contraseña: luz-en-la-niebla
cat nota_para_el_archivo.txt
exit
echo "Firmado: recluta" > ~/expedicion/salvoconducto.txt
scp ~/expedicion/salvoconducto.txt cartero@archivo:/srv/buzon/        # contraseña: sobre-lacrado
```

## 17. La isla que no está en el mapa

*Capítulo IV · La red* — conceptos: `nmap`, `ping`, `/etc/hosts`

**Objetivos**

- Escaneá la red, identificá la bóveda y guardá su IP en `~/expedicion/boveda.txt`

**Solución**

```bash
cat ~/carta_del_archivista.txt
nmap 10.0.0.0/24
echo 10.0.0.66 > ~/expedicion/boveda.txt
```

## 18. Abrir el túnel (Vim III)

*Capítulo IV · La red* — conceptos: `:%s/a/b/g`, `:s/a/b/`, `/^texto`, `ping`

**Objetivos**

- Con vim, reemplazá TODAS las apariciones de `IP_BOVEDA` por la IP de la bóveda
- Activá el túnel: `activo = no` → `activo = si`

**Solución**

```bash
vim ~/herramientas/tunel.conf
#   dentro de vim teclear: :%s/IP_BOVEDA/10.0.0.66/g<CR>/^activo<CR>:s/no/si/<CR>:wq<CR>
ping -c 1 10.0.0.66
```

## 19. Dentro de la bóveda

*Capítulo V · La bóveda* — conceptos: `find /`, `2>/dev/null`, `tr`, `su`

**Objetivos**

- Entrá a la bóveda por SSH como `intruso`
- Encontrá y leé el respaldo con la contraseña de root
- Convertite en `root` en la bóveda

**Solución**

```bash
ssh intruso@10.0.0.66        # contraseña: puerta-trasera
cat LEEME.txt
find / -name "*.bak" 2>/dev/null
tr 'A-Za-z' 'N-ZA-Mn-za-m' < /var/backups/.root_pass.bak
su        # contraseña: corona-de-hierro
```

## 20. El tesoro de la Capitana Root

*Capítulo V · La bóveda* — conceptos: `cat a b c > d`, `scp`, `exit`

**Objetivos**

- Llevá `TESORO.txt` a tu barco: `/home/recluta/TESORO.txt` en base
- Las tres piezas deben estar en orden: 1 → 2 → 3

**Solución**

```bash
cd /boveda/cofre
cat LEEME_ROOT.txt
head -n 1 pieza_*
cat pieza_rubi.txt pieza_ambar.txt pieza_esmeralda.txt > /tmp/TESORO.txt
scp /tmp/TESORO.txt recluta@base:TESORO.txt        # contraseña: brujula
```

