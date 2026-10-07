/** Órdenes al backend; nunca se conecta al controlador físico. */
export async function command(action: 'move' | 'stop' | 'home', token: string, position?: number, velocity = 10) {
  const response = await fetch(`/api/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Control-Token': token },
    body: action === 'move' ? JSON.stringify({ position_mm: position, velocity_mm_s: velocity }) : action === 'home' ? JSON.stringify({ confirm_clear: true }) : undefined,
    signal: AbortSignal.timeout(action === 'stop' ? 60000 : 30000),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Solicitud inválida.')
  }
  return response.json()
}
