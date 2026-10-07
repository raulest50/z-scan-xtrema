"""Pruebas sin conexión ni órdenes al hardware físico."""
import asyncio
import pytest
from fastapi.testclient import TestClient
from main import app
from Drivers.driver_lin_stage import LinearStage
from session import ControlSession


def test_exclusive_control_and_validation():
    with TestClient(app) as client:
        assert client.post('/api/move', json={'position_mm': 1}).status_code == 403
        with client.websocket_connect('/ws', headers={'origin': 'http://localhost:5173'}) as ws:
            ws.send_json({})
            token = ws.receive_json()['token']
            assert ws.receive_json()['type'] == 'state'
            with client.websocket_connect('/ws', headers={'origin': 'http://localhost:5173'}) as other:
                other.send_json({})
                assert other.receive_json() == {'type': 'busy'}
            headers = {'X-Control-Token': token}
            for velocity in (0, 51, 'bad'):
                assert client.post('/api/move', headers=headers, json={'position_mm': 5, 'velocity_mm_s': velocity}).status_code == 422
            assert client.post('/api/move', headers=headers, json={'position_mm': 11}).status_code == 409
            assert client.post('/api/move', headers=headers, json={'position_mm': 'bad'}).status_code == 422
            assert client.post('/api/move', headers=headers, json={'position_mm': 5, 'velocity_mm_s': 1}).json()['velocity_mm_s'] == 1
            assert client.post('/api/move', headers=headers, json={'position_mm': 2}).status_code == 409
            assert client.post('/api/stop', headers=headers).json()['moving'] is False


def test_reconnect_expiry_and_release():
    async def scenario():
        stage = LinearStage()
        session = ControlSession(stage, grace=0.02)
        claims = await asyncio.gather(session.acquire(), session.acquire())
        assert sum(c is not None for c in claims) == 1
        token, connection = next(c for c in claims if c)
        await asyncio.sleep(0.03)
        assert session.token == token  # No idle-user timeout.
        await session.move(token, 5)
        await session.disconnect(connection)
        assert not stage.moving
        assert await session.acquire() is None
        resumed = await session.acquire(token)
        assert resumed[0] == token
        with pytest.raises(PermissionError):
            await session.move('invalid', 1)
        await session.disconnect(resumed[1])
        await asyncio.sleep(0.04)
        new_token, new_connection = await session.acquire()
        assert new_token != token
        await session.disconnect(new_connection, release=True)
        assert session.token is None
        await session.close()
    asyncio.run(scenario())


def test_real_mode_fails_closed(monkeypatch):
    monkeypatch.setenv('ZSCAN_STAGE_MODE', 'unknown')
    with pytest.raises(RuntimeError):
        LinearStage()


def test_built_frontend_and_origin_rejection():
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as client:
        response = client.get('/')
        assert response.status_code == 200
        assert 'Z-Scan Xtrema' in response.text
        import re
        asset = re.search(r'src="(/assets/[^"]+)"', response.text).group(1)
        assert client.get(asset).status_code == 200
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect('/ws', headers={'origin': 'http://untrusted.example'}):
                pass


def test_camera_requires_operator_and_valid_settings():
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect('/ws/camera', headers={'origin': 'http://untrusted.example'}):
                pass
        with client.websocket_connect('/ws/camera', headers={'origin': 'http://localhost:5173'}) as camera:
            camera.send_json({'token': 'invalid', 'fps': 10})
            assert 'error' in camera.receive_json()
        for fps in (0, 60, True, '10'):
            with client.websocket_connect('/ws/camera', headers={'origin': 'http://localhost:5173'}) as camera:
                camera.send_json({'token': 'invalid', 'fps': fps})
                assert 'FPS' in camera.receive_json()['error']


def test_camera_frames_and_cleanup_without_hardware():
    closed = []

    class FakeCamera:
        async def frames(self, fps):
            assert fps == 15
            try:
                yield b'jpeg-test-frame'
                raise RuntimeError('Camera disconnected')
            finally:
                closed.append(True)

    with TestClient(app) as client:
        app.state.camera = FakeCamera()
        with client.websocket_connect('/ws', headers={'origin': 'http://localhost:5173'}) as control:
            control.send_json({})
            token = control.receive_json()['token']
            with client.websocket_connect('/ws/camera', headers={'origin': 'http://localhost:5173'}) as camera:
                camera.send_json({'token': token, 'fps': 15})
                assert camera.receive_bytes() == b'jpeg-test-frame'
                assert camera.receive_json()['error'] == 'Camera disconnected'
        assert closed == [True]
