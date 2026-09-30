# Barfly Backend — API Reference

**Version:** 1.0  
**Last Updated:** 2026-06-11  
**Base URL:** `http://<host>:2000`  
**Content-Type:** `application/json` (unless noted as multipart)

---

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

Tokens are returned from login/register endpoints.

---

## Standard Error Response

All errors return this shape:

```json
{
  "message": "ERROR_KEY or human-readable message",
  "status": 400
}
```

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request / validation failed |
| 401 | Unauthorized / invalid token / user blocked |
| 404 | Resource not found |
| 500 | Server error |

---

## Table of Contents

1. [Customer Authentication](#1-customer-authentication)
2. [Customer — Entities & Menu](#2-customer--entities--menu)
3. [Customer — User Profile](#3-customer--user-profile)
4. [Owner Authentication](#4-owner-authentication)
5. [Owner — Restaurant Management](#5-owner--restaurant-management)
6. [Owner — Events](#6-owner--events)
7. [Owner — Orders & Analytics](#7-owner--orders--analytics)
8. [Orders](#8-orders)
9. [Wallee Payments](#9-wallee-payments)
10. [Admin](#10-admin)
11. [Utility](#11-utility)

---

## 1. Customer Authentication

### POST `/api/customer/auth/register`

Register a new customer account.

**Auth required:** No

**Request body:**

```json
{
  "email": "user@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "password": "SecurePass123!",
  "dob": "1995-04-20",
  "countrTag": "@jane.doe"
}
```

| Field | Type | Required |
|-------|------|----------|
| email | string | Yes |
| firstName | string | Yes |
| lastName | string | Yes |
| password | string | Yes |
| dob | date string | Yes |
| countrTag | string | Yes — unique handle |

**Success response (200):**

```json
{
  "message": "CUSTOMER_REGISTER_SUCCESS",
  "userObj": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:**

| Status | Message |
|--------|---------|
| 400 | Email already registered |
| 400 | CountR tag already exists |

---

### POST `/api/customer/auth/login`

**Auth required:** No

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Success response (200):**

```json
{
  "message": "CUSTOMER_LOGIN_SUCCESS",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userDetails": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "user@example.com",
    "contactNumber": "+41791234567",
    "role": "CUSTOMER"
  }
}
```

**Errors:**

| Status | Message |
|--------|---------|
| 401 | User not found |
| 401 | Customer blocked by admin |
| 401 | Only customers can login here |
| 401 | Invalid password |

---

### POST `/api/customer/auth/logout`

**Auth required:** Yes

**Request body:** Empty `{}`

**Success response (200):**

```json
{
  "message": "CUSTOMER_LOGOUT_SUCCESS",
  "response": null
}
```

---

### POST `/api/customer/auth/delete-account`

**Auth required:** Yes

**Request body:** Empty `{}`

**Success response (200):**

```json
{
  "message": "CUSTOMER_DELETE_ACCOUNT_SUCCESS"
}
```

**Errors:**

| Status | Message |
|--------|---------|
| 400 | User doesn't exist |
| 400 | Cannot delete — active orders in progress |

---

### GET `/api/customer/auth/check-and-generate-countR-tag`

Generate available CountR tag suggestions.

**Auth required:** No

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| firstName | string | Yes |
| lastName | string | Yes |

**Success response (200):**

```json
{
  "message": "COUNTR_TAG_GENERATE_SUCCESS",
  "availableTags": [
    "@jane.doe",
    "@jane.doe89",
    "@jane.doe42"
  ]
}
```

---

### POST `/api/customer/auth/countR-tag`

Accept/set a CountR tag for the authenticated user.

**Auth required:** Yes

**Request body:**

```json
{
  "countrTag": "@jane.doe"
}
```

**Success response (200):**

```json
{
  "message": "COUNTR_TAG_ACCEPT_SUCCESS"
}
```

---

### POST `/api/customer/auth/send-email-otp`

Two-in-one endpoint: send OTP (first call) or verify OTP (second call with `otp` field).

**Auth required:** No

**Request body — Step 1 (send OTP):**

```json
{
  "email": "user@example.com"
}
```

**Request body — Step 2 (verify OTP):**

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

> **Load test note:** When `BYPASS_OTP=true` is set on the server, use `"otp": "999999"` and no real email is sent.

**Success response — Step 1 (200):**

```json
{
  "otpSent": true,
  "message": "OTP_SENT_EMAIL_SUCCESS"
}
```

**Success response — Step 2 (200):**

```json
{
  "otpVerified": true,
  "token": "a3f9b2c1d4e5...",
  "message": "OTP_VERIFIED_SUCCESS"
}
```

**Errors:**

| Status | Message |
|--------|---------|
| 400 | Email required |
| 400 | OTP expired |
| 400 | OTP invalid |
| 500 | Email send failed |

---

### POST `/api/customer/auth/reset-password`

**Auth required:** No — but requires reset token from OTP verification in headers.

**Headers:**

```
token: a3f9b2c1d4e5...
```

**Request body:**

```json
{
  "email": "user@example.com",
  "newPassword": "NewSecurePass123!"
}
```

**Success response (200):**

```json
{
  "success": true,
  "message": "PASSWORD_RESET_SUCCESS"
}
```

**Errors:**

| Status | Message |
|--------|---------|
| 400 | Reset token required |
| 400 | Invalid or expired reset token |
| 404 | User not found |

---

## 2. Customer — Entities & Menu

### GET `/api/customer/entities/get-entities`

List all entities (restaurants/bars).

**Auth required:** Optional

**Query params:**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| limit | number | No | Default: 30 |
| skip | number | No | Default: 0 |
| searchTerm | string | No | Search by entity name |
| isNewlyAdded | boolean | No | Entities added in last 48 h |
| isPopular | boolean | No | Sort by view count |
| isFavouriteEntities | string | No | `"true"` to show only favourites |

**Success response (200):**

```json
{
  "message": "ENTITIES_FETCH_SUCCESS",
  "entityEvents": {
    "ongoingEventEntities": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "entityName": "The Bar",
        "city": "Zurich",
        "entityType": "BAR",
        "street": "Bahnhofstrasse 1",
        "image": "https://s3.presigned.url/...",
        "views": 1420,
        "isFavouriteEntity": false
      }
    ],
    "remainingEntities": []
  }
}
```

---

### GET `/api/customer/entities/get-entity`

Get single entity details.

**Auth required:** Optional

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| entityId | string | Yes |

**Success response (200):**

```json
{
  "message": "ENTITY_FETCH_SUCCESS",
  "entity": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "entityName": "The Bar",
    "entityType": "BAR",
    "city": "Zurich",
    "isOpen": true,
    "image": "https://s3.presigned.url/...",
    "views": 1420
  }
}
```

---

### GET `/api/customer/entities/newly-added-entities`

**Auth required:** No

**Success response (200):**

```json
{
  "message": "NEW_ENTITIES_FETCH_SUCCESS",
  "data": [
    { "_id": "...", "entityName": "New Place", "city": "Basel" }
  ]
}
```

---

### GET `/api/customer/entities/popular-entities`

Top 10 entities by view count.

**Auth required:** No

**Success response (200):**

```json
{
  "message": "POPULAR_ENTITIES_FETCH_SUCCESS",
  "data": [
    { "_id": "...", "entityName": "The Bar", "views": 5200 }
  ]
}
```

---

### GET `/api/customer/entities/entity-offers`

**Auth required:** No

**Success response (200):**

```json
{
  "message": "ENTITY_OFFERS_FETCH_SUCCESS",
  "entityOffers": [
    {
      "_id": "...",
      "code": "SUMMER20",
      "type": "percentage",
      "value": 20,
      "description": "20% off all drinks",
      "colourTheme": "#FF5733",
      "entityId": { "_id": "...", "entityName": "The Bar" }
    }
  ]
}
```

---

### GET `/api/customer/entities/get-counter-list`

**Auth required:** Optional

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| entityId | string | Yes |
| searchTerm | string | No |

**Success response (200):**

```json
{
  "message": "COUNTER_LIST_FETCH_SUCCESS",
  "counterLists": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
      "counterName": "Main Bar",
      "totalTables": 12,
      "isTableService": true,
      "isLive": true,
      "eventId": null
    }
  ]
}
```

---

### GET `/api/customer/entities/get-counter-menu-category`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| counterId | string | Yes |
| searchTerm | string | No |

**Success response (200):**

```json
{
  "message": "MENU_CATEGORIES_FETCH_SUCCESS",
  "menuLists": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d3",
      "categoryName": "Cocktails",
      "counterId": "64f1a2b3c4d5e6f7a8b9c0d2",
      "nutritionType": "BEVERAGES"
    }
  ]
}
```

---

### GET `/api/customer/entities/get-menu-category-items`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| menuCategoryId | string | Yes |
| counterId | string | Yes |
| entityId | string | Yes |
| searchTerm | string | No |

**Success response (200):**

```json
{
  "message": "MENU_ITEMS_FETCH_SUCCESS",
  "menuItems": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d4",
      "itemName": "Aperol Spritz",
      "description": "Classic Italian aperitivo",
      "price": 12.50,
      "currency": "CHF",
      "image": "https://s3.presigned.url/...",
      "quantity": 50,
      "isVegan": true,
      "isAlcohol18": true,
      "isAlcohol16": false
    }
  ]
}
```

---

### GET `/api/customer/entities/recommended-items`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| entityId | string | Yes |
| counterId | string | Yes |
| searchTerm | string | No |

**Success response (200):**

```json
{
  "message": "RECOMMENDED_ITEMS_FETCH_SUCCESS",
  "menuItems": [ ]
}
```

---

### GET `/api/customer/entities/get-platform-fee`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "PLATFORM_FEE_FETCH_SUCCESS",
  "platformFee": 0.05
}
```

---

### GET `/api/customer/entities/get-tables-user-side`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| entityId | string | Yes |
| counterId | string | Yes |

**Success response (200):**

```json
{
  "message": "TABLES_FETCH_SUCCESS",
  "data": [
    {
      "tableCount": ["1", "2", "3", "4"],
      "tableSectionName": "Terrace",
      "tableSetionNo": 1,
      "entityId": "64f1a2b3c4d5e6f7a8b9c0d1"
    }
  ]
}
```

---

### POST `/api/customer/entities/visitor-count`

Track that a user opened an event.

**Auth required:** Yes

**Request body:**

```json
{
  "eventId": "64f1a2b3c4d5e6f7a8b9c0d5"
}
```

**Success response (200):**

```json
{ "message": "" }
```

---

### POST `/api/customer/entities/event-opened`

**Auth required:** Yes

**Request body:**

```json
{ "eventId": "64f1a2b3c4d5e6f7a8b9c0d5" }
```

**Success response (200):**

```json
{ "message": "EVENT_OPENED_SUCCESS" }
```

---

### POST `/api/customer/entities/event-closed`

**Auth required:** Yes

**Request body:**

```json
{ "eventId": "64f1a2b3c4d5e6f7a8b9c0d5" }
```

**Success response (200):**

```json
{ "message": "EVENT_CLOSED_SUCCESS" }
```

---

### POST `/api/customer/entities/add-favourite-entity`

**Auth required:** Yes

**Request body:**

```json
{
  "entityId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "isFavourite": true
}
```

**Success response (200):**

```json
{ "message": "FAVOURITE_ENTITY_ADD_SUCCESS" }
```

---

### GET `/api/customer/entities/get-favourite-items`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| counterId | string | Yes |
| searchTerm | string | No |

**Success response (200):**

```json
{
  "message": "FAVOURITE_ITEMS_FETCH_SUCCESS",
  "menuItems": [ ]
}
```

---

### POST `/api/customer/entities/update-favourite-items`

**Auth required:** Yes

**Request body:**

```json
{
  "menuId": "64f1a2b3c4d5e6f7a8b9c0d3",
  "itemId": "64f1a2b3c4d5e6f7a8b9c0d4",
  "isFavourite": true
}
```

**Success response (200):**

```json
{ "message": "FAVOURITE_ITEM_UPDATE_SUCCESS" }
```

---

### POST `/api/customer/entities/create-search-logs`

**Auth required:** Yes

**Request body:**

```json
{ "entityId": "64f1a2b3c4d5e6f7a8b9c0d1" }
```

**Success response (200):**

```json
{ "message": "SEARCH_LOG_CREATE_SUCCESS" }
```

---

### GET `/api/customer/entities/get-search-logs`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "SEARCH_LOG_FETCH_SUCCESS",
  "searchedEntitiesLogs": [
    {
      "_id": "...",
      "entityId": {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "entityName": "The Bar",
        "city": "Zurich",
        "image": "https://s3.presigned.url/..."
      },
      "createdAt": "2026-06-10T14:23:00.000Z"
    }
  ]
}
```

---

### POST `/api/customer/entities/remove-search-logs`

**Auth required:** Yes

**Request body:**

```json
{
  "entityId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "isRemoved": true
}
```

**Success response (200):**

```json
{
  "message": "SEARCH_LOG_REMOVE_SUCCESS",
  "data": { }
}
```

---

### POST `/api/customer/entities/location`

Save user location and check proximity.

**Auth required:** Yes

**Request body:**

```json
{
  "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "latitude": 47.3769,
  "longitude": 8.5417,
  "locationEnabled": true
}
```

**Success response (200):**

```json
{
  "message": "LOCATION_FETCH_SUCCESS",
  "result": {
    "insideArea": true,
    "distanceInKm": 0.8,
    "locationSaved": true
  }
}
```

---

### POST `/api/customer/entities/user-feedback`

**Auth required:** Yes

**Request body:**

```json
{
  "entityId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "answers": [
    { "questionId": "64f1a2b3c4d5e6f7a8b9c0d9", "value": 5 },
    { "questionId": "64f1a2b3c4d5e6f7a8b9c0da", "value": "Great experience" }
  ]
}
```

**Success response (200):**

```json
{ "message": "USER_FEEDBACK_SUBMIT_SUCCESS" }
```

---

### POST `/api/customer/entities/user-app-feedback`

**Auth required:** Yes

**Request body:**

```json
{
  "answers": [
    { "questionId": "appFeedback1", "answer": "Very Easy" },
    { "questionId": "appFeedback2", "answer": "5" }
  ]
}
```

**Success response (200):**

```json
{ "message": "USER_FEEDBACK_SUBMIT_SUCCESS" }
```

---

### GET `/api/customer/entities/get-feedback-questions`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| entityId | string | Yes |

**Success response (200):**

```json
{
  "message": "FEEDBACK_QUESTIONS_FETCH_SUCCESS",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d9",
      "question": "How was the service?",
      "answerType": ["1", "2", "3", "4", "5"],
      "answerTypeKey": "RATING"
    }
  ]
}
```

---

### GET `/api/customer/entities/get-feedback-app-questions`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "FEEDBACK_QUESTIONS_FETCH_SUCCESS",
  "data": [
    {
      "id": "appFeedback1",
      "question": "How easy was the app to use?",
      "answerType": "FRIENDLY",
      "options": [
        { "value": "Very Easy", "label": "Very Easy" },
        { "value": "Easy", "label": "Easy" }
      ]
    }
  ]
}
```

---

### GET `/api/customer/entities/get-all-countries`

**Auth required:** No

**Success response (200):**

```json
{
  "message": "COUNTRIES_FETCH_SUCCESS",
  "data": [
    { "name": "Switzerland", "isoCode": "CH" },
    { "name": "Germany", "isoCode": "DE" }
  ]
}
```

---

### GET `/api/customer/entities/get-iso-code`

**Auth required:** No

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| isoCode | string | Yes |

**Success response (200):**

```json
{
  "message": "ISO_CODE_FETCH_SUCCESS",
  "stateList": {
    "country": "Switzerland",
    "isoCode": "CH",
    "statesList": [
      { "state": "Zurich", "isoCode": "ZH" }
    ]
  }
}
```

---

### GET `/api/customer/entities/get-cities-of-state`

**Auth required:** No

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| countryCode | string | Yes |
| stateCode | string | Yes |

**Success response (200):**

```json
{
  "message": "CITIES_FETCH_SUCCESS",
  "cities": [
    { "name": "Zurich" },
    { "name": "Winterthur" }
  ]
}
```

---

## 3. Customer — User Profile

### GET `/api/customer/entities/get-user-details`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "USER_DETAILS_FETCH_SUCCESS",
  "response": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "contactNumber": "+41791234567",
    "role": "CUSTOMER"
  }
}
```

---

### POST `/api/customer/entities/update-user-details`

Two-step update for email and phone (OTP required). Password update is single-step.

**Auth required:** Yes

**Request body — change password:**

```json
{
  "newPassword": "NewSecurePass123!"
}
```

**Request body — change email (Step 1 — sends OTP):**

```json
{
  "email": "newemail@example.com"
}
```

**Request body — change email (Step 2 — verify OTP):**

```json
{
  "email": "newemail@example.com",
  "enteredOtp": "123456"
}
```

**Request body — change phone (Step 1):**

```json
{
  "contactNumber": "+41799876543"
}
```

**Request body — change phone (Step 2):**

```json
{
  "contactNumber": "+41799876543",
  "enteredOtp": "123456"
}
```

**Success response — password (200):**

```json
{ "message": "PASSWORD_UPDATE_SUCCESS" }
```

**Success response — Step 1 OTP sent (200):**

```json
{
  "message": "OTP_SENT_NEW_EMAIL",
  "otpSent": true
}
```

**Success response — Step 2 verified (200):**

```json
{
  "message": "EMAIL_UPDATE_SUCCESS",
  "otpVerified": true
}
```

---

### GET `/api/customer/entities/fetch-notification-settings`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "NOTIFICATION_SETTINGS_FETCH_SUCCESS",
  "notificationSettingsDetails": {
    "_id": "...",
    "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
    "isEmailOn": true,
    "isPushOn": true,
    "isPromotionalOn": false
  }
}
```

---

### POST `/api/customer/entities/update-notification-settings`

**Auth required:** Yes

**Request body:**

```json
{
  "isPushOn": true,
  "value": true
}
```

**Success response (200):**

```json
{ "message": "NOTIFICATION_SETTINGS_UPDATE_SUCCESS" }
```

---

### POST `/api/customer/entities/add-card`

**Auth required:** Yes

**Request body:**

```json
{
  "cardHolderName": "Jane Doe",
  "cardNo": "4111111111111111",
  "cardExpireAt": "12/27",
  "securityCode": "123",
  "type": "VISA"
}
```

**Success response (200):**

```json
{ "message": "CARD_ADDED_SUCCESS" }
```

---

### GET `/api/customer/entities/get-user-cards`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "CARDS_FETCH_SUCCESS",
  "cards": [
    {
      "_id": "...",
      "cardHolderName": "Jane Doe",
      "cardNo": "4111111111111111",
      "cardExpireAt": "12/27",
      "securityCode": "123",
      "type": "VISA",
      "status": "ACTIVE"
    }
  ]
}
```

---

### POST `/api/customer/entities/edit-card`

**Auth required:** Yes

**Request body:**

```json
{
  "cardId": "64f1a2b3c4d5e6f7a8b9c0db",
  "cardHolderName": "Jane Doe Updated",
  "action": "EDIT"
}
```

`action` values: `"EDIT"` or `"DELETE"`

**Success response (200):**

```json
{ "message": "CARD_UPDATE_SUCCESS" }
```

---

## 4. Owner Authentication

### POST `/api/owner/auth/register`

Three-step registration: send OTP → verify OTP → create account.

**Auth required:** No  
**Content-Type:** `multipart/form-data`

**Step 1 — Send OTP (only `contactNumber` required):**

```
contactNumber: +41791234567
```

**Response Step 1 (200):**

```json
{
  "otpSent": true,
  "message": "OTP_SENT_SUCCESS",
  "otp": "123456"
}
```

**Step 2 — Verify OTP:**

```
contactNumber: +41791234567
enteredOtp: 123456
```

**Response Step 2 (200):**

```json
{
  "otpVerified": true,
  "message": "OTP_VERIFIED_SUCCESS",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Step 3 — Create account (all fields):**

```
sessionId: 550e8400-e29b-41d4-a716-446655440000
email: owner@thebar.ch
fullName: John Owner
password: SecurePass123!
contactNumber: +41791234567
city: Zurich
zipcode: 8001
entityName: The Bar
entityType: BAR
entityContactNumber: +41441234567
country: CH
buildingName: Bahnhofstrasse 1
state: ZH
location: 47.3769,8.5417
file: (image file, optional)
```

**Response Step 3 (200):**

```json
{
  "message": "OWNER_REGISTRATION_SUCCESS",
  "entity": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0dc",
    "entityName": "The Bar",
    "entityType": "BAR",
    "city": "Zurich"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "isRegistered": true
}
```

> **Load test note:** When `BYPASS_OTP=true`, use `999999` for `enteredOtp` in Step 2. No SMS is sent.

**Errors:**

| Status | Message |
|--------|---------|
| 400 | Email already registered |
| 400 | OTP expired |
| 400 | Invalid OTP |
| 400 | OTP session invalid |
| 400 | Missing required entity fields |

---

### POST `/api/owner/auth/login`

**Auth required:** No

**Request body:**

```json
{
  "email": "owner@thebar.ch",
  "password": "SecurePass123!"
}
```

Or login by phone:

```json
{
  "contactNumber": "+41791234567",
  "password": "SecurePass123!"
}
```

**Success response (200):**

```json
{
  "message": "OWNER_LOGIN_SUCCESS",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userDetails": {
    "fullName": "John Owner",
    "email": "owner@thebar.ch",
    "contactNumber": "+41791234567",
    "role": "STORE_OWNER"
  }
}
```

**Errors:**

| Status | Message |
|--------|---------|
| 401 | Email/contact not found |
| 401 | Owner blocked by admin |
| 401 | Entity not found |
| 401 | Invalid password |

---

### POST `/api/owner/auth/logout`

**Auth required:** Yes

**Request body:** Empty `{}`

**Success response (200):**

```json
{
  "message": "ENTITY_LOGOUT_SUCCESS",
  "response": null
}
```

---

### POST `/api/owner/auth/send-email-otp`

Same pattern as customer OTP. Send OTP or verify OTP.

**Auth required:** No

**Request body — send:**

```json
{ "email": "owner@thebar.ch" }
```

**Request body — verify:**

```json
{
  "email": "owner@thebar.ch",
  "otp": "999999"
}
```

**Success responses:** Same as [Customer OTP](#post-apicustomerauthsend-email-otp).

---

### POST `/api/owner/auth/reset-password`

Same as customer. Requires `token` header from OTP verification.

**Headers:** `token: <reset_token>`

**Request body:**

```json
{
  "email": "owner@thebar.ch",
  "newPassword": "NewPass123!"
}
```

**Success response (200):**

```json
{
  "success": true,
  "message": "PASSWORD_RESET_SUCCESS"
}
```

---

## 5. Owner — Restaurant Management

### POST `/api/owner/restaurant/create-counter`

**Auth required:** Yes

**Request body:**

```json
{
  "counterName": "Main Bar",
  "isTableService": true,
  "isSelfPickUp": false,
  "tableFrom": 1,
  "tableTo": 10,
  "tableSectionName": "Indoor"
}
```

**Success response (200):**

```json
{
  "message": "OWNER_COUNTER_CREATE_SUCCESS",
  "data": "Main Bar"
}
```

**Errors:**

| Status | Message |
|--------|---------|
| 400 | Counter name required |
| 400 | Counter name already exists |
| 400 | Invalid table range (from >= to) |

---

### GET `/api/owner/restaurant/get-counter`

**Auth required:** Yes

**Query params:**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| isItemRequired | string | No | `"true"` to include menu items |
| isSettings | string | No | `"true"` to include inactive counters |

**Success response (200):**

```json
{
  "message": "OWNER_COUNTER_FETCH_SUCCESS",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
      "counterName": "Main Bar",
      "isSelfPickUp": false,
      "isTableService": true,
      "tableCount": ["1", "2", "3"],
      "status": "ACTIVE",
      "tableSectionName": "Indoor",
      "items": [
        { "_id": "...", "itemName": "Aperol Spritz", "inStock": true }
      ]
    }
  ]
}
```

---

### POST `/api/owner/restaurant/create-counter-menu-category`

**Auth required:** Yes

**Request body:**

```json
{
  "categories": [
    { "categoryName": "Cocktails", "nutritionType": "BEVERAGES" },
    { "categoryName": "Snacks", "nutritionType": "FOOD" }
  ]
}
```

**Success response (200):**

```json
{
  "message": "OWNER_CATEGORY_CREATE_SUCCESS",
  "data": [ ]
}
```

---

### GET `/api/owner/restaurant/get-menu-category`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "OWNER_MENU_CATEGORY_FETCH_SUCCESS",
  "data": [
    {
      "_id": "...",
      "categoryName": "Cocktails",
      "nutritionType": "BEVERAGES",
      "counterIds": [ ]
    }
  ]
}
```

---

### POST `/api/owner/restaurant/edit-category`

**Auth required:** Yes

**Request body:**

```json
{
  "categoryName": "Cocktails",
  "action": "EDIT",
  "newCategoryName": "Signature Cocktails"
}
```

`action` values: `"EDIT"` or `"DELETE"`

**Success response (200):**

```json
{ "message": "OWNER_CATEGORIES_UPDATE_SUCCESS" }
```

---

### POST `/api/owner/restaurant/create-menu-items`

**Auth required:** Yes  
**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| file | file | No |
| itemName | string | Yes |
| price | number | Yes |
| description | string | No |
| currency | string | No (default: CHF) |
| quantity | number | No |
| isVegan | boolean | No |
| unit | string | No |
| nutritionType | string | No |
| counterIds | array (JSON) | Yes |
| categoryName | string | Yes |
| isAlcohol18 | boolean | No |
| isAlcohol16 | boolean | No |

**Success response (200):**

```json
{
  "message": "OWNER_MENU_ITEM_CREATE_SUCCESS",
  "data": [ ]
}
```

---

### GET `/api/owner/restaurant/get-entity-items`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| itemId | string | No |
| pageNo | number | No (default: 1) |
| pageLimit | number | No (default: 8) |
| inStock | boolean | No |
| searchTerm | string | No |
| menuCategoryName | string | No |

**Success response (200):**

```json
{
  "message": "OWNER_ENTITY_ITEMS_FETCH_SUCCESS",
  "data": {
    "itemsList": [
      {
        "_id": "...",
        "itemName": "Aperol Spritz",
        "price": 12.50,
        "currency": "CHF",
        "inStock": true,
        "image": "https://s3.presigned.url/..."
      }
    ],
    "totalCount": 42
  }
}
```

---

### POST `/api/owner/restaurant/update-menu-item`

**Auth required:** Yes  
**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| itemId | string | Yes |
| action | string | Yes — `"EDIT"` or `"DELETE"` |
| itemName | string | No |
| price | number | No |
| description | string | No |
| inStock | boolean | No |
| removeImage | boolean | No |
| file | file | No |

**Success response (200):**

```json
{ "message": "OWNER_MENU_ITEM_UPDATE_SUCCESS" }
```

---

### GET `/api/owner/restaurant/get-menu-particular-item`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| menuItemId | string | Yes |

**Success response (200):**

```json
{
  "message": "OWNER_ITEM_DETAILS_FETCH_SUCCESS",
  "particularItemDetails": { }
}
```

---

### POST `/api/owner/restaurant/update-counter-settings`

**Auth required:** Yes

**Request body:**

```json
{
  "counterId": "64f1a2b3c4d5e6f7a8b9c0d2",
  "action": "EDIT",
  "counterName": "Renamed Bar",
  "isTableService": true,
  "isSelfPickUp": false,
  "status": "ACTIVE"
}
```

**Success response (200):**

```json
{
  "message": "OWNER_COUNTER_UPDATE_SUCCESS",
  "counterSettings": { }
}
```

---

### GET `/api/owner/restaurant/get-counter-settings`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| counterId | string | Yes |

**Success response (200):**

```json
{
  "message": "OWNER_COUNTER_SETTINGS_FETCH_SUCCESS",
  "counterSettings": { }
}
```

---

### POST `/api/owner/restaurant/adding-tables`

**Auth required:** Yes

**Request body:**

```json
{
  "tableFrom": 1,
  "tableTo": 20,
  "counterIds": ["64f1a2b3c4d5e6f7a8b9c0d2"],
  "tableSectionName": "Garden"
}
```

**Success response (200):**

```json
{ "message": "OWNER_TABLES_ADD_SUCCESS" }
```

---

### GET `/api/owner/restaurant/get-tables`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "OWNER_TABLES_FETCH_SUCCESS",
  "data": [
    {
      "_id": "...",
      "tableCount": ["1", "2", "3"],
      "tableSectionName": "Garden",
      "tableSetionNo": 1,
      "counterIds": [ ]
    }
  ]
}
```

---

### POST `/api/owner/restaurant/create-discount-coupon`

**Auth required:** Yes

**Request body:**

```json
{
  "code": "SUMMER20",
  "type": "percentage",
  "value": 20,
  "maxDiscount": 50,
  "minAmount": 30,
  "usageLimit": 100,
  "startDate": "2026-06-01",
  "endDate": "2026-08-31",
  "description": "20% off all drinks",
  "colourTheme": "#FF5733"
}
```

`type` values: `"percentage"` or `"fixed"`

**Success response (200):**

```json
{ "message": "OWNER_DISCOUNT_CREATE_SUCCESS" }
```

---

### POST `/api/owner/restaurant/restaurant-open`

Toggle restaurant open/closed state.

**Auth required:** Yes

**Request body:**

```json
{ "isOpen": true }
```

**Success response (200):**

```json
{ "message": "OWNER_RESTAURANT_UPDATE_SUCCESS" }
```

---

### GET `/api/owner/restaurant/get-business-user-details`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "OWNER_BUSINESS_DETAILS_FETCH_SUCCESS",
  "response": {
    "entityName": "The Bar",
    "email": "owner@thebar.ch",
    "contactNumber": "+41791234567",
    "city": "Zurich",
    "zipcode": "8001",
    "entityType": "BAR",
    "entityContactNumber": "+41441234567",
    "country": "CH",
    "buildingName": "Bahnhofstrasse 1",
    "image": "https://s3.presigned.url/..."
  }
}
```

---

### GET `/api/owner/restaurant/get-feedbacks-from-users`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "OWNER_FEEDBACK_FETCH_SUCCESS",
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "entityId": "...",
      "answers": [
        { "questionId": "...", "value": 5 }
      ]
    }
  ]
}
```

---

### GET `/api/owner/restaurant/get-sales-report-history`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "OWNER_SALES_REPORT_HISTORY_FETCH_SUCCESS",
  "response": [ ]
}
```

---

### POST `/api/owner/restaurant/restaurant-cancel-order`

**Auth required:** Yes

**Request body:**

```json
{
  "orderId": "64f1a2b3c4d5e6f7a8b9c0de",
  "reason": "Out of stock"
}
```

**Success response (200):**

```json
{ "message": "OWNER_ORDER_CANCEL_SUCCESS" }
```

---

### POST `/api/owner/restaurant/delete-entity-account`

**Auth required:** Yes

**Request body:** Empty `{}`

**Success response (200):**

```json
{ "message": "OWNER_ENTITY_DELETE_SUCCESS" }
```

---

## 6. Owner — Events

### POST `/api/owner/restaurant/create-event`

**Auth required:** Yes  
**Content-Type:** `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| file | file | No | Event image |
| eventName | string | Yes | |
| serialType | string | Yes | Event type |
| isRepetitive | boolean | Yes | |
| repetitiveDays | string | No | JSON array e.g. `[0,0,1,1,1,0,0]` (Sun–Sat) |
| from | string | Yes | ISO datetime e.g. `2026-06-15T18:00:00.000Z` |
| to | string | Yes | ISO datetime |
| counterIds | string | Yes | JSON array of counter IDs |
| location | string | No | |
| isAllDay | boolean | No | |

**Success response (200):**

```json
{
  "message": "OWNER_EVENT_CREATE_SUCCESS",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0df",
    "eventName": "Friday Night",
    "from": "2026-06-15T18:00:00.000Z",
    "to": "2026-06-15T23:59:00.000Z",
    "isRepetitive": false,
    "counterIds": [ ]
  }
}
```

---

### POST `/api/owner/restaurant/delete-event`

**Auth required:** Yes

**Request body:**

```json
{ "eventId": "64f1a2b3c4d5e6f7a8b9c0df" }
```

**Success response (200):**

```json
{ "message": "OWNER_EVENT_DELETE_SUCCESS" }
```

---

### GET `/api/owner/restaurant/get-upcoming-events`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| filterBy | string | No — `"week"` or `"month"` |
| year | number | No |
| month | number | No |

**Success response (200):**

```json
{
  "message": "OWNER_UPCOMING_EVENTS_FETCH_SUCCESS",
  "upcomingEvents": [
    {
      "_id": "...",
      "eventName": "Friday Night",
      "from": "2026-06-15T18:00:00.000Z",
      "to": "2026-06-15T23:59:00.000Z",
      "isRepetitive": false,
      "image": "https://s3.presigned.url/...",
      "counters": [
        { "counterId": "...", "counterName": "Main Bar" }
      ]
    }
  ]
}
```

---

### GET `/api/owner/restaurant/get-ongoing-event-details`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "OWNER_ONGOING_EVENTS_FETCH_SUCCESS",
  "ongoingEventDetails": [
    {
      "_id": "...",
      "eventName": "Friday Night",
      "activeUsers": 42,
      "totalOrders": 108,
      "counters": [ ]
    }
  ]
}
```

---

### GET `/api/owner/restaurant/get-past-events-years`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "OWNER_PAST_EVENTS_YEARS_FETCH_SUCCESS",
  "pastEventsYear": [
    { "year": 2026 },
    { "year": 2025 }
  ]
}
```

---

### GET `/api/owner/restaurant/get-past-events-year-month`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| year | number | Yes |

**Success response (200):**

```json
{
  "message": "OWNER_PAST_EVENTS_MONTHS_FETCH_SUCCESS",
  "pastEventsMonths": [
    { "year": 2026, "month": 5 },
    { "year": 2026, "month": 4 }
  ]
}
```

---

### GET `/api/owner/restaurant/get-past-events-by-month`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| month | number | Yes |
| year | number | Yes |

**Success response (200):**

```json
{
  "message": "OWNER_PAST_EVENTS_FETCH_SUCCESS",
  "data": [ ]
}
```

---

### GET `/api/owner/restaurant/get-order-details-of-events`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| eventId | string | Yes |

**Success response (200):**

```json
{
  "message": "OWNER_ORDER_DETAILS_FETCH_SUCCESS",
  "orderDetailsOfEvents": {
    "orderGrouped": {
      "64f1a2b3c4d5e6f7a8b9c0d4": {
        "totalAmount": 250.00,
        "totalTicket": 20,
        "singlePrice": 12.50,
        "itemName": "Aperol Spritz"
      }
    },
    "totalAmout": 250.00,
    "totalTicket": 20
  }
}
```

---

## 7. Owner — Orders & Analytics

### GET `/api/orders/get-entity-orders`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| status | string | No |

**Success response (200):**

```json
{
  "message": "ORDER_FETCH_SUCCESS",
  "data": [ ],
  "orderProcessCount": 5,
  "readyOrders": 3,
  "completedOrders": 120,
  "cancelledOrders": 2
}
```

---

### GET `/api/orders/get-restaurant-orders-and-count`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "ORDER_FETCH_SUCCESS",
  "data": [ ],
  "totalRevenue": 4800.00
}
```

---

### GET `/api/orders/get-offline-orders`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "OFFLINE_ORDER_FETCH_SUCCESS",
  "data": [ ],
  "preparing": 2,
  "readyOrders": 1,
  "completedOrders": 45
}
```

---

### GET `/api/orders/get-entity-orders-group-by-years`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "ORDER_FETCH_SUCCESS",
  "previosuOrdersList": [ ]
}
```

---

### GET `/api/orders/get-event-order-summary`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| eventId | string | Yes |

**Success response (200):**

```json
{
  "message": "EVENT_REVENUE_FETCH_SUCCESS",
  "data": {
    "totalOrders": 108,
    "totalRevenue": 1350.00,
    "itemBreakdown": {
      "Aperol Spritz": 42,
      "Mojito": 30
    }
  }
}
```

---

## 8. Orders

### POST `/api/orders/create-order`

**Auth required:** Yes

**Request body:**

```json
{
  "entityId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "counterId": "64f1a2b3c4d5e6f7a8b9c0d2",
  "eventId": "64f1a2b3c4d5e6f7a8b9c0df",
  "items": [
    {
      "itemId": "64f1a2b3c4d5e6f7a8b9c0d4",
      "quantity": 2,
      "price": 12.50,
      "currency": "CHF"
    }
  ],
  "tableId": "64f1a2b3c4d5e6f7a8b9c0e0",
  "totalAmount": 25.00,
  "paymentMethod": "wallee",
  "specialInstructions": "No ice please",
  "note": "",
  "discount": 0,
  "discountCode": ""
}
```

`paymentMethod` values: `"cash"`, `"card"`, `"wallee"`

**Success response (200):**

```json
{
  "message": "ORDER_CREATE_SUCCESS",
  "response": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0de",
      "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "entityId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "items": [ ],
      "totalAmount": 25.00,
      "status": "PAYMENT_PROCESSING",
      "paymentMethod": "wallee",
      "createdAt": "2026-06-11T10:00:00.000Z"
    }
  ]
}
```

**Order status values:** `PAYMENT_PROCESSING`, `WAITING`, `IN_PROGRESS`, `READY`, `COMPLETED`, `CANCELLED`

---

### POST `/api/orders/create-offline-order`

**Auth required:** Yes

**Request body:**

```json
{
  "entityId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "counterId": "64f1a2b3c4d5e6f7a8b9c0d2",
  "items": [
    { "itemId": "...", "quantity": 1, "price": 12.50, "currency": "CHF" }
  ],
  "totalAmount": 12.50,
  "paymentMethod": "cash"
}
```

**Success response (200):**

```json
{
  "message": "OFFLINE_ORDER_CREATE_SUCCESS",
  "response": { }
}
```

---

### POST `/api/orders/update-status-of-order`

**Auth required:** Yes

**Request body:**

```json
{
  "orderId": "64f1a2b3c4d5e6f7a8b9c0de",
  "status": "IN_PROGRESS"
}
```

**Success response (200):**

```json
{ "message": "ORDER_STATUS_UPDATE_SUCCESS" }
```

---

### POST `/api/orders/cancel-order`

**Auth required:** Yes

**Request body:**

```json
{
  "orderId": "64f1a2b3c4d5e6f7a8b9c0de",
  "reason": "Changed my mind"
}
```

**Success response (200):**

```json
{ "message": "ORDER_CANCEL_SUCCESS" }
```

---

### GET `/api/orders/get-live-orders-user`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "ORDER_FETCH_SUCCESS",
  "liveOrders": [ ]
}
```

---

### GET `/api/orders/get-particular-live-order-details`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| orderId | string | Yes |

**Success response (200):**

```json
{
  "message": "ORDER_FETCH_SUCCESS",
  "liveOrders": { }
}
```

---

### GET `/api/orders/get-particular-live-order-details-customer`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| orderId | string | Yes |

**Success response (200):**

```json
{
  "message": "ORDER_FETCH_SUCCESS",
  "particularLiveOrder": { }
}
```

---

### GET `/api/orders/get-users-orders-group-by-years`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "ORDER_FETCH_SUCCESS",
  "previosuOrdersList": [ ]
}
```

---

### GET `/api/orders/get-users-orders-group-by-months`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "MONTHLY_ORDER_FETCH_SUCCESS",
  "ordersByMonthAndEntity": [ ]
}
```

---

### GET `/api/orders/get-users-restaurant-orders-count`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "USER_ORDERS_FETCH_SUCCESS",
  "userOrders": [ ]
}
```

---

### GET `/api/orders/get-past-ticket-years-customer`

**Auth required:** Yes

**Success response (200):**

```json
{
  "message": "ORDER_FETCH_SUCCESS",
  "pastTicketYearsData": [ ]
}
```

---

## 9. Wallee Payments

### POST `/api/wallee/create-payment`

**Auth required:** Yes

**Request body:**

```json
{
  "amount": 25.00,
  "currency": "CHF",
  "eventId": "64f1a2b3c4d5e6f7a8b9c0df",
  "paymentMethodType": "card"
}
```

**Success response (200):**

```json
{
  "paymentPageUrl": "https://payment.wallee.com/pay/...",
  "transactionId": 987654321,
  "type": "payment_page",
  "state": "PENDING"
}
```

---

### GET `/api/wallee/get-payment-status`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| transactionId | number | Yes |
| entityId | string | No |

**Success response (200):**

```json
{
  "data": {
    "state": "FULFILL",
    "transactionId": 987654321,
    "currency": "CHF",
    "authorizationAmount": 25.00,
    "completedOn": "2026-06-11T10:05:00.000Z",
    "failedOn": null,
    "failureReason": null,
    "spaceId": 89431
  }
}
```

`state` values: `FULFILL`, `AUTHORIZED`, `COMPLETED`, `FAILED`, `PENDING`

---

### POST `/api/wallee/webhook`

Wallee payment status callback. Called by Wallee, not client apps.

**Auth required:** No (signature verification)

**Request body:** Raw JSON from Wallee (do not send manually)

**Success response (200):**

```json
{ "success": true }
```

---

### POST `/api/wallee/account-link`

Link a Wallee space to the owner's entity.

**Auth required:** Yes

**Request body:**

```json
{
  "spaceId": 89431
}
```

**Success response (200):**

```json
{
  "success": true,
  "message": "Space linked successfully",
  "spaceId": 89431,
  "spaceName": "The Bar Payments",
  "spaceState": "ACTIVE"
}
```

---

### GET `/api/wallee/check-account-status`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| entityId | string | Yes |

**Success response (200):**

```json
{
  "success": true,
  "hasMissingFields": false,
  "missingFields": [],
  "isOnboarded": true,
  "spaceState": "ACTIVE"
}
```

---

### GET `/api/wallee/get-wallee-space`

**Auth required:** Yes

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| spaceId | number | Yes |

**Success response (200):**

```json
{
  "message": "WALLEE_SPACE_FETCH_SUCCESS",
  "response": {
    "space": {
      "id": 89431,
      "name": "The Bar Payments",
      "state": "ACTIVE",
      "primaryCurrency": "CHF",
      "administratorEmail": "owner@thebar.ch",
      "postalAddress": { }
    },
    "paymentMethodConfigurations": [],
    "bankAccounts": []
  }
}
```

---

## 10. Admin

### POST `/api/admins/login-admin`

**Auth required:** No

**Request body:**

```json
{
  "email": "admin@barfly.ch",
  "password": "AdminPass123!"
}
```

**Success response (200):**

```json
{
  "message": "ADMIN_LOGIN_SUCCESS",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "adminDetails": {
    "_id": "...",
    "email": "admin@barfly.ch",
    "role": "ADMIN"
  }
}
```

---

### GET `/api/admins/get-users`

**Auth required:** Yes (Admin token)

**Success response (200):**

```json
{
  "message": "ADMIN_USERS_FETCH_SUCCESS",
  "users": [ ]
}
```

---

### GET `/api/admins/get-restaurants`

**Auth required:** Yes (Admin token)

**Success response (200):**

```json
{
  "message": "ADMIN_RESTAURANTS_FETCH_SUCCESS",
  "restaurants": [ ]
}
```

---

### GET `/api/admins/get-restaurants-orders`

**Auth required:** Yes (Admin token)

**Success response (200):**

```json
{
  "message": "ADMIN_ORDERS_FETCH_SUCCESS",
  "orders": [ ]
}
```

---

### GET `/api/admins/get-transaction-logs`

**Auth required:** Yes (Admin token)

**Success response (200):**

```json
{
  "message": "ADMIN_TRANSACTION_LOGS_FETCH_SUCCESS",
  "transactionLogs": [ ]
}
```

---

### GET `/api/admins/get-dashboard-analytics`

**Auth required:** Yes (Admin token)

**Success response (200):**

```json
{
  "message": "ADMIN_ANALYTICS_FETCH_SUCCESS",
  "analytics": {
    "totalUsers": 1200,
    "totalRestaurants": 45,
    "totalOrders": 8900,
    "totalRevenue": 125000.00
  }
}
```

---

### POST `/api/admins/edit-restaurants-or-users`

Block/unblock a user or restaurant.

**Auth required:** Yes (Admin token)

**Request body:**

```json
{
  "userId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "isBlocked": true
}
```

**Success response (200):**

```json
{ "message": "ADMIN_USER_UPDATE_SUCCESS" }
```

---

### POST `/api/admins/add-platform-fees`

**Auth required:** Yes (Admin token)

**Request body:**

```json
{
  "platformFee": 0.05
}
```

**Success response (200):**

```json
{ "message": "ADMIN_PLATFORM_FEE_UPDATE_SUCCESS" }
```

---

### GET `/api/admins/total-revenue-of-entity`

**Auth required:** Yes (Admin token)

**Success response (200):**

```json
{
  "message": "ADMIN_REVENUE_FETCH_SUCCESS",
  "totalAmount": 125000.00
}
```

---

### POST `/api/admins/get-money-spent-by-user`

**Auth required:** Yes (Admin token)

**Request body:**

```json
{
  "userId": "64f1a2b3c4d5e6f7a8b9c0d1"
}
```

**Success response (200):**

```json
{
  "message": "ADMIN_REVENUE_FETCH_SUCCESS",
  "noOfOrders": 42,
  "moneySpent": 580.00
}
```

---

## 11. Utility

### GET `/api/health-check`

**Auth required:** No

**Success response (200):**

```json
{
  "message": "countr service running...!",
  "time": "2026-06-11T10:00:00.000Z"
}
```

---

### POST `/api/upload-file`

**Auth required:** No  
**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| file | file | Yes |

**Success response (200):**

```json
{
  "message": "FILE_UPLOAD_SUCCESS",
  "location": "https://s3.presigned.url/..."
}
```

---

### GET `/api/download-file`

**Auth required:** No

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| fileName | string | Yes |

**Success response (200):**

```json
{
  "fileStream": "https://s3.presigned.url/..."
}
```

---

### POST `/api/register-token`

Register a Firebase Cloud Messaging (FCM) token for push notifications.

**Auth required:** Yes

**Request body:**

```json
{
  "fcmToken": "dGhpcyBpcyBhIHRlc3QgdG9rZW4..."
}
```

**Success response (200):**

```json
{ "message": "FCM_TOKEN_REGISTER_SUCCESS" }
```

---

### POST `/send-firebase-notification`

**Auth required:** Yes

**Request body:**

```json
{
  "token": "dGhpcyBpcyBhIHRlc3QgdG9rZW4...",
  "title": "Your order is ready!",
  "body": "Pick up at counter 2"
}
```

**Success response (200):**

```json
{
  "success": true,
  "message": "FIREBASE_NOTIFICATION_SENT"
}
```

---

### GET `/api/get-trade-and-download-pdf`

**Auth required:** Yes

**Success response (200):**

```json
{
  "downloadUrl": "https://s3.presigned.url/report.pdf"
}
```

---

## Appendix — Common Headers

```
Content-Type: application/json
Authorization: Bearer <token>
Accept-Language: en   (or "de" for German)
```

## Appendix — Order Status Flow

```
PAYMENT_PROCESSING → WAITING → IN_PROGRESS → READY → COMPLETED
                                                    ↘ CANCELLED
```

## Appendix — User Roles

| Role | Login Endpoint |
|------|---------------|
| `CUSTOMER` | `/api/customer/auth/login` |
| `STORE_OWNER` | `/api/owner/auth/login` |
| `ADMIN` | `/api/admins/login-admin` |
