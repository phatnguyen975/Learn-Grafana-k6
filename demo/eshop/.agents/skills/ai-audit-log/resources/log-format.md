# Log Format Specification

## File Naming

**Default (no `--file` flag):**

```
docs/audit/ai/<fullname>-YYYY-MM.log.md
```

**With `--file` flag:**

```
<exactly the path specified by human>
```

**Fullname normalization:** lowercase · remove diacritics · spaces → `-`

| Raw input         | Normalized filename              |
| ----------------- | -------------------------------- |
| `Tấn Phát`        | `tan-phat-2026-07.log.md`        |
| `Nguyễn Tấn Phát` | `nguyen-tan-phat-2026-07.log.md` |
| `John Doe`        | `john-doe-2026-07.log.md`        |

## File Structure

```
[Statistics Block]   ← always at top, updated on every write
[Entry 001]
[Entry 002]
...
[Entry N]            ← newest at bottom
```

## Statistics Block

```markdown
# AI Audit Log — [Month Year]

> **Last updated:** YYYY-MM-DDTHH:MM:SS+07:00

## Monthly Statistics

- **Period:** YYYY-MM-01 → YYYY-MM-DD
- **Total Interactions:** N
- **Models Used:** model-name (N), model-name (N)

### Status Breakdown

| Status        | Count | %   |
| ------------- | ----- | --- |
| ✅ VALID      | 0     | 0%  |
| ⚠️ PARTIAL    | 0     | 0%  |
| 🔄 REVISED    | 0     | 0%  |
| ❌ INVALID    | 0     | 0%  |
| 🔲 INCOMPLETE | 0     | 0%  |
| ⏳ PENDING    | 0     | 0%  |
| **Total**     | **0** |     |

### Tag Breakdown

| Tag | Count |
| --- | ----- |
| ... | ...   |

### Quality Metrics

- **Acceptance Rate** (VALID + PARTIAL / Total): 0%
- **Revision Rate** (REVISED / Total): 0%
- **Failure Rate** (INVALID + INCOMPLETE / Total): 0%
```

## Log Entry

````markdown
## [AI-AUDIT-NNN] YYYY-MM-DDTHH:MM:SS+07:00

### Metadata

- **Model:** model-name
- **Tags:** `tag1` · `tag2` · `tag3`
- **Status:** [emoji] STATUS

### Prompt

```prompt
[exact prompt text]
```

### Output

[For text/code output:]

```markdown
[AI output here]
```

[For file output:]

- `filename.ext` — detailed description of content
- `filename.ext` — detailed description of content

### Evaluation

| Field    | Detail                                        |
| -------- | --------------------------------------------- |
| Status   | [emoji] STATUS                                |
| Reason   | [explanation of why this status was assigned] |
| Revised  | Yes / No                                      |
| Revision | [description of changes made, or "N/A"]       |

## Field Definitions

| Field     | Required    | Description                                |
| --------- | ----------- | ------------------------------------------ |
| Entry ID  | Yes         | `[AI-AUDIT-NNN]` — 3-digit, resets monthly |
| Timestamp | Yes         | ISO 8601 with UTC+7 offset                 |
| Model     | Yes         | Exact model name, e.g. `claude-sonnet-4-6` |
| Tags      | Yes         | 1–3 tags from taxonomy                     |
| Status    | Yes         | One of 6 defined statuses                  |
| Prompt    | Yes         | Full original prompt in fenced block       |
| Output    | Yes         | Inline content or file bullet list         |
| Reason    | Yes         | Plain English explanation of status        |
| Revised   | Yes         | `Yes` or `No`                              |
| Revision  | Conditional | Required if Revised = Yes                  |
````
