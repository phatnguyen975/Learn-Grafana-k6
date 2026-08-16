# Tag Taxonomy

Select **1–3 tags** per interaction. Choose the most specific tags available. At least one tag should be from **Domain** or **Task Type**.

## Domain Tags

| Tag           | Use When                                             |
| ------------- | ---------------------------------------------------- |
| `backend`     | Server-side logic, APIs, databases, services         |
| `frontend`    | UI components, web pages, CSS, browser logic         |
| `mobile`      | iOS, Android, React Native, Flutter                  |
| `data`        | Data pipelines, analytics, SQL, ETL, ML/AI datasets  |
| `devops`      | CI/CD, deployment, containers, orchestration         |
| `infra`       | Cloud resources, networking, IaC (Terraform, Pulumi) |
| `security`    | Auth, encryption, vulnerability review, secrets      |
| `performance` | Profiling, optimizing speed, memory, resource usage  |
| `design`      | UI/UX design, wireframes, design systems             |

## Task Type Tags

| Tag                  | Use When                                                    |
| -------------------- | ----------------------------------------------------------- |
| `code-gen`           | Generating new code from a description or spec              |
| `refactor`           | Improving existing code structure without changing behavior |
| `debugging`          | Finding or fixing bugs in existing code                     |
| `testing`            | Writing unit tests, integration tests, test plans           |
| `review`             | Code review, PR feedback, architecture review               |
| `documentation`      | Writing docs, README, API specs, comments                   |
| `analysis`           | Investigating code, logs, data, or architecture             |
| `planning`           | Breaking down tasks, sprint planning, roadmap               |
| `research`           | Comparing technologies, summarizing papers, benchmarks      |
| `prompt-engineering` | Designing, testing, or optimizing prompts for AI            |

## Output Type Tags

| Tag           | Use When                                                      |
| ------------- | ------------------------------------------------------------- |
| `file-output` | AI produced one or more files as output                       |
| `script`      | Output was a standalone runnable script                       |
| `query`       | Output was a database or search query                         |
| `config`      | Output was a configuration file (YAML, JSON, TOML, etc.)      |
| `diagram`     | Output was a diagram, ERD, flowchart, or architecture drawing |
| `report`      | Output was a structured document or written report            |

## Misc Tags

| Tag              | Use When                                                     |
| ---------------- | ------------------------------------------------------------ |
| `quick-question` | Short factual or conceptual question, no significant output  |
| `multi-turn`     | This interaction was part of a longer back-and-forth session |

## Tagging Examples

| Interaction                                        | Tags                               |
| -------------------------------------------------- | ---------------------------------- |
| "Generate a JWT auth middleware in Express"        | `backend` · `code-gen`             |
| "Write unit tests for my UserService class"        | `backend` · `testing`              |
| "Review this Terraform module for security issues" | `infra` · `security` · `review`    |
| "Create an ERD for the e-commerce schema"          | `data` · `diagram` · `file-output` |
| "Explain the difference between TCP and UDP"       | `quick-question`                   |
| "Refactor this React component to use hooks"       | `frontend` · `refactor`            |
