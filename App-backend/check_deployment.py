"""Verificación remota: HTTP y exclusividad, sin enviar movimientos."""
import asyncio
import json
import urllib.request
import websockets
import argparse


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['simulation', 'newport'], default='simulation')
    expected = parser.parse_args().mode
    base = 'http://192.168.0.101:8000'
    for path in ('/', '/api/health'):
        with urllib.request.urlopen(base + path, timeout=10) as response:
            assert response.status == 200
            print(path, response.status)
    async with websockets.connect('ws://192.168.0.101:8000/ws', origin=base) as first:
        await first.send('{}')
        granted = json.loads(await first.recv())
        assert granted['type'] == 'granted'
        state = json.loads(await first.recv())
        assert state['mode'] == expected
        print('Estado:', state)
        if expected == 'newport':
            assert state['connected'] and state['model'] == 'IMS600CCHA'
            assert not state['moving'] and state['operation'] is None
        async with websockets.connect('ws://192.168.0.101:8000/ws', origin=base) as second:
            await second.send('{}')
            assert json.loads(await second.recv())['type'] == 'busy'
        await first.send(json.dumps({'type': 'release'}))
        await asyncio.wait_for(first.wait_closed(), timeout=5)
    async with websockets.connect('ws://192.168.0.101:8000/ws', origin=base) as third:
        await third.send('{}')
        assert json.loads(await third.recv())['type'] == 'granted'
        await third.send(json.dumps({'type': 'release'}))
        await asyncio.wait_for(third.wait_closed(), timeout=5)
    print('OK: frontend, API, estado, exclusividad y liberación. No se enviaron movimientos.')


asyncio.run(main())
