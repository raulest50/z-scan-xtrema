# Sistema Linux personalizado para Z-Scan Xtrema

Traspaso para continuar con un agente de desarrollo en una laptop Linux.
Fecha: 2026-10-08.

## Estado actual

Existe una receta inicial en
[`xtreme-zscan-poff-resistant/xtreme-zscan-poff-resistant.bb`](xtreme-zscan-poff-resistant/xtreme-zscan-poff-resistant.bb).
Define un rootfs de solo lectura sobre AMD Embedded Development Framework
(EDF). Aún no hay entorno de compilación, imagen construida ni pruebas en la
placa. Este trabajo no modificó la Kria.

Leer primero el `AGENTS.md` de la raíz. Sigue vigente la aprobación previa de
archivos nuevos y la correspondencia con los modelos Gaphor, sin modelamiento
excesivo. Este documento no autoriza instalar herramientas, crear toda la
infraestructura, grabar tarjetas ni actualizar firmware: acordar la siguiente
iteración con el usuario.

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

No duplicar aquí los fuentes de la aplicación. Las recetas futuras deben
empaquetar revisiones identificadas del código existente. Sin escritorio no
significa sin interfaz web. PYNQ y Jupyter no forman parte de la base inicial.

## Por qué Yocto / EDF

Yocto proporciona recetas, capas y BitBake para construir una distribución.
EDF aporta la integración de AMD. Una futura capa `meta-zscan` mantendría
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
de `meta-pynq` antiguo ni de scripts de inicialización SysV. Registrar también
el digest del contenedor cuando se prepare el entorno.

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
3. Evaluar Docker Engine y el contenedor oficial `xilinx/edf` para aislar las
   dependencias. Docker sería una herramienta del PC, no un requisito en Kria.
4. Preparar Git, `repo` y el manifiesto siguiendo el flujo oficial, sin duplicar
   herramientas que ya proporcione el contenedor.
5. Mantener build, descargas, cachés y fuentes externas fuera del repositorio,
   en almacenamiento Linux nativo. Aquí solo van nuestras definiciones.

Presupuesto práctico, no mínimo oficial: 16–32 GB de RAM y 250–300 GB libres en
SSD. Ajustar tareas paralelas a recursos reales. No hace falta descargar todas
las cachés precompiladas de AMD para empezar.

No instalar PetaLinux, Vivado o Vitis por costumbre: comprobar primero qué
requiere el flujo seleccionado. `meta-kria` rel-v2026.1 documenta
`k26-smk-kv-sdt` para KV260; verificar el flujo de imagen y firmware antes de
adoptar ese MACHINE como configuración definitiva.

## Receta inicial: xtreme-zscan-poff-resistant

Responsabilidad: definir el contenido y la política de escritura del rootfs.
El README documenta las decisiones; el `.bb` permite ejecutarlas en BitBake.
Por ahora se registra directamente mediante `BBFILES`; todavía no es una capa
`meta-zscan` ni una distribución independiente de `amd-edf`.

La receta configura:

- Salida SquashFS y `read-only-rootfs`: no hay postinstalación pendiente para
  el primer arranque ni gestor de paquetes para actualizar la raíz en sitio.
- systemd y `volatile-binds` de OE-Core para estado transitorio en RAM.
- `/run` y `/tmp` limitados a 64 MiB cada uno; `/var/volatile`, a 128 MiB.
- Journal volátil de hasta 16 MiB; sin volcados de memoria a disco.
- `fstab` sin swap ni particiones de datos; descubrimiento automático GPT de
  systemd deshabilitado. El arranque deberá proporcionar `root=` explícito.
- Consola con contraseña provisionada al construir, sin contraseña de fábrica
  ni cambio obligatorio en el primer arranque sobre `/etc` de solo lectura.

El estado de `volatile-binds`, los temporales y los logs se pierden al apagar.
**No son un lugar para guardar mediciones.** Los límites de RAM son iniciales
y deben contrastarse con el consumo real. No se incluye todavía el servidor
SSH, configuración de red de producto, webcam, aplicación ni FPGA.

### Registro y compilación futura

Ejecutar en un host compatible, dentro de Bash y en un directorio de trabajo
externo a este repositorio. Estos comandos documentan el flujo oficial; aún
no se ejecutaron aquí:

```bash
repo init -u https://github.com/Xilinx/yocto-manifests.git \
  -b refs/tags/amd-edf-rel-v26.06.1 -m default-edf.xml
repo sync
source edf-init-build-env
```

En `conf/local.conf` del build, conservando la configuración creada por EDF:

```bitbake
DISTRO = "amd-edf"
MACHINE = "amd-cortexa53-mali-common"
# Ajustar a la ruta absoluta visible desde el host o contenedor de build.
BBFILES += "/ruta/z-scan-xtrema/custom-OS/xtreme-zscan-poff-resistant/xtreme-zscan-poff-resistant.bb"
```

Generar un hash con `openssl passwd -6`, que pide la contraseña de forma
interactiva. Escapar cada `$` del resultado como `\$` y asignarlo a
`ZSCAN_ROOT_PASSWORD_HASH:pn-xtreme-zscan-poff-resistant` en la configuración
privada del build. El valor debe ser un hash SHA-512 crypt completo, incluyendo
sal y hash; no una contraseña en claro. La receta rechaza valores vacíos o
mal formados. No guardar esa configuración ni el hash en Git. El hash formará
parte del rootfs y de los artefactos de build, que también deben protegerse.

El acceso inicial será `root` por consola serie. Las credenciales definitivas,
la identidad por dispositivo y las claves de host SSH pertenecen a la futura
etapa de aprovisionamiento; no generar una clave SSH compartida para todas
las placas.

Después de configurar el hash:

```bash
bitbake -p
bitbake xtreme-zscan-poff-resistant
```

El resultado esperado es un `.squashfs` bajo
`tmp/deploy/images/amd-cortexa53-mali-common/`. **No es una imagen completa
que pueda grabarse directamente en una SD para arrancar.** Falta integrar
kernel, device tree, arranque e imagen de disco mediante el flujo EDF para
Kria. Verificar `CONFIG_SQUASHFS`, soporte del compresor zlib y del dispositivo
raíz en kernel/initramfs, además de parámetros `root=`, `rootfstype=squashfs`
y `ro`. `k26-smk-kv-sdt` corresponde al flujo de firmware de la placa; no
sustituye automáticamente al MACHINE de Linux común.

Validación local realizada: sintaxis de las funciones Python y shell,
aceptación de un hash de prueba y rechazo de configuraciones inválidas,
y ejecución del postprocesado sobre un directorio temporal. Se comprobaron
los montajes declarados y la configuración de logs. No equivale a parsear
o compilar con BitBake, que no está instalado en este entorno, ni a probar
montajes reales, arranque o cortes de energía.

### Correspondencia con la arquitectura

`arquitectura/ArquitecturaGaphor.gaphor` aún describe Ubuntu 22.04/PYNQ y el
despliegue anterior. La receta define una base futura, no un cambio ya
desplegado. Cuando se adopte, actualizar el nodo de sistema operativo y las
notas de almacenamiento, servicios y uso opcional del FPGA. El modelo no se
modificó en esta iteración.

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
5. Incorporar red/SSH, webcam y Z-Scan, manteniendo las garantías anteriores.
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
