# Sistema Linux personalizado para Z-Scan Xtrema

Traspaso para continuar con un agente de desarrollo en una laptop Linux.
Fecha: 2026-10-08.

## Estado actual

Esta carpeta contiene únicamente este documento. No hay recetas, entorno de
compilación ni imagen construida o probada. Este trabajo no modificó la Kria.
El siguiente paso es preparar y validar un entorno Yocto / AMD Embedded
Development Framework (EDF) en Linux.

Leer primero el `AGENTS.md` de la raíz. Sigue vigente la aprobación previa de
archivos nuevos y la correspondencia con los modelos Gaphor, sin modelamiento
excesivo. Este documento no autoriza instalar herramientas, crear toda la
infraestructura, grabar tarjetas ni actualizar firmware: acordar la siguiente
iteración con el usuario.

## Objetivo

Crear una distribución Linux reproducible, sin escritorio, para la Kria KV260:

- PYNQ y los overlays requeridos por el laboratorio, una vez validados.
- Backend Python/FastAPI y frontend React compilado de este repositorio.
- Nginx, SSH y dnsmasq conforme a la arquitectura vigente.
- Webcam Logitech Brio 100 por V4L2/FFmpeg, sin grabación del streaming en SD.
- Servicios de inicio automático, diagnóstico y recuperación.
- Máxima resistencia práctica a desconexiones de alimentación imprevistas.

No duplicar aquí los fuentes de la aplicación. Las recetas futuras deben
empaquetar revisiones identificadas del código existente. Sin escritorio no
significa sin interfaz web. Decidir con el usuario si conservar Jupyter: PYNQ
y Jupyter son requisitos distintos.

## Por qué Yocto / EDF

Yocto proporciona recetas, capas y BitBake para construir una distribución.
EDF aporta la integración de AMD. Una futura capa `meta-zscan` mantendría
nuestras personalizaciones separadas de las capas externas.

La guía AMD UG1144 2026.1 anuncia la deprecación de las herramientas PetaLinux
para 2026.2 y recomienda EDF/Yocto. Por ello EDF es la base candidata para este
proyecto nuevo. No significa que sistemas existentes dejen de funcionar.

La documentación consultada identifica EDF 26.06.1, la rama `rel-v2026.1` y el
manifiesto `amd-edf-rel-v26.06.1`. Antes de construir, verificar vigencia y
compatibilidad y fijar revisiones exactas. No mezclar ramas ni depender de
`latest`; registrar también el digest del contenedor si se utiliza.

## Riesgo principal: integración de PYNQ

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

## Robustez requerida

- Raíz de solo lectura; evaluar SquashFS u otra solución validada.
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

Yocto/EDF no garantizan resistencia a cortes por sí solos. La SD puede fallar
internamente incluso con raíz de solo lectura. Considerar almacenamiento y
alimentación adecuados y definir qué datos recientes es aceptable perder.
Validar cortes durante funcionamiento y actualización solo en soportes de
prueba, con autorización y respaldos.

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

1. Acordar entorno, versiones y archivos nuevos con el usuario.
2. Construir una base oficial reproducible y arrancar en una SD de pruebas,
   verificando antes compatibilidad con el firmware existente.
3. Validar consola, Ethernet, SSH y detección de webcam.
4. Resolver PYNQ y un overlay representativo.
5. Incorporar Z-Scan; después validar persistencia, actualización y cortes.

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
  https://edf.docs.amd.com/en/latest/osdev/operating-system-integration-and-development.html
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
  https://docs.yoctoproject.org/dev/security-manual/read-only-rootfs.html
