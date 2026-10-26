import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Person } from '../shared/types'

export interface Candidate extends Person {
  /** how often seen as attendee/organizer, contacts count once */
  count: number
  source: 'contacts' | 'events'
}

/** Minimal vCard reader: FN and EMAIL of every card in the text. */
export function parseVcards(text: string): Person[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1)
  return cards.flatMap((card) => {
    const field = (name: string) =>
      card
        .split(/\r?\n/)
        .filter((line) => new RegExp(`^${name}[;:]`, 'i').test(line))
        .map((line) => line.slice(line.indexOf(':') + 1).trim())
        .filter(Boolean)
    const name = field('FN')[0]?.replace(/\\,/g, ',')
    const emails = field('EMAIL')
    if (!name && !emails.length) return []
    return emails.length ? emails.map((email) => ({ name, email })) : [{ name }]
  })
}

async function vcfFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.vcf'))
    .map((e) => join(e.parentPath, e.name))
}

/** People from the address books under `dir` (pimsync's contacts vdir). */
export async function readContacts(dir: string): Promise<Person[]> {
  const files = await vcfFiles(dir)
  const people = await Promise.all(
    files.map((f) => readFile(f, 'utf8').then(parseVcards, () => [] as Person[])),
  )
  return people.flat()
}

/** Merges contacts and event participants into ranked candidates per address/name. */
export function mergePeople(contacts: Person[], participants: Person[]): Candidate[] {
  const byKey = new Map<string, Candidate>()
  const key = (p: Person) => (p.email ?? p.name ?? '').toLowerCase()
  for (const p of contacts) {
    if (!key(p)) continue
    byKey.set(key(p), { ...p, count: 1, source: 'contacts' })
  }
  for (const p of participants) {
    if (!key(p)) continue
    const known = byKey.get(key(p))
    if (known) {
      known.count++
      known.name ??= p.name
    } else {
      byKey.set(key(p), { ...p, count: 1, source: 'events' })
    }
  }
  return [...byKey.values()]
}

/** Word-start matches before substring matches, with address before without, frequent first. */
export function rankPeople(people: Candidate[], query: string, limit = 8): Candidate[] {
  const q = query.toLowerCase().replace(/[._-]/g, ' ').trim()
  const score = (p: Candidate) => {
    const haystack = `${p.name ?? ''} ${p.email ?? ''}`.toLowerCase()
    if (!q) return 1
    const words = haystack.split(/[\s@._-]+/)
    if (words.some((w) => w.startsWith(q))) return 3
    if (haystack.replace(/[._-]/g, ' ').includes(q)) return 2
    return 0
  }
  return people
    .map((p) => ({ p, s: score(p) }))
    .filter(({ s }) => s > 0)
    .sort(
      (a, b) =>
        b.s - a.s ||
        Number(Boolean(b.p.email)) - Number(Boolean(a.p.email)) ||
        b.p.count - a.p.count ||
        (a.p.name ?? '').localeCompare(b.p.name ?? ''),
    )
    .slice(0, limit)
    .map(({ p }) => p)
}
