<div align="center">
  <h1>AI Audit Log Skill</h1>
  <small>
    <strong>Author:</strong> Nguyễn Tấn Phát
  </small> <br />
  <sub>July 06, 2026</sub>
</div>

AI Audit Log is a prompt-based skill that standardizes and logs interactions between developers and AI during project development. This skill automatically extracts context, prompts users to evaluate response quality, and synthesizes structured monthly log files (`docs/audit/ai/<fullname>-YYYY-MM.log.md`) with detailed statistics.

It is an ideal solution for enterprises that need quality assurance (QA), AI model performance tracking, and a clear audit trail of AI usage in their codebase.

## ✨ Core Features

- **Automated Context Detection:** AI automatically reads the conversation history to extract the _Prompt_, _Model_, _Timestamp_, and _Output_ (inline code/text, or file summaries).
- **Structured Evaluation Form:** Provides a standardized form for users to evaluate AI responses via a Status system and Tagging taxonomy (Domain, Task type, Output type).
- **Monthly Log Management:** Automatically creates and updates Markdown log files separated by month. New entries are sequentially numbered (e.g., `[AI-AUDIT-001]`) and appended to the bottom of the file.
- **Statistical Reports:** Continuously maintains and updates an Acceptance Rate, Revision Rate, and status/tag distribution table at the top of each log file.
- **Multi-language Input, Standardized Output:** Supports user evaluations in any language. The AI will automatically translate and log everything in English to ensure professionalism and consistency.
- **Custom Output Paths:** Offers flexibility to bypass the default naming convention and save logs directly to a custom file path using the `--file` flag.

## 🚀 Installation

1. **Clone the repository:**

```bash
git clone git@github.com:phatnguyen975/ai-audit-log.git
```

2. **Integrate into your project:** Copy the entire `ai-audit-log/` into the `skills/` directory of your project.

## 💡 Invocation & Syntax

You can trigger this skill at any time during your conversation with the AI using the following syntax:

```bash
/ai-audit-log                                      # log last 1 interaction, save to default path
/ai-audit-log --last=N                             # log last N interactions, save to default path (N: 1–5)
/ai-audit-log --file="path/to/output.md"           # log last 1 interaction, save to custom file path
/ai-audit-log --last=N --file="path/to/output.md"  # log last N interactions, save to custom file path (N: 1–5)
```

> [!NOTE]
> The maximum number of interactions (`N`) that can be logged at once is 5. If a number greater than 5 is provided, the AI will cap it at 5 and notify you.

## 🔄 Interaction Flow

1. **Invoke:** Type `/ai-audit-log` with your desired flags in the chat.
2. **Fullname Resolution:** If your name isn't already in the conversation context, the AI will ask: _"What is your full name? (Used for the log filename)"_. The name is always normalized (lowercase, diacritics removed, spaces replaced with hyphens) to formulate the log file name.
3. **AI Analysis:** The AI scans recent interactions and displays a numbered summary of the detected tasks, followed by a structured Evaluation Form for each.
4. **User Evaluation:** Copy the provided form, fill in your assessment (Tags, Status, Reason, Revision), and paste it back into the chat. _You can fill this out in your native language; the AI will translate it to English before writing._
5. **Logging:** The AI processes your form, creates or updates the log file, appends the new entry, and recalculates the Quality Metrics at the top of the file.

## 📊 Evaluation System

When filling out the evaluation form, you will classify interactions using Statuses and Tags.

### Status Definitions

- ✅ **VALID:** Output correct, used as-is.
- ⚠️ **PARTIAL:** Partially correct; minor fixes applied (e.g., typos, missing edge cases).
- 🔄 **REVISED:** Output sufficient but required significant rework before use.
- ❌ **INVALID:** Incorrect, hallucinated, or not used.
- 🔲 **INCOMPLETE:** AI did not finish the task (cut off, timeout, etc.).
- ⏳ **PENDING:** Not yet evaluated.

### Tag Taxonomy

Select 1–3 tags per interaction. At least one tag must be from the **Domain** or **Task Type** categories.

- **Domain:** `backend`, `frontend`, `mobile`, `data`, `devops`, `infra`, `security`, `performance`, `design`.
- **Task Type:** `code-gen`, `refactor`, `debugging`, `testing`, `review`, `documentation`, `analysis`, `planning`, `research`, `prompt-engineering`.
- **Output Type:** `file-output`, `script`, `query`, `config`, `diagram`, `report`.
- **Misc:** `quick-question`, `multi-turn`.

## 📁 Log File Structure

Unless the `--file` flag is specified, logs are automatically routed to `docs/audit/ai/<fullname>-YYYY-MM.log.md`. The file is structured into two main parts:

1. **Statistics Block (Top):** Tracks the period, Total Interactions, Models Used, Status Breakdown, Tag Breakdown, and Quality Metrics (Acceptance Rate, Revision Rate, Failure Rate). This section is updated on every write.
2. **Log Entries (Bottom):** Chronological entries containing Metadata, the original Prompt, the AI Output (fenced or bulleted), and the final Evaluation details.
