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

# Phase 2 — order board, order chat, live updates

## Order board (owner)

`GET /api/orders/board?status=live|ready&counterId=<id>` — owner token only (`403` otherwise), always scoped to the caller's restaurant. `status` defaults to `live` (Waiting + In Process); `ready` = Ready. Omit `counterId` for all counters; a counter of another restaurant → `404` `BOARD_COUNTER_NOT_FOUND`; another `status` → `400` `BOARD_STATUS_INVALID`. Completed / Cancelled tabs keep using `get-entity-orders` (unchanged).

```json
{ "serverTime": "…", "status": "live", "counterId": null,
  "asap": [ { …order, "ageMinutes": 12 } ],
  "slots": [ { "start": "…", "end": "…", "state": "overdue" | "running" | "upcoming",
               "minutesLeft": 8,        // running only (until the slot ends)
               "startsInMinutes": 8,    // upcoming only
               "prepareFrom": "…",      // start − counter prep time
               "booked": 4, "limit": 6, // limit null = no limit
               "orders": [ …order ] } ] }
```

- `asap`: orders with `pickupMode: "asap"` or no `pickupMode` (older orders), oldest first; `ageMinutes` counts from `createdAt`.
- `slots`: one row per slot start that has orders on this tab — overdue rows first, then running, then upcoming, each by start; orders inside oldest first.
- `booked` counts every order holding the slot (also Ready / Completed and recent Payment Processing, as for the guest's free slots). In the all-counters view a row may hold several counters: `booked` and `limit` are the sums over those counters (`limit` null if one has no limit), `prepareFrom` uses the longest prep time.
- Order: `_id, tokenNumber, status, counterId, counterName, countrTag, userId, createdAt, updatedAt, totalAmount, finalAmount, isSelfPickup, tableNo, note, pickupMode, pickupSlotStart, pickupSlotLength, items[{ itemId, itemName, quantity, note, categoryId, categoryName, categorySortIndex, extras[{ extraId, name, price }], unitPrice, lineTotal }], latestMessage: { sender, text, createdAt, viaVoice } | null, unreadFromGuest`.
- Use `serverTime` (not the device clock) to count down `minutesLeft` / ticket age between refreshes.

## Order chat

Mounted at `/api/orders` (`Controller/messageController.js`). The same paths serve both apps: an owner token (has `entityId`) acts as the restaurant, any other token as the guest.

| | |
| --- | --- |
| `GET /api/orders/:orderId/messages` | `{ data: { orderId, status, chatOpen, canSend, messages: [{ _id, orderId, sender: "restaurant" \| "guest", text, viaVoice, readAt, createdAt }] } }`, oldest first. History stays readable after the order is finished. |
| `POST /api/orders/:orderId/messages` | `{ text, viaVoice? }` → `{ data: message }`. `viaVoice` only counts for the restaurant. |
| `POST /api/orders/:orderId/messages/read` | Marks the other side's messages read → `{ data: { orderId, marked } }`. |

Rules (errors are `{ message, code }`):
- Restaurant: only orders of its own restaurant; guest: only own orders. Otherwise `404` `MESSAGE_ORDER_NOT_FOUND`.
- Sending only while the order is Waiting / In Process / Ready, else `400` `MESSAGE_CHAT_CLOSED`.
- The guest can only reply: before the first restaurant message `400` `MESSAGE_GUEST_CANNOT_START` (`canSend` is false).
- Text is trimmed, 1–500 characters, else `400` `MESSAGE_TEXT_INVALID` (`data.maxLength`).

Push:
- Restaurant message → topic `user_<guestId>`, visible with sound, title = restaurant name, body = text, data `{ action: "order_message", screen: "order_chat", orderId, entityId, orderNo }`.
- Guest reply → topic `owner_entity_<entityId>`, silent, data `{ action: "order_message", screen: "order_board", orderId, entityId, orderNo }`.

Guest order endpoints `GET /api/orders/get-live-orders-user` and `GET /api/orders/get-particular-live-order-details-customer` now add per order: `hasMessages`, `unreadMessages` (restaurant messages the guest has not read) and `latestMessage` (`{ sender, text, createdAt, viaVoice }` or `null`).

## Realtime (Phase 2)

| Event | Payload | Rooms |
| --- | --- | --- |
| `orderMessage` | `{ orderId, entityId, message }` | restaurant room `<entityId>`, `user_<guestId>` |
| `orderMessagesRead` | `{ orderId, entityId, reader: "restaurant" \| "guest", readAt }` | restaurant room, `user_<guestId>` |
| `orderUpdated` | `{ entityId, orderId, status, counterId }` | restaurant room, `user_<guestId>` |
| `counterStateChanged` | as in Phase 0 | restaurant room, `public` |

- `orderUpdated` is sent when a paid order arrives (Wallee webhook → Waiting; or create-order when it is not Payment Processing), on every `update-status-of-order`, on the guest's `cancel-order` and on `restaurant-cancel-order`. Boards and guest apps patch or refetch that one order. The older events (`newOrder`, `orderStatusUpdate`, `cancelOrder`) are still sent.
- `counterStateChanged` now also comes from a minute ticker (`Utils/counterStateTicker.js`, Bull queue `counter-state-ticker`, one repeatable job id `counter-state-tick`, every 60 s). It recomputes every active counter and announces only changes (opening hours starting/ending, a timed pause running out) compared with the last announced state in Redis (`counterState:<counterId>`). Each change also sends a silent push `{ action: "counter_state_update", entityId, counterId, state }` to `customer_entity` and `owner_entity_<entityId>`. A counter seen for the first time is recorded without an announcement.

## Removed: Events

The Event scheduling (`Utils/emitQueue.js`, `Utils/emitProcessor.js`, `Utils/bullQueue.js`, `Utils/cachedUpcomingEvenrts.js`, `cron/emitEvent.js`, socket `ongoingEvent` / `eventUpdate`) and these endpoints are gone (`404`):
`/api/owner/restaurant/create-event`, `edit-event`, `delete-event`, `get-upcoming-events`, `get-past-events-years`, `get-past-events-year-month`, `get-past-events-by-month`, `get-event-details-monthly`, `get-ongoing-event-details`, `get-counters-for-event`, `get-order-details-of-events`, and `/api/orders/get-event-order-summary`. The `Event` model stays (old orders reference it).

## Tests

- `npm run test:unit` covers the board layout rules (`Utils/ordering/board.js`: slot row state, `prepareFrom`, `minutesLeft`, sorting, limits).
