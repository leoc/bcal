import { describe, expect, it } from 'vitest'
import { links } from '../src/main/details'

describe('links', () => {
  it('dedupes, strips trailing punctuation and puts meeting links first', () => {
    expect(
      links(
        'Doku: https://example.org/doc, und https://example.org/doc.',
        undefined,
        'Call: https://meet.google.com/abc-defg-hij)',
      ),
    ).toEqual(['https://meet.google.com/abc-defg-hij', 'https://example.org/doc'])
  })
})
