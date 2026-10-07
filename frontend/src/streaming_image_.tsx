import { useEffect, useRef, useState } from 'react'
import { Badge, Box, Button, Flex, Heading, Text } from '@chakra-ui/react'
import { CAMERA_FPS } from './user_preferences'

/** Vista USB del operador activo; sin órdenes al stage ni conexiones USB locales. */
export default function StreamingImage({ token, fps, onFpsChange }: { token: string; fps: number; onFpsChange: (fps: number) => void }) {
  const [paused, setPaused] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('Conectando cámara…')
  const [failed, setFailed] = useState(false)
  const picture = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (paused || !token) return
    let disposed = false
    let current = ''
    let loading = false
    setFailed(false)
    setStatus('Conectando cámara…')
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/camera`)
    ws.binaryType = 'blob'
    ws.onopen = () => ws.send(JSON.stringify({ token, fps }))
    ws.onmessage = event => {
      if (disposed) return
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data)
        if (message.error) { setFailed(true); setStatus(message.error) }
        return
      }
      // Drop frames while the browser decodes; never accumulate a display queue.
      if (loading || !picture.current) return
      loading = true
      const next = URL.createObjectURL(event.data)
      if (current) URL.revokeObjectURL(current)
      current = next
      picture.current.onload = () => { loading = false; setStatus('En directo') }
      picture.current.onerror = () => { loading = false; setFailed(true); setStatus('No se pudo mostrar la imagen.') }
      picture.current.src = next
    }
    ws.onclose = () => {
      if (!disposed) { setFailed(true); setStatus(value => value === 'En directo' || value === 'Conectando cámara…' ? 'Cámara desconectada. Pulsa Reintentar.' : value) }
    }
    return () => {
      disposed = true
      ws.close()
      if (current) URL.revokeObjectURL(current)
      if (picture.current) {
        picture.current.onload = null
        picture.current.onerror = null
        picture.current.removeAttribute('src')
      }
    }
  }, [token, fps, paused, attempt])

  return <Box className="camera-content" bg="white" p={3} height="100%" minH="300px" display="flex" flexDirection="column" gap={2}>
    <Flex align="center" justify="space-between" gap={2} wrap="wrap" flexShrink={0}>
      <Box><Heading size="xl">Vista del laboratorio</Heading><Text fontSize="sm" color="gray.600">Logitech Brio 100 · 1280 × 720 · sin audio ni grabación</Text></Box>
      <Flex align="center" gap={3} wrap="wrap">
        <label htmlFor="camera-fps">FPS solicitados: </label>
        <select id="camera-fps" value={fps} onChange={e => onFpsChange(Number(e.target.value))} style={{ padding: '8px', border: '1px solid #bcccdc', borderRadius: '6px' }}>
          {CAMERA_FPS.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <Button variant="outline" onClick={() => setPaused(value => !value)}>{paused ? 'Reanudar' : 'Pausar cámara'}</Button>
        {failed && !paused && <Button onClick={() => setAttempt(value => value + 1)}>Reintentar</Button>}
      </Flex>
    </Flex>
    <Badge colorPalette={failed ? 'orange' : 'teal'} alignSelf="start" flexShrink={0} role="status">{paused ? 'Cámara pausada' : status}</Badge>
    <Box className="camera-image" bg="#102a43" borderRadius="lg" overflow="hidden" width="100%" flex="1" minH="100px" position="relative">
      <img ref={picture} alt="Vista en directo del laboratorio" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', visibility: paused || failed ? 'hidden' : 'visible' }} />
    </Box>
    <Text flexShrink={0} fontSize="xs" color="gray.600">Vista auxiliar con latencia; no sustituye la supervisión ni la parada de emergencia física. La tasa efectiva depende de la cámara y la red.</Text>
  </Box>
}
