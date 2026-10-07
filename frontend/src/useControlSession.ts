import { useEffect, useRef, useState } from 'react'
export type StageState = { position_mm: number | null; target_mm: number | null; moving: boolean; mode: string; connected: boolean; ready: boolean; can_home: boolean; state_label: string; state_code: number | null; operation: string | null; error: string | null; min_mm: number | null; max_mm: number | null; model?: string; velocity_mm_s?: number }
type Status = 'connecting' | 'active' | 'busy' | 'released' | 'offline'

/** Reserva por pestaña; los ping/pong son gestionados por WebSocket/Uvicorn. */
export function useControlSession() {
  const [status, setStatus] = useState<Status>('connecting')
  const [stage, setStage] = useState<StageState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const token = useRef(sessionStorage.getItem('zscan-control') ?? '')
  const socket = useRef<WebSocket | null>(null)
  const released = useRef(false)
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    released.current = false
    function connect() {
      if (disposed || released.current) return
      setStatus('connecting')
      let busy = false
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`)
      socket.current = ws
      ws.onopen = () => ws.send(JSON.stringify({ token: token.current || null }))
      ws.onmessage = event => {
        if (disposed) return
        const data = JSON.parse(event.data)
        if (data.type === 'granted') {
          token.current = data.token
          sessionStorage.setItem('zscan-control', data.token)
          setStatus('active')
        } else if (data.type === 'busy') {
          busy = true; token.current = ''
          sessionStorage.removeItem('zscan-control'); setStatus('busy')
        } else if (data.type === 'released') {
          released.current = true; token.current = ''
          sessionStorage.removeItem('zscan-control'); setStage(null); setStatus('released')
        } else if (data.type === 'release_failed') {
          released.current = false
          setStage(current => current ? {...current, error: data.detail} : current)
        } else if (data.type === 'state') setStage(data)
      }
      ws.onclose = () => {
        if (disposed || busy || released.current) return
        setStatus('offline'); timer = setTimeout(connect, 2000)
      }
    }
    connect()
    return () => { disposed = true; clearTimeout(timer); socket.current?.close() }
  }, [attempt])
  function release() {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify({ type: 'release' }))
    else socket.current?.close()
  }
  return { status, stage, token, release, retry: () => setAttempt(x => x + 1) }
}
