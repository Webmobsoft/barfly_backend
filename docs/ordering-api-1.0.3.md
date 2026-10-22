# Ordering API — Countr 1.0.3 (Phase 0)

What changed for the apps. Opening hours replace Events as the source of "can a guest order now". All times are ISO 8601 UTC; the venue's timezone (`Europe/Zurich` by default) is applied on the server.

## Ordering state

Returned as `orderingState` on counters and restaurants.

| Field | Meaning |
| --- | --- |
| `state` | `open` (ASAP now) · `preorder` (only slots now) · `paused` · `upcoming` (opens later) · `no_hours` · `unavailable` |
| `acceptsAsap` / `acceptsSlots` | What the checkout may offer right now |
| `openUntil` | End of the current ASAP window (pickup end − prep time) |
| `pickupFrom` | Start of pickup for the current block (or first free slot when `preorder`) |
| `nextOpening` | `{ at, kind: "asap" \| "preorder", pickupFrom }` or `null` |
| `pausedUntil` / `pauseKind` | `pausedUntil: null` with `pauseKind: "manual"` = paused until resumed |
| `prepTimeMinutes`, `timezone` | Counter prep time, venue timezone |

A restaurant is `open` when any of its counters is open.

## Guest endpoints

- `GET /api/customer/entities/get-entities` — unchanged keys. `ongoingEventEntities` = orderable now (`open` or `preorder`), `remainingEntities` = the rest. Each entity has `orderingState`.
- `GET /api/customer/entities/get-counter-list?entityId=` — each counter has `orderingState`. `isLive` = `acceptsAsap || acceptsSlots`. `eventId` is always `null`.
- `GET /api/customer/entities/pickup-slots?counterId=` (public) — `{ orderingState, slotLengthMinutes: 15, slots: [{ start, end, remaining }] }`. Only free slots are listed; `remaining` is `null` when there is no limit.
- `POST /api/orders/create-order`
  ```json
  { "counterId": "…", "pickupMode": "asap" | "slot", "pickupSlotStart": "2026-10-21T09:30:00.000Z",
    "isSelfPickup": true, "tableNo": 0, "couponCode": "…",
    "items": [{ "itemId": "…", "quantity": 1, "note": "no basil", "extras": ["<extraId>"] }] }
  ```
  `eventId` is ignored. Without `counterId` the item's counter is used and `pickupMode` defaults to `asap` (pre-1.0.3 builds). Prices are computed on the server. Each order line comes back with `extras`, `unitPrice`, `lineTotal`, `categoryId`, `categoryName`, `categorySortIndex`; the order with `pickupMode`, `pickupSlotStart`, `pickupSlotLength`, `countrTag`.
  Rejections are `400` with `{ message, code, data? }`:
  `ORDER_CLOSED`, `ORDER_PAUSED`, `ORDER_ASAP_NOT_AVAILABLE`, `ORDER_SLOT_NOT_AVAILABLE`, `ORDER_SLOT_FULL`, `ORDER_ITEM_NOT_FOUND`, `ORDER_ITEM_OUT_OF_STOCK`, `ORDER_ITEM_WRONG_COUNTER`, `ORDER_EXTRA_NOT_AVAILABLE`, `ORDER_INVALID_QUANTITY`, `ORDER_INVALID_PICKUP`, `ORDER_COUNTER_NOT_FOUND`, `ORDER_EMPTY`, `ORDER_RESTAURANT_CLOSED`. `data.nextOpening` / `data.pausedUntil` when relevant.
- `POST /api/wallee/create-payment` — body `{ orderId, currency? }`. The amount is the order's `finalAmount`; `amount` and `eventId` are ignored. Only the guest who placed the order can pay it, and only while it is `Payment Processing`. Deep links: `countr://payment/success?orderId=…&userId=…` (and `/cancel`).
- `GET /api/wallee/get-payment-status?transactionId=&orderId=` — `orderId` resolves the merchant space; `eventId` still accepted.
- `POST /api/orders/cancel-order` — only the guest's own order.

## Owner endpoints (`/api/owner/restaurant`)

- `GET /counter-ordering-settings[?counterId=]` — `{ counterId, counterName, openingHours[7], prepTimeMinutes, ordersPerSlot, pause, orderingState, timezone }` (array without `counterId`).
- `PUT /counter-opening-hours` — `{ counterId, prepTimeMinutes?, openingHours: [{ day: 0-6 (Mon-Sun), enabled, blocks: [{ name?, pickupFrom: "HH:mm", pickupTo: "HH:mm", mode: "live" | "preorder" | "both", orderCutoff: "HH:mm" (preorder/both) }] }] }`. Max 2 blocks per day, no overlap, cut-off at or before pickup start, a block ending before it starts runs past midnight. Errors: `400` with `code` (`HOURS_*`) and `data.errors`.
- `PUT /counter-orders-per-slot` — `{ counterId, ordersPerSlot }` (`null`/`0` = no limit).
- `POST /pause-orders` — `{ counterId?, kind: "15m" | "30m" | "manual" | "today" }`. Without `counterId` every counter is paused.
- `POST /resume-orders` — `{ counterId? }`.
- `POST /update-status-of-order`, `restaurant-cancel-order`, `update-offline-status-of-order` — only for the caller's own restaurant.
- A new counter copies the first counter's opening hours and prep time.

## Realtime

- Socket handshake: `query: { token }` as before. Guest apps add `query.client = "customer"`; they join `public` (also without a token) and, logged in, `user_<userId>`.
- `counterStateChanged` → `{ entityId, counterId, ...orderingState }`, sent to the restaurant room and `public` on hours edit, slot-limit change, pause and resume.

## App config

`GET /api/app-config` (public) → `{ minVersion: { customer: { ios, android }, countrPlus: { ios, android } }, storeUrls: { … } }`. Set in the `appconfigs` collection (document `key: "global"`). Defaults `0.0.0` block nobody.

## Setup

- Opening hours for existing restaurants: `node scripts/set-opening-hours.js --entity <id> --file hours.json [--dry-run]`.
- Rules tests: `npm run test:unit`.
