import { useId } from 'react'

type Props = {
  positionMm: number | null
  minMm: number | null
  maxMm: number | null
  connected: boolean
  referenced: boolean
  moving: boolean
  homing: boolean
  simulation: boolean
}

/** Vista pasiva: recibe telemetría por props; no abre conexiones ni ordena movimientos. */
export default function ZScanVisualComponent({ positionMm, minMm, maxMm, connected, referenced, moving, homing, simulation }: Props) {
  const id = useId().replace(/:/g, '')
  const measured = connected && positionMm !== null && Number.isFinite(positionMm)
  const range = minMm !== null && maxMm !== null && Number.isFinite(minMm) && Number.isFinite(maxMm) && maxMm > minMm
  const located = measured && range
  const fraction = located ? Math.max(0, Math.min(1, (positionMm! - minMm!) / (maxMm! - minMm!))) : 0
  const outside = located && (positionMm! < minMm! || positionMm! > maxMm!)
  const status = !connected ? 'Sin telemetría válida' : homing ? 'Homing en curso' : moving ? 'En movimiento' : 'En reposo'
  return <section aria-label="Vista lateral del desplazamiento" style={{ padding: '20px 16px', border: '1px solid #dbe6ed', borderRadius: 16, background: '#f6fafc' }}>
    <style>{`.zscan-carriage { transition: transform 700ms linear; } @media (prefers-reduced-motion: reduce) { .zscan-carriage { transition: none; } }`}</style>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <div><div style={{ fontSize: 11, letterSpacing: '.14em', color: '#547080' }}>VISTA LATERAL · EJE Z</div><div style={{ marginTop: 6, fontSize: 13, color: '#426272' }}>{simulation ? 'Simulación · ' : ''}{status}</div></div>
      <div style={{ fontSize: 28, fontWeight: 600, color: '#0c7772', fontVariantNumeric: 'tabular-nums' }}>z = {measured ? positionMm!.toFixed(3) : '—'} <span style={{ fontSize: 14 }}>mm</span></div>
    </div>
    <svg viewBox="0 0 800 265" role="img" aria-labelledby={`${id}-title`} style={{ display: 'block', width: '100%', marginTop: 12 }}>
      <title id={`${id}-title`}>{`Stage lineal, vista lateral esquemática. ${measured ? `Encoder: ${positionMm!.toFixed(3)} milímetros.` : 'Posición no disponible.'}`}</title>
      <defs><linearGradient id={`${id}-rail`} x2="0" y2="1"><stop stopColor="#bacbd6"/><stop offset="1" stopColor="#728e9f"/></linearGradient></defs>
      <path d="M85 221 H715" stroke="#d6e2e9" strokeWidth="2"/>
      <rect x="85" y="145" width="630" height="40" rx="8" fill={`url(#${id}-rail)`}/>
      <rect x="105" y="150" width="590" height="7" rx="3" fill="#e8f0f5"/>
      <path d="M105 172 H695" stroke="#4c697c" strokeWidth="3"/>
      <rect x="72" y="131" width="30" height="60" rx="5" fill="#36576b"/>
      <rect x="698" y="131" width="30" height="60" rx="5" fill="#36576b"/>
      <rect x="110" y="185" width="45" height="17" rx="3" fill="#526e80"/>
      <rect x="645" y="185" width="45" height="17" rx="3" fill="#526e80"/>
      {range && Array.from({ length: 7 }, (_, i) => <g key={i}><path d={`M${120 + i * 560 / 6} 207 v8`} stroke="#849ca9"/><text x={120 + i * 560 / 6} y="239" textAnchor="middle" fontSize="12" fill="#536f80">{Number((minMm! + (maxMm! - minMm!) * i / 6).toFixed(2))}</text></g>)}
      <text x="744" y="239" fontSize="12" fill="#536f80">mm</text>
      <path d="M565 45 H695 l-7 -5 m7 5 l-7 5" fill="none" stroke="#7699a9" strokeWidth="1.5"/><text x="555" y="49" textAnchor="end" fill="#536f80" fontSize="13">+Z</text>
      {located && <g className="zscan-carriage" style={{ transform: `translateX(${120 + fraction * 560}px)`, transitionDuration: moving || homing ? undefined : '0ms' }}>
        <path d="M0 115 V212" stroke="#13998e" strokeDasharray="3 4" opacity=".55"/>
        <rect x="-47" y="116" width="94" height="30" rx="5" fill="#09877f"/>
        <rect x="-56" y="109" width="112" height="9" rx="3" fill="#204c5d"/>
        <rect x="-9" y="64" width="18" height="45" rx="2" fill="#7899aa"/>
        <rect x="-21" y="52" width="42" height="21" rx="4" fill="#e0f3f0" stroke="#178f88" strokeWidth="2"/>
        <circle cx="-31" cy="130" r="3" fill="#a4e2da"/><circle cx="31" cy="130" r="3" fill="#a4e2da"/>
        <path d="M-5 213 L0 219 L5 213" fill="#0b837b"/>
      </g>}
      {!located && <text x="400" y="90" textAnchor="middle" fill="#6a7f8b" fontSize="14">{measured ? 'Escala de recorrido no disponible' : 'Esperando posición válida'}</text>}
    </svg>
    <p style={{ margin: 0, fontSize: 12, color: outside ? '#b54708' : '#627b8a' }}>{outside ? 'Lectura fuera de límites: dibujo limitado al extremo; el número conserva la lectura recibida.' : !referenced ? 'Referencia no confirmada: Z corresponde a la lectura del encoder.' : 'Z es la posición del stage, no una distancia calibrada al foco óptico.'}</p>
    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#627b8a' }}>Esquema no dimensional. Animación entre lecturas recibidas; no predice el movimiento.</p>
  </section>
}
