"""Newport XPS-RL ASCII TCP y simulación. Ninguna escritura al iniciar."""
import asyncio
import math
import os
import time


class SimulatedStage:
    def __init__(self):
        self.position = 0.0
        self.target = 0.0
        self.moving = False
        self.task = None
        self.velocity = 10.0

    def status(self):
        return {"mode": "simulation", "position_mm": self.position,
                "target_mm": self.target, "moving": self.moving,
                "min_mm": -10.0, "max_mm": 10.0, "ready": not self.moving,
                "connected": True, "can_home": False, "state_label": "Simulación",
                "operation": "move" if self.moving else None, "error": None,
                "velocity_mm_s": self.velocity}

    async def start(self):
        pass

    async def available(self):
        return not self.moving

    async def home(self):
        await self.move(0)

    async def move(self, position: float, velocity=10.0):
        if not math.isfinite(velocity) or not 1 <= velocity <= 50:
            raise ValueError('Velocidad permitida: 1 a 50 mm/s.')
        if not math.isfinite(position) or not -10 <= position <= 10:
            raise ValueError("Posición fuera del rango simulado [-10, 10] mm.")
        if self.moving:
            raise ValueError("Hay un movimiento en curso.")
        self.target = position
        self.velocity = velocity
        self.moving = True
        self.task = asyncio.create_task(self._motion())

    async def _motion(self):
        previous = time.monotonic()
        try:
            while self.position != self.target:
                await asyncio.sleep(0.05)
                now = time.monotonic()
                step = min(abs(self.target - self.position), (now - previous) * self.velocity)
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


class XpsError(RuntimeError):
    pass


class NewportStage:
    READY = {10, 11, 12, 13, 14, 15, 16, 17, 18}
    NOTINIT = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 50, 63}
    IDLE = READY | NOTINIT | {42} | set(range(20, 40))

    def __init__(self):
        self.host = os.getenv('ZSCAN_XPS_HOST', '192.168.0.254')
        self.port = int(os.getenv('ZSCAN_XPS_PORT', '5001'))
        self.group = 'Group1'
        self.axis = 'Group1.Pos'
        self.task = None
        self.poller = None
        self.operation = None
        self.fault = None
        self.uncertain = False
        self.verified = False
        self.read_lock = asyncio.Lock()
        self.data = dict(mode='newport', connected=False, ready=False, can_home=False,
                         moving=False, position_mm=None, target_mm=None, min_mm=None,
                         max_mm=None, state_code=None, state_label='Conectando',
                         model=None, firmware=None, error=None, velocity_mm_s=None)

    async def _call(self, command, timeout=3):
        """Un socket por transacción: la parada nunca espera al socket de movimiento."""
        writer = None
        try:
            async def exchange():
                nonlocal writer
                reader, writer = await asyncio.open_connection(self.host, self.port)
                writer.write(command.encode('ascii'))
                await writer.drain()
                response = await reader.readuntil(b',EndOfAPI')
                payload = response[:-9].decode('ascii')
                code, _, value = payload.partition(',')
                if int(code) != 0:
                    raise XpsError(f'{command.split("(")[0]}: error Newport {code}: {value}')
                return value
            return await asyncio.wait_for(exchange(), timeout)
        except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError,
                asyncio.LimitOverrunError, UnicodeError, ValueError) as exc:
            raise XpsError(f'Comunicación XPS incierta: {type(exc).__name__}. No se reintenta la orden.') from exc
        finally:
            if writer:
                writer.close()
                try:
                    await asyncio.wait_for(writer.wait_closed(), 1)
                except (OSError, asyncio.TimeoutError):
                    pass

    async def start(self):
        # Validar identidad y topología antes de habilitar operaciones.
        try:
            firmware = await self._call('FirmwareVersionGet(char *)')
            objects = (await self._call('ObjectsListGet(char *)')).split(';')
            model = await self._call(f'PositionerStageParameterGet({self.axis},SmartStageName,char *)')
            axes = [name for name in objects if name.startswith(self.group + '.')]
            if firmware != 'XPS-RL V1.0' or axes != [self.axis] or model != 'IMS600CCHA':
                raise XpsError('Identidad/topología distinta de la validada: revisar configuración.')
            self.data.update(firmware=firmware, model=model)
            self.verified = True
            self.home_timeout = float(await self._call(f'PositionerStageParameterGet({self.axis},HomeSearchTimeOut,char *)')) + 15
            await self.refresh()
        except (XpsError, ValueError) as exc:
            self.uncertain = True
            self.fault = str(exc)
        self.poller = asyncio.create_task(self._poll())

    async def refresh(self):
        async with self.read_lock:
            try:
                code = int(await self._call(f'GroupStatusGet({self.group},int *)'))
                pos = float(await self._call(f'GroupPositionCurrentGet({self.axis},double *)'))
                limits = [float(v) for v in (await self._call(f'PositionerUserTravelLimitsGet({self.axis},double *,double *)')).split(',')]
                if len(limits) != 2 or not all(math.isfinite(v) for v in [pos, *limits]) or not 0 <= limits[0] < limits[1] <= 600:
                    raise XpsError('Posición/límites no válidos para IMS600CCHA.')
                label = await self._call(f'GroupStatusStringGet({code},char *)')
                self.data.update(connected=True, state_code=code, position_mm=pos,
                                 min_mm=limits[0], max_mm=limits[1], state_label=label,
                                 moving=code not in self.IDLE)
            except (XpsError, ValueError) as exc:
                self.data.update(connected=False, ready=False, can_home=False)
                raise XpsError(str(exc)) from exc

    async def _poll(self):
        while True:
            try:
                await self.refresh()
            except XpsError as exc:
                self.fault = str(exc)
                if self.operation:
                    self.uncertain = True
                    try:
                        await self.stop()
                    except XpsError:
                        pass
            await asyncio.sleep(0.5)

    def status(self):
        valid = self.data['connected'] and self.verified and not self.uncertain
        return {**self.data, 'operation': self.operation, 'error': self.fault,
                'ready': valid and not self.operation and self.data['state_code'] in self.READY,
                'can_home': valid and not self.operation and self.data['state_code'] in {0, 7, 42}}

    async def available(self):
        try:
            await self.refresh()
        except XpsError:
            return False
        return self.verified and not self.uncertain and not self.operation and self.data['state_code'] in self.IDLE

    async def _failed_operation(self, exc):
        self.fault = str(exc)
        self.uncertain = True
        # Sin reintentos de movimiento. Intentar detener por una conexión separada.
        try:
            await self._call(f'GroupKill({self.group})', 10)
            await self.refresh()
        except XpsError as stop_error:
            self.fault += '; parada no confirmada: ' + str(stop_error)

    async def home(self):
        await self.refresh()
        if not self.status()['can_home']:
            raise ValueError('Homing permitido solo desde estado inicial, abortado o sin referencia. No se borran fallos automáticamente.')
        self.fault = None
        self.operation = 'homing'
        self.task = asyncio.create_task(self._run_home())

    async def _run_home(self):
        try:
            if self.data['state_code'] != 42:
                await self._call(f'GroupInitialize({self.group})', 30)
            await self.refresh()
            if self.data['state_code'] != 42:
                raise XpsError('Inicialización no alcanzó NOT REFERENCED.')
            await self._call(f'GroupHomeSearch({self.group})', self.home_timeout)
            await self.refresh()
            if self.data['state_code'] not in self.READY:
                raise XpsError('El controlador no confirmó READY tras homing.')
        except (XpsError, ValueError) as exc:
            await self._failed_operation(exc)
        finally:
            self.operation = None

    async def move(self, position, velocity=10.0):
        if not math.isfinite(velocity) or not 1 <= velocity <= 50:
            raise ValueError('Velocidad permitida: 1 a 50 mm/s.')
        await self.refresh()
        if not self.status()['ready']:
            raise ValueError('El eje debe estar referenciado y listo; comprueba su estado.')
        if not math.isfinite(position) or not self.data['min_mm'] <= position <= self.data['max_mm']:
            raise ValueError('Posición fuera de los límites reales del controlador.')
        self.fault = None
        self.data['target_mm'] = position
        self.operation = 'move'
        self.task = asyncio.create_task(self._run_move(position, velocity))

    async def _run_move(self, position, velocity):
        try:
            # Conservar aceleración y jerk; limitar velocidad de los movimientos de esta app.
            gamma = [float(v) for v in (await self._call(f'PositionerSGammaParametersGet({self.axis},double *,double *,double *,double *)')).split(',')]
            if len(gamma) != 4 or not all(math.isfinite(v) and v > 0 for v in gamma):
                raise XpsError('Parámetros de trayectoria inválidos.')
            maximum = [float(v) for v in (await self._call(f'PositionerMaximumVelocityAndAccelerationGet({self.axis},double *,double *)')).split(',')]
            if len(maximum) != 2 or not all(math.isfinite(v) and v > 0 for v in maximum) or velocity > maximum[0]:
                raise XpsError('Velocidad solicitada supera el límite validado del controlador.')
            gamma[0] = float(velocity)
            await self._call(f'PositionerSGammaParametersSet({self.axis},' + ','.join(map(str, gamma)) + ')')
            self.data['velocity_mm_s'] = gamma[0]
            # 600 mm a 1 mm/s puede superar el antiguo timeout de 180 s.
            await self._call(f'GroupMoveAbsolute({self.group},{position:.9f})', 600 / velocity + 60)
            await self.refresh()
            if self.data['state_code'] not in self.READY:
                raise XpsError('Movimiento finalizado sin confirmación READY.')
        except (XpsError, ValueError) as exc:
            await self._failed_operation(exc)
        finally:
            self.operation = None

    async def stop(self):
        # Cancelar primero la secuencia evita lanzar HomeSearch después de una parada.
        if not self.verified:
            raise XpsError('Identidad del controlador no validada; no se envían órdenes.')
        pending = self.operation is not None or self.uncertain
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        self.operation = None
        try:
            if pending and not self.data['connected']:
                await self._call(f'GroupKill({self.group})', 10)
            await self.refresh()
            code = self.data['state_code']
            if code in {44, 47}:
                await self._call(f'GroupMoveAbort({self.group})', 10)
            elif code not in self.IDLE or pending:
                # Homing/initialization cannot be aborted with GroupMoveAbort.
                await self._call(f'GroupKill({self.group})', 10)
            # El acuse de la orden no garantiza que la desaceleración haya terminado.
            deadline = time.monotonic() + 10
            while True:
                await self.refresh()
                if self.data['state_code'] in self.IDLE:
                    break
                if time.monotonic() >= deadline:
                    raise XpsError('Parada no confirmada. Mantener el equipo reservado.')
                await asyncio.sleep(0.1)
            self.data['target_mm'] = self.data['position_mm']
            self.uncertain = False
            self.fault = None
        except XpsError as exc:
            self.uncertain = True
            self.fault = 'No se pudo confirmar la parada: ' + str(exc)
            raise

    async def close(self):
        if self.poller:
            self.poller.cancel()
            try:
                await self.poller
            except asyncio.CancelledError:
                pass
        if self.operation:
            await self.stop()


def LinearStage():
    mode = os.getenv('ZSCAN_STAGE_MODE', 'simulation')
    if mode == 'simulation':
        return SimulatedStage()
    if mode == 'newport':
        return NewportStage()
    raise RuntimeError(f'Modo desconocido: {mode}')
