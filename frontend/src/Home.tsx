import { useState } from 'react'
import { Badge, Box, Button, Flex, Heading, Input, Stack, Text } from '@chakra-ui/react'
import { command } from './api'
import { useControlSession } from './useControlSession'
import ZScanVisualComponent from './z_scan_visual_component'
const labLogo = new URL('../../assets/logo_svg.svg', import.meta.url).href

export default function Home() {
  const control = useControlSession()
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
    <Box maxW="1800px" mx="auto">
      <Flex justify="space-between" align="center" gap={4} wrap="wrap" mb={12}>
        <Flex align="center" gap={{ base: 3, md: 5 }} wrap="wrap"><Box bg="white" borderRadius="lg" p={2} flexShrink={0}><img src={labLogo} alt="Grupo de Fotónica y Opto-electrónica" width={168} height={148} style={{ width: 'clamp(100px, 15vw, 168px)', height: 'auto' }} /></Box><Box><Text fontSize="xs" fontWeight="bold" letterSpacing="0.2em" color="teal.700">INSTRUMENTACIÓN · FOTÓNICA</Text><Heading size={{ base: 'xl', md: '3xl' }} mt={2}>Z-Scan Xtrema</Heading></Box></Flex>
        <Badge colorPalette={active ? 'teal' : 'orange'} px={4} py={2}>{labels[control.status]}</Badge>
      </Flex>
      <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" p={4} borderRadius="lg" mb={6}><Text fontWeight="bold">{control.stage?.mode === 'simulation' ? 'Modo de simulación' : control.stage?.mode === 'newport' ? 'Control físico · Newport IMS600CCHA' : 'Esperando estado del instrumento'}</Text><Text fontSize="sm">{control.stage?.mode === 'simulation' ? 'Los controles no mueven el hardware.' : 'El homing y los movimientos actúan sobre el stage real. Mantén el recorrido despejado.'}</Text></Box>
      {!active ? <Box bg="white" p={10} borderRadius="xl" borderWidth="1px"><Heading size="xl">{labels[control.status]}</Heading><Text mt={3}>{control.status === 'busy' ? 'Actualmente no está disponible: otro operador tiene el control o el instrumento no está disponible para una nueva sesión.' : 'El panel se habilita cuando el servidor concede una sesión exclusiva.'}</Text>{(control.status === 'busy' || control.status === 'released') && <Button mt={6} onClick={control.retry} colorPalette="teal">Solicitar control</Button>}</Box> : <Stack gap={6}>
        <Box bg="white" borderWidth="1px" borderRadius="xl" p={{ base: 6, md: 10 }}>
          <Flex justify="space-between" align="start"><Heading size="xl">Desplazamiento lineal</Heading><Badge colorPalette={control.stage?.ready ? 'teal' : 'orange'}>{control.stage?.operation === 'homing' ? 'Homing en curso' : control.stage?.state_label ?? 'Consultando estado'}</Badge></Flex>
          <Box display="grid" gridTemplateColumns={{ base: 'minmax(0, 1fr)', xl: 'minmax(300px, 380px) minmax(0, 1fr)' }} gap={{ base: 5, xl: 8 }} mt={6} alignItems="start">
            <Box minW={0} order={{ base: 0, xl: 1 }}>
              <ZScanVisualComponent positionMm={control.stage?.position_mm ?? null} minMm={control.stage?.min_mm ?? null} maxMm={control.stage?.max_mm ?? null} connected={Boolean(control.stage?.connected)} referenced={Boolean(control.stage?.ready || (control.stage?.moving && control.stage?.operation !== 'homing'))} moving={Boolean(control.stage?.moving)} homing={control.stage?.operation === 'homing'} simulation={control.stage?.mode === 'simulation'} />
            </Box>
            <Stack minW={0} gap={5} order={{ base: 1, xl: 0 }}>
              {control.stage?.mode === 'newport' && !control.stage.ready && (!control.stage.moving || control.stage.operation === 'homing') && <Box p={5} bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg">
                <Text fontWeight="bold">Referenciar el eje</Text>
                <Text fontSize="sm" my={2}>Inicializa y ejecuta el homing configurado en Newport. Cancelarlo deshabilita el grupo y requiere repetir la referencia.</Text>
                <label><input type="checkbox" checked={clear} onChange={e => setClear(e.target.checked)} /> Confirmo que todo el recorrido está despejado.</label>
                <Button width="full" whiteSpace="normal" mt={3} onClick={() => execute('home')} disabled={pending || stopping || !clear || !control.stage.can_home} colorPalette="orange">Inicializar y hacer homing</Button>
              </Box>}
              <Box p={{ base: 4, md: 6 }} bg="gray.50" borderWidth="1px" borderColor="gray.200" borderRadius="lg">
                <Text fontWeight="bold" mb={3}>Control de posición</Text>
                <label htmlFor="position">Posición objetivo (mm)</label>
                <Input id="position" type="number" min={control.stage?.min_mm ?? undefined} max={control.stage?.max_mm ?? undefined} step="0.1" value={position} onChange={e => setPosition(e.target.value)} mt={2} size="lg" bg="white" />
                <Box mt={4}><label htmlFor="velocity">Velocidad (mm/s)</label><Input id="velocity" type="number" min={1} max={50} step="1" value={velocity} onChange={e => setVelocity(e.target.value)} mt={2} size="lg" bg="white" /></Box>
                <Text fontSize="sm" color="gray.600" mt={3}>Límites: {control.stage?.min_mm ?? '—'} a {control.stage?.max_mm ?? '—'} mm. Velocidad de 1 a 50 mm/s para el siguiente movimiento; homing según configuración Newport.</Text>
                <Stack mt={5} gap={3}>
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
        <Flex justify="space-between" align="center" wrap="wrap" gap={4}><Text fontSize="sm" color="gray.600">Tu sesión permanece activa aunque no interactúes.</Text><Button variant="outline" onClick={control.release}>Liberar equipo</Button></Flex>
      </Stack>}
      <Text mt={8} fontSize="xs" color="gray.500">Control de laboratorio · React / FastAPI · La parada web no sustituye una parada de emergencia física.</Text>
    </Box>
  </Box>
}
