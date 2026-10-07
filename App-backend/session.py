"""Reserva exclusiva en memoria para una sola instancia/worker."""
import asyncio
import secrets


class ControlSession:
    def __init__(self, stage, grace=10.0):
        self.stage = stage
        self.grace = grace
        self.lock = asyncio.Lock()
        self.token = None
        self.connection = None
        self.expiry = None

    async def acquire(self, previous=None):
        async with self.lock:
            if self.token and (previous != self.token or self.connection is not None):
                return None
            if self.token is None and not await self.stage.available():
                return None
            if self.expiry:
                self.expiry.cancel()
                self.expiry = None
            self.token = self.token or secrets.token_urlsafe(32)
            self.connection = secrets.token_hex(16)
            return self.token, self.connection

    async def move(self, token, position, velocity=10.0):
        async with self.lock:
            self._authorize(token)
            await self.stage.move(position, velocity)

    async def stop(self, token):
        async with self.lock:
            self._authorize(token)
            await self.stage.stop()

    async def home(self, token):
        async with self.lock:
            self._authorize(token)
            await self.stage.home()

    def _authorize(self, token):
        if not token or token != self.token or self.connection is None:
            raise PermissionError("Sesión de control no válida o desconectada.")

    def authorize_view(self, token):
        """Validate camera access without acquiring control or calling hardware."""
        self._authorize(token)

    async def disconnect(self, connection, release=False):
        async with self.lock:
            if self.connection != connection:
                return
            # Confirmar parada antes de permitir que otro operador tome control.
            try:
                await self.stage.stop()
            finally:
                self.connection = None
            if release:
                self.token = None
            else:
                self.expiry = asyncio.create_task(self._expire(self.token))

    async def _expire(self, token):
        await asyncio.sleep(self.grace)
        async with self.lock:
            if self.token == token and self.connection is None:
                self.token = None

    async def close(self):
        if self.expiry:
            self.expiry.cancel()
        await self.stage.close()
