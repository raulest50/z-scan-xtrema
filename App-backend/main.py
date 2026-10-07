"""API, WebSocket de control y distribución del frontend compilado."""
import asyncio
import os
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from Drivers.driver_lin_stage import LinearStage, XpsError
from Drivers.web_cam import WebCam
from session import ControlSession


@asynccontextmanager
async def lifespan(app):
    app.state.stage = LinearStage()
    await app.state.stage.start()
    app.state.session = ControlSession(app.state.stage)
    app.state.camera = WebCam()
    yield
    await app.state.session.close()


app = FastAPI(title="Z-Scan Xtrema", lifespan=lifespan)


class Move(BaseModel):
    position_mm: float = Field(allow_inf_nan=False)
    velocity_mm_s: float = Field(default=10.0, ge=1, le=50, allow_inf_nan=False)


class HomeRequest(BaseModel):
    confirm_clear: bool


@app.exception_handler(XpsError)
async def xps_error(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=503, content={'detail': str(exc)})


@app.post('/api/home')
async def home(body: HomeRequest, x_control_token: str = Header(default='')):
    if not body.confirm_clear:
        raise HTTPException(422, 'Confirma que el recorrido está despejado antes del homing.')
    try:
        await app.state.session.home(x_control_token)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return app.state.stage.status()


@app.get("/api/health")
async def health():
    return {"status": "ok", "mode": app.state.stage.status()["mode"]}


@app.post("/api/move")
async def move(body: Move, x_control_token: str = Header(default="")):
    try:
        await app.state.session.move(x_control_token, body.position_mm, body.velocity_mm_s)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return app.state.stage.status()


@app.post("/api/stop")
async def stop(x_control_token: str = Header(default="")):
    try:
        await app.state.session.stop(x_control_token)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    return app.state.stage.status()


@app.websocket('/ws/camera')
async def camera(ws: WebSocket):
    origins = os.getenv('ZSCAN_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,http://zscan.home.arpa,http://192.168.0.101').split(',')
    if ws.headers.get('origin') not in origins:
        await ws.close(code=1008)
        return
    await ws.accept()
    frames = None
    try:
        hello = await asyncio.wait_for(ws.receive_json(), 5)
        if not isinstance(hello, dict):
            raise ValueError('Solicitud de cámara inválida.')
        token, fps = hello.get('token'), hello.get('fps', 10)
        if type(fps) is not int or fps not in WebCam.FPS:
            raise ValueError('Selecciona 5, 10, 15, 20 o 30 FPS.')
        app.state.session.authorize_view(token)
        frames = app.state.camera.frames(fps)
        async for frame in frames:
            app.state.session.authorize_view(token)
            await asyncio.wait_for(ws.send_bytes(frame), 3)
    except WebSocketDisconnect:
        pass
    except (ValueError, PermissionError, RuntimeError, OSError, asyncio.TimeoutError) as exc:
        with suppress(RuntimeError, WebSocketDisconnect):
            await ws.send_json({'error': str(exc) or 'Tiempo de espera de cámara agotado.'})
    finally:
        if frames:
            await frames.aclose()
        with suppress(RuntimeError, WebSocketDisconnect):
            await ws.close()


@app.websocket("/ws")
async def control(ws: WebSocket):
    origins = os.getenv("ZSCAN_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,http://zscan.home.arpa,http://192.168.0.101").split(",")
    if ws.headers.get("origin") not in origins:
        await ws.close(code=1008)
        return
    await ws.accept()
    try:
        hello = await asyncio.wait_for(ws.receive_json(), timeout=5)
        if not isinstance(hello, dict):
            await ws.close(code=1008)
            return
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        await ws.close()
        return
    claim = await app.state.session.acquire(hello.get("token"))
    if claim is None:
        await ws.send_json({"type": "busy"})
        await ws.close(code=1008)
        return
    token, connection = claim
    release = False

    async def publish():
        while True:
            await ws.send_json({"type": "state", **app.state.stage.status()})
            await asyncio.sleep(0.25)

    publisher = None
    try:
        await ws.send_json({"type": "granted", "token": token})
        publisher = asyncio.create_task(publish())
        while True:
            message = await ws.receive_json()
            if isinstance(message, dict) and message.get("type") == "release":
                release = True
                break
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        if publisher:
            publisher.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await publisher
        try:
            await app.state.session.disconnect(connection, release)
        except XpsError as exc:
            if release:
                await ws.send_json({'type': 'release_failed', 'detail': str(exc)})
        else:
            if release:
                await ws.send_json({'type': 'released'})
        if release:
            await ws.close()


dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if (dist / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")


@app.get("/")
async def frontend():
    if not (dist / "index.html").is_file():
        raise HTTPException(503, "Frontend pendiente de compilar: npm run build")
    return FileResponse(dist / "index.html")
