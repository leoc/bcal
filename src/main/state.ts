import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Small per-machine UI state (calendar toggles) as JSON next to Electron's
 * userData. Not in localStorage: its first synchronous access blocks the
 * renderer for ~3 s while Chromium opens the storage backend.
 */
export class State<T extends object> {
  private readonly path: string

  constructor(
    dir: string,
    name: string,
    private readonly fallback: T,
  ) {
    this.path = join(dir, `${name}.json`)
  }

  async read(): Promise<T> {
    try {
      return { ...this.fallback, ...JSON.parse(await readFile(this.path, 'utf8')) }
    } catch {
      return this.fallback
    }
  }

  async write(value: T): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, `${JSON.stringify(value, null, 2)}\n`)
  }
}
