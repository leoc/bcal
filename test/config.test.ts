import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { defaultConfig, normalize, writeConfigValue } from '../src/main/config'

describe('normalize', () => {
  it('falls back to defaults for empty or broken input', () => {
    expect(normalize(null)).toEqual(defaultConfig)
    expect(normalize({ startView: 'year', groups: 'x', hidden: [1, 'a'] })).toEqual({
      ...defaultConfig,
      hidden: ['a'],
    })
  })

  it('reads groups, hidden calendars and key overrides', () => {
    const config = normalize(
      parse(`
startView: month
groups:
  - name: Privat
    calendars: [family, Mia]
  - name: Sonstiges
    toggle: true
    calendars: [birthdays]
hidden: [birthdays]
keymap: { n: next, h: none }
`),
    )
    expect(config).toEqual({
      startView: 'month',
      groups: [
        { name: 'Privat', toggle: false, calendars: ['family', 'Mia'] },
        { name: 'Sonstiges', toggle: true, calendars: ['birthdays'] },
      ],
      hidden: ['birthdays'],
      keymap: { n: 'next', h: 'none' },
      defaultCalendar: undefined,
      defaultDuration: 60,
      defaultAlarm: undefined,
      organizer: undefined,
      emails: [],
      video: undefined,
      places: [],
      near: { lat: 52.52, lon: 13.405 },
      zoom: 1,
      panels: { sidebar: 'remember', details: 'remember' },
      sync: { command: 'pimsync', config: undefined, pairs: [], afterWrite: 0, interval: 0 },
    })
  })

  it('accepts only http(s) URLs for video rooms', () => {
    expect(normalize({ video: 'https://meet.example.org/' }).video).toBe(
      'https://meet.example.org/',
    )
    expect(normalize({ video: 'javascript:alert(1)' }).video).toBeUndefined()
  })

  it('reads the link command as a line or a list', () => {
    expect(normalize({ openLink: ' firefox  --new-window ' }).openLink).toEqual([
      'firefox',
      '--new-window',
    ])
    expect(normalize({ openLink: ['browser', '--app={url}'] }).openLink).toEqual([
      'browser',
      '--app={url}',
    ])
    expect(normalize({ openLink: '' }).openLink).toBeUndefined()
  })

  it('reads own places and the map center', () => {
    const config = normalize(
      parse(`
places:
  - name: Büro
    address: Musterstraße 1, 10115 Berlin
    geo: [52.53, 13.38]
  - name: Kita
  - address: ohne Namen
near: { lat: 48.14, lon: 11.58 }
`),
    )
    expect(config.places).toEqual([
      {
        name: 'Büro',
        label: 'Büro, Musterstraße 1, 10115 Berlin',
        geo: { lat: 52.53, lon: 13.38 },
        source: 'config',
      },
      { name: 'Kita', label: 'Kita', geo: undefined, source: 'config' },
    ])
    expect(config.near).toEqual({ lat: 48.14, lon: 11.58 })
  })
})

describe('zoom', () => {
  it('reads and clamps the zoom factor', () => {
    expect(normalize({ zoom: 0.8 }).zoom).toBe(0.8)
    expect(normalize({ zoom: 5 }).zoom).toBe(2)
    expect(normalize({ zoom: 0.1 }).zoom).toBe(0.5)
    expect(normalize({ zoom: 'big' }).zoom).toBe(1)
  })
})

describe('writeConfigValue', () => {
  it('sets one key and keeps comments and the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bcal-config-'))
    const path = join(dir, 'config.yml')
    await writeFile(path, '# mine\nstartView: month # by hand\nzoom: 1\nhidden: [a]\n')
    await writeConfigValue('zoom', 0.9, path)
    const text = await readFile(path, 'utf8')
    expect(text).toContain('# mine')
    expect(text).toContain('startView: month # by hand')
    expect(normalize(parse(text))).toMatchObject({ zoom: 0.9, startView: 'month', hidden: ['a'] })
  })

  it('adds a missing key and writes the template for a missing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bcal-config-'))
    const path = join(dir, 'sub', 'config.yml')
    await writeConfigValue('zoom', 1.2, path)
    const text = await readFile(path, 'utf8')
    expect(text).toContain('# bcal configuration')
    expect(normalize(parse(text)).zoom).toBe(1.2)
  })
})
