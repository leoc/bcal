import type { Geo, Place } from '../shared/types'

export interface PlaceCandidate extends Place {
  /** how often a past event used it; contacts and config count once */
  count: number
}

const unescape = (value: string) => value.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ')

/** `Name, Straße Nr, PLZ Ort` without empty parts. */
export function placeLabel(
  name: string | undefined,
  street?: string,
  code?: string,
  city?: string,
) {
  const town = [code, city].filter(Boolean).join(' ')
  return [name, street, town].filter(Boolean).join(', ')
}

/** Contacts with a postal address (ADR, GEO if given), one place per address. */
export function parseVcardPlaces(text: string): PlaceCandidate[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1)
  return cards.flatMap((card) => {
    const lines = card.split(/\r?\n/)
    const field = (name: string) =>
      lines
        .filter((line) => new RegExp(`^(?:item\\d+\\.)?${name}[;:]`, 'i').test(line))
        .map((line) => line.slice(line.indexOf(':') + 1).trim())
    const name = field('FN')[0] ? unescape(field('FN')[0] ?? '') : undefined
    if (!name || name.includes('@')) return []
    const geo = parseGeo(field('GEO')[0])
    const seen = new Set<string>()
    return field('ADR').flatMap((value) => {
      // post office box; extended; street; locality; region; postal code; country
      const parts = value.split(/(?<!\\);/).map((p) => unescape(p).trim())
      const [, , street, city, , code] = parts
      if (!street && !city) return []
      const label = placeLabel(name, street, code, city)
      if (seen.has(label)) return []
      seen.add(label)
      return [{ name, label, geo, source: 'contacts' as const, count: 1 }]
    })
  })
}

/** `geo:52.5,13.4` (vCard 4) or `52.5;13.4` (vCard 3, iCalendar). */
export function parseGeo(value: string | undefined): Geo | undefined {
  const match = value?.match(/(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/)
  if (!match) return undefined
  const lat = Number(match[1])
  const lon = Number(match[2])
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined
}

/** LOCATIONs of past events, most used first; links are no places. */
export function eventPlaces(locations: { location: string; geo?: Geo }[]): PlaceCandidate[] {
  const byLabel = new Map<string, PlaceCandidate>()
  for (const { location, geo } of locations) {
    const label = location.replace(/\s+/g, ' ').trim()
    if (!label || /https?:\/\//i.test(label)) continue
    const key = label.toLowerCase()
    const known = byLabel.get(key)
    if (known) {
      known.count++
      known.geo ??= geo
    } else {
      const name = label.split(',')[0]?.trim() || label
      byLabel.set(key, { name, label, geo, source: 'events', count: 1 })
    }
  }
  return [...byLabel.values()].sort((a, b) => b.count - a.count)
}

/** Lower case without accents, so `cafe` finds `Café`. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Local places for a query, grouped by source in the order contacts, past
 * events, config; within a source word-start matches first, then frequent ones.
 */
export function rankPlaces(places: PlaceCandidate[], query: string, perSource = 4): Place[] {
  const q = fold(query).trim()
  if (!q) return []
  const score = (p: PlaceCandidate) => {
    const haystack = fold(`${p.name} ${p.label}`)
    if (haystack.split(/[\s,.()/-]+/).some((w) => w.startsWith(q)) || fold(p.name).startsWith(q))
      return 2
    return haystack.includes(q) ? 1 : 0
  }
  const order = ['contacts', 'events', 'config'] as const
  const seen = new Set<string>()
  return order.flatMap((source) =>
    places
      .filter((p) => p.source === source)
      .map((p) => ({ p, s: score(p) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s || b.p.count - a.p.count || a.p.name.localeCompare(b.p.name))
      .filter(({ p }) => {
        const key = p.label.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, perSource)
      .map(({ p }) => ({ name: p.name, label: p.label, geo: p.geo, source: p.source })),
  )
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, string | undefined>
}

/** Photon GeoJSON to places; streets and towns get their own name as label. */
export function photonPlaces(json: { features?: PhotonFeature[] }): Place[] {
  const seen = new Set<string>()
  return (json.features ?? []).flatMap((feature) => {
    const p = feature.properties ?? {}
    const [lon, lat] = feature.geometry?.coordinates ?? []
    const street = [p.street, p.housenumber].filter(Boolean).join(' ') || undefined
    const name = p.name ?? street ?? p.city
    if (!name || lat === undefined || lon === undefined) return []
    const label = placeLabel(
      name,
      street === name ? undefined : street,
      p.postcode,
      p.city === name ? undefined : p.city,
    )
    if (seen.has(label)) return []
    seen.add(label)
    return [{ name, label, geo: { lat, lon }, source: 'map' as const }]
  })
}

const PHOTON = 'https://photon.komoot.io/api/'
const USER_AGENT = 'bcal/0.1 (personal desktop calendar)'

/**
 * Photon (OSM) search with a small cache. Failures (offline, rate limit)
 * return no places; the line then simply keeps its free text.
 */
export class Photon {
  private cache = new Map<string, Promise<Place[]>>()

  constructor(
    private readonly near: () => Geo,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  search(query: string, limit = 5): Promise<Place[]> {
    const q = query.trim()
    if (q.length < 3) return Promise.resolve([])
    const { lat, lon } = this.near()
    const url = `${PHOTON}?${new URLSearchParams({ q, lang: 'de', limit: String(limit), lat: String(lat), lon: String(lon) })}`
    let result = this.cache.get(url)
    if (!result) {
      result = this.fetcher(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(4000),
      })
        .then((response) => (response.ok ? response.json() : { features: [] }))
        .then((json) => photonPlaces(json as { features?: PhotonFeature[] }))
        .catch(() => {
          // try again next time instead of caching the failure
          this.cache.delete(url)
          return []
        })
      this.cache.set(url, result)
      if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value as string)
    }
    return result
  }

  /** Coordinates for an address, e.g. a contact's ADR without GEO. */
  async geocode(address: string): Promise<Geo | undefined> {
    const [first] = await this.search(address, 1)
    return first?.geo
  }
}
