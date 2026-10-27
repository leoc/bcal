import { describe, expect, it } from 'vitest'
import {
  eventPlaces,
  Photon,
  type PlaceCandidate,
  parseGeo,
  parseVcardPlaces,
  photonPlaces,
  rankPlaces,
} from '../src/main/places'

describe('parseVcardPlaces', () => {
  it('reads FN with every distinct ADR, GEO if given', () => {
    const text = [
      'BEGIN:VCARD',
      'FN:Simon Müller',
      'ADR;TYPE=home:;;Alberichstr. 98;Berlin;;12623;',
      'ADR;TYPE=home:;;Alberichstr. 98;Berlin;;12623;',
      'item1.ADR;TYPE=work:;;Kurfürstendamm 1\\, Hinterhaus;Berlin;;10719;Deutschland',
      'GEO:geo:52.51,13.6',
      'END:VCARD',
      'BEGIN:VCARD',
      'FN:Ohne Adresse',
      'EMAIL:x@example.org',
      'END:VCARD',
    ].join('\r\n')
    expect(parseVcardPlaces(text)).toEqual([
      {
        name: 'Simon Müller',
        label: 'Simon Müller, Alberichstr. 98, 12623 Berlin',
        geo: { lat: 52.51, lon: 13.6 },
        source: 'contacts',
        count: 1,
      },
      {
        name: 'Simon Müller',
        label: 'Simon Müller, Kurfürstendamm 1, Hinterhaus, 10719 Berlin',
        geo: { lat: 52.51, lon: 13.6 },
        source: 'contacts',
        count: 1,
      },
    ])
  })
})

describe('parseGeo', () => {
  it('reads vCard and iCalendar forms, rejects nonsense', () => {
    expect(parseGeo('52.5;13.4')).toEqual({ lat: 52.5, lon: 13.4 })
    expect(parseGeo('geo:-33.9,151.2')).toEqual({ lat: -33.9, lon: 151.2 })
    expect(parseGeo('200;13')).toBeUndefined()
    expect(parseGeo(undefined)).toBeUndefined()
  })
})

describe('eventPlaces', () => {
  it('counts LOCATIONs, skips links, keeps the first part as name', () => {
    const places = eventPlaces([
      { location: 'Café Kranzler, Kurfürstendamm 18, 10719 Berlin' },
      { location: 'Büro' },
      { location: 'café kranzler, kurfürstendamm 18, 10719 berlin', geo: { lat: 52.5, lon: 13.3 } },
      { location: 'https://meet.example.org/abc' },
    ])
    expect(places).toEqual([
      {
        name: 'Café Kranzler',
        label: 'Café Kranzler, Kurfürstendamm 18, 10719 Berlin',
        geo: { lat: 52.5, lon: 13.3 },
        source: 'events',
        count: 2,
      },
      { name: 'Büro', label: 'Büro', geo: undefined, source: 'events', count: 1 },
    ])
  })
})

describe('rankPlaces', () => {
  const places: PlaceCandidate[] = [
    { name: 'Kranzler Eck', label: 'Kranzler Eck', source: 'config', count: 1 },
    { name: 'Café Kranzler', label: 'Café Kranzler, Kudamm', source: 'events', count: 1 },
    { name: 'Bar Kranz', label: 'Bar Kranz', source: 'events', count: 5 },
    { name: 'Simon Kranz', label: 'Simon Kranz, Weg 1, Berlin', source: 'contacts', count: 1 },
    { name: 'Büro', label: 'Büro', source: 'events', count: 9 },
  ]

  it('orders contacts, past events, config; frequent first; folds accents', () => {
    expect(rankPlaces(places, 'kranz').map((p) => p.name)).toEqual([
      'Simon Kranz',
      'Bar Kranz',
      'Café Kranzler',
      'Kranzler Eck',
    ])
    expect(rankPlaces(places, 'cafe').map((p) => p.name)).toEqual(['Café Kranzler'])
    expect(rankPlaces(places, ' ')).toEqual([])
  })
})

describe('photonPlaces', () => {
  it('turns features into labelled places', () => {
    const json = {
      features: [
        {
          geometry: { coordinates: [13.33, 52.504] as [number, number] },
          properties: {
            name: 'Kranzler Eck Berlin',
            street: 'Kurfürstendamm',
            housenumber: '21',
            postcode: '10719',
            city: 'Berlin',
          },
        },
        {
          geometry: { coordinates: [13.4, 52.52] as [number, number] },
          properties: { name: 'Berlin', city: 'Berlin' },
        },
        { properties: { name: 'ohne Koordinaten' } },
      ],
    }
    expect(photonPlaces(json)).toEqual([
      {
        name: 'Kranzler Eck Berlin',
        label: 'Kranzler Eck Berlin, Kurfürstendamm 21, 10719 Berlin',
        geo: { lat: 52.504, lon: 13.33 },
        source: 'map',
      },
      { name: 'Berlin', label: 'Berlin', geo: { lat: 52.52, lon: 13.4 }, source: 'map' },
    ])
  })
})

describe('Photon', () => {
  const answer = {
    features: [
      { geometry: { coordinates: [13.3, 52.5] }, properties: { name: 'Kranzler', city: 'Berlin' } },
    ],
  }

  it('asks near the configured point, caches, and stays quiet on errors', async () => {
    const urls: string[] = []
    let fail = false
    const fetcher = (async (url: string) => {
      urls.push(url)
      if (fail) throw new Error('offline')
      return new Response(JSON.stringify(answer))
    }) as typeof fetch
    const photon = new Photon(() => ({ lat: 52.52, lon: 13.405 }), fetcher)

    expect(await photon.search('Kr')).toEqual([])
    expect(await photon.search('Kranzler')).toEqual([
      { name: 'Kranzler', label: 'Kranzler, Berlin', geo: { lat: 52.5, lon: 13.3 }, source: 'map' },
    ])
    await photon.search('Kranzler')
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('q=Kranzler')
    expect(urls[0]).toContain('lat=52.52')

    fail = true
    expect(await photon.search('Offline')).toEqual([])
    fail = false
    expect(await photon.search('Offline')).toHaveLength(1)
    expect(await photon.geocode('Kurfürstendamm 21, Berlin')).toEqual({ lat: 52.5, lon: 13.3 })
  })
})
