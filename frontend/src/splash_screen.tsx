/// <reference types="vite/client" />
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SVG } from '@svgdotjs/svg.js'
import logoMarkup from '../../assets/logo_svg.svg?raw'

const durationMs = 10_000
const fadeMs = 320

/** Apertura visual autocontenida. No monta ni reserva el instrumento hasta terminar. */
export default function SplashScreen({ children }: { children: ReactNode }) {
  const canvas = useRef<HTMLDivElement>(null)
  const logoContainer = useRef<HTMLDivElement>(null)
  const [finished, setFinished] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reduced = useRef(false)

  function dismiss() {
    if (leaveTimer.current !== undefined) return
    setLeaving(true)
    leaveTimer.current = setTimeout(() => setFinished(true), reduced.current ? 0 : fadeMs)
  }

  useEffect(() => {
    if (finished || !canvas.current) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.current = preference.matches
    // Normalize the original outlines without changing the shared logo asset.
    logoContainer.current?.querySelectorAll('#path1, #path2').forEach(path => path.setAttribute('pathLength', '1'))
    logoContainer.current?.querySelectorAll('#tspan4, #tspan5').forEach((line, index) => {
      const letters = Array.from(line.textContent ?? '')
      line.replaceChildren(...letters.map((letter, i) => {
        const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
        span.textContent = letter
        span.classList.add('zscan-logo-letter')
        span.style.animationDelay = `${5200 + index * 1400 + i * 70}ms`
        return span
      }))
    })
    const draw = SVG().addTo(canvas.current).size('100%', '100%').viewbox(0, 0, 900, 260)
    draw.attr({ 'aria-hidden': 'true', focusable: 'false' })
    const gradient = draw.gradient('linear', add => {
      add.stop(0, '#fb923c', 0)
      add.stop(0.35, '#e34b42', 1)
      add.stop(0.65, '#be3455', 1)
      add.stop(1, '#9f2949', 0)
    })
    for (let x = 50; x < 900; x += 50) {
      draw.line(x, 35, x, 225).stroke({ color: '#d8e6e7', width: 0.7, opacity: 0.5 })
    }
    draw.line(0, 130, 900, 130).stroke({ color: '#b4c9cd', width: 1 })
    const envelope = draw.path().fill('none').stroke({ color: '#c99598', width: 1, dasharray: '3 6' })
    const glow = draw.path().fill('none').stroke({ color: '#ed655c', width: 9, opacity: 0.09 })
    const field = draw.path().fill('none').stroke({ color: gradient.toString(), width: 2.2, linecap: 'round' })
    const start = performance.now()
    let frame = 0
    function paint(now: number) {
      const progress = reduced.current ? 0.5 : Math.min((now - start) / durationMs, 1)
      const center = 240 + 420 * progress
      let wave = ''
      let outline = ''
      for (let x = 0; x <= 900; x += 2) {
        const amplitude = 88 * Math.exp(-(((x - center) / 102) ** 2))
        const y = 130 - amplitude * Math.cos((x - center) * 0.18 - progress * 9)
        wave += `${x === 0 ? 'M' : 'L'}${x},${y.toFixed(2)} `
        outline += `${x === 0 ? 'M' : 'L'}${x},${(130 - amplitude).toFixed(2)} `
      }
      field.plot(wave); glow.plot(wave); envelope.plot(outline)
      if (!reduced.current && progress < 1) frame = requestAnimationFrame(paint)
    }
    paint(start)
    const onPreference = () => { reduced.current = preference.matches; if (preference.matches) cancelAnimationFrame(frame) }
    preference.addEventListener('change', onPreference)
    const timer = setTimeout(dismiss, reduced.current ? 250 : durationMs - fadeMs)
    return () => {
      clearTimeout(timer); cancelAnimationFrame(frame)
      preference.removeEventListener('change', onPreference)
      draw.remove()
    }
  }, [finished])

  useEffect(() => () => { clearTimeout(leaveTimer.current) }, [])

  if (finished) return <>{children}</>
  return <section aria-label="Bienvenida a Z-Scan Xtrema" style={{
    minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '32px 20px', boxSizing: 'border-box', overflow: 'hidden',
    background: 'radial-gradient(ellipse at 50% 45%, #fff 0%, #edf5f4 55%, #e5edf3 100%)',
    color: '#183344', opacity: leaving ? 0 : 1,
    transition: reduced.current ? 'none' : 'opacity 320ms ease',
  }}>
    <style>{`
      @keyframes zscan-logo-reveal {
        from { opacity: 0; transform: translateY(20px) scale(.94); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .zscan-splash-logo { animation: zscan-logo-reveal 3200ms cubic-bezier(.2,.7,.2,1) both; }
      .zscan-splash-logo svg { display: block; width: 100%; height: auto; }
      @keyframes zscan-logo-write {
        0% { stroke-dashoffset: 1; fill-opacity: 0; opacity: 0; }
        5% { opacity: 1; }
        75% { stroke-dashoffset: 0; fill-opacity: 0; }
        100% { stroke-dashoffset: 0; fill-opacity: 1; opacity: 1; }
      }
      .zscan-splash-logo #path1, .zscan-splash-logo #path2 {
        stroke: white; stroke-width: .35 !important; stroke-dasharray: 1;
        animation: zscan-logo-write 2400ms ease-in-out both;
      }
      .zscan-splash-logo #path1 { animation-delay: 400ms; }
      .zscan-splash-logo #path2 { animation-delay: 2800ms; }
      @keyframes zscan-logo-text { from { opacity: 0; } to { opacity: 1; } }
      .zscan-splash-logo .zscan-logo-letter { animation: zscan-logo-text 180ms ease both; }
      @media (prefers-reduced-motion: reduce) {
        .zscan-splash-logo, .zscan-splash-logo #path1, .zscan-splash-logo #path2, .zscan-splash-logo tspan { animation: none; }
        .zscan-splash-logo #path1, .zscan-splash-logo #path2 { stroke: none; }
      }
    `}</style>
    {/* Trusted, bundled SVG only: never inject external/user-provided markup here. */}
    <div ref={logoContainer} className="zscan-splash-logo" role="img" aria-label="Grupo de Fotónica y Opto-electrónica"
      style={{ width: 'min(480px, 85vw)', marginBottom: 28 }} dangerouslySetInnerHTML={{ __html: logoMarkup }} />
    <p style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', textAlign: 'center', color: '#49747b', margin: '0 0 12px' }}>Instrumentación óptica de alta precisión</p>
    <h1 style={{ fontSize: 'clamp(32px, 7vw, 62px)', fontWeight: 500, letterSpacing: '-0.045em', margin: 0 }}>Z-Scan <span style={{ color: '#0d827b' }}>Xtrema</span></h1>
    <p style={{ fontSize: 15, color: '#587381', margin: '14px 0 0' }}>Precisión en cada desplazamiento.</p>
    <div ref={canvas} style={{ width: 'min(900px, 110vw)', height: 'clamp(150px, 26vw, 260px)', margin: '12px 0' }} />
    <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6a838d', margin: 0 }}>Pulso ultracorto</p>
    <button type="button" onClick={dismiss} style={{ marginTop: 32, padding: '10px 22px',
      border: '1px solid #9bb6bb', borderRadius: 24, background: '#ffffff99', color: '#214b58',
      cursor: 'pointer', fontSize: 13 }}>Entrar al control →</button>
  </section>
}
