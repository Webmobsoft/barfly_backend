const express = require("express");
const router = express.Router();

const {
  createWalleeTransaction,
  getWalleeTransactionStatus,
  handleWalleeWebhook,
  createWalleeOnboardingLink,
  continueWalleeOnboarding,
  checkWalleeAccountStatus,
  getWalleeSpace,
} = require("../CustomerServices/walleeServices");
const { STATUS_CODES } = require("../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("../Utils/translator");

/**
 * Create a payment transaction and get payment page URL
 * POST /api/wallee/create-payment
 *
 * Request body:
 * {
 *   amount: number,      // Amount in the specified currency (e.g., 10.50)
 *   currency: string,    // Currency code (e.g., "CHF", "EUR")
 *   eventId: string,     // Event ID for the order
 *   paymentMethodType: string // Optional: "card", "twint", etc.
 * }
 *
 * Response:
 * {
 *   type: "payment_page",
 *   url: string,           // Payment page URL to redirect user to
 *   transactionId: number  // Wallee transaction ID
 * }
 */
router.post("/create-payment", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const result = await createWalleeTransaction(req);

    // Match frontend expected response format
    return res.status(STATUS_CODES.OK).json({
      paymentPageUrl: result.url, // Frontend expects 'paymentPageUrl' not 'url'
      transactionId: result.transactionId,
      // Include additional fields for backward compatibility
      type: result.type,
      state: result.state,
    });
  } catch (error) {
    console.error("Error while creating Wallee payment:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_CREATE_PAYMENT_ERROR", lang),
    });
  }
});

/**
 * Get payment transaction status
 * GET /api/wallee/get-payment-status?transactionId=123
 *
 * Query params:
 * - transactionId: Wallee transaction ID
 *
 * Response:
 * {
 *   transactionId: number,
 *   state: string,
 *   currency: string,
 *   authorizationAmount: number,
 *   completedOn: date,
 *   failedOn: date,
 *   failureReason: object
 * }
 */
/**
 * Get payment transaction status
 * GET /api/wallee/get-payment-status?transactionId=123&entityId=xxx
 *
 * Query params:
 * - transactionId: Wallee transaction ID (REQUIRED)
 * - entityId: Entity ID (OPTIONAL - helps find merchant space)
 *
 * Response (matches frontend expectation):
 * {
 *   data: {
 *     state: "FULFILL" | "AUTHORIZED" | "PENDING" | "FAILED" | "COMPLETED" | ...
 *     transactionId: number,
 *     currency: string,
 *     authorizationAmount: number,
 *     completedOn: date,
 *     failedOn: date,
 *     failureReason: object
 *   }
 * }
 */
router.get("/get-payment-status", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const transactionStatus = await getWalleeTransactionStatus(req);

    // Ensure response matches frontend expectation: { data: { state: ... } }
    // Frontend checks data.state for "FULFILL" or "AUTHORIZED"
    return res.status(STATUS_CODES.OK).json({
      data: {
        state: transactionStatus.state, // Frontend checks this field
        transactionId: transactionStatus.transactionId,
        currency: transactionStatus.currency,
        authorizationAmount: transactionStatus.authorizationAmount,
        completedOn: transactionStatus.completedOn,
        failedOn: transactionStatus.failedOn,
        failureReason: transactionStatus.failureReason,
        spaceId: transactionStatus.spaceId, // Include space ID if available
      },
    });
  } catch (error) {
    console.error("Error while getting Wallee payment status:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_PAYMENT_STATUS_ERROR", lang),
    });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    const result = await handleWalleeWebhook(req);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(error.status || 500).json({ message: error.message });
  }
});

/**
 * Store merchant's Wallee Space ID
 * POST /api/wallee/account-link
 *
 * In this model, merchants create their own Wallee space on Wallee dashboard
 * and provide the Space ID to the platform for storage.
 *
 * Request body:
 * {
 *   spaceId: number      // REQUIRED - Wallee Space ID provided by merchant
 * }
 *
 * Response:
 * {
 *   success: true,
 *   message: string,
 *   spaceId: number,     // Stored Wallee space ID
 *   spaceName: string,   // Space name from Wallee
 *   spaceState: string   // Space state (e.g., "ACTIVE")
 * }
 */
router.post("/account-link", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await createWalleeOnboardingLink(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error while creating Wallee onboarding link:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_ONBOARDING_LINK_ERROR", lang),
    });
  }
});

/**
 * Continue/resume merchant onboarding
 * POST /api/wallee/create-onboarding-link-again
 *
 * Request body:
 * {
 *   platform: string     // "app" or "web"
 * }
 *
 * Response:
 * {
 *   success: true,
 *   url: string,          // Onboarding URL
 *   spaceId: number      // Wallee space ID
 * }
 */

/**
 * Check merchant account status
 * GET /api/wallee/check-account-status?entityId=xxx
 *
 * Query params:
 * - entityId: Entity ID
 *
 * Response:
 * {
 *   success: true,
 *   hasMissingFields: boolean,
 *   missingFields: string[],
 *   isOnboarded: boolean,
 *   spaceState: string
 * }
 */
router.get("/check-account-status", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await checkWalleeAccountStatus(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error while checking Wallee account status:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_ACCOUNT_CHECK_ERROR", lang),
    });
  }
});

/**
 * Get Wallee Space details
 * GET /api/wallee/get-wallee-space?spaceId=12345
 *
 * Query params:
 * - spaceId: number (REQUIRED) - Wallee Space ID
 *
 * Response:
 * {
 *   message: string,
 *   response: {
 *     space: {
 *       id: number,
 *       name: string,
 *       state: string,
 *       primaryCurrency: string,
 *       administratorEmail: string,
 *       postalAddress: object,
 *       ...
 *     },
 *     paymentMethodConfigurations: array,
 *     bankAccounts: array
 *   }
 * }
 */
router.get("/get-wallee-space", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await getWalleeSpace(req);

    // If there's an error in the response, return error
    if (response.error) {
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: response.error,
      });
    }

    return res.status(STATUS_CODES.OK).json({
      message: t("WALLEE_SPACE_FETCH_SUCCESS", lang),
      response: response,
    });
  } catch (error) {
    console.error("Error while fetching Wallee space:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("WALLEE_SPACE_FETCH_ERROR", lang),
    });
  }
});

// NOTE: Webhook endpoint (/api/wallee/webhook) is registered in app.js
// BEFORE bodyParser.json() to receive raw body for signature verification

module.exports = router;
