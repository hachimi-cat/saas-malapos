---
title: Events — reference
---

# Events

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/events/stream` | [List stream](#list-stream) |

## List stream

```
GET /api/v1/events/stream
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `outletId` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/events/stream" \
  -H "Authorization: Bearer sk_live_…"
```
