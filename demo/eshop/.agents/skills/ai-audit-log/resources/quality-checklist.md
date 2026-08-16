# Quality Checklist

Run through this before finalizing any log entry.

## Entry Completeness

- [ ] Entry ID is 3-digit and sequential within the month (`001`, `002`, ...).
- [ ] Timestamp is ISO 8601 with `+07:00` offset.
- [ ] Model name is exact (e.g. `claude-sonnet-4-6`, not just `claude`).
- [ ] 1–3 tags selected; at least one from Domain or Task Type.
- [ ] Status is one of the 6 defined values.
- [ ] Reason is present and non-empty for all statuses except PENDING.
- [ ] Revision field is filled if status is `PARTIAL` or `REVISED`; `N/A` otherwise.

## Content Format

- [ ] Prompt is inside a fenced ` ```prompt ``` ` block.
- [ ] Text/code output is inside an appropriate fenced block.
- [ ] File output is a bullet list with `filename — description` format.
- [ ] All content is in English (translated from source language if needed).
- [ ] No raw Vietnamese or other non-English text in any field.

## Statistics Block

- [ ] Total Interactions count is updated.
- [ ] Status Breakdown counts and percentages are recalculated.
- [ ] Tag Breakdown is updated with any new tags from this entry.
- [ ] Quality Metrics (Acceptance Rate, Revision Rate, Failure Rate) are recalculated.
- [ ] `Last updated` timestamp is refreshed.
- [ ] Models Used list reflects any new model added.

## File Integrity

- [ ] New entry is appended at the **bottom** of the file.
- [ ] Statistics block remains at the **top** of the file.
- [ ] Entry IDs have no gaps or duplicates within the month.
