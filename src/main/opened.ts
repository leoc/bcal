import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

/**
 * Files passed on the command line (`bcal invite.ics`, xdg-open, mu4e), by
 * the first start or by a second one that hands them over. Electron puts its
 * own switches and the app path into argv; only existing files remain.
 */
export function filesIn(argv: string[], cwd: string, appPath: string): string[] {
  const app = resolve(appPath)
  return argv
    .slice(1)
    .filter((arg) => !arg.startsWith('-'))
    .map((arg) => resolve(cwd, arg.replace(/^file:\/\//, '')))
    .filter((path) => path !== app && isFile(path))
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** Reads the file at once: mail clients remove their temp files soon. */
export async function readOpened(path: string): Promise<{ name: string; text: string }> {
  return { name: basename(path), text: await readFile(path, 'utf8') }
}
