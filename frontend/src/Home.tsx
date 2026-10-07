import { useState } from 'react'
import { Badge, Box, Button, Flex, Heading, Input, Stack, Text } from '@chakra-ui/react'
import { command } from './api'
import { useControlSession } from './useControlSession'

export default function Home() {
  const control = useControlSession()
  const [position, setPosition] = useState('0')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [clear, setClear] = useState(false)
  const active = control.status === 'active'
  async function execute(action: 'move' | 'stop' | 'home') {
    setError(''); setPending(true)
    try {
      if (action === 'move' && (!position.trim() || !Number.isFinite(Number(position)))) throw new Error('Introduce una posición numérica.')
      if (action === 'home' && !clear) throw new Error('Confirma que el recorrido está despejado.')
      await command(action, control.token.current, Number(position))
      if (action === 'home') setClear(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error de comunicación; comprueba el estado antes de reintentar.') }
    finally { setPending(false) }
  }
  const labels = { connecting: 'Conectando…', active: 'Control exclusivo', busy: 'Equipo ocupado', released: 'Control liberado', offline: 'Conexión interrumpida' }
  return <Box minH="100vh" bg="#eef3f7" color="#102a43" px={{ base: 5, md: 12 }} py={10}>
    <Box maxW="1000px" mx="auto">
      <Flex justify="space-between" align="center" gap={4} wrap="wrap" mb={12}>
        <Box><Text fontSize="xs" fontWeight="bold" letterSpacing="0.2em" color="teal.700">INSTRUMENTACIÓN · FOTÓNICA</Text><Heading size="3xl" mt={2}>Z-Scan Xtrema</Heading></Box>
        <Badge colorPalette={active ? 'teal' : 'orange'} px={4} py={2}>{labels[control.status]}</Badge>
      </Flex>
      <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" p={4} borderRadius="lg" mb={6}><Text fontWeight="bold">{control.stage?.mode === 'simulation' ? 'Modo de simulación' : control.stage?.mode === 'newport' ? 'Control físico · Newport IMS600CCHA' : 'Esperando estado del instrumento'}</Text><Text fontSize="sm">{control.stage?.mode === 'simulation' ? 'Los controles no mueven el hardware.' : 'El homing y los movimientos actúan sobre el stage real. Mantén el recorrido despejado.'}</Text></Box>
      {!active ? <Box bg="white" p={10} borderRadius="xl" borderWidth="1px"><Heading size="xl">{labels[control.status]}</Heading><Text mt={3}>{control.status === 'busy' ? 'Actualmente no está disponible: otro operador tiene el control o el instrumento no está disponible para una nueva sesión.' : 'El panel se habilita cuando el servidor concede una sesión exclusiva.'}</Text>{(control.status === 'busy' || control.status === 'released') && <Button mt={6} onClick={control.retry} colorPalette="teal">Solicitar control</Button>}</Box> : <Stack gap={6}>
        <Box bg="white" borderWidth="1px" borderRadius="xl" p={{ base: 6, md: 10 }}>
          <Flex justify="space-between" align="start"><Heading size="xl">Desplazamiento lineal</Heading><Badge colorPalette={control.stage?.ready ? 'teal' : 'orange'}>{control.stage?.operation === 'homing' ? 'Homing en curso' : control.stage?.state_label ?? 'Consultando estado'}</Badge></Flex>
          <Text mt={8} color="gray.600">{control.stage?.ready ? 'Posición actual referenciada' : 'Lectura del encoder · referencia no confirmada'}</Text><Text fontSize="5xl" fontWeight="semibold" fontVariantNumeric="tabular-nums">{control.stage?.connected ? control.stage.position_mm?.toFixed(3) ?? '—' : '—'} <Text as="span" fontSize="xl" color="gray.500">mm</Text></Text>
          {control.stage?.mode === 'newport' && <Box mt={6} p={4} bg="gray.50" borderRadius="lg"><Text fontWeight="bold">1. Referenciar el eje</Text><Text fontSize="sm" my={2}>Inicializa y ejecuta el homing configurado en Newport. Cancelarlo deshabilita el grupo y requiere repetir la referencia.</Text><label><input type="checkbox" checked={clear} onChange={e => setClear(e.target.checked)} /> Confirmo que todo el recorrido está despejado.</label><Button display="block" mt={3} onClick={() => execute('home')} disabled={pending || !clear || !control.stage.can_home} colorPalette="orange">Inicializar y hacer homing</Button></Box>}
          <Box mt={8} maxW="520px"><label htmlFor="position">2. Posición objetivo (mm)</label><Text fontSize="sm" color="gray.600">Límites: {control.stage?.min_mm ?? '—'} a {control.stage?.max_mm ?? '—'} mm. Movimientos de esta app: máximo 10 mm/s; homing según configuración Newport.</Text><Input id="position" type="number" min={control.stage?.min_mm ?? undefined} max={control.stage?.max_mm ?? undefined} step="0.1" value={position} onChange={e => setPosition(e.target.value)} mt={2} size="lg" /><Flex mt={4} gap={3}><Button colorPalette="teal" onClick={() => execute('move')} disabled={pending || !control.stage?.ready}>Mover</Button><Button colorPalette="red" variant="outline" onClick={() => execute('stop')}>Detener / cancelar homing</Button></Flex></Box>
          {control.stage?.error && <Text role="alert" color="red.700" mt={4}>{control.stage.error}</Text>}
          {error && <Text role="alert" color="red.700" mt={4}>{error}</Text>}
        </Box>
        <Flex justify="space-between" align="center" gap={4}><Text fontSize="sm" color="gray.600">Tu sesión permanece activa aunque no interactúes.</Text><Button variant="outline" onClick={control.release}>Liberar equipo</Button></Flex>
      </Stack>}
      <Text mt={8} fontSize="xs" color="gray.500">Control de laboratorio · React / FastAPI · La parada web no sustituye una parada de emergencia física.</Text>
    </Box>
  </Box>
}
