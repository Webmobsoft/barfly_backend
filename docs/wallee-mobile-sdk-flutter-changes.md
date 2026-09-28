# Flutter Changes — Wallee Mobile SDK Token

Companion to the backend change that adds `mobileSdkToken` to `POST /api/wallee/create-payment`.
This document lists what the **Flutter app** must change to use the native Wallee Mobile SDK
instead of the Hosted Payment Page WebView.

## Background

TWINT cannot complete reliably inside a WebView — it hands off to the user's bank app and returns
via native URL schemes, which an embedded WebView can't drive. The native Wallee Mobile SDK
handles TWINT, card payments, and 3-D Secure. The backend now returns a **transaction credentials
access token** (`mobileSdkToken`) that the SDK's `launch(token)` requires.

The rollout is backward compatible: if `mobileSdkToken` is present → launch the native SDK
(target path); if missing/empty → fall back to the WebView using `paymentPageUrl` (transitional,
removed once the SDK path is verified).

## Backend contract (already shipped)

`POST /api/wallee/create-payment` response:

```jsonc
{
  "transactionId": "123456",
  "mobileSdkToken": "<credentials string>", // NEW — non-empty on success, "" on failure
  "paymentPageUrl": "https://app-wallee.com/...", // keep as WebView fallback
  "type": "payment_page",
  "state": "PENDING"
}
```

`GET /api/wallee/get-payment-status?transactionId={id}&eventId={eventId}` — **unchanged**.
A payment is successful when `state` is `FULFILL` or `AUTHORIZED`.

---

## Required Flutter changes

### 1. Parse the new field

Add `mobileSdkToken` to the `create-payment` response model (nullable), keep `paymentPageUrl`:

```dart
class CreatePaymentResponse {
  final String transactionId;
  final String? mobileSdkToken; // new
  final String? paymentPageUrl; // fallback
  final String? state;

  CreatePaymentResponse.fromJson(Map<String, dynamic> json)
      : transactionId = json['transactionId'].toString(),
        mobileSdkToken = json['mobileSdkToken'] as String?,
        paymentPageUrl = json['paymentPageUrl'] as String?,
        state = json['state'] as String?;
}
```

### 2. Add the native Wallee Mobile SDK

There is no official Flutter plugin, so integrate the native SDKs and bridge with a
`MethodChannel` (or a thin wrapper plugin):

- **Android:** https://github.com/wallee-payment/android-mobile-sdk
- **iOS (SPM):** https://github.com/wallee-payment/ios-mobile-sdk-spm

Bridge a single method, e.g. `launchWalleePayment(token)`, returning success / failure / cancel.

### 3. Configure native URL-scheme return handling

TWINT (and 3-DS) leave the app (bank-app / browser switch) and return via a URL scheme. This is a
**client-side SDK deep link**, configured on the app — **not** the transaction completion URLs.

- **iOS:** register the `countrwallee` URL scheme in `CFBundleURLTypes` (`Info.plist`) and route
  the return into the SDK from `application(_:open:options:)` / the scene delegate.
- **Android:** the SDK handles the return internally; no manual intent-filter routing needed for
  the SDK path (follow the Android SDK's integration guide).

> Note: the backend's `countr://payment/success` and `countr://payment/cancel` values are the
> **Hosted Payment Page / WebView** completion URLs. The native SDK does **not** use them — it
> uses the client deep link above and reports the outcome through its own result callback
> (see step 6). Those completion URLs stay in place only for the WebView fallback.

### 4. Branch the payment flow

```dart
Future<void> startPayment(CreatePaymentResponse res) async {
  final token = res.mobileSdkToken;
  if (token != null && token.isNotEmpty) {
    // Target path — native SDK
    await walleeSdk.launch(token);
  } else if (res.paymentPageUrl != null) {
    // Transitional fallback — WebView
    await openWebView(res.paymentPageUrl!);
  } else {
    throw Exception('No payment method available');
  }
}
```

### 5. Verify via `get-payment-status` (source of truth)

After the SDK returns (any result), call the status endpoint and decide the outcome from it — do
not trust the SDK callback alone:

```dart
final status = await api.getPaymentStatus(
  transactionId: res.transactionId,
  eventId: eventId,
);
final ok = status.state == 'FULFILL' || status.state == 'AUTHORIZED';
```

### 6. Handle SDK result callbacks

Map the native SDK results (success / failure / user-cancel) to app UI, then reconcile against
the status endpoint before showing a final success/failure screen.

---

## Checklist

- [ ] Add `mobileSdkToken` to the create-payment response model
- [ ] Add Android + iOS native Wallee SDK dependencies
- [ ] Add `MethodChannel` bridge (`launch(token)` → result)
- [ ] Configure return URL schemes (Android manifest + iOS Info.plist)
- [ ] Branch: token present → native SDK, else WebView fallback
- [ ] Call `get-payment-status` after SDK return; success = `FULFILL` | `AUTHORIZED`
- [ ] Map SDK success / failure / cancel to UI
- [ ] Test TWINT end-to-end on a real device (bank-app handoff + return)
- [ ] Regression-test the WebView fallback (force empty token)

## References

- Wallee — create transaction credentials:
  https://app-wallee.com/doc/api/web-service#transaction-service--create-transaction-credentials
- Android SDK: https://github.com/wallee-payment/android-mobile-sdk
- iOS SDK (SPM): https://github.com/wallee-payment/ios-mobile-sdk-spm
