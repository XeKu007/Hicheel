# API Documentation

Base URL: `/api`

All endpoints require authentication via Stack Auth session cookie.

---

## Products

### GET /api/products
Get paginated product list for the authenticated user's organization.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| q | string | "" | Search by name |
| page | number | 1 | Page number |

**Response 200:**
```json
{
  "items": [
    {
      "id": "cuid",
      "name": "Wireless Keyboard",
      "sku": "WK-001",
      "price": 25000,
      "quantity": 10,
      "lowStockAt": 3,
      "imageUrl": "https://..."
    }
  ],
  "totalCount": 42,
  "totalPages": 5
}
```

**Rate limit:** 100 req/min per IP

---

### PATCH /api/products/:id
Update a product or adjust quantity.

**Request Body (update):**
```json
{
  "name": "New Name",
  "price": 30000,
  "quantity": 15,
  "sku": "WK-002",
  "lowStockAt": 5
}
```

**Request Body (adjust quantity):**
```json
{
  "delta": 1   // or -1
}
```

**Response 200:**
```json
{
  "id": "cuid",
  "name": "New Name",
  "price": 30000,
  "quantity": 15,
  "sku": "WK-002",
  "lowStockAt": 5,
  "imageUrl": null
}
```

**Errors:**
- `400` Invalid input
- `404` Product not found or not in your org
- `429` Rate limited

---

### DELETE /api/products/:id
Delete a product from the organization.

**Response 200:**
```json
{ "success": true }
```

---

## Inventory Events (SSE)

### GET /api/inventory-events
Server-Sent Events stream for real-time inventory updates.

**Event Types:**
```
data: {"type":"connected"}

data: {"type":"product_updated","product":{"id":"...","quantity":5,...}}

data: {"type":"product_deleted","id":"..."}

: ping
```

**Notes:**
- Connection auto-closes after 25 seconds (reconnects automatically)
- Org-scoped: only receives events for your organization

---

## Alerts

### GET /api/alerts *(via Server Action)*
Returns paginated alerts. Called via `getAlerts(page)`.

**Alert Types:**
- `LOW_STOCK` — quantity ≤ lowStockAt threshold
- `ANOMALY` — quantity dropped >50% in single update

---

## Authentication

All API routes use Stack Auth session cookies. No manual JWT handling required.

**Protected by middleware:**
- `/dashboard/*`
- `/inventory/*`
- `/add-product/*`
- `/settings/*`
- `/org/*`
- `/alerts/*`
- `/leaderboard/*`
- `/dispatch/*`

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| GET /api/products | 100 req | 60s |
| PATCH /api/products/:id | 60 req | 60s |
| DELETE /api/products/:id | 30 req | 60s |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
Retry-After: 60
```

---

## Error Responses

```json
{ "error": "Unauthorized" }           // 401
{ "error": "Not found" }              // 404
{ "error": "Invalid input" }          // 400
{ "error": "Too many requests..." }   // 429
{ "error": "Failed to update" }       // 500
```
