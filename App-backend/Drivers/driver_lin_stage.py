"""Adaptador de movimiento. Simulación explícita; hardware pendiente de validación."""
import asyncio
import math
import os
import time


class LinearStage:
    def __init__(self):
        if os.getenv("ZSCAN_STAGE_MODE", "simulation") != "simulation":
            raise RuntimeError("Modo físico bloqueado: falta validar API, eje y límites Newport.")
        self.position = 0.0
        self.target = 0.0
        self.moving = False
        self.task = None

    def status(self):
        return {"mode": "simulation", "position_mm": self.position,
                "target_mm": self.target, "moving": self.moving,
                "min_mm": -10.0, "max_mm": 10.0}

    async def move(self, position: float):
        if not math.isfinite(position) or not -10 <= position <= 10:
            raise ValueError("Posición fuera del rango simulado [-10, 10] mm.")
        if self.moving:
            raise ValueError("Hay un movimiento en curso.")
        self.target = position
        self.moving = True
        self.task = asyncio.create_task(self._motion())

    async def _motion(self):
        previous = time.monotonic()
        try:
            while self.position != self.target:
                await asyncio.sleep(0.05)
                now = time.monotonic()
                step = min(abs(self.target - self.position), (now - previous) * 2)
                previous = now
                self.position += math.copysign(step, self.target - self.position)
        finally:
            self.moving = False

    async def stop(self):
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None
        self.moving = False
        self.target = self.position

    async def close(self):
        await self.stop()
