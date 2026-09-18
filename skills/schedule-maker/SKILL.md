---
name: schedule-maker
description: Turn natural-language itineraries, event plans, and schedules into the schedule-maker schema, an editable web link, and a matching PNG long image. Use when a user wants a schedule organized, visualized, or handed off to the schedule-maker webpage; do not use for ordinary calendar reminders or unrelated spreadsheets.
---

# Schedule Maker

Convert the user's source material into the website's structured schedule without inventing dates, times, people, places, or activities. Ask only when a missing fact materially changes the schedule; otherwise preserve uncertainty with a short label such as `待定`.

Read [references/schedule-schema.md](references/schedule-schema.md) before building the data. Keep rows in display order, repeat the date and card title on every row, keep rows for one card adjacent, and preserve useful emoji.

End the main title, subtitle (`description`), and each card heading with one context-appropriate emoji, separated from the text by a space. Reuse an existing suitable trailing emoji rather than duplicating it. Use the same complete heading, including its emoji, on all rows of a card. For the subtitle, summarize only supplied activities; leave it empty if no meaningful context is available. Keep dates and time labels undecorated. Follow an explicit user request for a different style.

## Generate the image

1. Save one schema-compatible JSON object in the task's writable directory.
2. Run the bundled script using the skill's absolute path:

   ```text
   node scripts/render_schedule.mjs <input.json> --output <absolute-output.png>
   ```

   Requires Node 22+ and installed Chrome or Edge; no npm installation. The script validates data and round-trips the edit URL, launches an isolated headless browser, opens that exact URL, verifies imported data, renders the webpage export to PNG, and closes the browser and removes its temporary profile. Default timeout is 45 seconds. Use `--scale 2` for high resolution; `--browser <executable>` if browser discovery fails.
3. Inspect the PNG once. Read the reported `editMarkdownPath` for the final link. Return the PNG and paste that Markdown verbatim; never reconstruct, shorten, or manually re-encode its URL. The `.result.json` sidecar contains the full link and dimensions; normal stdout prints only a compact summary.

Prefer this tested entrypoint over creating new render scripts or probing browser packages. If it fails, use the named failure stage to make a targeted correction; do not repeat unchanged attempts. Network or process restrictions still require the environment's normal permission handling. A verified `.edit.md` is saved before browser launch, so a rendering failure can still yield an editable link. If rendering remains unavailable, say that no PNG was generated and return that link.

## Webpage interface (alternative environments)

When local Chrome/Edge execution is unavailable but browser JavaScript is available, use `prepare_schedule.mjs <input.json>` to obtain normalized `schedule`, `editUrl`, and `editMarkdown`. Open that exact `editUrl` and wait for `window.ScheduleMaker`.

- `getSchedule()` returns the current schedule; compare its supported fields with the normalized input before export.
- `replaceSchedule(schedule)` replaces the page's schedule.
- `getSvg()` returns **`{ filename, width, height, svg }`**, not an SVG string. Use `.svg` as an in-memory intermediate, wait for fonts, and render at the returned dimensions to PNG in the same browser session.
- If webpage tools expose `replace_schedule` and `get_schedule_image`, they can provide the equivalent flow.

Save and return only PNG unless the user explicitly requests SVG. Do not persist intermediate SVG files.

The editable link stores data in its URL fragment; it is not a server upload. Anyone receiving the full link can read its schedule data. Do not create or share it when the user asks to keep data out of URLs.
