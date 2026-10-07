import { useState } from 'react'
import { Badge, Box, Button, Flex, Heading, Input, Stack, Text } from '@chakra-ui/react'
import { command } from './api'
import { useControlSession } from './useControlSession'

export default function Home() {
  const control = useControlSession()
  const [position, setPosition] = useState('0')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const active = control.status === 'active'
  async function execute(action: 'move' | 'stop') {
    setError(''); setPending(true)
    try {
      if (action === 'move' && (!position.trim() || !Number.isFinite(Number(position)))) throw new Error('Introduce una posición numérica.')
      await command(action, control.token.current, Number(position))
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
      <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" p={4} borderRadius="lg" mb={6}><Text fontWeight="bold">Modo de simulación</Text><Text fontSize="sm">Los controles no mueven el hardware. El rango ±10 mm es ilustrativo.</Text></Box>
      {!active ? <Box bg="white" p={10} borderRadius="xl" borderWidth="1px"><Heading size="xl">{labels[control.status]}</Heading><Text mt={3}>{control.status === 'busy' ? 'Actualmente no está disponible: otro operador tiene el control del instrumento.' : 'El panel se habilita cuando el servidor concede una sesión exclusiva.'}</Text>{(control.status === 'busy' || control.status === 'released') && <Button mt={6} onClick={control.retry} colorPalette="teal">Solicitar control</Button>}</Box> : <Stack gap={6}>
        <Box bg="white" borderWidth="1px" borderRadius="xl" p={{ base: 6, md: 10 }}>
          <Flex justify="space-between" align="start"><Heading size="xl">Desplazamiento lineal</Heading><Badge colorPalette={control.stage?.moving ? 'blue' : 'teal'}>{control.stage?.moving ? 'En movimiento' : 'En reposo'}</Badge></Flex>
          <Text mt={8} color="gray.600">Posición actual</Text><Text fontSize="5xl" fontWeight="semibold" fontVariantNumeric="tabular-nums">{control.stage?.position_mm.toFixed(3) ?? '—'} <Text as="span" fontSize="xl" color="gray.500">mm</Text></Text>
          <Box mt={8} maxW="420px"><label htmlFor="position">Posición objetivo (mm)</label><Input id="position" type="number" min={-10} max={10} step="0.1" value={position} onChange={e => setPosition(e.target.value)} mt={2} size="lg" /><Flex mt={4} gap={3}><Button colorPalette="teal" onClick={() => execute('move')} disabled={pending || !control.stage || control.stage.moving}>Mover</Button><Button colorPalette="red" variant="outline" onClick={() => execute('stop')}>Detener</Button></Flex></Box>
          {error && <Text role="alert" color="red.700" mt={4}>{error}</Text>}
        </Box>
        <Flex justify="space-between" align="center" gap={4}><Text fontSize="sm" color="gray.600">Tu sesión permanece activa aunque no interactúes.</Text><Button variant="outline" onClick={control.release}>Liberar equipo</Button></Flex>
      </Stack>}
      <Text mt={8} fontSize="xs" color="gray.500">Control de laboratorio · React / FastAPI · La parada web no sustituye una parada de emergencia física.</Text>
    </Box>
  </Box>
}
