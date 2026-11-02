import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalize } from '../src/main/config'
import { errorText, Sync, summarize, syncArgs } from '../src/main/sync'
import type { SyncSettings, SyncStatus } from '../src/shared/types'

const settings = (changes: Partial<SyncSettings> = {}): SyncSettings => ({
  command: 'pimsync',
  pairs: [],
  afterWrite: 0,
  interval: 0,
  ...changes,
})

/** A fake pimsync: a shell script that prints, waits and exits as told. */
async function fake(body: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bcal-sync-'))
  const path = join(dir, 'pimsync')
  await writeFile(path, `#!/bin/sh\n${body}\n`)
  await chmod(path, 0o755)
  return path
}

describe('pimsync output', () => {
  it('sums up operations and conflicts', () => {
    const out = `>> Pair: a
1 collection operations, 2 item operations, 0 property operations
0 conflicts detected
>> Pair: b
0 collection operations, 1 item operations, 0 property operations
1 conflicts detected`
    expect(summarize(out)).toBe('4 Änderungen, 1 Konflikt')
    expect(summarize('0 collection operations, 0 item operations\n0 conflicts detected')).toBe(
      'nichts zu tun',
    )
  })

  it('keeps the last lines of an error', () => {
    expect(errorText('Configuration error: x\n\nCaused by:\n    pair missing\n', 78)).toBe(
      'Configuration error: x · Caused by: · pair missing',
    )
    expect(errorText('', 1)).toBe('pimsync endete mit Code 1')
  })

  it('passes config file and pairs', () => {
    expect(syncArgs(settings())).toEqual(['sync'])
    expect(syncArgs(settings({ config: '~/p.conf', pairs: ['cal'] }))).toEqual([
      '-c',
      join(homedir(), 'p.conf'),
      'sync',
      'cal',
    ])
  })

  it('reads the sync section of config.yml', () => {
    expect(normalize({ sync: { afterWrite: 5, pairs: ['a', 1], command: ' ' } }).sync).toEqual({
      command: 'pimsync',
      config: undefined,
      pairs: ['a'],
      afterWrite: 5,
      interval: 0,
    })
  })
})

describe('Sync', () => {
  it('reports a good run with its summary', async () => {
    const command = await fake('echo "0 collection operations, 3 item operations"; exit 0')
    const seen: SyncStatus[] = []
    const status = await new Sync(
      () => settings({ command }),
      (s) => seen.push(s),
    ).run()
    expect(status).toMatchObject({ running: false, ok: true, summary: '3 Änderungen' })
    expect(seen.map((s) => s.running)).toEqual([true, false])
  })

  it('reports errors, a missing binary and a hanging run', async () => {
    const failing = await fake('echo "Error: connection refused" >&2; exit 1')
    expect(await new Sync(() => settings({ command: failing })).run()).toMatchObject({
      ok: false,
      error: 'Error: connection refused',
    })
    expect(await new Sync(() => settings({ command: '/nonexistent/pimsync' })).run()).toMatchObject(
      { ok: false, error: '/nonexistent/pimsync nicht gefunden' },
    )
    const hanging = await fake('sleep 5')
    const status = await new Sync(
      () => settings({ command: hanging }),
      undefined,
      undefined,
      200,
    ).run()
    expect(status.error).toMatch(/antwortet nicht/)
  })

  it('runs once more when asked while running, never two at a time', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bcal-sync-'))
    const command = await fake(
      `[ -e "${dir}/lock" ] && echo overlap >> "${dir}/log"; touch "${dir}/lock"; sleep 0.2; rm "${dir}/lock"; echo run >> "${dir}/log"`,
    )
    const sync = new Sync(() => settings({ command }))
    const first = sync.run()
    const second = sync.run()
    const third = sync.run()
    await Promise.all([first, second, third])
    const log = spawnSync('cat', [join(dir, 'log')]).stdout.toString()
    expect(log.trim().split('\n')).toEqual(['run', 'run'])
  })
})

const hasPimsync = spawnSync('pimsync', ['version']).status === 0

describe.skipIf(!hasPimsync)('Sync with pimsync between two local vdirs', () => {
  it('pushes a new event from one side to the other', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bcal-pimsync-'))
    await mkdir(join(dir, 'a/cal'), { recursive: true })
    await mkdir(join(dir, 'b'), { recursive: true })
    const config = join(dir, 'pimsync.conf')
    await writeFile(
      config,
      `storage a {
	type vdir/icalendar
	fileext .ics
	path ${dir}/a
}
storage b {
	type vdir/icalendar
	fileext .ics
	path ${dir}/b
}
pair local {
	storage_a a
	storage_b b
	collections from a
}
status_path ${dir}/status
`,
    )
    await writeFile(
      join(dir, 'a/cal/x.ics'),
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nBEGIN:VEVENT\r\nUID:x@bcal\r\nDTSTAMP:20261101T000000Z\r\nDTSTART:20261103T100000Z\r\nSUMMARY:X\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
    )
    const sync = new Sync(() => settings({ config, pairs: ['local'] }))
    expect(await sync.run()).toMatchObject({ ok: true, summary: '2 Änderungen' })
    expect(await readdir(join(dir, 'b/cal'))).toHaveLength(1)
    expect(await sync.run()).toMatchObject({ ok: true, summary: 'nichts zu tun' })

    const wrong = new Sync(() => settings({ config, pairs: ['nope'] }))
    expect((await wrong.run()).error).toMatch(/nope/)
  })
})
