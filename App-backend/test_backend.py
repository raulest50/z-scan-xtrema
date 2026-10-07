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
            assert client.post('/api/move', headers=headers, json={'position_mm': 11}).status_code == 409
            assert client.post('/api/move', headers=headers, json={'position_mm': 'bad'}).status_code == 422
            assert client.post('/api/move', headers=headers, json={'position_mm': 5}).status_code == 200
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
