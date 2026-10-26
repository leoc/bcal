import type ICAL from 'ical.js'
import type { Attendee } from '../shared/types'

const MEETING =
  /meet\.google\.com|zoom\.us|teams\.microsoft|teams\.live|jitsi|whereby\.com|bbb|webex\.com/i
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g

export function person(property: ICAL.Property | null): Attendee | undefined {
  if (!property) return undefined
  const value = String(property.getFirstValue() ?? '').trim()
  const param = (name: string) => {
    const v = property.getParameter(name)
    return typeof v === 'string' ? v : undefined
  }
  return {
    // many clients put the address into CN; that is no name
    name: param('cn')?.includes('@') ? undefined : param('cn'),
    // some clients write the scheme twice (mailto:mailto:…)
    email: value.replace(/^(mailto:)+/i, '') || undefined,
    status: param('partstat'),
    role: param('role'),
  }
}

export function attendees(component: ICAL.Component): Attendee[] {
  return component
    .getAllProperties('attendee')
    .map((p) => person(p))
    .filter((a): a is Attendee => a !== undefined)
}

/** Unique http(s) links from the given texts, meeting links first. */
export function links(...texts: (string | undefined | null)[]): string[] {
  const found = new Set<string>()
  for (const text of texts) {
    for (const match of text?.match(URL_PATTERN) ?? []) found.add(match.replace(/[.,;:]+$/, ''))
  }
  return [...found].sort((a, b) => Number(MEETING.test(b)) - Number(MEETING.test(a)))
}
