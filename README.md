# bcal

Keyboard-driven desktop calendar. Electron + React + TypeScript, styled with
shadcn/ui, views by FullCalendar v7 (shadcn flavor). bcal does not talk CalDAV
itself: it reads the local vdir that [pimsync](https://pimsync.whynothugo.nl/)
keeps in sync with the Nextcloud, and will write new events back as `.ics`
files for pimsync to upload.

MIT licensed.

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

| Key                  | Action                                                             |
| -------------------- | ------------------------------------------------------------------ |
| `h` / `l`, `←` / `→` | previous / next period                                             |
| `t`                  | today                                                              |
| `w` `m` `d` `a`      | week, month, day, agenda                                           |
| `j` / `k`, `↓` / `↑` | next / previous event                                              |
| `Enter`, `i`         | toggle details panel                                               |
| `o`                  | open the event's first link                                        |
| `Esc`                | clear focus / close                                                |
| `g`                  | go to date (`fr`, `12.11.`, `kw 45`, `+3`, `nächsten Freitag`)     |
| `Ctrl+K`             | palette: new event, commands (`>`), search (`/`)                   |
| `n`                  | new event from one line (see below)                                |
| `e`                  | edit the focused event as a line, or reopen the draft              |
| `Shift+Enter`        | save the draft (also right from the palette)                       |
| `D`, `Delete`        | delete the focused event (asks first)                              |
| `u`                  | take back the last write (new, changed or deleted event)           |
| `:` / `>`            | commands                                                           |
| `/`                  | search all events                                                  |
| `1`–`9`              | show only that group; add-on groups (`toggle: true`) switch on/off |
| `0`                  | show all calendars                                                 |
| `x`                  | incognito: titles become "Termin", no names in details or search   |
| `q`                  | hide the window; bcal keeps running (see below)                    |
| `b`                  | toggle sidebar                                                     |
| `?`                  | key help                                                           |

## New events

`n` opens the palette with one line, German or English:

```
nächsten Freitag 14 Uhr eine Stunde Kaffee @Simon #family video
next friday 2pm 1h call @simon
jeden Montag 9 Uhr Standup bis 18.12.
morgen 14-15:30 Workshop im Büro
```

Date and time (chrono), duration (`1h`, `90min`, `eine Stunde`) or end
(`14-15:30`, `bis 16 Uhr`), place (`in`, `im`, `bei`, `at` + capitalized
words; `bei Friedi` also stays in the title), recurrence (`jeden Montag`, `alle 2 Wochen`, `every monday`, `… bis
18.12.`), `#calendar`, `@person` (Tab completes from contacts and past
participants; people with an address get invited by the server) and
`video`/`call` for a meeting room (`video:` URL in `config.yml`, plus a random
room name). Without time it is all-day, without
date today. Defaults live in `config.yml`.

After `bei`, `in`, `im` or `at` the palette suggests places: contacts with an
address, locations of past events, own `places:` from `config.yml` and the OSM
map search ([Photon](https://photon.komoot.io), biased towards `near:`). Enter
still keeps the line; `↓` or Tab picks a place, the panel shows it on a map
(MapLibre with [OpenFreeMap](https://openfreemap.org) tiles). A picked place is
saved as `LOCATION` "Name, street, postcode city" plus `GEO`; saved events with
`GEO` show the map too. Without a pick the words stay free text. Map searches
send the typed place words to photon.komoot.io.

While typing, the draft shows dashed in the calendar and in the panel; Enter
keeps it as a draft, `Shift+Enter` saves it as `<uid>.ics` and pimsync uploads
it. `u` moves the event just created to `~/_nobackup/_deletable/bcal/`.

## Changing events

`e` on the focused event opens it as a line, e.g. `29.10.2026 14:00 90min
Kaffee in Café Kranzler @SimonMüller`; its place and people count as picked, so
the full address, `GEO` and invitations survive. Change what you like (`#family`
moves it to another calendar) and save with `Shift+Enter`. Dragging or resizing
an event in the calendar changes its time the same way.

For a series bcal asks: only this occurrence (an override with
`RECURRENCE-ID`), this and the following ones (the series ends before, a new one
starts here) or all of them (moved by as much as this occurrence moved).
`D`/`Delete` asks the same for series and otherwise confirms once.

bcal edits the file's own component: alarms, unknown and `X-` properties and
the reply state of attendees stay; `SEQUENCE` goes up so the server sends updates
or cancellations. Events organized by someone else can only be deleted, which
takes them out of your calendar. Removed files go to `~/_nobackup/_deletable/bcal/`;
`u` takes back the last write of the session, one after the other.

## Opening .ics files

`bcal invite.ics` (or `xdg-open` with bcal as handler for `text/calendar`, as
the desktop entry declares) shows each event of the file as a draft and asks
where it goes. A running bcal takes the file over from a second start.

- New events: pick a calendar (default first, type to filter), Enter adds it.
- Invitations to you (`organizer` or `emails:` in `config.yml`): Tab switches
  between accept, tentative and decline; your copy carries the answer so the
  server can reply to the organizer.
- An event already in a calendar (same UID) is updated there; one with a lower
  `SEQUENCE` than your copy is flagged as older. `METHOD:CANCEL` offers to
  delete it, a cancelled occurrence of a series becomes an `EXDATE`.
- Re-sent invitations often come with a new UID: events by the same organizer
  with a similar title within two months are offered for deletion along with
  the import (checked when the title matches). Enter on one toggles it.

The `METHOD` line is dropped, alarms and other properties stay. `u` takes back
the import and the deletions together.

## Configuration

`~/.config/bcal/config.yml` (or `BCAL_CONFIG`) is written with commented
defaults on first start and reloaded on save: start view, sidebar groups (their
order assigns the keys 1–9; `toggle: true` makes a group an add-on that its
key switches on and off), calendars hidden by default, defaults for new events
(calendar, duration, alarm, `organizer`, `video` room URL), own places
(`places:` with `name`, optional `address` and `geo: [lat, lon]`), the point map
searches prefer (`near:`, default Berlin), and key overrides
(`<key>: <action>`, `none` unbinds). Toggles in the app win over `hidden` and
are kept per machine. Chromium state lives in `~/.local/state/bcal`.

## Sync

Configured in `~/.nixos-config/home/arthur/shared/programs/calendar.nix`
(`programs.pimsync`, `services.pimsync`, `accounts.calendar.accounts.*.pimsync`).
The vdir root defaults to `~/.calendar`; override with `BCAL_VDIR`.

## Install

The flake builds a package with Electron from nixpkgs: `nix run
github:leoc/bcal`, or in a flake-based Home Manager config:

```nix
inputs.bcal.url = "github:leoc/bcal";
# …
home.packages = [ inputs.bcal.packages.${pkgs.stdenv.hostPlatform.system}.default ];
```

It installs `bcal` and a desktop entry.



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
