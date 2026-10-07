import { useState } from 'react'
import { Badge, Box, Button, Flex, Heading, Input, Stack, Text } from '@chakra-ui/react'
import { command } from './api'
import { useControlSession } from './useControlSession'
import ZScanVisualComponent from './z_scan_visual_component'
import TopBanner from './top_banner'
import StreamingImage from './streaming_image_'
import GridLayout, { useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { sideBySideLayout, useUserPreferences } from './user_preferences'

export default function Home() {
  const control = useControlSession()
  const { preferences, storageAvailable, setLayout, setCameraFps, resetLayout } = useUserPreferences()
  const { width, containerRef } = useContainerWidth()
  const desktop = width >= 1000
  const [position, setPosition] = useState('0')
  const [velocity, setVelocity] = useState('10')
  const [notice, setNotice] = useState('')
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [clear, setClear] = useState(false)
  const active = control.status === 'active'
  async function execute(action: 'move' | 'stop' | 'home') {
    setError(''); setNotice('')
    if (action === 'stop') setStopping(true)
    else setPending(true)
    try {
      if (action === 'move' && (!position.trim() || !Number.isFinite(Number(position)))) throw new Error('Introduce una posición numérica.')
      if (action === 'move' && (!velocity.trim() || !Number.isFinite(Number(velocity)) || Number(velocity) < 1 || Number(velocity) > 50)) throw new Error('Introduce una velocidad entre 1 y 50 mm/s.')
      if (action === 'home' && !clear) throw new Error('Confirma que el recorrido está despejado.')
      const result = await command(action, control.token.current, Number(position), Number(velocity))
      if (action === 'stop') setNotice(result.connected && !result.moving ? 'Controlador en reposo: parada confirmada. Si ya estaba detenido, no hay desplazamiento que cancelar.' : 'Parada sin confirmar: comprueba el controlador y utiliza la parada física si es necesario.')
      if (action === 'home') setClear(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error de comunicación; comprueba el estado antes de reintentar.') }
    finally { if (action === 'stop') setStopping(false); else setPending(false) }
  }
  const labels = { connecting: 'Conectando…', active: 'Control exclusivo', busy: 'Equipo ocupado', released: 'Control liberado', offline: 'Conexión interrumpida' }
  return <Box minH="100vh" bg="#eef3f7" color="#102a43" px={{ base: 5, md: 12 }} py={10}>
    <Box maxW="1800px" mx="auto" ref={containerRef}>
      <TopBanner active={active} statusLabel={labels[control.status]} />
      <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" p={4} borderRadius="lg" mb={6}><Text fontWeight="bold">{control.stage?.mode === 'simulation' ? 'Modo de simulación' : control.stage?.mode === 'newport' ? 'Control físico · Newport IMS600CCHA' : 'Esperando estado del instrumento'}</Text><Text fontSize="sm">{control.stage?.mode === 'simulation' ? 'Los controles no mueven el hardware.' : 'El homing y los movimientos actúan sobre el stage real. Mantén el recorrido despejado.'}</Text></Box>
      {!active ? <Box bg="white" p={10} borderRadius="xl" borderWidth="1px"><Heading size="xl">{labels[control.status]}</Heading><Text mt={3}>{control.status === 'busy' ? 'Actualmente no está disponible: otro operador tiene el control o el instrumento no está disponible para una nueva sesión.' : 'El panel se habilita cuando el servidor concede una sesión exclusiva.'}</Text>{(control.status === 'busy' || control.status === 'released') && <Button mt={6} onClick={control.retry} colorPalette="teal">Solicitar control</Button>}</Box> : <Stack gap={6}>
        <Flex justify="space-between" gap={3} wrap="wrap" align="center">
          <Text fontSize="sm">{desktop ? 'Arrastra los títulos; ajusta ancho y alto desde cualquier borde o esquina.' : 'Vista vertical; tu distribución de escritorio se conserva.'}</Text>
          <Flex gap={3} wrap="wrap"><Button variant="outline" disabled={!desktop} onClick={() => setLayout(sideBySideLayout())}>Lado a lado</Button><Button variant="outline" onClick={resetLayout}>Restablecer distribución</Button><Button colorPalette="red" disabled={stopping} onClick={() => execute('stop')}>{stopping ? 'Deteniendo…' : 'Detener stage'}</Button></Flex>
        </Flex>
        {!storageAvailable && <Text role="status" color="orange.700">No se pudieron guardar las preferencias en este navegador. Los cambios se mantienen solo durante esta sesión.</Text>}
        <Box css={{
          '& .panel': { background: 'white', border: '1px solid #d9e2ec', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
          '& .panel-body': { minHeight: 0, overflow: 'auto', flex: 1, containerType: 'inline-size' },
          '& .layout-handle': { padding: '10px 16px', flexShrink: 0, background: '#e5f1f3', color: '#234e52', fontWeight: '600', cursor: desktop ? 'grab' : 'default', touchAction: desktop ? 'none' : 'auto' },
          '& .react-resizable-handle': { width: '20px', height: '20px', zIndex: 5 },
          '& .react-resizable-handle-e, & .react-resizable-handle-w': { height: 'calc(100% - 40px)', width: '10px', top: '20px', marginTop: 0, transform: 'none', cursor: 'ew-resize' },
          '& .react-resizable-handle-n, & .react-resizable-handle-s': { width: 'calc(100% - 40px)', height: '10px', left: '20px', marginLeft: 0, transform: 'none', cursor: 'ns-resize' },
          '& .react-resizable-handle-n::after, & .react-resizable-handle-s::after, & .react-resizable-handle-e::after, & .react-resizable-handle-w::after': { display: 'none' },
          '& .react-resizable-handle:hover': { backgroundColor: 'rgba(13,148,136,0.16)' },
          '& .stage-layout': { display: 'grid', gridTemplateColumns: 'minmax(0,1fr)' },
          '& .stage-visual svg': { maxHeight: '220px' },
          '& .position-fields': { display: 'grid', gap: '12px' },
          '@container (min-width: 480px)': { '& .position-fields': { gridTemplateColumns: '1fr 1fr' }, '& .position-actions': { flexDirection: 'row', flexWrap: 'wrap' } },
          '@container (min-width: 720px)': { '& .stage-layout': { gridTemplateColumns: 'minmax(260px, 0.85fr) minmax(0,1fr)' }, '& .stage-visual': { order: 1 }, '& .stage-controls': { order: 0 } },
          ...(!desktop ? { '& .react-grid-layout': { height: 'auto !important' }, '& .react-grid-item': { position: 'relative !important', transform: 'none !important', width: '100% !important', height: 'auto !important', marginBottom: '20px' }, '& .panel-body': { overflow: 'visible' }, '& .camera-content': { height: 'auto', minHeight: 0 }, '& .camera-image': { flex: 'none', aspectRatio: '16 / 9' } } : {}),
        }}>
        <GridLayout width={width} layout={preferences.layout} gridConfig={{ cols: 12, rowHeight: 24, margin: [12, 12], containerPadding: [0, 0] }}
          dragConfig={{ enabled: desktop, handle: '.layout-handle' }} resizeConfig={{ enabled: desktop, handles: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] }}
          onDragStop={layout => setLayout(layout)} onResizeStop={layout => setLayout(layout)}>
        <div key="stage" className="panel">
        <div className="layout-handle">⠿ Z-Scan · desplazamiento lineal</div>
        <div className="panel-body">
        <Box p={4}>
          <Flex justify="space-between" align="start" wrap="wrap" gap={2}><Heading size="lg">Desplazamiento lineal</Heading><Badge colorPalette={control.stage?.ready ? 'teal' : 'orange'}>{control.stage?.operation === 'homing' ? 'Homing en curso' : control.stage?.state_label ?? 'Consultando estado'}</Badge></Flex>
          <Box className="stage-layout" gap={3} mt={3} alignItems="start">
            <Box className="stage-visual" minW={0}>
              <ZScanVisualComponent positionMm={control.stage?.position_mm ?? null} minMm={control.stage?.min_mm ?? null} maxMm={control.stage?.max_mm ?? null} connected={Boolean(control.stage?.connected)} referenced={Boolean(control.stage?.ready || (control.stage?.moving && control.stage?.operation !== 'homing'))} moving={Boolean(control.stage?.moving)} homing={control.stage?.operation === 'homing'} simulation={control.stage?.mode === 'simulation'} />
            </Box>
            <Stack className="stage-controls" minW={0} gap={5}>
              {control.stage?.mode === 'newport' && !control.stage.ready && (!control.stage.moving || control.stage.operation === 'homing') && <Box p={5} bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg">
                <Text fontWeight="bold">Referenciar el eje</Text>
                <Text fontSize="sm" my={2}>Inicializa y ejecuta el homing configurado en Newport. Cancelarlo deshabilita el grupo y requiere repetir la referencia.</Text>
                <label><input type="checkbox" checked={clear} onChange={e => setClear(e.target.checked)} /> Confirmo que todo el recorrido está despejado.</label>
                <Button width="full" whiteSpace="normal" mt={3} onClick={() => execute('home')} disabled={pending || stopping || !clear || !control.stage.can_home} colorPalette="orange">Inicializar y hacer homing</Button>
              </Box>}
              <Box p={3} bg="gray.50" borderWidth="1px" borderColor="gray.200" borderRadius="lg">
                <Text fontWeight="bold" mb={3}>Control de posición</Text>
                <Box className="position-fields"><Box><label htmlFor="position">Posición objetivo (mm)</label>
                <Input id="position" type="number" min={control.stage?.min_mm ?? undefined} max={control.stage?.max_mm ?? undefined} step="0.1" value={position} onChange={e => setPosition(e.target.value)} mt={2} size="lg" bg="white" />
                </Box><Box><label htmlFor="velocity">Velocidad (mm/s)</label><Input id="velocity" type="number" min={1} max={50} step="1" value={velocity} onChange={e => setVelocity(e.target.value)} mt={2} size="lg" bg="white" /></Box></Box>
                <Text fontSize="sm" color="gray.600" mt={3}>Límites: {control.stage?.min_mm ?? '—'} a {control.stage?.max_mm ?? '—'} mm. Velocidad de 1 a 50 mm/s para el siguiente movimiento; homing según configuración Newport.</Text>
                <Stack className="position-actions" mt={3} gap={3}>
                  <Button colorPalette="teal" onClick={() => execute('move')} disabled={pending || stopping || !control.stage?.ready}>Mover</Button>
                  <Button colorPalette="red" variant="outline" whiteSpace="normal" disabled={stopping} onClick={() => execute('stop')}>{stopping ? 'Deteniendo…' : 'Detener / cancelar homing'}</Button>
                  {notice && <Text role="status" fontSize="sm">{notice}</Text>}
                </Stack>
              </Box>
            </Stack>
          </Box>
          {control.stage?.error && <Text role="alert" color="red.700" mt={4}>{control.stage.error}</Text>}
          {error && <Text role="alert" color="red.700" mt={4}>{error}</Text>}
        </Box>
        </div></div>
        <div key="camera" className="panel">
          <div className="layout-handle">⠿ Cámara · vista del laboratorio</div>
          <div className="panel-body"><StreamingImage token={control.token.current} fps={preferences.cameraFps} onFpsChange={setCameraFps} /></div>
        </div>
        </GridLayout>
        </Box>
        <Flex justify="space-between" align="center" wrap="wrap" gap={4}><Text fontSize="sm" color="gray.600">Tu sesión permanece activa aunque no interactúes.</Text><Button variant="outline" onClick={control.release}>Liberar equipo</Button></Flex>
      </Stack>}
      <Text mt={8} fontSize="xs" color="gray.500">Control de laboratorio · React / FastAPI · La parada web no sustituye una parada de emergencia física.</Text>
    </Box>
  </Box>
}
