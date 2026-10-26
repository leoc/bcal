import { describe, expect, it } from 'vitest'
import { mergePeople, parseVcards, rankPeople } from '../src/main/people'

describe('parseVcards', () => {
  it('reads FN and every EMAIL, unfolding lines', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Simon Müller',
      'EMAIL;TYPE=home:simon@example.org',
      'EMAIL;TYPE=work:s.mueller@work.exam',
      ' ple',
      'END:VCARD',
      'BEGIN:VCARD',
      'FN:Nur Name',
      'END:VCARD',
    ].join('\r\n')
    expect(parseVcards(text)).toEqual([
      { name: 'Simon Müller', email: 'simon@example.org' },
      { name: 'Simon Müller', email: 's.mueller@work.example' },
      { name: 'Nur Name' },
    ])
  })
})

describe('rankPeople', () => {
  const people = mergePeople(
    [{ name: 'Simon Müller', email: 'simon@example.org' }, { name: 'Simone Ohne' }],
    [
      { name: 'Simon Kurz', email: 'kurz@example.org' },
      { name: 'Simon Kurz', email: 'kurz@example.org' },
      { email: 'simon@example.org' },
      { name: 'Tosimo', email: 'tosimo@example.org' },
    ],
  )

  it('merges by address and counts appearances', () => {
    expect(people.find((p) => p.email === 'simon@example.org')).toMatchObject({
      name: 'Simon Müller',
      count: 2,
      source: 'contacts',
    })
  })

  it('ranks word starts, then addresses, then frequency', () => {
    expect(rankPeople(people, 'sim').map((p) => p.name)).toEqual([
      'Simon Kurz',
      'Simon Müller',
      'Simone Ohne',
      'Tosimo',
    ])
    expect(rankPeople(people, 'müll').map((p) => p.email)).toEqual(['simon@example.org'])
  })
})
