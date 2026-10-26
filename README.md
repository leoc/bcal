# bcal

Keyboard-driven desktop calendar. Electron + React + TypeScript, styled with
shadcn/ui, views by FullCalendar v7 (shadcn flavor). bcal does not talk CalDAV
itself: it reads the local vdir that [pimsync](https://pimsync.whynothugo.nl/)
keeps in sync with the Nextcloud, and will write new events back as `.ics`
files for pimsync to upload.

Planning, decisions and open questions: `../../project.org` (outside the repo).

## How it works

```
Nextcloud (CalDAV) <-> pimsync (HM service) <-> ~/.calendar/<account>/<collection>/*.ics
                                                     |
                     main process: Vdir (ical.js) ---+--- fs.watch -> reload
                          | IPC (preload: window.api)
                     renderer: React + FullCalendar + keymap
```

- `src/main/vdir.ts` reads every collection (`displayname`, `color`, `*.ics`),
  keeps parsed events in memory and expands RRULE/EXDATE/RECURRENCE-ID per
  requested range.
- `src/renderer/src/lib/keymap.ts` holds the bindings (Vim-style defaults).
- `src/renderer/src/components/ui/` is shadcn/FullCalendar registry code; edit
  it freely, but it is excluded from Biome.

## Keys

| Key | Action |
|---|---|
| `h` / `l`, `←` / `→` | previous / next period |
| `t` | today |
| `w` `m` `d` `a` | week, month, day, agenda |
| `1`–`9` | toggle calendar |
| `b` | toggle sidebar |
| `?` | key help |

## Sync

Configured in `~/.nixos-config/home/arthur/shared/programs/calendar.nix`
(`programs.pimsync`, `services.pimsync`, `accounts.calendar.accounts.*.pimsync`).
The vdir root defaults to `~/.calendar`; override with `BCAL_VDIR`.

## Development

```sh
direnv allow            # or: nix develop
npm install
npm run dev             # electron-vite with HMR
npm test                # vitest (fixtures in test/fixtures/vdir)
npm run typecheck
npm run lint            # biome; npm run format to fix
```

Electron comes from nixpkgs (see `flake.nix`); the npm `electron` package stays
on the same major for typings only.

Add shadcn or FullCalendar components with `npx shadcn@latest add …`; the
`@fullcalendar` registry is set in `components.json`.
