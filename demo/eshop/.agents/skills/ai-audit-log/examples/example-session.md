# Example Session Walkthrough

> **Three examples:** single interaction, multi-interaction (`--last=3`), and custom file path (`--file`).

## Example A: `/ai-audit-log` (default, `--last=1`)

### Step 1 — Human invokes the skill

```
/ai-audit-log
```

### Step 2 — AI resolves fullname, then detects interactions

Since no fullname is found in context, AI asks first:

```
What is your full name? (Used for the log filename)
```

**Human answers:** `Tấn Phát`

**AI normalizes:** `tan-phat` → **Output file:** `docs/audit/ai/tan-phat-2026-07.log.md`

```
I detected 1 interaction to log:

  #1 — "Write a Python function to validate JWT tokens and check expiry"
       Output type: code

Please fill in the evaluation form below and paste it back.

─── Interaction 1 ───
Prompt excerpt: "Write a Python function to validate JWT tokens and check expiry"
Output type: code

Tags (pick 1–3):
  Domain:  backend · frontend · mobile · data · devops · infra · security · performance · design
  Task:    code-gen · refactor · debugging · testing · planning · review · documentation · analysis · research · prompt-engineering
  Output:  file-output · script · query · config · diagram · report
>

Status:
  ✅ VALID       — Output correct, used as-is
  ⚠️ PARTIAL     — Partially correct, minor fixes needed
  🔄 REVISED     — Output sufficient but required significant edits before use
  ❌ INVALID     — Incorrect, not used
  🔲 INCOMPLETE  — AI did not finish the task (cut off, timeout, etc.)
  ⏳ PENDING     — Not yet evaluated
>

Reason (why this status?):
>

Revision (what did you change? Leave blank if VALID/INVALID/INCOMPLETE/PENDING):
>
```

### Step 3 — Human fills in the form and pastes back

Human answers in Vietnamese (will be auto-translated):

```
─── Interaction 1 ───
Prompt excerpt: "Write a Python function to validate JWT tokens and check expiry"
Output type: code

Tags (pick 1–3):
> backend, security, code-gen

Status:
> PARTIAL

Reason (why this status?):
> Hàm thiếu xử lý trường hợp token bị malformed, chỉ handle expired token

Revision (what did you change?):
> Thêm try/except để bắt jwt.DecodeError và chuẩn hóa error message
```

### Step 4 — AI writes the log entry

AI translates and generates:

````markdown
## [AI-AUDIT-001] 2026-07-04T14:32:00+07:00

### Metadata

- **Model:** claude-sonnet-4-6
- **Tags:** `backend` · `security` · `code-gen`
- **Status:** ⚠️ PARTIAL

### Prompt

```prompt
Write a Python function to validate JWT tokens and check expiry
```

### Output

```python
import jwt
from datetime import datetime

def validate_jwt(token: str, secret: str) -> dict:
    payload = jwt.decode(token, secret, algorithms=["HS256"])
    if payload["exp"] < datetime.utcnow().timestamp():
        raise ValueError("Token has expired")
    return payload
```

### Evaluation

| Field    | Detail                                                                                |
| -------- | ------------------------------------------------------------------------------------- |
| Status   | ⚠️ PARTIAL                                                                            |
| Reason   | Function only handles expired tokens; missing handling for malformed token format     |
| Revised  | Yes                                                                                   |
| Revision | Added try/except block to catch `jwt.DecodeError` and normalized error message format |
````

## Example B: `/ai-audit-log --last=3`

### Step 1 — Human invokes with `--last=3`

```
/ai-audit-log --last=3
```

### Step 2 — AI detects 3 interactions

```
I detected 3 interactions to log:

  #1 — "Generate an ERD for the e-commerce schema with users, orders, products"
       Output type: file(s)
  #2 — "Write unit tests for the UserService class"
       Output type: code
  #3 — "Explain the difference between optimistic and pessimistic locking"
       Output type: text

Please fill in the evaluation form below for each interaction, then paste it all back at once.

─── Interaction 1 ───
Prompt excerpt: "Generate an ERD for the e-commerce schema with users, orders, products"
Output type: file(s)

Tags (pick 1–3):
  Domain:  backend · frontend · mobile · data · devops · infra · security · performance · design
  Task:    code-gen · refactor · debugging · testing · planning · review · documentation · analysis · research · prompt-engineering
  Output:  file-output · script · query · config · diagram · report
>

Status:
  ✅ VALID       — Output correct, used as-is
  ⚠️ PARTIAL     — Partially correct, minor fixes needed
  🔄 REVISED     — Output sufficient but required significant edits before use
  ❌ INVALID     — Incorrect, not used
  🔲 INCOMPLETE  — AI did not finish the task (cut off, timeout, etc.)
  ⏳ PENDING     — Not yet evaluated
>

Reason (why this status?):
>

Revision (what did you change? Leave blank if VALID/INVALID/INCOMPLETE/PENDING):
>

─── Interaction 2 ───
Prompt excerpt: "Write unit tests for the UserService class"
Output type: code

Tags: >
Status: >
Reason: >
Revision: >

─── Interaction 3 ───
Prompt excerpt: "Explain the difference between optimistic and pessimistic locking"
Output type: text

Tags: >
Status: >
Reason: >
Revision: >
```

### Step 3 — Human fills all 3 sections and pastes back

```
─── Interaction 1 ───
Tags: > data, diagram, file-output
Status: > VALID
Reason: > ERD was accurate and complete, used directly in Confluence
Revision: >

─── Interaction 2 ───
Tags: > backend, testing
Status: > REVISED
Reason: > Tests were generated but used wrong mocking library (mockito vs pytest-mock)
Revision: > Rewrote all mock setup using pytest-mock fixtures; adjusted assertion style

─── Interaction 3 ───
Tags: > backend, quick-question
Status: > VALID
Reason: > Clear explanation, shared with team as reference
Revision: >
```

### Step 4 — AI writes 3 entries and updates statistics

AI appends entries `[AI-AUDIT-002]`, `[AI-AUDIT-003]`, `[AI-AUDIT-004]` to the log file, then updates the Statistics Block at the top:

```markdown
- **Total Interactions:** 4
- **Models Used:** claude-sonnet-4-6 (4)

### Status Breakdown

| Status     | Count | %   |
| ---------- | ----- | --- |
| ✅ VALID   | 3     | 75% |
| ⚠️ PARTIAL | 1     | 25% |
| 🔄 REVISED | 0     | 0%  |

...

### Quality Metrics

- **Acceptance Rate:** 100%
- **Revision Rate:** 0%
- **Failure Rate:** 0%
```

## Example C: `/ai-audit-log --file="path/to/output.md"` (custom file path)

### Step 1 — Human invokes with --file flag

```
/ai-audit-log --file="reports/ai/july-review.md"
```

### Step 2 — AI uses the specified path directly

```
Output path set to: reports/ai/july-review.md

I detected 1 interaction to log:
  #1 — "Refactor the payment service to use the repository pattern"
       Output type: code

Please fill in the evaluation form below and paste it back.

─── Interaction 1 ───
Prompt excerpt: "Refactor the payment service to use the repository pattern"
Output type: code

Tags (pick 1–3):
  Domain:  backend · frontend · mobile · data · devops · infra · security · performance · design
  Task:    code-gen · refactor · debugging · testing · planning · review · documentation · analysis · research · prompt-engineering
  Output:  file-output · script · query · config · diagram · report
>

Status:
  ✅ VALID       — Output correct, used as-is
  ⚠️ PARTIAL     — Partially correct, minor fixes needed
  🔄 REVISED     — Output sufficient but required significant edits before use
  ❌ INVALID     — Incorrect, not used
  🔲 INCOMPLETE  — AI did not finish the task (cut off, timeout, etc.)
  ⏳ PENDING     — Not yet evaluated
>

Reason (why this status?):
>

Revision (what did you change? Leave blank if VALID/INVALID/INCOMPLETE/PENDING):
>
```

Human fills in the form and pastes back, then AI writes the log entry to `reports/ai/july-review.md`, creating intermediate directories if they do not exist.

## Edge Case: `--last=7` (exceeds limit)

```
Human: /ai-audit-log --last=7

AI: "--last=7 exceeds the maximum of 5. Running with --last=5 instead."
    [proceeds with last 5 interactions]
```
