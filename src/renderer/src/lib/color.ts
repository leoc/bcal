/** Picks white or near-black text for a hex background, whichever contrasts more. */
export function contrastFor(hex: string | undefined): string | undefined {
  const match = hex?.match(/^#?([0-9a-f]{6})/i)
  if (!match?.[1]) return undefined
  const value = Number.parseInt(match[1], 16)
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
  // contrast ratio against white vs. against #09090b (luminance ~0.003)
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.053 ? '#ffffff' : '#09090b'
}
