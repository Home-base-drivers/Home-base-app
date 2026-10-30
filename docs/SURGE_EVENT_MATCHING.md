# Matching surges to events

Every surge record (an Uber map or an Empower alert) is checked against the events that were near it at the time.

## How a match is made
- **Where:** an event counts if it is within 2.5 km of one of the record's hot areas. Big venues (stadiums, arenas, Soundstage, the Hippodrome, the Ottobar and similar) count within 3.5 km. Areas the map shows as calm are ignored.
- **When:** an event counts from 90 minutes before it starts until 90 minutes after it ends. If no end time is listed, the end is set 3 hours after the start for big venues and 2.5 hours for everything else.
- **Phase:** each match is labelled `arrivals` (before the start), `during`, or `let-out` (after the end).
- **Ignored as noise:**
  - Campus rooms and small sessions: tabling, study sessions, advising, galleries, dining halls, lectures, panels and similar.
  - Season passes and parking listings.
- **Ranking:** a record keeps at most 3 matches. Big venues come first, then the closest.

## Where matches are stored
- **`config/event-history.json`:** every event Home Base has read, kept append-only. Live feeds drop events once they pass, so this is the only way to match past surges.
- **The `EVENT_LINKS` block in `dist/homebase-demand-history.js`:** loads onto each record as `matched_events`. Matches are added, never removed.
  - Events checked by hand (`linked_event`, `related_events`) and `cause_note` are never replaced.
  - When no event is found, the record keeps its `cause_note` (for example, "thin night driver supply").
- **In the app:** whenever events load, `HomeBaseDemandHistory.linkEvents(events)` links them to recent records.
- **On screen:** the demand history shows a "Likely cause" line for each record.

## After every screenshot upload
```
npm run link:events -- --since 2026-10-29
```
The report lists every record from that date with its matched event, or "no event found".
