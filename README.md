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
| `Enter`, `i`         | toggle details panel (off at first start, then remembered)         |
| `o`                  | open the event's link; with several: choose one                    |
| `O`                  | all links of the event: open in the browser or copy, by number     |
| `Esc`                | clear focus / close                                                |
| `g`                  | go to date (`fr`, `12.11.`, `kw 45`, `+3`, `nächsten Freitag`)     |
| `Ctrl+K`             | palette: new event, commands (`>`), search (`/`)                   |
| `n`                  | new event from one line (see below)                                |
| `e`                  | change the focused event: type only what changes, or reopen draft  |
| `Shift+Enter`        | save the draft (also right from the palette)                       |
| `D`, `Delete`        | delete the focused event (asks first)                              |
| `c`                  | cancel the focused event (stays struck through), again: lift it    |
| `u`                  | take back the last write (new, changed, cancelled or deleted)      |
| `:` / `>`            | commands                                                           |
| `/`                  | search all events                                                  |
| `1`–`9`              | show only that group; add-on groups (`toggle: true`) switch on/off |
| `0`                  | show all calendars                                                 |
| `S`                  | sync now with pimsync (pull and push)                              |
| `x`                  | incognito: titles become "Termin", no names in details or search   |
| `q`                  | hide the window; bcal keeps running (see below)                    |
| `b`                  | toggle sidebar (remembered; also the buttons left and right)       |
| `Ctrl+=` / `Ctrl+-`  | zoom the whole UI in / out (also `Ctrl`+wheel), `Ctrl+0` resets    |
| `?`                  | key help                                                           |

## New events

`n` opens the palette with one line, German or English:

```
nächsten Freitag 14 Uhr eine Stunde Kaffee @Simon #family video
next friday 2pm 1h call @simon
jeden Montag 9 Uhr Standup bis 18.12.
morgen 14-15:30 Workshop im Büro
Urlaub 2.11. bis 6.11. in Hamburg #family
Messe 10.11. 9 Uhr bis 12.11. 17 Uhr
```

Date and time (chrono), duration (`1h`, `90min`, `eine Stunde`) or end
(`14-15:30`, `bis 16 Uhr`), place (`in`, `im`, `bei`, `at` + capitalized
words; `bei Friedi` also stays in the title), recurrence (`jeden Montag`, `alle 2 Wochen`, `every monday`, `… bis
18.12.`), `#calendar`, `@person` (Tab completes from contacts and past
participants; people with an address get invited by the server) and
`video`/`call` for a meeting room (`video:` URL in `config.yml`, plus a random
room name). Without time it is all-day, without
date today. Defaults live in `config.yml`.

A date range makes one multi-day event: `2.11. bis 6.11.`, `2.11.-6.11.`,
`2.-6.11.`, `vom 2. bis 6. November`, `Montag bis Freitag`, `Nov 10 to Nov 12`.
Without times it is all-day including the last day; with a time on one side
only, both ends use it. An end before the start lies in the next year
(`28.12. bis 3.1.`).

A date without a year stays in this year while it lies in the current month,
later it means next year. `backdate:` in `config.yml` changes that limit: `month`
or a number of days (`0` for none). For anything older put `<`, `letzter` or
`last` in front (`<2.10.`, `letzten Montag`, `last 20.10. bis 24.10.`), or type
the year (`2.10.26`). A range counts as a whole, by its end.

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

`e` on the focused event opens an empty line in the same syntax as `n`. What
you type replaces only those parts of the event, the rest stays:

```
16 Uhr          same day and length, starts at 16:00
fr              same time, moved to Friday
2h              same start, two hours long
10-11:15        new start and end on the same day
2.11. bis 6.11. all-day from the 2nd to the 6th
in Büro         new place
@Tim            Tim instead of the current attendees
#family         moved to another calendar
Kaffee und Kuchen 16 Uhr   new title and time
```

The panel on the right previews the changed event; `Shift+Enter` saves it and
the attendees get an update from the server. All-day events stay all-day unless
the line names a time; a date range without times makes any event all-day. Dragging or resizing an event in the calendar changes
its time the same way.

For a series bcal asks: only this occurrence (an override with
`RECURRENCE-ID`), this and the following ones (the series ends before, a new one
starts here) or all of them (moved by as much as this occurrence moved).
`D`/`Delete` asks the same for series and otherwise confirms once.

bcal edits the file's own component: alarms, unknown and `X-` properties and
the reply state of attendees stay; `SEQUENCE` goes up so the server sends updates
or cancellations. Events organized by someone else cannot be changed: you answer them
(see below) or delete them, which takes them out of your calendar. Removed files go to `~/_nobackup/_deletable/bcal/`;
`u` takes back the last write of the session, one after the other.

## Answering invitations

An event someone else organizes with you on the list (`organizer` or `emails:`
in `config.yml`) gets an answer instead of an edit. `e` offers accept, tentative
and decline, `c` declines after one question, and on a declined event `c`
offers the same choice again. For a series bcal asks: only this occurrence or
all of them; only the organizer can split a series.

Only your `PARTSTAT` changes, `SEQUENCE` stays, so the server replies to the
organizer. A declined event stays in the calendar, grey but not struck through,
and gets `TRANSP:TRANSPARENT`, so the time counts as free; taking the decline
back blocks it again. Tentative events are lighter, unanswered ones dashed.
`u` takes an answer back, the organizer then gets the old answer.

## Cancelling events

`c` on an own event cancels it without deleting it: `STATUS:CANCELLED` and
`SEQUENCE` + 1, so the server sends the attendees a cancellation. The event
stays in the calendar, struck through and dimmed, as do events their
organizer cancelled. With attendees bcal asks first ("Absage an N Teilnehmer
senden?", Esc keeps the event as it is); without, it cancels right away. A
series asks for this one, this and the following (the series splits there,
like an edit), or all. `c` on a cancelled event lifts it (`STATUS:CONFIRMED`,
attendees get an update), `u` takes either back.

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
defaults on first start and reloaded on save: start view, UI `zoom` (0.5–2;
the zoom keys write it back, comments in the file stay), side `panels`
(`remember` the last state, or always start `shown`/`hidden`), sidebar groups (their
order assigns the keys 1–9; `toggle: true` makes a group an add-on that its
key switches on and off), calendars hidden by default, defaults for new events
(calendar, duration, alarm, `organizer`, `video` room URL), own places
(`places:` with `name`, optional `address` and `geo: [lat, lon]`), the point map
searches prefer (`near:`, default Berlin), the command that opens links
(`openLink: firefox --new-window`, the URL replaces `{url}` or is appended;
the system browser without it), and key overrides
(`<key>: <action>`, `none` unbinds). Toggles in the app win over `hidden` and
are kept per machine. Chromium state lives in `~/.local/state/bcal`.

## Sync

bcal runs [pimsync](https://pimsync.whynothugo.nl/) itself when asked: `S`
(or "Jetzt synchronisieren" in the palette, or a click on the sync line in the
sidebar) runs `pimsync sync` once, pulling and pushing, e.g. to get an event
onto the phone right away. The sidebar shows when the last run was and what it
did; errors show there and as a message. The `sync:` section of `config.yml`
sets the pimsync `config` file (pimsync's own default otherwise), the `pairs`
to sync, `afterWrite` (push own changes that many seconds after a write) and
`interval` (minutes). Keep the last two at 0 while a pimsync service keeps the
vdir in sync, so two runs never work on the same status at once.

The Nix package puts pimsync on `PATH` (after your own). pimsync's own
configuration (storages, credentials) stays with pimsync; mine is in
`~/.nixos-config/home/arthur/shared/programs/calendar.nix`. The vdir root
defaults to `~/.calendar`; override with `BCAL_VDIR`.

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
