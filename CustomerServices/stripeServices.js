const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const StripeModel = require("./../Models/Stripe");
const throwError = require("./../Utils/throwError");
const {
  STATUS_CODES,
  STRIPE_PAYMENT_STATUS,
} = require("../Utils/globalConstants");
const User = require("../Models/User");
const EntityDetails = require("../Models/EntityDetails");
const Order = require("../Models/Order");
const Event = require("../Models/Event");
const { t, getLanguageFromRequest } = require("../Utils/translator");

const createPaymentIntent = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    userId,
    body: { amount, currency, paymentMethodType = "card", eventId },
    email, // Get email from req.email (from JWT token) or req.body.email
  } = req;

  // Use email from request body if provided, otherwise use from JWT token
  const customerEmail = req.body.email || email;

  // Validate required fields
  if (!amount || !currency || !eventId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("STRIPE_MISSING_REQUIRED_FIELDS", lang),
    });
  }

  // Normalize paymentMethodType to always be an array
  let paymentMethodTypes = Array.isArray(paymentMethodType)
    ? paymentMethodType
    : [paymentMethodType];

  // Remove duplicates
  paymentMethodTypes = [...new Set(paymentMethodTypes)];

  // Validate that at least one payment method is provided
  if (paymentMethodTypes.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("STRIPE_NO_PAYMENT_METHOD", lang),
    });
  }

  // Validate TWINT currency requirement
  if (
    paymentMethodTypes.includes("twint") &&
    currency.toLowerCase() !== "chf"
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("STRIPE_TWINT_CURRENCY_ERROR", lang),
    });
  }

  // Fetch event and restaurant account
  const event = await Event.findById(eventId).populate({
    path: "entityId",
    select: "stripeAccountId",
  });

  if (!event || !event.entityId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("EVENT_NOT_FOUND", lang),
    });
  }

  const stripeAccountId = event.entityId.stripeAccountId;
  if (!stripeAccountId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("STRIPE_ACCOUNT_NOT_FOUND_FOR_ENTITY", lang),
    });
  }

  // Check if transfers capability is enabled
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (account.capabilities?.transfers !== "active") {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("STRIPE_TRANSFERS_NOT_ENABLED", lang),
      });
    }

    // Log account capabilities for debugging TWINT issues
    if (paymentMethodTypes.includes("twint")) {
      // console.log("Connected account capabilities:", {...}); // Noisy debug log
    }
  } catch (error) {
    // If it's already our custom error, re-throw it
    if (
      error.status === STATUS_CODES.BAD_REQUEST &&
      error.message === t("STRIPE_TRANSFERS_NOT_ENABLED", lang)
    ) {
      throw error;
    }
    // Otherwise, log and continue (account might be inaccessible, but let Stripe handle it)
    console.warn("Could not verify transfers capability:", error.message);
  }

  const platformFees = global.PLATFORM_FEES || 0;
  const amountInCents = Math.round(amount * 100);
  const feeInCents = Math.round(platformFees * 100);

  // If TWINT is the payment method, use Stripe Checkout Session (for iOS compatibility)
  if (paymentMethodTypes.includes("twint")) {
    try {
      // Create checkout session configuration
      const checkoutSessionConfig = {
        payment_method_types: ["twint"],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: "Payment",
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        payment_intent_data: {
          application_fee_amount: feeInCents,
          transfer_data: {
            destination: stripeAccountId,
          },
          metadata: {
            userId: req.userId,
            eventId: eventId,
            paymentMethodType: "twint",
          },
        },
        success_url: `countr://payment/success?session_id={CHECKOUT_SESSION_ID}&eventId=${eventId}&userId=${req.userId}`,
        cancel_url: `countr://payment/cancel?eventId=${eventId}&userId=${req.userId}`,
        metadata: {
          userId: req.userId,
          eventId: eventId,
          paymentMethodType: "twint",
        },
      };

      // Pre-fill email if available to streamline checkout
      if (customerEmail) {
        checkoutSessionConfig.customer_email = customerEmail;
      }

      const checkoutSession = await stripe.checkout.sessions.create(
        checkoutSessionConfig
      );

      // Log checkout session details for debugging
      // console.log("TWINT Checkout Session created:", {...}); // Noisy debug log

      // Store checkout session info in database
      await StripeModel.create({
        amount,
        currency,
        paymentMethodType: "twint",
        userId: req.userId,
        stripePaymentIntentId:
          checkoutSession.payment_intent || checkoutSession.id,
        stripeCheckoutSessionId: checkoutSession.id,
        lastPaymentDate: new Date(),
      });

      // Return checkout session response
      return {
        id: checkoutSession.id,
        url: checkoutSession.url,
        type: "checkout_session",
        clientSecret: null, // Checkout sessions don't have client_secret
      };
    } catch (error) {
      console.error("Error creating checkout session:", error);

      // Check for test/live mode mismatch
      if (
        error.code === "resource_missing" &&
        error.message?.includes("test mode")
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("STRIPE_TEST_LIVE_MODE_MISMATCH", lang),
        });
      }

      // Check for insufficient capabilities error
      if (error.code === "insufficient_capabilities_for_transfer") {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("STRIPE_TRANSFERS_NOT_ENABLED", lang),
        });
      }

      throwError({
        status: STATUS_CODES.SERVER_ERROR,
        message: error.message || t("STRIPE_CHECKOUT_SESSION_ERROR", lang),
      });
    }
  }

  // For other payment methods, use Payment Intent
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      payment_method_types: paymentMethodTypes,
      application_fee_amount: feeInCents,
      transfer_data: {
        destination: stripeAccountId,
      },
      metadata: {
        userId: req.userId,
        eventId: eventId,
        paymentMethodType: Array.isArray(paymentMethodType)
          ? paymentMethodType.join(",")
          : paymentMethodType,
      },
    });

    // Store payment intent info in database
    await StripeModel.create({
      amount,
      currency,
      paymentMethodType: Array.isArray(paymentMethodType)
        ? paymentMethodType
        : paymentMethodType,
      userId: req.userId,
      stripePaymentIntentId: paymentIntent.id,
      lastPaymentDate: new Date(),
    });

    // Return payment intent with type for frontend to identify
    return {
      ...paymentIntent,
      type: "payment_intent",
    };
  } catch (error) {
    console.error("Error creating payment intent:", error);

    // Check for test/live mode mismatch
    if (
      error.code === "resource_missing" &&
      error.message?.includes("test mode")
    ) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("STRIPE_TEST_LIVE_MODE_MISMATCH", lang),
      });
    }

    // Check for insufficient capabilities error
    if (error.code === "insufficient_capabilities_for_transfer") {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("STRIPE_TRANSFERS_NOT_ENABLED", lang),
      });
    }

    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: error.message || t("STRIPE_PAYMENT_INTENT_ERROR", lang),
    });
  }
};

// const createPaymentMethod = async (req) => {
//   const { cardNumber, expMonth, expYear, cvc, type } = req.body;

//   // if (!cardNumber || !expMonth || !expYear || !cvc) {
//   //   throwError({
//   //     status: STATUS_CODES.BAD_REQUEST,
//   //     message: "Card details are required.",
//   //   });
//   // }

//   const paymentMethod = await stripe.paymentMethods.create({
//     type: type || "card",
//     card: {
//       number: cardNumber,
//       exp_month: expMonth,
//       exp_year: expYear,
//       cvc: cvc,
//     },
//   });
//   return paymentMethod;
// };

// const getPaymentStatusForStripe = (stripeStatus) => {
//   switch (stripeStatus) {
//     case "succeeded":
//       return STRIPE_PAYMENT_STATUS.SUCCESSFUL;
//     case "processing":
//       return STRIPE_PAYMENT_STATUS.PENDING;
//     case "canceled":
//       return STRIPE_PAYMENT_STATUS.CANCELLED;
//     case "incomplete":
//       return STRIPE_PAYMENT_STATUS.INCOMPLETE;
//     case "requires_payment_method":
//     case "requires_action":
//     case "requires_confirmation":
//     case "requires_capture":
//       return STRIPE_PAYMENT_STATUS.PENDING;
//     default:
//       return STRIPE_PAYMENT_STATUS.FAILED;
//   }
// };

// const confirmPaymentIntent = async (req) => {
//   const { paymentIntentId, paymentMethodId, paymentMethodType } = req.body;

//   try {
//     const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
//       payment_method: paymentMethodId,
//     });

//     console.log("Stripe payment intent status:", paymentIntent.status);

//     const mappedStatus = getPaymentStatusForStripe(paymentIntent.status);
//     console.log("Mapped status for DB:", mappedStatus);

//     const updatePayload = {
//       paymentStatus: mappedStatus,
//       paymentMethodUsed: paymentMethodType || "unknown",
//     };

//     const existing = await StripeModel.findOne({
//       stripePaymentIntentId: paymentIntentId,
//     });
//     console.log("Before update, DB record is:", existing);
//     const result = await StripeModel.updateOne(
//       { stripePaymentIntentId: paymentIntentId },
//       { $set: updatePayload }
//     );

//     if (result.matchedCount === 0) {
//       console.warn("No document found with this paymentIntentId");
//     } else if (result.modifiedCount === 0) {
//       console.warn(
//         "Document found but no fields were modified. Maybe already up-to-date?"
//       );
//     } else {
//       console.log("Payment status successfully updated in DB");
//     }

//     console.log(
//       "Confirmed payment intent:",
//       paymentIntent.id,
//       "Status:",
//       paymentIntent.status
//     );

//     return paymentIntent;
//   } catch (error) {
//     console.error("Error confirming payment intent:", error.message);

//     // Optional: update the DB to mark the payment as failed
//     await StripeModel.updateOne(
//       { stripePaymentIntentId: paymentIntentId },
//       { $set: { paymentStatus: STRIPE_PAYMENT_STATUS.FAILED } }
//     );

//     throw error;
//   }
// };

const confirmPaymentIntent = async (req) => {
  const { paymentIntentId, paymentMethodId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });

    // console.log("Stripe payment intent confirmed:", paymentIntent.id); // Noisy debug log

    return paymentIntent;
  } catch (error) {
    console.error("Error confirming payment intent:", error.message);
    throw error;
  }
};

const getPaymentStatus = async (req) => {
  const { paymentIntentId } = req.query;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent;
};

const createStripeOnboardingLink = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    entityId,
    body: { email, platform },
  } = req;

  if (!entityId || !email) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("STRIPE_MISSING_ENTITY_OR_EMAIL", lang),
    });
  }

  const account = await stripe.accounts.create({
    type: "express",
    country: "CH",
    email,
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      entityId,
    },
  });

  await EntityDetails.updateOne(
    { _id: entityId },
    { stripeAccountId: account.id }
  );

  const isMobile = platform === "app";
  const redirectUrl = isMobile
    ? // ? `${process.env.HOST_URL}/stripe/redirect-bank?platform=app`
      `${process.env.HOST_URL}/bank`
    : `${process.env.HOST_URL}/app/profile/bank-account`;

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: redirectUrl,
    return_url: redirectUrl,
    type: "account_onboarding",
  });

  await EntityDetails.updateOne(
    { _id: entityId },
    { bankLinkUrl: accountLink.url }
  );

  return {
    success: true,
    message: t("STRIPE_ONBOARDING_LINK_SUCCESS", lang),
    url: accountLink.url,
  };
};

// const checkStripeAccountMissingFields = async (req) => {
//   try {
//     const { entityId } = req;

//     if (!entityId) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "Missing entityId",
//       });
//     }

//     const entity = await EntityDetails.findById(entityId);
//     if (!entity?.stripeAccountId) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "No Stripe account found for this entity",
//       });
//     }

//     const account = await stripe.accounts.retrieve(entity.stripeAccountId);

//     const missingFields = [];

//     if (!account.business_profile?.name) {
//       missingFields.push("Business Profile Name");
//     }
//     if (!account.business_profile?.mcc) {
//       missingFields.push("MCC (Merchant Category Code)");
//     }
//     if (!account.business_profile?.url) {
//       missingFields.push("Business URL");
//     }

//     if (
//       !account.documents?.verification?.status ||
//       account.documents?.verification?.status !== "verified"
//     ) {
//       missingFields.push("Identity Verification Document");
//     }
//     if (!account.business_type || account.business_type === "individual") {
//       missingFields.push("Business Type or Incorporation Document");
//     }

//     if (!account.external_accounts?.data?.length) {
//       missingFields.push("Bank Account");
//     }

//     return {
//       success: true,
//       message: "Stripe account check complete",
//       missingFields: missingFields.length
//         ? missingFields
//         : ["No fields missing"],
//     };
//   } catch (error) {
//     console.error("Stripe Account Check Error:", error);
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Failed to check Stripe account fields",
//     });
//   }
// };

const checkStripeAccountMissingFields = async (req) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { entityId } = req;

    if (!entityId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("STRIPE_MISSING_ENTITY_ID", lang),
      });
    }

    const entity = await EntityDetails.findById(entityId);
    if (!entity?.stripeAccountId) {
      return {
        success: true,
        message: t("STRIPE_ACCOUNT_NOT_ASSOCIATED", lang),
        hasMissingFields: true,
        missingFields: [],
      };
    }

    let account;
    try {
      account = await stripe.accounts.retrieve(entity.stripeAccountId);
    } catch (err) {
      console.error("Stripe retrieve failed:", err);
      return {
        success: true,
        message: t("STRIPE_ACCOUNT_INACCESSIBLE", lang),
        hasMissingFields: true,
        missingFields: [],
      };
    }

    const missingFields = [];

    if (!account?.business_profile?.name) {
      missingFields.push("Business Profile Name");
    }
    if (!account?.business_profile?.mcc) {
      missingFields.push("MCC (Merchant Category Code)");
    }
    if (!account?.business_profile?.url) {
      missingFields.push("Business URL");
    }

    if (
      account?.verification?.disabled_reason ||
      account?.requirements?.disabled_reason
    ) {
      missingFields.push("Identity Verification Document");
    }

    if (!account?.business_type || account.business_type === "individual") {
      missingFields.push("Business Type or Incorporation Document");
    }

    if (!account?.external_accounts?.data?.length) {
      missingFields.push("Bank Account");
    }

    return {
      success: true,
      message: t("STRIPE_ACCOUNT_CHECK_COMPLETE", lang),
      hasMissingFields: !!missingFields.length,
      missingFields,
    };
  } catch (error) {
    console.error("Stripe Account Check Error:", error);
    throwError({
      status: STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: t("STRIPE_ACCOUNT_CHECK_FAILED", lang),
    });
  }
};

const continueStripeOnboarding = async (req) => {
  const lang = getLanguageFromRequest(req);
  try {
    const {
      entityId,
      body: { platform },
    } = req;

    if (!entityId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("STRIPE_MISSING_ENTITY_ID", lang),
      });
    }

    const entity = await EntityDetails.findById(entityId);
    if (!entity?.stripeAccountId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("STRIPE_ACCOUNT_NOT_FOUND_FOR_ENTITY", lang),
      });
    }

    const isMobile = platform === "app";
    const redirectUrl = isMobile
      ? // ? `${process.env.HOST_URL}/stripe/redirect-bank?platform=app`
        `${process.env.HOST_URL}/bank`
      : `${process.env.HOST_URL}/app/profile/bank-account`;

    const accountLink = await stripe.accountLinks.create({
      account: entity.stripeAccountId,
      refresh_url: redirectUrl,
      return_url: redirectUrl,
      type: "account_onboarding",
    });

    await EntityDetails.updateOne(
      { _id: entityId },
      { bankLinkUrl: accountLink.url }
    );

    return {
      success: true,
      url: accountLink.url,
    };
  } catch (error) {
    console.error("Stripe Resume Onboarding Error:", error);
    throw error;
  }
};

const retrieveAccountBalance = async (req) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { accountId } = req.body;
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountId,
    });

    return {
      success: true,
      available: balance.available,
      pending: balance.pending,
    };
  } catch (error) {
    console.error("Error fetching balance:", error);
    return {
      success: false,
      message: t("STRIPE_BALANCE_FETCH_FAILED", lang),
      error: error.message,
    };
  }
};

const getStripeAccount = async (req) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { accountId } = req.query;

    const account = await stripe.accounts.retrieve(accountId);

    if (!account) {
      return {
        error: t("STRIPE_ACCOUNT_NOT_FOUND", lang),
      };
    }

    const bankAccounts = await stripe.accounts.listExternalAccounts(accountId, {
      object: "bank_account",
    });

    return {
      account: account,
      bankAccounts: bankAccounts.data || [],
    };
  } catch (err) {
    console.error("Error fetching Stripe account:", err);
    return {
      error: err.message || t("STRIPE_ACCOUNT_FETCH_ERROR_GENERIC", lang),
    };
  }
};

module.exports = {
  createPaymentIntent,
  confirmPaymentIntent,
  getPaymentStatus,
  createStripeOnboardingLink,
  getStripeAccount,
  retrieveAccountBalance,
  continueStripeOnboarding,
  checkStripeAccountMissingFields,
};
