---
title: Outlets — reference
---

# Outlets

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/outlets` | [List outlets](#list-outlets) |
| `POST` | `/api/v1/outlets` | [Create an outlet](#create-an-outlet) |
| `DELETE` | `/api/v1/outlets/{id}` | [Delete an outlet](#delete-an-outlet) |
| `GET` | `/api/v1/outlets/{id}` | [Get an outlet](#get-an-outlet) |
| `PATCH` | `/api/v1/outlets/{id}` | [Update an outlet](#update-an-outlet) |

## List outlets

```
GET /api/v1/outlets
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/outlets" \
  -H "Authorization: Bearer sk_live_…"
```

## Create an outlet

```
POST /api/v1/outlets
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 120 |
| `address` | string | no | max length 500; may be null |
| `phone` | string | no | max length 40; may be null |
| `timezone` | string | no | default `"Asia/Jakarta"`; max length 64 |
| `taxRateBps` | integer | no | default `0`; min 0; max 10000 |
| `taxInclusive` | boolean | no | default `false` |
| `receiptHeader` | string | no | max length 500; may be null |
| `receiptFooter` | string | no | max length 500; may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/outlets" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","address":"…","phone":"…","timezone":"Asia/Jakarta","taxRateBps":0,"taxInclusive":false,"receiptHeader":"…","receiptFooter":"…"}'
```

## Delete an outlet

```
DELETE /api/v1/outlets/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/outlets/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Get an outlet

```
GET /api/v1/outlets/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/outlets/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update an outlet

```
PATCH /api/v1/outlets/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 120 |
| `address` | string | no | max length 500; may be null |
| `phone` | string | no | max length 40; may be null |
| `timezone` | string | no | default `"Asia/Jakarta"`; max length 64 |
| `taxRateBps` | integer | no | default `0`; min 0; max 10000 |
| `taxInclusive` | boolean | no | default `false` |
| `receiptHeader` | string | no | max length 500; may be null |
| `receiptFooter` | string | no | max length 500; may be null |
| `isActive` | boolean | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/outlets/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","address":"…","phone":"…","timezone":"Asia/Jakarta","taxRateBps":0,"taxInclusive":false,"receiptHeader":"…","receiptFooter":"…","isActive":false}'
```
