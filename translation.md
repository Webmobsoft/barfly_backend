# Translation (i18n) Setup Guide — Barfly Backend

This document explains how the translation system works in this project so you can follow the same pattern when adding new features.

---

## Overview

We support **English (`en`)** and **German (`de`)** across all user-facing backend strings — API responses, validation errors, and (eventually) email content. Every user-facing string should go through the translation helper — no hardcoded strings in handlers, services, or routes.

There is a **single** translation function plus a small helper for resolving the request's language. Both are exported from one module:

```js
const { t, getLanguageFromRequest } = require("../Utils/translator");
```

No separate `t_validation()` or `t_email()` — the same `t()` handles every kind of string. Domain is encoded in the **key prefix**, not in separate files.

---

## File layout

```
Utils/
└── translator.js                 # The t() implementation + language resolver

Assets/
└── translation/
    ├── en.json                   # English strings — currently ~450 keys
    └── de.json                   # German strings — must mirror en.json
```

**Rule:** `en.json` and `de.json` must be exact key-for-key mirrors. Every key added to `en.json` must also be added to `de.json` with the German value, and vice versa. The current state has 451 keys in `en.json` and 450 keys in `de.json` — a one-key drift that should not happen for new work.

---

## Key naming convention

Keys are **flat UPPER_SNAKE_CASE** strings — **not** dot-notated paths.

The first segment is the module / domain, the rest describes what the message is about:

```
{MODULE}_{SUBJECT}_{ACTION_OR_STATE}
```

Examples taken from the current codebase:

| Key | Used for |
|---|---|
| `OWNER_EVENT_NOT_FOUND` | Owner-side error when an event lookup fails |
| `OWNER_EVENT_DUPLICATE_TIME_ERROR` | Owner-side error when creating an event clashes |
| `STRIPE_ACCOUNT_BALANCE_SUCCESS` | Stripe account balance fetch success |
| `CARD_ADDED_SUCCESS` | Card added confirmation |
| `OTP_EXPIRED` | OTP no longer valid |
| `EMAIL_ALREADY_EXISTS` | Duplicate email error |

### Existing module prefixes

These are the prefixes already in `en.json` (frequency in parentheses):

| Prefix | Count | Domain |
|---|---|---|
| `OWNER_` | 160 | Owner-side endpoints |
| `ADMIN_` | 40 | Admin panel |
| `STRIPE_` | 30 | Stripe integration |
| `WALLEE_` | 29 | Wallee integration |
| `ORDER_` | 19 | Order lifecycle |
| `CUSTOMER_` | 15 | Customer-side endpoints |
| `USER_` | 13 | Generic user |
| `OTP_` | 10 | OTP flows |
| `EVENT_` | 9 | Events |
| `FEEDBACK_` | 7 | Feedback |
| `ENTITY_` | 7 | Entities (bars/restaurants) |
| `EMAIL_` | 7 | Email-related errors / messages |
| `SEARCH_`, `FAVOURITE_`, `CARD_` | 6 each | Search, favourites, cards |

When adding a new key, **reuse an existing prefix** if it fits. Only invent a new prefix for a genuinely new domain — and use the same prefix consistently across both `en.json` and `de.json`.

---

## How `t()` works

```js
t(key, language, variables)
```

- **`key`** — the UPPER_SNAKE_CASE string.
- **`language`** — either `"en"` or `"de"`. Typically resolved with `getLanguageFromRequest(req)`.
- **`variables`** — optional object of values to interpolate.

Implementation summary ([Utils/translator.js](Utils/translator.js)):
1. Loads `Assets/translation/{language}.json` on first use; result is cached in memory.
2. Looks up the key in that file.
3. If missing, falls back to `en.json`.
4. If still missing, returns the **key itself** so missing strings are visible during development.
5. Performs `{{variable}}` interpolation.

### Interpolation syntax — `{{variable}}` (double curly braces)

```js
t("OWNER_EVENT_REPETITIVE_DAYS_INVALID", lang, { day: "Monday" });
```

`en.json`:
```json
{
  "OWNER_EVENT_REPETITIVE_DAYS_INVALID": "Invalid repetitive day: {{day}}"
}
```

`de.json`:
```json
{
  "OWNER_EVENT_REPETITIVE_DAYS_INVALID": "Ungültiger wiederkehrender Tag: {{day}}"
}
```

⚠️ This is **double-curly** — not single. Single braces (`{day}`) will not interpolate.

---

## How `getLanguageFromRequest(req)` works

Resolves the language to use, in this priority order:

| Priority | Source | When it kicks in |
|---|---|---|
| 1 | `req.language` (set by some middleware / payload) | Public endpoints that pass language in the request body |
| 2 | `req.lang` | Alternate property some routes attach |
| 3 | `Accept-Language` header | Falls back to whatever the mobile app sends |
| 4 | Default: `"en"` | Nothing else found |

Returned value is normalized — the primary language code only, so `Accept-Language: de-CH,de;q=0.9` becomes `"de"`.

---

## Usage patterns in this codebase

### 1. API responses / error messages (services + controllers)

Every service handler that can return a translated string starts with the same pattern:

```js
const { t, getLanguageFromRequest } = require("../Utils/translator");

module.exports.someHandler = async (req) => {
  const lang = getLanguageFromRequest(req);
  // ...
};
```

#### Throwing a translated error

```js
const throwError = require("../Utils/throwError");

const event = await Event.findById(eventId);
if (!event) {
  throwError({
    status: STATUS_CODES.BAD_REQUEST,
    message: t("OWNER_EVENT_NOT_FOUND", lang),
  });
}
```

#### Returning a translated success message

```js
return { message: t("OWNER_EVENT_DELETE_SUCCESS", lang) };
```

#### Interpolating a variable

```js
throwError({
  status: STATUS_CODES.BAD_REQUEST,
  message: t("EMAIL_ALREADY_EXISTS", lang, { email }),
});
```

`en.json`:
```json
{ "EMAIL_ALREADY_EXISTS": "Email {{email}} already exists." }
```

### 2. Validation errors

There is no separate `t_validation()` — validation errors use the same `t()` helper. Convention is to use a descriptive `*_INVALID` or `*_REQUIRED` suffix:

```js
if (!Array.isArray(categories) || categories.length === 0) {
  throwError({
    status: STATUS_CODES.BAD_REQUEST,
    message: t("OWNER_CATEGORIES_REQUIRED", lang),
  });
}
```

### 3. Email subjects and bodies — ⚠️ not yet integrated

Email templates ([Utils/emailTemplates/](Utils/emailTemplates/)) and their subject lines are **currently hardcoded in English** at the call sites. Examples that still need to be moved into the translation files:

| Hardcoded string | Location |
|---|---|
| `"Welcome to Countr! 🎉"` | [Customer auth:97](Controller/Customer/Authentication/services.js#L97), [Owner auth:222](Controller/Owner/Authentication/service.js#L222), [Admin:90](Admin/services.js#L90) |
| `"Your Verification Code - Countr"` | [Customer auth services.js:299](Controller/Customer/Authentication/services.js#L299) |
| `"COUNTR: OTP for Email Update"` | [Customer service:1387](Controller/Customer/service.js#L1387), [Owner service:3604](Controller/Owner/service.js#L3604) |
| `"Your Order Report"` | [PdfServices/customerOrderReport.js:46](PdfServices/customerOrderReport.js#L46) |
| Entire HTML body of every template in `Utils/emailTemplates/` | various |

When the German email translation is delivered, the work is:
1. Add keys like `EMAIL_WELCOME_SUBJECT`, `EMAIL_OTP_SUBJECT`, `EMAIL_WELCOME_BODY_GREETING`, `EMAIL_WELCOME_BODY_INTRO` etc. to both `en.json` and `de.json`.
2. Refactor each email template function to accept a `lang` argument and use `t()` for every visible string.
3. Refactor each call site to pass the resolved language and use `t()` for the subject too.

The full inventory of strings that need translation is in the PDF at [scripts/email-templates-for-translation.pdf](scripts/email-templates-for-translation.pdf).

---

## Step-by-step: adding translations for a new feature

### Step 1 — Pick a key name

Use an existing module prefix if it fits. Use the `MODULE_SUBJECT_ACTION` shape. Example for a new "tip" feature on the order:

```
ORDER_TIP_AMOUNT_INVALID
ORDER_TIP_ADDED_SUCCESS
ORDER_TIP_NOT_ALLOWED_AFTER_COMPLETION
```

### Step 2 — Add the key to BOTH language files

`Assets/translation/en.json`:
```json
{
  "ORDER_TIP_AMOUNT_INVALID": "Tip amount must be a positive number.",
  "ORDER_TIP_ADDED_SUCCESS": "Tip of {{amount}} {{currency}} added successfully."
}
```

`Assets/translation/de.json`:
```json
{
  "ORDER_TIP_AMOUNT_INVALID": "Trinkgeldbetrag muss eine positive Zahl sein.",
  "ORDER_TIP_ADDED_SUCCESS": "Trinkgeld von {{amount}} {{currency}} erfolgreich hinzugefügt."
}
```

### Step 3 — Use `t()` in your handler

```js
const { t, getLanguageFromRequest } = require("../../Utils/translator");

module.exports.addTip = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { amount, currency } = req.body;

  if (!amount || amount <= 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_TIP_AMOUNT_INVALID", lang),
    });
  }
  // ...
  return { message: t("ORDER_TIP_ADDED_SUCCESS", lang, { amount, currency }) };
};
```

### Step 4 — Restart the server

The translation file cache is populated on first read and persists for the lifetime of the process. After editing `en.json` / `de.json`, restart the server for the new keys to load. (No hot-reload today.)

---

## Common mistakes to avoid

### ❌ Don't hardcode user-facing strings

```js
// WRONG
throwError({ status: 400, message: "Event not found" });

// RIGHT
throwError({ status: 400, message: t("OWNER_EVENT_NOT_FOUND", lang) });
```

### ❌ Don't add a key to only one language file

The `en.json` and `de.json` files must mirror each other. If you add `ORDER_TIP_ADDED_SUCCESS` to `en.json`, the German version must be added to `de.json` in the **same commit**. Missing-key fallback exists for safety, but relying on it means German users silently see English.

### ❌ Don't use single curly braces

```js
// WRONG — single braces are not interpolated
"WELCOME_MESSAGE": "Hello {name}"

// RIGHT — double braces match the regex in translator.js
"WELCOME_MESSAGE": "Hello {{name}}"
```

### ❌ Don't build keys dynamically with template literals

```js
// WRONG — the key isn't traceable, can't be statically extracted
t(`OWNER_ORDER_${status}`, lang);

// RIGHT — pass status as a variable
t("OWNER_ORDER_STATUS_CHANGED", lang, { status });
```

### ❌ Don't forget `getLanguageFromRequest(req)` in new services

Every handler that emits a user-facing string needs the line:

```js
const lang = getLanguageFromRequest(req);
```

It's cheap (just reads a few fields off `req`) and it's the only thing that tells `t()` which language to serve.

### ❌ Don't translate placeholder names

The text inside `{{ }}` is a variable name — keep it exactly the same in every language:

```json
// en.json — CORRECT
{ "ORDER_TIP_ADDED_SUCCESS": "Tip of {{amount}} {{currency}} added successfully." }

// de.json — CORRECT
{ "ORDER_TIP_ADDED_SUCCESS": "Trinkgeld von {{amount}} {{currency}} erfolgreich hinzugefügt." }

// de.json — WRONG (don't translate {{amount}} to {{betrag}})
{ "ORDER_TIP_ADDED_SUCCESS": "Trinkgeld von {{betrag}} {{währung}} erfolgreich hinzugefügt." }
```

---

## Quick reference

```js
// Import
const { t, getLanguageFromRequest } = require("../Utils/translator");
// (adjust the relative path for your file)

// 1. Resolve the language once per handler
const lang = getLanguageFromRequest(req);

// 2. Use it
t("MODULE_KEY_NAME", lang);
t("MODULE_KEY_NAME", lang, { variable: value });

// 3. Common patterns
throwError({ status: STATUS_CODES.BAD_REQUEST, message: t("OWNER_EVENT_NOT_FOUND", lang) });
return { message: t("OWNER_EVENT_DELETE_SUCCESS", lang) };
```

---

## Known gaps / future work

1. **Emails are not yet translated.** All template HTML in [Utils/emailTemplates/](Utils/emailTemplates/), all subject lines at call sites, and the two inline plain-text emails (Owner email-update OTP and Order Report). Translation source PDF: [scripts/email-templates-for-translation.pdf](scripts/email-templates-for-translation.pdf).
2. **One key drift** between `en.json` (451 keys) and `de.json` (450 keys). Should be reconciled.
3. **No build-time check** for missing or unused keys — a lint script that compares the two JSON files and grep-validates that every key is used somewhere would catch drift early.
4. **No language hot-reload** — server must be restarted to pick up changes to the JSON files.
