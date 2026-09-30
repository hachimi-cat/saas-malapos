---
title: Uploads — reference
---

# Uploads

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/v1/uploads/sign` | [Create a sign](#create-a-sign) |

## Create a sign

```
POST /api/v1/uploads/sign
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `contentType` | string | yes | min length 1 |
| `ext` | string | no | max length 8 |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/uploads/sign" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"contentType":"…","ext":"…"}'
```
