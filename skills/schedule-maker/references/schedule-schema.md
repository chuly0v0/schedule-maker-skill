# Schedule data

Use this exact shape:

```json
{
  "title": "广州旅行计划🧳",
  "dateRange": "5.1-5.5",
  "description": "城市漫游・美食之旅🍜",
  "rows": [
    {
      "date": "5.1",
      "title": "抵达广州🚄",
      "label": "11:00",
      "content": "到达广州南站",
      "highlight": false
    }
  ]
}
```

## Field decisions

- `title`: concise name for the whole schedule, ending in a space and one suitable emoji.
- `dateRange`: compact range shown below the title. Derive it only from supplied dates.
- `description`: subtitle summarizing supplied activities, ending in a space and one suitable emoji; keep it empty when the source does not support one.
- `rows`: one concrete detail per row, in display order.
- `date`: compact date label such as `5.1`; use `待定` if the user wants a result but supplied no date.
- `title` inside a row: concise card heading ending in a space and one suitable emoji. Repeat the exact heading including its emoji on every row of the card. Rows with the same date and exact title merge only when adjacent.
- `label`: time or a short tag such as `上午`, `全天`, or `待定`. Leave it empty when absent.
- `content`: the concrete activity. Do not repeat the date, label, or card title unnecessarily.
- `highlight`: boolean. Use `true` for explicitly emphasized items or a clearly central event when the user asks the model to choose highlights; otherwise use `false`. Keep it consistent across all rows of one card.

A title-only summary card has empty `label` and `content`. Do not add empty detail rows to a normal card.

Give the main title, nonempty subtitle, and every card heading one context-appropriate trailing emoji by default, for example `三日生活安排 📅`, `探亲・创作・公园 🌿`, and `全天创作 ✍️`. Reuse an existing suitable trailing emoji rather than duplicating it. Preserve meaningful source emoji; do not add emoji to dates, time labels, or activity details merely for decoration. Explicit user styling instructions override this default.

## Editable-link contract

The production editor is `https://chuly0v0.github.io/schedule-maker/`.

`scripts/prepare_schedule.mjs` validates the object, removes unsupported properties, and encodes UTF-8 JSON as unpadded base64url in the URL fragment:

```text
#schedule=<base64url-json>
```

The script decodes the completed URL and compares the recovered JSON with the normalized schedule before returning it. It also emits `editMarkdown`; use that field verbatim for the user-facing link instead of manually rebuilding or transcribing the URL.

The fragment stays client-side during normal HTTP navigation. It is removed from the address bar after the webpage imports and stores the schedule; the page's **复制编辑链接** button creates a fresh link containing current edits.
