# Status Definitions

## Status Reference

| Emoji | Status     | Meaning                                           | When to Use                                                                     |
| ----- | ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| ✅    | VALID      | Output correct, used as-is                        | No edits needed; output went directly into use                                  |
| ⚠️    | PARTIAL    | Partially correct; minor fixes applied            | Core logic correct but missing edge cases, incomplete sections, or small errors |
| 🔄    | REVISED    | Output sufficient but required significant rework | Structure or approach was right, but content needed major edits before use      |
| ❌    | INVALID    | Incorrect or hallucinated; not used               | Wrong approach, fabricated facts, or output was discarded entirely              |
| 🔲    | INCOMPLETE | AI did not finish the task                        | Response was cut off, context limit hit, or AI stopped mid-task                 |
| ⏳    | PENDING    | Not yet evaluated                                 | Logged immediately after generation; evaluation deferred                        |

## Decision Guide

```
Was the output used without any changes?
  └─ Yes → VALID

Was the output used with small fixes (typos, one missing case, minor wording)?
  └─ Yes → PARTIAL

Was the output used but required significant rework (restructured, logic rewritten)?
  └─ Yes → REVISED

Was the output discarded entirely?
  ├─ AI stopped mid-way / was cut off → INCOMPLETE
  └─ Output was wrong / hallucinated → INVALID

Not sure yet?
  └─ PENDING
```

## Notes

- `PARTIAL` vs `REVISED`: The distinction is **effort**. `PARTIAL` = a few minutes of touch-up. `REVISED` = meaningful time spent rewriting before the output was usable.
- `INVALID` should include a clear **Reason** explaining what was wrong (hallucination, wrong framework, misunderstood requirement, etc.).
- `PENDING` entries should be resolved and updated at the next audit session.
- A high **REVISED** rate may indicate prompts need more context or constraints.
- A high **INVALID** rate may indicate the model is poorly suited for this task type.
