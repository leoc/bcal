const services: [RegExp, string][] = [
  [/(^|\.)teams\.(microsoft|live)\.com$/, 'Teams'],
  [/(^|\.)zoom\.us$/, 'Zoom'],
  [/^meet\.google\.com$/, 'Google Meet'],
  [/(^|\.)webex\.com$/, 'Webex'],
  [/^meet\.jit\.si$|^meet\./, 'Jitsi'],
]

/** Short name for a link: the meeting service, else the host. */
export function linkName(url: string): string {
  let host: string
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
  return services.find(([pattern]) => pattern.test(host))?.[1] ?? host
}
