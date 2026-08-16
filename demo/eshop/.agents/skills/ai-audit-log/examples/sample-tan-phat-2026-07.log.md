# AI Audit Log — July 2026

> **Last updated:** 2026-07-04T16:45:00+07:00

## Monthly Statistics

- **Period:** 2026-07-01 → 2026-07-04
- **Total Interactions:** 4
- **Models Used:** claude-sonnet-4-6 (4)

### Status Breakdown

| Status        | Count | %   |
| ------------- | ----- | --- |
| ✅ VALID      | 2     | 50% |
| ⚠️ PARTIAL    | 1     | 25% |
| 🔄 REVISED    | 1     | 25% |
| ❌ INVALID    | 0     | 0%  |
| 🔲 INCOMPLETE | 0     | 0%  |
| ⏳ PENDING    | 0     | 0%  |
| **Total**     | **4** |     |

### Tag Breakdown

| Tag              | Count |
| ---------------- | ----- |
| `backend`        | 3     |
| `code-gen`       | 2     |
| `testing`        | 1     |
| `security`       | 1     |
| `data`           | 1     |
| `diagram`        | 1     |
| `file-output`    | 1     |
| `quick-question` | 1     |

### Quality Metrics

- **Acceptance Rate** (VALID + PARTIAL / Total): 75%
- **Revision Rate** (REVISED / Total): 25%
- **Failure Rate** (INVALID + INCOMPLETE / Total): 0%

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

## [AI-AUDIT-002] 2026-07-04T15:10:00+07:00

### Metadata

- **Model:** claude-sonnet-4-6
- **Tags:** `data` · `diagram` · `file-output`
- **Status:** ✅ VALID

### Prompt

```prompt
Generate an ERD for the e-commerce schema with users, orders, products, and order_items tables. Include primary keys, foreign keys, and cardinality.
```

### Output

- `erd-ecommerce.mermaid` — Mermaid ERD diagram with 4 tables, all PKs/FKs, and one-to-many relationships between users→orders, orders→order_items, products→order_items
- `erd-ecommerce.png` — Rendered PNG export of the ERD, 1200×800px

### Evaluation

| Field    | Detail                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Status   | ✅ VALID                                                                 |
| Reason   | ERD was accurate and complete; used directly in Confluence documentation |
| Revised  | No                                                                       |
| Revision | N/A                                                                      |

## [AI-AUDIT-003] 2026-07-04T15:47:00+07:00

### Metadata

- **Model:** claude-sonnet-4-6
- **Tags:** `backend` · `testing`
- **Status:** 🔄 REVISED

### Prompt

```prompt
Write unit tests for the UserService class. It has methods: createUser(dto), findById(id), updateUser(id, dto), deleteUser(id). Use pytest.
```

### Output

```python
import pytest
from unittest.mock import MagicMock, patch
from services.user_service import UserService
from schemas.user import UserCreateDTO

@pytest.fixture
def user_service():
    repo = MagicMock()
    return UserService(repo)

def test_create_user(user_service):
    dto = UserCreateDTO(name="Alice", email="alice@example.com")
    user_service.createUser(dto)
    user_service.repo.save.assert_called_once_with(dto)

def test_find_by_id_not_found(user_service):
    user_service.repo.find.return_value = None
    result = user_service.findById(999)
    assert result is None
```

### Evaluation

| Field    | Detail                                                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status   | 🔄 REVISED                                                                                                                                                                        |
| Reason   | Tests were generated using `unittest.mock` but the project uses `pytest-mock`; fixture and assertion patterns were inconsistent with the codebase style                           |
| Revised  | Yes                                                                                                                                                                               |
| Revision | Rewrote all mock setup using `pytest-mock` fixtures (`mocker`); adjusted assertion style to match project conventions; added missing test cases for `updateUser` and `deleteUser` |

## [AI-AUDIT-004] 2026-07-04T16:20:00+07:00

### Metadata

- **Model:** claude-sonnet-4-6
- **Tags:** `backend` · `quick-question`
- **Status:** ✅ VALID

### Prompt

```prompt
Explain the difference between optimistic locking and pessimistic locking in databases. When should I use each?
```

### Output

```markdown
**Optimistic Locking** assumes conflicts are rare. It reads data without locking, then checks at write time whether the data was modified (usually via a version field or timestamp). If a conflict is detected, the operation is retried or rejected. Best for: read-heavy workloads, low-contention scenarios.

**Pessimistic Locking** locks the data immediately on read, preventing other transactions from modifying it until the lock is released (SELECT FOR UPDATE). Best for: write-heavy workloads, high-contention scenarios, financial transactions.

Use optimistic when conflicts are unlikely and retry cost is low. Use pessimistic when data integrity is critical and you cannot afford conflicts.
```

### Evaluation

| Field    | Detail                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Status   | ✅ VALID                                                                                                         |
| Reason   | Clear, accurate explanation covering both concepts and decision criteria; shared with team as reference material |
| Revised  | No                                                                                                               |
| Revision | N/A                                                                                                              |
