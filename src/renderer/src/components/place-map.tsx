import type { Geo } from '@shared/types'
import { Map as MapLibre, Marker, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// OpenFreeMap: OSM vector tiles without keys or limits
const styles = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

// the bundled worker lives next to the page, not next to maplibre's module
setWorkerUrl(workerUrl)

/** A small map with one marker; follows `geo` without rebuilding. */
export function PlaceMap({ geo, className }: { geo: Geo; className?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const marker = useRef<Marker | null>(null)
  const dark = useDark()
  // the first position only; later ones move the existing map
  const initial = useRef(geo)

  useEffect(() => {
    if (!container.current) return
    const center: [number, number] = [initial.current.lon, initial.current.lat]
    const instance = new MapLibre({
      container: container.current,
      style: dark ? styles.dark : styles.light,
      center,
      zoom: 15,
      attributionControl: { compact: true },
      // the panel is no place for a map that grabs keys and scrolling
      keyboard: false,
      scrollZoom: false,
    })
    // starts unfolded and would cover the small map; the (i) stays
    instance.once('load', () =>
      container.current
        ?.querySelector('.maplibregl-ctrl-attrib')
        ?.classList.remove('maplibregl-compact-show'),
    )
    marker.current = new Marker({ color: '#ef4444' }).setLngLat(center).addTo(instance)
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
    }
  }, [dark])

  const { lat, lon } = geo
  useEffect(() => {
    initial.current = { lat, lon }
    marker.current?.setLngLat([lon, lat])
    map.current?.easeTo({ center: [lon, lat], zoom: 15, duration: 300 })
  }, [lat, lon])

  return (
    <div
      ref={container}
      className={cn('h-44 w-full overflow-hidden rounded-md border bg-muted', className)}
    />
  )
}

function useDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark')),
    )
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

/** The place on openstreetmap.org, for the browser. */
export function osmLink({ lat, lon }: Geo): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`
}
