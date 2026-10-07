import { useEffect, useState } from 'react'
import type { Layout } from 'react-grid-layout'

const KEY = 'zscan.user-preferences.v1'
export const CAMERA_FPS = [5, 10, 15, 20, 30] as const
export const defaultLayout = (): Layout => [
  { i: 'stage', x: 0, y: 0, w: 12, h: 24, minW: 4, minH: 12 },
  { i: 'camera', x: 0, y: 24, w: 12, h: 20, minW: 4, minH: 12 },
]
export const sideBySideLayout = (): Layout => defaultLayout().map((item, index) => ({
  ...item, x: index * 6, y: 0, w: 6, h: 22,
}))
type Preferences = { version: 1; layout: Layout; cameraFps: number }
const defaults = (): Preferences => ({ version: 1, layout: defaultLayout(), cameraFps: 10 })

/** Treat browser storage as untrusted: only persist known, bounded UI fields. */
export function normalizePreferences(value: unknown): Preferences {
  const result = defaults()
  if (!value || typeof value !== 'object') return result
  const candidate = value as Partial<Preferences>
  if (candidate.version !== 1) return result
  if (CAMERA_FPS.some(fps => fps === candidate.cameraFps)) result.cameraFps = candidate.cameraFps!
  if (!Array.isArray(candidate.layout) || candidate.layout.length !== 2) return result
  const layout = defaultLayout().map(base => {
    const items = candidate.layout!.filter(item => item && item.i === base.i)
    if (items.length !== 1) return null
    const item = items[0]
    if (![item.x, item.y, item.w, item.h].every(Number.isInteger)) return null
    if (item.x < 0 || item.y < 0 || item.y > 200 || item.w < base.minW! || item.w > 12 || item.x + item.w > 12 || item.h < base.minH! || item.h > 60) return null
    return { ...base, x: item.x, y: item.y, w: item.w, h: item.h }
  })
  if (layout.some(item => !item)) return result
  const [a, b] = layout as Layout
  if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return result
  result.layout = layout as Layout
  return result
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try { return normalizePreferences(JSON.parse(localStorage.getItem(KEY) ?? 'null')) }
    catch { return defaults() }
  })
  const [storageAvailable, setStorageAvailable] = useState(true)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(preferences)); setStorageAvailable(true) }
    catch { setStorageAvailable(false) }
  }, [preferences])
  return {
    preferences, storageAvailable,
    setLayout: (layout: Layout) => setPreferences(previous => normalizePreferences({ ...previous, layout })),
    setCameraFps: (cameraFps: number) => setPreferences(previous => normalizePreferences({ ...previous, cameraFps })),
    resetLayout: () => setPreferences(previous => ({ ...previous, layout: defaultLayout() })),
  }
}
