const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const {
  createPaymentIntent,
  confirmPaymentIntent,
  createPaymentMethod,
  getPaymentStatus,
  createStripeOnboardingLink,
  getStripeAccount,
  retrieveAccountBalance,
  checkStripeAccountMissingFields,
  continueStripeOnboarding,
} = require("../CustomerServices/stripeServices");
const { STATUS_CODES } = require("../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("../Utils/translator");

router.post("/create-payment", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const result = await createPaymentIntent(req);

    // Handle Checkout Session (for TWINT)
    if (result.type === "checkout_session") {
      return res.status(STATUS_CODES.OK).json({
        type: "checkout_session",
        url: result.url,
        id: result.id,
      });
    }

    // Handle Payment Intent (for other payment methods)
    // Return clientSecret directly for backward compatibility with ClientSecretModel
    return res.status(STATUS_CODES.OK).json({
      clientSecret: result.client_secret,
      type: "payment_intent", // Optional: frontend can check this
      id: result.id, // Optional: frontend can check this
    });
  } catch (error) {
    console.error("Error while creating intent: ", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("STRIPE_CREATE_PAYMENT_ERROR", lang),
    });
  }
});

router.post("/confirm-payment", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const paymentIntent = await confirmPaymentIntent(req);
    return res.status(STATUS_CODES.OK).json({ status: paymentIntent.status });
  } catch (error) {
    console.error("Error while confirming the payment: ", error);
    res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("STRIPE_CONFIRM_PAYMENT_ERROR", lang),
    });
  }
});

router.get("/get-payment-status", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const paymentIntent = await getPaymentStatus(req);
    return res.status(STATUS_CODES.OK).json({ data: paymentIntent });
  } catch (error) {
    console.error("Error while getting payments", error);
    res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("STRIPE_PAYMENT_STATUS_ERROR", lang),
    });
  }
});

router.post("/account-link", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await createStripeOnboardingLink(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error while creating the account:", error);
    res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("STRIPE_ACCOUNT_LINK_ERROR", lang),
    });
  }
});

router.get("/retrieve-account-balance", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await retrieveAccountBalance(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("STRIPE_ACCOUNT_BALANCE_SUCCESS", lang), response });
  } catch (error) {
    console.error("Error while checking the account balance");

    res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("STRIPE_ACCOUNT_BALANCE_ERROR", lang),
    });
  }
});

router.get("/get-stripe-accounts", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await getStripeAccount(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("STRIPE_ACCOUNTS_FETCH_SUCCESS", lang), response });
  } catch (error) {
    console.error("Error while creating the account");

    res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("STRIPE_ACCOUNTS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-account-missing-fields", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await checkStripeAccountMissingFields(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("STRIPE_ACCOUNT_MISSING_FIELDS_SUCCESS", lang),
      response,
    });
  } catch (error) {
    console.error("Error while fetching missing fields.");

    res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("STRIPE_ACCOUNT_MISSING_FIELDS_ERROR", lang),
    });
  }
});

router.post("/create-onboarding-link-again", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await continueStripeOnboarding(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error while generating the link.");

    res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("STRIPE_ONBOARDING_LINK_ERROR", lang),
    });
  }
});

// /**
//  * Controller to handle Stripe webhooks.
//  * Note: Make sure to use express.raw({ type: "application/json" }) middleware for this route.
//  */
// const stripeWebhook = (req, res) => {
//   const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
//   const sig = req.headers["stripe-signature"];
//   let event;

//   try {
//     event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
//   } catch (err) {
//     console.error("Webhook signature verification failed:", err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   // Handle different webhook events
//   switch (event.type) {
//     case "payment_intent.succeeded":
//       {
//         const paymentIntent = event.data.object;
//         // Example: Update user/order record
//         // user.paymentStatus = 'succeeded';
//         // user.stripePaymentIntentId = paymentIntent.id;
//         console.log("Payment succeeded:", paymentIntent.id);
//       }
//       break;
//     case "payment_intent.payment_failed":
//       {
//         const paymentIntent = event.data.object;
//         // Example: Update user/order record with failure status
//         // user.paymentStatus = 'failed';
//         console.log("Payment failed:", paymentIntent.id);
//       }
//       break;
//     default:
//       console.log(`Unhandled event type: ${event.type}`);
//   }

//   res.json({ received: true });
// };

module.exports = router;
