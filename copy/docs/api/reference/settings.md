---
title: Settings — reference
---

# Settings

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/settings` | [List settings](#list-settings) |
| `PUT` | `/api/v1/settings` | [Set settings](#set-settings) |

## List settings

```
GET /api/v1/settings
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/settings" \
  -H "Authorization: Bearer sk_live_…"
```

## Set settings

```
PUT /api/v1/settings
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `businessName` | string | no | max length 120; may be null |
| `businessType` | `RETAIL` or `FNB` or `PHARMACY` or `GENERAL` | no |  |
| `currency` | string | no | min length 1; max length 8 |
| `transferBankName` | string | no | max length 120; may be null |
| `transferBankAccountNumber` | string | no | max length 60; may be null |
| `transferBankAccountHolder` | string | no | max length 120; may be null |

### Example

```bash
curl -X PUT "https://malapos.com/api/v1/settings" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"businessName":"…","businessType":"RETAIL","currency":"…","transferBankName":"…","transferBankAccountNumber":"…","transferBankAccountHolder":"…"}'
```
