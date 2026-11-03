import { describe, expect, it } from 'vitest'
import { linkCommand } from '../src/main/links'
import { linkName } from '../src/renderer/src/lib/links'

describe('linkCommand', () => {
  it('appends the URL', () => {
    expect(linkCommand(['firefox', '--new-window'], 'https://a.b')).toEqual([
      'firefox',
      '--new-window',
      'https://a.b',
    ])
  })

  it('puts the URL in place of {url}', () => {
    expect(linkCommand(['browser', '--app={url}', '-x'], 'https://a.b')).toEqual([
      'browser',
      '--app=https://a.b',
      '-x',
    ])
  })
})

describe('linkName', () => {
  it('names meeting services, else the host', () => {
    expect(linkName('https://teams.microsoft.com/l/meetup-join/19%3a')).toBe('Teams')
    expect(linkName('https://us02web.zoom.us/j/123')).toBe('Zoom')
    expect(linkName('https://meet.google.com/abc-defg-hij')).toBe('Google Meet')
    expect(linkName('https://meet.velalu.qa/room')).toBe('Jitsi')
    expect(linkName('https://www.example.org/agenda')).toBe('example.org')
  })
})
