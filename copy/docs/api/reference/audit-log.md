---
title: Audit log — reference
---

# Audit log

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/audit-log` | [List audit log](#list-audit-log) |

## List audit log

```
GET /api/v1/audit-log
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `type` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/audit-log" \
  -H "Authorization: Bearer sk_live_…"
```
