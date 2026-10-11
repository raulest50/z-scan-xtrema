# Sistema Linux personalizado para Z-Scan Xtrema

Base de EDF y construcción de la imagen para la Kria del laboratorio.
Fecha de la última construcción: 2026-10-10.

## Estado actual

La implementación vive en
[`xtreme-zscan-poff-resistant/`](xtreme-zscan-poff-resistant/). Incluye la capa
`meta-zscan`, la receta de imagen y un script de construcción. Las fuentes de
EDF 26.06.1 ya se sincronizaron dentro del contenedor oficial; el frontend se
compiló y se prepararon las dependencias Python para ARM64 a partir de los
lockfiles del proyecto. BitBake completó el análisis de 7.617 recetas sin
errores. El DTB de KV260 revB se construyó con 957 tareas sin errores y
el kernel Linux 6.18.10 de AMD terminó de compilar correctamente, incluidos
sus módulos. **La imagen de SD ya se construyó**: BitBake finalizó sus
5.718 tareas correctamente, reutilizando 5.670 en la ejecución final.
Los resultados están en `yocto-workspace/artifacts/`. Aún no hay pruebas
de arranque, webcam o apagones en la KV260 física.

El usuario autorizó estos archivos y la integración del sistema. **No modificar
los fuentes de la aplicación**: empaquetar la revisión comprobada del repositorio.
Leer `AGENTS.md`; los archivos adicionales siguen sujetos a su regla de aprobación.
No se ha escrito la SD, actualizado QSPI ni enviado órdenes al instrumento.

## Objetivo

Crear una distribución Linux reproducible, sin escritorio, para la Kria KV260:

- Uso futuro del FPGA fabric; PYNQ es opcional y no bloquea esta etapa.
- Backend Python/FastAPI y frontend React compilado de este repositorio.
- Nginx, SSH y dnsmasq conforme a la arquitectura vigente.
- Webcam Logitech Brio 100 por V4L2/FFmpeg, sin grabación del streaming en SD.
- Servicios de inicio automático, diagnóstico y recuperación.
- Prioridad principal: resistencia a desconexiones diarias de alimentación.
- Conservar las mediciones locales confirmadas como guardadas, sin respaldo
  de energía. Este requisito aún no está implementado ni validado.

No duplicar aquí los fuentes de la aplicación. El build empaqueta una revisión
identificada del código existente sin modificarla. Sin escritorio no
significa sin interfaz web. PYNQ y Jupyter no forman parte de la base inicial.

## Por qué Yocto / EDF

Yocto proporciona recetas, capas y BitBake para construir una distribución.
EDF aporta la integración de AMD. La capa `meta-zscan` mantiene
nuestras personalizaciones separadas de las capas externas.

La guía AMD UG1144 2026.1 anuncia la deprecación de las herramientas PetaLinux
para 2026.2 y recomienda EDF/Yocto. Por ello EDF es la base elegida para este
proyecto nuevo. No significa que sistemas existentes dejen de funcionar.

Base verificada el 2026-10-08: **EDF 26.06.1**, documentación 26.06.1-rev1,
sobre **Yocto Scarthgap (5.0)**. Usar el tag de manifiesto
`amd-edf-rel-v26.06.1`, que fija las revisiones de sus capas, en vez de seguir
la punta de `rel-v2026.1`. Scarthgap es la base que usa esta versión de EDF;
no mezclar capas de otra versión de Yocto por ser más reciente.

El manifiesto fija, entre otras, estas revisiones:

| Repositorio | Commit |
| --- | --- |
| `meta-amd-edf` | `cb75a4c061568fe7fecd552a60b17af9c9e64cf1` |
| `meta-kria` | `9a35e64910908a42a338cf5ddef37094c82649bd` |
| `poky` | `1d54d1c4736a114e1cecbe85a0306e3814d5ce70` |

La receta usa `core-image`, `read-only-rootfs`, `extrausers`, systemd y sintaxis
actual de overrides (`:append`, `:remove`). No depende de proyectos PetaLinux,
de `meta-pynq` antiguo ni de scripts de inicialización SysV. La etiqueta y el
digest verificados del contenedor de compilación se registran más abajo.

## FPGA y PYNQ: etapa futura

El soporte actual de KV260 no garantiza PYNQ automáticamente. Kria-PYNQ documenta
instalación sobre Ubuntu. La antigua capa meta-pynq documenta PetaLinux 2018.2
con limitaciones; no copiarla suponiendo compatibilidad con EDF actual.

Verificar BSP, kernel, Python, dependencias FPGA y overlays propios. No basta
con `import pynq`: hace falta comprobar carga del overlay y las operaciones de
memoria/comunicación necesarias. Obtener autorización para pruebas físicas.
Si el portado requiere un esfuerzo considerable, presentar alternativas antes
de cambiar el enfoque acordado.

## Setup propuesto en Linux

1. Inventariar distribución, arquitectura, CPU, RAM y disco sin instalar nada.
2. Contrastar con la matriz de la versión EDF elegida. EDF 26.06 incluye Ubuntu
   24.04.3 y 22.04.5; Windows/WSL están fuera de su soporte oficial.
3. Usar Docker Engine y el contenedor oficial `xilinx/edf` para aislar las
   dependencias. Docker es una herramienta del PC, no un requisito en Kria.
4. Preparar Git, `repo` y el manifiesto siguiendo el flujo oficial, sin duplicar
   herramientas que ya proporcione el contenedor.
5. Mantener build, descargas, cachés y fuentes externas fuera de Git, en
   almacenamiento Linux nativo. El script usa `yocto-workspace/`, ignorado,
   junto a la receta. `ZSCAN_WORKSPACE` permite elegir otra ubicación.

Docker ya fue instalado manualmente en esta laptop. El 2026-10-08 se confirmó
mediante la API pública de Docker Hub que el contenedor de compilación
publicado para Linux/amd64 es **`xilinx/edf:ubuntu2204-26.06`**, con digest:

```text
sha256:4a434d1e9117a63bfa200771ecfa4566dcc8e10918b9afd92b6853d83dd95057
```

La guía de AMD menciona `ubuntu2204-26.06.1`, pero esa etiqueta no aparece en
el registro y su descarga devuelve `manifest unknown`. Usar la etiqueta
verificada, o el digest anterior para fijar exactamente el contenedor:

```bash
sudo docker pull xilinx/edf:ubuntu2204-26.06
```

Esto selecciona las herramientas del host; las fuentes del OS siguen fijadas
al manifiesto `amd-edf-rel-v26.06.1`. Se comprobó el contenedor en ejecución: usuario `amd-edf` (UID 1000),
Python 3.10, Git y `repo`. Esta versión de Python corresponde al host de build;
el Python de la imagen EDF es 3.12.

Presupuesto práctico, no mínimo oficial: 16–32 GB de RAM y 250–300 GB libres en
SSD. Ajustar tareas paralelas a recursos reales. No hace falta descargar todas
las cachés precompiladas de AMD para empezar.

No instalar PetaLinux, Vivado o Vitis por costumbre: comprobar primero qué
requiere el flujo seleccionado. `meta-kria` rel-v2026.1 documenta
`k26-smk-kv-sdt` para KV260; verificar el flujo de imagen y firmware antes de
adoptar ese MACHINE como configuración definitiva.

## Construcción de xtreme-zscan-poff-resistant

Archivos de esta integración:

| Archivo | Responsabilidad |
| --- | --- |
| `build-image.sh` | Preparar entradas, credenciales, contenedor, DTB y build |
| `xtreme-zscan-poff-resistant.bb` | Contenido de imagen, raíz inmutable y arranque |
| `meta-zscan/conf/layer.conf` | Registrar recetas, fragmentos y WIC |
| `meta-zscan/recipes-apps/zscan/zscan-app.bb` | Instalar backend, frontend y dependencias fijadas |
| `meta-zscan/recipes-core/zscan-system/zscan-system.bb` | Generar servicios, DNS, Nginx, red y SSH |
| `meta-zscan/recipes-kernel/linux/linux-xlnx_%.bbappend` y `files/zscan.cfg` | Soporte de SquashFS, SD y cámara UVC |
| `meta-zscan/wic/xtreme-zscan-poff-resistant.wks.in` | Particiones de arranque FAT y raíz SquashFS |

El host necesita Docker, Git, Node compatible con `frontend/package.json`, npm,
`uv`, Python 3, OpenSSL, `ssh-keygen` y GNU tar. No instalar dependencias de
Yocto con `apt` dentro de la placa. El contenedor EDF proporciona el entorno de
compilación; el frontend y los wheels se preparan en directorios de trabajo.

Desde la raíz del repositorio:

```bash
bash custom-OS/xtreme-zscan-poff-resistant/build-image.sh parse
bash custom-OS/xtreme-zscan-poff-resistant/build-image.sh build
```

`prepare` solo empaqueta la aplicación; `configure` prepara además EDF.
`parse` analiza recetas y `build` construye. Para continuar después de un fallo
de empaquetado, `resume` reutiliza el DTB ya generado y evita cambiar de máquina
dos veces; si se cambian las fuentes/configuración del DTB, usar `build`.
Cada ejecución exige fuentes de la
aplicación sin cambios pendientes y usa `git archive HEAD`, `npm ci`, el lockfile
`uv.lock` y wheels ARM64/CPython 3.12 verificados por hash. Los paquetes Python
quedan en `/usr/lib/zscan/python`, separados del Python del sistema, y conservan
sus metadatos y licencias. No se ejecutan npm, pip ni instalaciones en el primer
arranque. El frontend y el backend conservan su disposición relativa.

El ELF precompilado de `watchfiles` usa la tabla de símbolos SysV `DT_HASH`
en vez de `GNU_HASH`. Se instala en el subpaquete `zscan-app-watchfiles-extension`,
con una excepción de QA `ldflags` limitada a ese archivo. No se modifica el
wheel ni su versión; los demás binarios conservan esa comprobación de Yocto.

La configuración limita BitBake y Make a una tarea, y detiene nuevas tareas si
quedan menos de 20 GiB de disco. El build se completó en este PC con unos
5.6 GiB de RAM más swap. No se midieron el máximo exacto de memoria ni una
duración continua sin pausas.
Se conservan los mirrors de fuentes y sstate de AMD de la plantilla EDF.

El build utiliza `MACHINE=k26-smk-kv-sdt` para generar el DTB oficial KV260 y
`amd-cortexa53-mali-common` para Linux. Crea una primera partición FAT de 128 MiB
con `Image`, `kv260.dtb` y `extlinux/extlinux.conf`, y una segunda partición
SquashFS. El kernel recibe el PARTUUID explícito de la raíz, `rootwait`, `ro` y
consola `ttyPS1,115200`. Requiere que el U-Boot del firmware QSPI existente
admita este arranque extlinux; **esa compatibilidad no se ha probado en la placa**.
No se construye ni graba firmware QSPI como parte de este procedimiento.

Resultados bajo `yocto-workspace/artifacts/`: `.wic.xz`, `.wic.bmap`,
`SHA256SUMS`, manifiesto de paquetes instalados (`.rootfs.manifest`), revisión
de la aplicación, dependencias Python y manifiesto resuelto de EDF. La imagen
del 2026-10-10 ocupa unos 99 MiB comprimida y 232.997.888 bytes sin comprimir;
su manifiesto registra 596 paquetes del sistema, además de las dependencias
Python incluidas dentro del paquete Z-Scan. Para comprobar los archivos:

```bash
cd custom-OS/xtreme-zscan-poff-resistant/yocto-workspace/artifacts
sha256sum -c SHA256SUMS
```

La imagen incluye:

- Aplicación FastAPI/React, Uvicorn con un solo worker y FFmpeg/V4L2.
- Nginx en TCP 80; backend en `127.0.0.1:8000`, con proxy de REST y WebSockets.
- dnsmasq como DNS del laboratorio; OpenSSH y consola serie.
- Raíz SquashFS de solo lectura; sin gestor de paquetes ni instalación pendiente.
- `/run` y `/tmp` en RAM, 64 MiB cada uno; `/var/volatile`, 128 MiB.
- `volatile-binds` para estado mutable de servicios; journal volátil de 16 MiB.
- Sin swap en SD, automontaje GPT, expansión de particiones ni volcados de memoria.

Los temporales, logs, cambios en el home del administrador y estado volátil se
pierden al apagar. **No guardar mediciones allí.** Esta imagen aún no incorpora
partición de datos, protocolo de guardado durable, actualizaciones A/B ni PYNQ.

### Acceso e identidad de esta Kria

La primera preparación genera una contraseña aleatoria y una clave de host SSH
Ed25519 en `yocto-workspace/inputs/identity/`, con permisos privados. Se reutilizan
al reconstruir para conservar la identidad de esta placa. La contraseña en claro
no se imprime en la salida ni se guarda en Git. Los archivos y logs del build
pueden contener hashes y material de identidad; el workspace es privado.
La contraseña puede consultarse localmente:

```bash
cat custom-OS/xtreme-zscan-poff-resistant/yocto-workspace/inputs/identity/admin-password
```

- SSH: `ssh zscan-admin@192.168.0.101` (también por el nombre cuando DNS funcione).
- Consola serie: usuario `root`, misma contraseña provisionada.
- Administración desde SSH: `su -`, misma contraseña. Root no inicia sesión por SSH.
- El servicio de aplicación usa la cuenta de sistema bloqueada `zscan`, con grupo
  `video`; no usa credenciales de administrador.

La contraseña y la identidad se provisionan durante el build: `/etc` es de solo
lectura y no admite cambiarlas en sitio. Proteger las imágenes, cachés y backups:
contienen material de identidad. Este aprovisionamiento corresponde a **una Kria**;
para otra placa usar un workspace independiente con credenciales nuevas.

### Red del laboratorio y zscan.home.arpa

La imagen configura la Ethernet documentada, MAC `00:0a:35:14:b6:23`, con IP
estática `192.168.0.101/24`, gateway `192.168.0.1` y DNS local. Mantener reservada
esa dirección en el router para evitar que DHCP la asigne a otro equipo. Una
placa con otra MAC requiere adaptar la configuración antes de construir.

El backend conserva el adaptador Newport existente: `192.168.0.254:5001`.
No ejecuta homing ni movimientos como parte de las pruebas de construcción.
Al arrancar en la placa, el servicio inicia la comunicación/telemetría habitual
de la aplicación; cualquier prueba física requiere condiciones acordadas.

`dnsmasq` escucha TCP/UDP 53 en loopback y en `192.168.0.101`; resuelve
`zscan.home.arpa` a esa IP. Es **solo DNS**: DHCP sigue en el router. Reenvía
consultas externas al router; este no debe reenviarlas de vuelta a la Kria.

Para abrir `http://zscan.home.arpa` desde otros equipos, configurar el DHCP del
router para anunciar DNS `192.168.0.101` (opción 6), o configurar ese DNS en cada
cliente. Renovar la concesión DHCP después. La imagen no cambia el router.
La alternativa directa es `http://192.168.0.101`. Ambas direcciones están en
`ZSCAN_ORIGINS` y usan el puerto 80, sin `:8000`.
Durante los primeros segundos de inicio puede aparecer un 502 hasta que el
backend termine de arrancar; esperar a que responda `/api/health`.

Comprobaciones previstas, sin ordenar movimientos:

```bash
# Desde un cliente del laboratorio:
nslookup zscan.home.arpa 192.168.0.101
curl http://192.168.0.101/api/health
# Desde la consola de la Kria:
findmnt /
findmnt -t squashfs,tmpfs,overlay
systemctl --failed
systemctl status zscan nginx dnsmasq zscan-sshd
```

### Validación realizada en el host

- Frontend compilado con su lockfile, sin cambios de fuentes.
- 20 dependencias de producción Python resueltas con los hashes de `uv.lock`;
  las siete extensiones ELF comprobadas son AArch64 de 64 bits.
- 15 pruebas existentes pasaron en Python 3.12, con Newport simulado/transporte
  falso y sin hardware. Un aviso de deprecación de TestClient pertenece al
  conjunto de dependencias existente; no se alteró el proyecto para ocultarlo.
- Prueba con Uvicorn real en loopback: frontend, health, WebSocket, origen
  `zscan.home.arpa`, exclusividad y liberación de sesión, siempre en simulación.
- Sintaxis de los scripts y recetas validada con Bash y el parser de BitBake.
  El análisis completo de BitBake terminó con 7.617 recetas analizadas,
  10.489 objetivos, 1.922 omisiones por configuración y cero errores.
- DTB de KV260 revB construido; consola `serial1`/`ttyPS1` verificada.
  Kernel Linux 6.18.10 compilado, con las comprobaciones de configuración
  aprobadas. SquashFS, SD/Arasan, consola y soporte UVC quedaron integrados
  en el kernel; no dependen de cargar módulos para montar la raíz.
- Build de imagen completado: 5.718 tareas exitosas, incluidas las comprobaciones
  de paquetes, sistema de archivos de solo lectura e imagen de Yocto.
- Los 721 archivos del paquete de aplicación coinciden con las entradas
  preparadas. No se modificaron fuentes, lockfiles ni modelos del proyecto.
- Python ARM64 3.12.12 ejecutado con QEMU/Cortex-A53: importación de las siete
  extensiones nativas, lifespan y health en simulación, y frontend presente.
  FFmpeg ARM64 reconoció V4L2/image2pipe y generó un JPEG sintético; dnsmasq
  ARM64 aprobó la comprobación de su configuración.
- Imagen WIC: SHA-256 y rangos del bmap verificados, CRC de GPT correctos,
  FAT de 128 MiB y SquashFS/gzip con el PARTUUID esperado. Kernel, DTB y extlinux
  extraídos de la FAT coinciden con sus artefactos de build.
- Sistema de archivos: seis servicios principales habilitados, montajes y
  binds volátiles configurados, servicios de expansión y SSH predeterminado
  enmascarados. Hashes de root/administrador comprobados contra la contraseña
  privada, sin cambio obligatorio; clave SSH `root:root`, modo `0600` en SquashFS.
- Arranque completo en QEMU `virt`/Cortex-A53, con el kernel y SquashFS generados,
  raíz en RAM y contenedor sin red: login root con la credencial provisionada,
  raíz de solo lectura y seis servicios activos. Pasaron frontend, health,
  upgrade WebSocket por Nginx, consulta DNS local de `zscan.home.arpa`, validación
  de configuración/clave SSH y escucha SSH. Se esperó la disponibilidad HTTP
  después de activar el servicio. El backend usó su configuración de Newport,
  sin instrumento ni interfaz de red accesibles; no se enviaron movimientos.
  La única unidad fallida fue `systemd-networkd-wait-online.service`, por la
  ausencia de Ethernet en esta prueba. No se probó autenticación remota por SSH.

Estas comprobaciones usan el host y emulación ARM64 sin acceso al instrumento.
El arranque virtual usa el DTB de QEMU y una raíz en RAM: no valida el firmware
QSPI, la lectura de la SD ni el DTB/periféricos de la KV260. No sustituye el
arranque en la placa, la prueba de la webcam ni las pruebas de cortes.

### Correspondencia con la arquitectura

`arquitectura/ArquitecturaGaphor.gaphor` todavía describe Ubuntu 22.04/PYNQ y
DHCP reservado. Esta integración propone EDF, Python 3.12, una raíz inmutable,
servicios provisionados y la misma IP fijada en el OS. Al adoptar la imagen,
actualizar el nodo de SO, las notas de almacenamiento, arranque, identidad,
red, servicios y FPGA opcional, y registrar las responsabilidades de esta capa.
El modelo no se modificó sin encargo. Los fuentes de la aplicación tampoco.

## Robustez requerida

- Raíz SquashFS de solo lectura; validar la configuración en la placa.
- Temporales en RAM; logs acotados y persistencia selectiva.
- Sin swap en SD ni vídeo persistente.
- Datos/configuración en partición separada, con políticas de escritura,
  sincronización, recuperación y límites de espacio explícitos.
- Actualización A/B del sistema, validación de arranque y retorno a versión
  anterior; evaluar RAUC o equivalente e integración con el bootloader.
- Distinguir A/B del firmware QSPI de Kria de A/B del sistema Linux en SD.
  La recuperación del firmware no recupera automáticamente el rootfs.
- Consola serie y procedimiento de rescate documentado.
- Nunca reanudar movimientos ni ejecutar homing automáticamente al arrancar.

El usuario descartó respaldo de energía y exige conservar toda medición
confirmada como guardada. Separar dos criterios de aceptación: que el sistema
vuelva a arrancar y que los datos confirmados sobrevivan. La raíz de solo
lectura atiende al primero; no resuelve el segundo.

Falta diseñar el almacenamiento persistente y el protocolo de confirmación:
confirmar solo después de la transacción y sincronización durables, comprobar
errores y espacio disponible, y recuperar operaciones interrumpidas al
arrancar. Nunca confirmar datos que solo estén en RAM. También hay que
comprobar que el medio respete las órdenes de sincronización: ninguna opción
del OS garantiza por sí sola que una SD no pierda datos o se dañe internamente
al cortar energía. El requisito de cero pérdidas confirmadas queda pendiente
de implementación y validación con el almacenamiento elegido.

Validar cortes durante funcionamiento y actualización solo en soportes de
prueba, con autorización y respaldos. Los resultados deben distinguir entre
arranque, integridad del sistema y conservación de mediciones confirmadas.

## Precauciones con la Kria actual

En la conversación previa se observaron errores EXT4, journal abortado y
rechazo de escrituras en la SD; un despliegue quedó bloqueado. Es un antecedente,
no una comprobación actual. Verificar estado antes de actuar. No forzar montaje
escribible ni reparar una partición montada.

Usar una segunda SD y disponer de copia de los datos y consola serie. No
sobrescribir la SD actual ni actualizar QSPI sin autorización específica,
comprobación de compatibilidad y procedimiento de recuperación.

No copiar secretos de `env.local` a Git, recetas, imágenes ni documentación.
Definir el aprovisionamiento de credenciales e identidad por separado.
No emitir movimientos ni homing en pruebas de build, interfaz o despliegue.

## Primera iteración

1. Preparar el entorno fijado de EDF y compilar esta receta.
2. Integrar disco y arranque; verificar compatibilidad con el firmware existente
   y probar en una SD de pruebas antes de cualquier uso del instrumento.
3. Validar consola, montajes de solo lectura, límites de RAM y ausencia de
   escrituras inesperadas; probar recuperación ante cortes autorizados.
4. Implementar persistencia de mediciones, confirmación durable y recuperación;
   comprobar que cada identificador confirmado sobreviva a los cortes.
5. Validar en la placa la red/SSH, webcam y Z-Scan ya integradas, manteniendo
   las garantías anteriores.
6. Resolver actualización A/B y sus cortes. Integrar FPGA cuando se necesite.

Registrar resultados y pendientes. Una imagen que compila o arranca todavía
no demuestra resistencia a apagones. No probarla moviendo el instrumento.

## Referencias oficiales de partida

Consultadas durante esta conversación; revisar versiones al retomar. No son
evidencia de pruebas realizadas en nuestra placa.

- EDF: https://edf.docs.amd.com/en/latest/
- Versiones y anfitriones:
  https://edf.docs.amd.com/en/latest/downloads-and-release-notes.html
- Contenedor:
  https://edf.docs.amd.com/en/latest/osdev/build-edf-yocto-with-the-edf-build-container.html
- Etiquetas realmente publicadas del contenedor:
  https://hub.docker.com/r/xilinx/edf/tags
- Integración del sistema:
  https://edf.docs.amd.com/en/v26.06.1/osdev/operating-system-integration-and-development.html
- Manifiesto fijado:
  https://github.com/Xilinx/yocto-manifests/blob/amd-edf-rel-v26.06.1/default-edf.xml
- Base y dependencias de EDF:
  https://github.com/Xilinx/meta-amd-edf/tree/cb75a4c061568fe7fecd552a60b17af9c9e64cf1
- Máquinas y artefactos de EDF:
  https://edf.docs.amd.com/en/v26.06.1/ref/common-specifications.html
- Migración:
  https://edf.docs.amd.com/en/latest/petalinux-to-edf-migration-guide.html
- Aviso PetaLinux:
  https://docs.amd.com/r/en-US/ug1144-petalinux-tools-reference-guide/PetaLinux-Deprecation-Message
- Máquinas Kria:
  https://github.com/Xilinx/meta-kria/blob/rel-v2026.1/README.kria.bsp.md
- Guía KV260:
  https://docs.amd.com/r/en-US/ug1089-kv260-starter-kit
- Kria-PYNQ: https://github.com/Xilinx/Kria-PYNQ
- Antecedente antiguo (no validado para nuestro proyecto):
  https://github.com/Xilinx/PYNQ/blob/master/sdbuild/boot/meta-pynq/README.md
- Raíz de solo lectura:
  https://docs.yoctoproject.org/scarthgap/dev-manual/read-only-rootfs.html
- Aprovisionamiento de usuarios durante el build:
  https://docs.yoctoproject.org/scarthgap/ref-manual/classes.html#extrausers
- Estado volátil de OE-Core:
  https://github.com/openembedded/openembedded-core/blob/scarthgap/meta/recipes-core/volatile-binds/volatile-binds.bb
