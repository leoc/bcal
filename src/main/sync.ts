import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import type { SyncSettings, SyncStatus } from '../shared/types'

/** What one `pimsync sync` printed, in short: `3 Änderungen, 1 Konflikt`. */
export function summarize(output: string): string {
  const count = (pattern: RegExp) =>
    [...output.matchAll(pattern)].reduce((sum, m) => sum + Number(m[1]), 0)
  const items = count(/(\d+) item operations?/g)
  const collections = count(/(\d+) collection operations?/g)
  const conflicts = count(/(\d+) conflicts? detected/g)
  const parts = [
    items + collections
      ? `${items + collections} ${items + collections === 1 ? 'Änderung' : 'Änderungen'}`
      : 'nichts zu tun',
  ]
  if (conflicts) parts.push(`${conflicts} ${conflicts === 1 ? 'Konflikt' : 'Konflikte'}`)
  return parts.join(', ')
}

/** The lines of pimsync's error output that say what went wrong, at most ~400 characters. */
export function errorText(stderr: string, code: number | null): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const text = lines.slice(-4).join(' · ')
  return (text || `pimsync endete mit Code ${code}`).slice(0, 400)
}

export function syncArgs(settings: SyncSettings): string[] {
  const config = settings.config?.replace(/^~(?=\/|$)/, homedir())
  return [...(config ? ['-c', config] : []), 'sync', ...settings.pairs]
}

type Spawn = typeof spawn

/**
 * Runs `pimsync sync` on demand, one run at a time: a request while one runs
 * starts one more run afterwards (it may have missed the latest write).
 */
export class Sync {
  private status: SyncStatus = { running: false }
  private current?: Promise<SyncStatus>
  private again = false

  constructor(
    private readonly settings: () => SyncSettings,
    private readonly onStatus: (status: SyncStatus) => void = () => {},
    private readonly run_: Spawn = spawn,
    private readonly timeoutMs = 120_000,
  ) {}

  get(): SyncStatus {
    return this.status
  }

  run(): Promise<SyncStatus> {
    if (this.current) {
      this.again = true
      return this.current
    }
    this.current = (async () => {
      let result: SyncStatus
      do {
        this.again = false
        this.set({ ...this.status, running: true })
        result = await this.once()
        this.set(result)
      } while (this.again)
      this.current = undefined
      return result
    })()
    return this.current
  }

  private set(status: SyncStatus): void {
    this.status = status
    this.onStatus(status)
  }

  private once(): Promise<SyncStatus> {
    const settings = this.settings()
    const started = new Date().toISOString()
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let done = false
      const finish = (status: Omit<SyncStatus, 'running' | 'at'>) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ running: false, at: started, ...status })
      }
      const child = this.run_(settings.command, syncArgs(settings), {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const timer = setTimeout(() => {
        child.kill()
        finish({ ok: false, error: `pimsync antwortet nicht (${this.timeoutMs / 1000} s)` })
      }, this.timeoutMs)
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', (error: NodeJS.ErrnoException) =>
        finish({
          ok: false,
          error:
            error.code === 'ENOENT'
              ? `${settings.command} nicht gefunden`
              : String(error.message ?? error),
        }),
      )
      child.on('close', (code) => {
        // pimsync prints the summary on stdout or stderr depending on the version
        if (code === 0) finish({ ok: true, summary: summarize(`${stdout}\n${stderr}`) })
        else finish({ ok: false, error: errorText(stderr || stdout, code) })
      })
    })
  }
}
