"""Captura USB MJPEG con FFmpeg, sin dependencias Python ni acceso al stage.

Una captura por proceso; cola de un frame para descartar imágenes atrasadas.
ZSCAN_CAMERA_DEVICE permite seleccionar una ruta V4L2 persistente explícita.
"""
import asyncio
import os
from contextlib import suppress
from pathlib import Path


class WebCam:
    FPS = (5, 10, 15, 20, 30)

    def __init__(self):
        self.lock = asyncio.Lock()

    @staticmethod
    def device():
        configured = os.getenv('ZSCAN_CAMERA_DEVICE')
        if configured:
            return configured
        candidates = sorted(Path('/dev/v4l/by-id').glob('*Brio*video-index0'))
        if candidates:
            return str(candidates[0])
        # Do not silently open a different camera when USB enumeration changes.
        for name in sorted(Path('/sys/class/video4linux').glob('video*/name')):
            if name.read_text().strip() == 'Brio 100':
                return '/dev/' + name.parent.name
        raise RuntimeError('Logitech Brio 100 no detectada. Comprueba el USB.')

    async def frames(self, fps):
        if fps not in self.FPS:
            raise ValueError('FPS no admitidos.')
        if self.lock.locked():
            raise RuntimeError('La cámara ya tiene una captura activa. Reintenta en un momento.')
        async with self.lock:
            process = None
            reader = None
            queue = asyncio.Queue(maxsize=1)

            async def capture():
                buffer = bytearray()
                try:
                    while True:
                        chunk = await asyncio.wait_for(process.stdout.read(65536), 8)
                        if not chunk:
                            raise RuntimeError('La cámara dejó de enviar imágenes.')
                        buffer.extend(chunk)
                        while True:
                            start = buffer.find(b'\xff\xd8')
                            end = buffer.find(b'\xff\xd9', max(0, start))
                            if start < 0 or end < 0:
                                break
                            frame = bytes(buffer[start:end + 2])
                            del buffer[:end + 2]
                            if queue.full():
                                queue.get_nowait()
                            queue.put_nowait(frame)
                        if len(buffer) > 4 * 1024 * 1024:
                            raise RuntimeError('Formato de imagen inesperado.')
                except Exception:
                    if queue.full():
                        queue.get_nowait()
                    queue.put_nowait(RuntimeError('Captura interrumpida: comprueba la cámara y reintenta.'))

            try:
                process = await asyncio.create_subprocess_exec(
                    'ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error',
                    '-f', 'v4l2', '-input_format', 'mjpeg', '-video_size', '1280x720',
                    '-framerate', str(fps), '-i', self.device(),
                    '-an', '-c:v', 'copy', '-f', 'image2pipe', 'pipe:1',
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                )
                reader = asyncio.create_task(capture())
                while True:
                    frame = await queue.get()
                    if isinstance(frame, Exception):
                        raise frame
                    yield frame
            finally:
                if reader:
                    reader.cancel()
                    with suppress(asyncio.CancelledError):
                        await reader
                if process and process.returncode is None:
                    with suppress(ProcessLookupError):
                        process.terminate()
                    try:
                        await asyncio.wait_for(process.wait(), 2)
                    except asyncio.TimeoutError:
                        with suppress(ProcessLookupError):
                            process.kill()
                        await process.wait()
