---
title: Account — reference
---

# Account

Generated from Malapos's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/account/abandoned-cart` | [List abandoned cart](#list-abandoned-cart) |
| `PATCH` | `/api/v1/account/abandoned-cart` | [Update abandoned cart](#update-abandoned-cart) |
| `GET` | `/api/v1/account/abandoned-cart/reminders` | [List reminders](#list-reminders) |
| `GET` | `/api/v1/account/abandoned-cart/stats` | [List stats](#list-stats) |
| `GET` | `/api/v1/account/blog/posts` | [List posts](#list-posts) |
| `POST` | `/api/v1/account/blog/posts` | [Create a post](#create-a-post) |
| `DELETE` | `/api/v1/account/blog/posts/{id}` | [Delete a post](#delete-a-post) |
| `GET` | `/api/v1/account/blog/posts/{id}` | [Get a post](#get-a-post) |
| `PATCH` | `/api/v1/account/blog/posts/{id}` | [Update a post](#update-a-post) |
| `POST` | `/api/v1/account/blog/posts/{id}/publish` | [Publish a post](#publish-a-post) |
| `POST` | `/api/v1/account/blog/posts/{id}/unpublish` | [Unpublish a post](#unpublish-a-post) |
| `GET` | `/api/v1/account/feeds` | [List feeds](#list-feeds) |
| `PATCH` | `/api/v1/account/feeds` | [Update feeds](#update-feeds) |
| `GET` | `/api/v1/account/feeds/preview` | [List preview](#list-preview) |
| `GET` | `/api/v1/account/marketing-media/avatar` | [Resolve the creator's signed S3 avatar URL via Ripllo's public uploads endpoint, then stream the bytes.](#resolve-the-creators-signed-s3-avatar-url-via-ripllos-public-uploads-endpoint-then-stream-the-bytes) |
| `GET` | `/api/v1/account/pixels` | [List pixels](#list-pixels) |
| `PATCH` | `/api/v1/account/pixels` | [Update pixels](#update-pixels) |
| `GET` | `/api/v1/account/referrals` | [List referrals](#list-referrals) |
| `PUT` | `/api/v1/account/referrals` | [Set referrals](#set-referrals) |
| `GET` | `/api/v1/account/referrals/attributions` | [List attributions](#list-attributions) |
| `GET` | `/api/v1/account/referrals/links` | [List links](#list-links) |
| `GET` | `/api/v1/account/referrals/stats` | [List stats](#list-stats-2) |

## List abandoned cart

```
GET /api/v1/account/abandoned-cart
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/abandoned-cart" \
  -H "Authorization: Bearer sk_live_…"
```

## Update abandoned cart

```
PATCH /api/v1/account/abandoned-cart
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `enabled` | boolean | no |  |
| `delayHours` | integer | no | min 1; max 168 |
| `emailSubject` | string | no | min length 1; max length 200 |
| `emailPreview` | string | no | min length 1; max length 200 |
| `discountCodeId` | string | no | may be null |
| `marketingCampaignId` | string | no | may be null |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/account/abandoned-cart" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false,"delayHours":1,"emailSubject":"…","emailPreview":"…","discountCodeId":"…","marketingCampaignId":"…"}'
```

## List reminders

```
GET /api/v1/account/abandoned-cart/reminders
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/abandoned-cart/reminders" \
  -H "Authorization: Bearer sk_live_…"
```

## List stats

```
GET /api/v1/account/abandoned-cart/stats
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `windowDays` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/abandoned-cart/stats" \
  -H "Authorization: Bearer sk_live_…"
```

## List posts

```
GET /api/v1/account/blog/posts
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `status` | `draft` or `published` | no |  |
| `limit` | integer | no | min 1; max 200 |
| `cursor` | string | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/blog/posts" \
  -H "Authorization: Bearer sk_live_…"
```

## Create a post

```
POST /api/v1/account/blog/posts
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | min length 1; max length 200 |
| `slug` | string | no | max length 160 |
| `excerpt` | string | no | max length 500; may be null |
| `body` | string | yes | min length 1; max length 200000 |
| `coverImage` | string (uri) | no | max length 1000; may be null |
| `status` | `draft` or `published` | no |  |
| `publishedAt` | string (date-time) | no | may be null |
| `authorName` | string | no | max length 100; may be null |
| `tags` | array of string | no |  |
| `metaTitle` | string | no | max length 200; may be null |
| `metaDescription` | string | no | max length 500; may be null |
| `marketingCampaignId` | string | no | may be null |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/account/blog/posts" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"title":"…","slug":"…","excerpt":"…","body":"…","coverImage":"…","status":"draft","publishedAt":"2026-01-01T00:00:00Z","authorName":"…","tags":[],"metaTitle":"…","metaDescription":"…","marketingCampaignId":"…"}'
```

## Delete a post

```
DELETE /api/v1/account/blog/posts/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://malapos.com/api/v1/account/blog/posts/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Get a post

```
GET /api/v1/account/blog/posts/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/blog/posts/:id" \
  -H "Authorization: Bearer sk_live_…"
```

## Update a post

```
PATCH /api/v1/account/blog/posts/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | min length 1; max length 200 |
| `slug` | string | no | max length 160 |
| `excerpt` | string | no | max length 500; may be null |
| `body` | string | no | min length 1; max length 200000 |
| `coverImage` | string (uri) | no | max length 1000; may be null |
| `status` | `draft` or `published` | no |  |
| `publishedAt` | string (date-time) | no | may be null |
| `authorName` | string | no | max length 100; may be null |
| `tags` | array of string | no |  |
| `metaTitle` | string | no | max length 200; may be null |
| `metaDescription` | string | no | max length 500; may be null |
| `marketingCampaignId` | string | no | may be null |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/account/blog/posts/:id" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"title":"…","slug":"…","excerpt":"…","body":"…","coverImage":"…","status":"draft","publishedAt":"2026-01-01T00:00:00Z","authorName":"…","tags":[],"metaTitle":"…","metaDescription":"…","marketingCampaignId":"…"}'
```

## Publish a post

```
POST /api/v1/account/blog/posts/{id}/publish
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/account/blog/posts/:id/publish" \
  -H "Authorization: Bearer sk_live_…"
```

## Unpublish a post

```
POST /api/v1/account/blog/posts/{id}/unpublish
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://malapos.com/api/v1/account/blog/posts/:id/unpublish" \
  -H "Authorization: Bearer sk_live_…"
```

## List feeds

```
GET /api/v1/account/feeds
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/feeds" \
  -H "Authorization: Bearer sk_live_…"
```

## Update feeds

```
PATCH /api/v1/account/feeds
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `enabled` | boolean | no |  |
| `defaultGoogleProductCategory` | string | no | max length 500; may be null |
| `includeUnpublished` | boolean | no |  |
| `marketingCampaignId` | string | no | may be null |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/account/feeds" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false,"defaultGoogleProductCategory":"…","includeUnpublished":false,"marketingCampaignId":"…"}'
```

## List preview

```
GET /api/v1/account/feeds/preview
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `format` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/feeds/preview" \
  -H "Authorization: Bearer sk_live_…"
```

## Resolve the creator's signed S3 avatar URL via Ripllo's public uploads endpoint, then stream the bytes.

```
GET /api/v1/account/marketing-media/avatar
```

GET /avatar?key=creators/… — resolve the creator's signed S3 avatar
 URL via Ripllo's public uploads endpoint, then stream the bytes.

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `key` | any | no |  |

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/marketing-media/avatar" \
  -H "Authorization: Bearer sk_live_…"
```

## List pixels

```
GET /api/v1/account/pixels
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/pixels" \
  -H "Authorization: Bearer sk_live_…"
```

## Update pixels

```
PATCH /api/v1/account/pixels
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `metaPixelId` | string | no | max length 64; may be null |
| `metaCapiAccessToken` | string | no | max length 500; may be null |
| `metaTestEventCode` | string | no | max length 64; may be null |
| `googleAnalyticsId` | string | no | max length 64; may be null |
| `googleAdsConversionId` | string | no | max length 64; may be null |
| `googleAdsPurchaseLabel` | string | no | max length 64; may be null |
| `tiktokPixelId` | string | no | max length 64; may be null |
| `enabled` | boolean | no |  |

### Example

```bash
curl -X PATCH "https://malapos.com/api/v1/account/pixels" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"metaPixelId":"…","metaCapiAccessToken":"…","metaTestEventCode":"…","googleAnalyticsId":"…","googleAdsConversionId":"…","googleAdsPurchaseLabel":"…","tiktokPixelId":"…","enabled":false}'
```

## List referrals

```
GET /api/v1/account/referrals
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/referrals" \
  -H "Authorization: Bearer sk_live_…"
```

## Set referrals

```
PUT /api/v1/account/referrals
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `enabled` | boolean | no |  |
| `rewardType` | `percent` or `fixed` or `shipping_percent` or `shipping_fixed` | yes |  |
| `referrerValue` | integer | yes | above 0 |
| `refereeValue` | integer | yes | above 0 |
| `currency` | string | yes | min length 1; max length 8 |
| `minPurchaseAmount` | integer | no | min 0; may be null |
| `rewardExpiryDays` | integer | no | min 1; max 365 |
| `attributionWindowDays` | integer | no | min 1; max 180 |
| `maxRewardsPerReferrer` | integer | no | above 0; may be null |
| `programTerms` | string | no | max length 10000; may be null |
| `marketingCampaignId` | string | no | may be null |

### Example

```bash
curl -X PUT "https://malapos.com/api/v1/account/referrals" \
  -H "Authorization: Bearer sk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false,"rewardType":"percent","referrerValue":0,"refereeValue":0,"currency":"…","minPurchaseAmount":0,"rewardExpiryDays":1,"attributionWindowDays":1,"maxRewardsPerReferrer":0,"programTerms":"…","marketingCampaignId":"…"}'
```

## List attributions

```
GET /api/v1/account/referrals/attributions
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/referrals/attributions" \
  -H "Authorization: Bearer sk_live_…"
```

## List links

```
GET /api/v1/account/referrals/links
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/referrals/links" \
  -H "Authorization: Bearer sk_live_…"
```

## List stats

```
GET /api/v1/account/referrals/stats
```

### Example

```bash
curl -X GET "https://malapos.com/api/v1/account/referrals/stats" \
  -H "Authorization: Bearer sk_live_…"
```
