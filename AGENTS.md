# Z-Scan Xtrema: arquitectura e implementación

## Propósito
La implementación debe ser un reflejo fiel de los diagramas de arquitectura de
Gaphor en `arquitectura/`. Los modelos son planos de trabajo y una especificación
compartida para reducir deuda técnica, deuda de conocimiento y deuda de intención:
deben explicar qué existe, qué responsabilidad tiene y por qué se separó así.

No se busca generación automática de código ni model-driven development exhaustivo.
Modelar a nivel de archivos, responsabilidades, dependencias relevantes y despliegue.
No reproducir cada función, variable, componente visual interno o detalle del framework.
El detalle solo se añade cuando resuelve una ambigüedad arquitectónica importante.

## Correspondencia con los diagramas
- El diagrama de paquetes especifica cada archivo fuente del frontend/backend y su
  función. Las notas de cada Artifact describen propósito, responsabilidades,
  dependencias y restricciones cuando sean necesarias.
- El diagrama de despliegue describe equipos, entornos y servicios y sus conexiones.
- Consultar los diagramas y el código antes de implementar. Si discrepan, explicar
  la discrepancia; no asumir que uno está actualizado ni alterar el modelo sin encargo.
- Mantener el alcance de cada archivo. Si una responsabilidad cambia, indicar la
  actualización requerida en las notas del diagrama.

## Aprobación de archivos nuevos
Solicitar aprobación explícita ANTES de crear cualquier nuevo archivo escrito por
el agente (código, prueba, configuración o documentación). Proponer nombre/ruta,
responsabilidad y motivo por el que los archivos existentes no son suficientes.
Una solicitud explícita del usuario que ya identifica el archivo cuenta como
aprobación; no pedir la misma aprobación dos veces.
Los productos automáticos normales de una operación autorizada (build, dependencias,
lockfiles, cachés y respaldos de despliegue) no son nuevas unidades arquitectónicas.
No aprovechar esa distinción para introducir archivos fuente sin aprobación.

## Organización acordada
- `App-backend/main.py`: FastAPI, endpoints, WebSocket, distribución del frontend.
- `App-backend/session.py`: control exclusivo del operador y reconexión.
- `App-backend/Drivers/driver_lin_stage.py`: adaptadores Newport y simulación.
- `App-backend/Drivers/web_cam.py`: captura USB MJPEG con FFmpeg/V4L2;
  un capturador, cola de último frame, selección de FPS y liberación del dispositivo.
- `frontend/src/streaming_image_.tsx`: imagen de cámara vía WebSocket autenticado
  por sesión de control; FPS, pausa, reintento y limpieza de recursos. Sin grabación.
- `frontend/src/main.tsx`: arranque y composición de proveedores/vistas.
- `frontend/src/Home.tsx`: panel de operación y composición de vistas.
- `frontend/src/top_banner.tsx`: identidad del laboratorio, estado de sesión por props
  y Dither Veil adaptado con ilustración conceptual raster, decorativa y horizontal
  (`assets/zscan_optical_banner.png`); no representa un montaje calibrado.
  Incluye licencia del código de terceros; no realiza comunicaciones con hardware.
- `frontend/src/z_scan_visual_component.tsx`: vista lateral del stage y posición Z;
  recibe telemetría mediante props desde Home, sin conexiones ni órdenes propias.
  Suaviza cambios recibidos, sin predecir movimiento ni confundir Z con el foco óptico.
- `frontend/src/api.ts`: peticiones HTTP al backend.
- `frontend/src/useControlSession.ts`: sesión y WebSocket del navegador.
- `frontend/src/splash_screen.tsx`: presentación inicial, SVG.js, animaciones,
  transiciones, omisión, movimiento reducido y limpieza de recursos. Archivo
  aprobado expresamente para esta iteración; añadir Artifact y nota al diagrama.
- `assets/logo_svg.svg`: identidad del laboratorio; reutilizar sin redibujar el logo.

## Instrumentación y validación
El frontend no se comunica directamente con Newport. No emitir movimientos ni homing
durante pruebas de interfaz o despliegue. Las pruebas físicas necesitan un encargo
explícito y condiciones de operación conocidas. Preservar la sesión exclusiva, los
límites y las comprobaciones de estado. Una animación de apertura no debe ocultar
controles durante una operación: mostrarla solo antes de montar la sesión de control.
No instalar dependencias en el Python global de PYNQ. Preservar cambios ajenos,
secretos y datos del modelo. Diferenciar pruebas simuladas de pruebas físicas.
