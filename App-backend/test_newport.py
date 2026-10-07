"""Pruebas del driver real con transporte falso; ninguna conexión física."""
import asyncio
import pytest
from Drivers.driver_lin_stage import NewportStage, XpsError
from session import ControlSession


class FakeXps(NewportStage):
    def __init__(self):
        super().__init__()
        self.code = 0
        self.commands = []
        self.hold_home = False
        self.entered = asyncio.Event()
        self.fail_stop = False
        self.fail_move = False

    async def _call(self, command, timeout=3):
        self.commands.append(command)
        name = command.split('(')[0]
        if name == 'FirmwareVersionGet': return 'XPS-RL V1.0'
        if name == 'ObjectsListGet': return 'Group1;Group1.Pos;'
        if name == 'PositionerStageParameterGet':
            return '26' if 'HomeSearchTimeOut' in command else 'IMS600CCHA'
        if name == 'GroupStatusGet': return str(self.code)
        if name == 'GroupPositionCurrentGet': return '8.004'
        if name == 'PositionerUserTravelLimitsGet': return '0,600'
        if name == 'GroupStatusStringGet': return f'State {self.code}'
        if name == 'GroupInitialize': self.code = 42
        elif name == 'GroupHomeSearch':
            assert self.code == 42
            self.code = 43
            self.entered.set()
            if self.hold_home: await asyncio.Event().wait()
            self.code = 11
        elif name == 'PositionerSGammaParametersGet': return '200,600,0.005,0.05'
        elif name == 'PositionerSGammaParametersSet': pass
        elif name == 'GroupMoveAbsolute':
            assert self.code in self.READY
            if self.fail_move: raise XpsError('Lost reply')
            self.code = 12
        elif name in {'GroupKill', 'GroupMoveAbort'}:
            if self.fail_stop: raise XpsError('Lost connection')
            self.code = 7 if name == 'GroupKill' else 13
        else: raise AssertionError(command)
        return ''


def test_real_state_machine():
    async def run():
        stage = FakeXps()
        await stage.start()
        assert not any(c.startswith(('GroupInitialize(', 'GroupHomeSearch(', 'GroupKill(')) for c in stage.commands)
        with pytest.raises(ValueError): await stage.move(10)
        await stage.home()
        await stage.task
        assert stage.status()['ready']
        with pytest.raises(ValueError): await stage.move(601)
        with pytest.raises(ValueError): await stage.move(float('nan'))
        await stage.move(10)
        await stage.task
        assert 'PositionerSGammaParametersSet(Group1.Pos,10.0,600.0,0.005,0.05)' in stage.commands
        assert 'GroupMoveAbsolute(Group1,10.000000000)' in stage.commands
        with pytest.raises(ValueError): await stage.home()  # No implicit kill to re-home.
        await stage.close()
    asyncio.run(run())


def test_homing_cancel_is_independent():
    async def run():
        stage = FakeXps()
        await stage.start()
        stage.hold_home = True
        await stage.home()
        await stage.entered.wait()
        await asyncio.wait_for(stage.stop(), 1)
        assert stage.code == 7
        assert 'GroupKill(Group1)' in stage.commands
        assert not stage.status()['ready']
        await stage.close()
    asyncio.run(run())


def test_uncertain_command_never_retries_and_holds_session():
    async def run():
        stage = FakeXps()
        await stage.start()
        stage.code = 11
        session = ControlSession(stage, grace=0.01)
        token, connection = await session.acquire()
        stage.fail_move = stage.fail_stop = True
        await session.move(token, 10)
        await stage.task
        assert stage.uncertain
        assert sum(c.startswith('GroupMoveAbsolute') for c in stage.commands) == 1
        with pytest.raises(XpsError): await session.disconnect(connection, release=True)
        await asyncio.sleep(0.02)
        assert session.token == token
        assert await session.acquire() is None
        resumed = await session.acquire(token)
        assert resumed
        stage.fail_stop = False
        await session.stop(token)
        assert not stage.uncertain
        await session.disconnect(resumed[1], release=True)
        await session.close()
    asyncio.run(run())


def test_fragmented_tcp_response():
    async def run():
        async def server(reader, writer):
            await reader.read(1024)
            writer.write(b'0,12.3,End')
            await writer.drain()
            await asyncio.sleep(0.01)
            writer.write(b'OfAPI')
            await writer.drain()
            writer.close()
        listener = await asyncio.start_server(server, '127.0.0.1', 0)
        stage = NewportStage()
        stage.host = '127.0.0.1'
        stage.port = listener.sockets[0].getsockname()[1]
        assert await stage._call('Read()') == '12.3'
        listener.close()
        await listener.wait_closed()
    asyncio.run(run())
