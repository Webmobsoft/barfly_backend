const {
  TransactionsService,
  Configuration,
  HttpBearerAuth,
  WebhookEncryptionKeysService,
  SpacesService,
  ApplicationUsersService,
  AccountsService,
  AccountScope,
} = require("wallee");

const wallee = require("wallee");
const throwError = require("./../Utils/throwError");
const { STATUS_CODES } = require("../Utils/globalConstants");
const mongoose = require("mongoose");
const Event = require("../Models/Event");
const EntityDetails = require("../Models/EntityDetails");
const Commission = require("../Models/Commission");
const Order = require("../Models/Order");
const { ORDER_STATUS } = require("../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("../Utils/translator");
const { io } = require("../app");

// Wallee Configuration
const spaceId = Number(process.env.WALLEE_SPACE_ID);
const walleeUserId = Number(process.env.WALLEE_USER_ID);
const apiSecret = process.env.WALLEE_API_SECRET;

// Initialize Wallee Configuration with authentication
const httpBearerAuth = new HttpBearerAuth(walleeUserId, apiSecret);
const config = new Configuration({
  httpBearerAuth: httpBearerAuth,
});

// Initialize Wallee Services
const transactionsService = new TransactionsService(config);
const webhookEncryptionService = new WebhookEncryptionKeysService(config);
const spacesService = new SpacesService(config);
const applicationUsersService = new ApplicationUsersService(config);
const accountsService = new AccountsService(config);

// Helper function to parse error response
const parseWalleeError = async (error) => {
  try {
    if (error.response) {
      // Try to get the response body as text
      const responseText = await error.response.text();
      console.error("Wallee API Error Response:", responseText);
      try {
        return JSON.parse(responseText);
      } catch {
        return { message: responseText };
      }
    }
  } catch (e) {
    console.error("Error parsing Wallee error:", e);
  }
  return { message: error.message || "Unknown error" };
};

/**
 * Create a Wallee transaction and return the payment page URL
 * Similar to Stripe's createPaymentIntent but returns a hosted payment page URL
 */
const createWalleeTransaction = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    userId: reqUserId,
    body: { amount, currency, eventId },
    email,
  } = req;

  // Use email from request body if provided, otherwise use from JWT token
  const customerEmail = req.body.email || email;

  // Validate required fields
  if (!amount || !currency || !eventId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_MISSING_REQUIRED_FIELDS", lang),
    });
  }

  // Validate Wallee configuration
  if (!walleeUserId || !apiSecret) {
    console.error("Wallee configuration missing:", {
      spaceId: !!spaceId,
      walleeUserId: !!walleeUserId,
      apiSecret: !!apiSecret,
    });
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: t("WALLEE_CONFIG_MISSING", lang),
    });
  }

  // Fetch event details with entity information
  const event = await Event.findById(eventId).populate({
    path: "entityId",
    select: "walleeSpaceId walleeLinkedAccountId entityName _id",
  });

  if (!event) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("EVENT_NOT_FOUND", lang),
    });
  }

  if (!event.entityId) {
    console.error("Event found but entityId is missing:", eventId);
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message:
        t("EVENT_NOT_FOUND", lang) + " - Entity not associated with event",
    });
  }

  // Get platform fees (commission percentage)
  const platformFeesPercent = global.PLATFORM_FEES || 2; // e.g., 1 for 1%
  const totalAmount = parseFloat(Number(amount).toFixed(2));
  const platformCommission = parseFloat(
    ((totalAmount * platformFeesPercent) / 100).toFixed(2)
  );
  const merchantAmount = parseFloat(
    (totalAmount - platformCommission).toFixed(2)
  );

  // IMPORTANT: Process payment in MERCHANT'S space
  // In this model, each merchant owns their own Wallee space
  // Full payment goes directly to merchant's space, commission is tracked separately
  const merchantSpaceId = event.entityId?.walleeSpaceId;
  const entityId = event.entityId._id;
  const entityName = event.entityId?.entityName || "Unknown Entity";

  // Validate merchant Space ID exists and is valid
  if (!merchantSpaceId) {
    console.error("========== MERCHANT SPACE ID MISSING ==========");
    console.error("Entity ID:", entityId);
    console.error("Entity Name:", entityName);
    console.error("Event ID:", eventId);
    console.error("Error: Merchant has not completed Wallee onboarding");
    console.error(
      "Action Required: Merchant must provide their Wallee Space ID"
    );
    console.error("================================================");
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_MERCHANT_SPACE_NOT_FOUND", lang),
    });
  }

  // Validate spaceId is a valid number
  const merchantSpaceIdNumber = Number(merchantSpaceId);
  if (isNaN(merchantSpaceIdNumber) || merchantSpaceIdNumber <= 0) {
    console.error("========== INVALID MERCHANT SPACE ID ==========");
    console.error("Entity ID:", entityId);
    console.error("Entity Name:", entityName);
    console.error("Invalid Space ID:", merchantSpaceId);
    console.error("================================================");
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_INVALID_SPACE_ID", lang),
    });
  }

  console.log("========== CREATING PAYMENT TRANSACTION ==========");
  console.log("Entity ID:", entityId.toString());
  console.log("Entity Name:", entityName);
  console.log("Merchant Space ID:", merchantSpaceIdNumber, "(validated)");
  console.log("Event ID:", eventId);
  console.log("User ID:", reqUserId);
  console.log("Amount:", totalAmount, currency);
  console.log("Platform Commission:", platformCommission, currency);
  console.log("Merchant Amount (full payment):", totalAmount, currency);
  console.log("Payment will be processed in MERCHANT'S Wallee space");
  console.log("===================================================");

  try {
    // Create line items for the transaction
    // Full amount goes to merchant (they receive $100, commission tracked separately)
    const lineItems = [
      {
        name: `Payment for ${event.entityId.entityName || "Order"}`,
        uniqueId: `order-${reqUserId}-${eventId}-${Date.now()}`,
        sku: `event-${eventId}`,
        quantity: 1,
        amountIncludingTax: totalAmount, // already rounded to 2 decimal places
        type: "PRODUCT",
      },
    ];

    // Note: Platform fee is NOT deducted from payment
    // It will be tracked in database and collected later via invoice/auto-debit

    // Create transaction object
    const transactionCreate = {
      lineItems: lineItems,
      autoConfirmationEnabled: true,
      currency: currency.toUpperCase(),
      customerEmailAddress: customerEmail || undefined,
      metaData: {
        userId: reqUserId,
        eventId: eventId,
        entityId: entityId.toString(), // Use validated entityId
        merchantSpaceId: merchantSpaceIdNumber.toString(), // Use validated spaceId number
        totalAmount: totalAmount.toString(),
        platformCommission: platformCommission.toString(), // Tracked for later collection
        merchantAmount: merchantAmount.toString(),
        platformFeesPercent: platformFeesPercent.toString(),
        paymentFlow: "MERCHANT_FULL_PAYMENT", // Indicates full payment to merchant
        entityName: entityName, // Include entity name for reference
        // paymentMethodType: paymentMethodType,
      },
      successUrl: `countr://payment/success?eventId=${eventId}&userId=${reqUserId}`,
      failedUrl: `countr://payment/cancel?eventId=${eventId}&userId=${reqUserId}`,
    };

    // Create the transaction in MERCHANT'S space
    // Payment goes directly to merchant's Wallee account
    console.log(
      "Creating transaction in merchant's Wallee space:",
      merchantSpaceIdNumber
    );
    const transaction = await transactionsService.postPaymentTransactions({
      space: merchantSpaceIdNumber, // Use validated number
      transactionCreate: transactionCreate,
    });

    console.log("Wallee transaction created:", {
      transactionId: transaction.id,
      state: transaction.state,
      currency: transaction.currency,
      amount: amount,
    });

    // Get the payment page URL from merchant's space
    console.log(
      "Generating payment page URL from merchant's space:",
      merchantSpaceIdNumber
    );
    const paymentPageUrl =
      await transactionsService.getPaymentTransactionsIdPaymentPageUrl({
        space: merchantSpaceIdNumber, // Use validated number
        id: transaction.id,
      });

    console.log("✅ Wallee payment page URL generated successfully");
    console.log("Transaction ID:", transaction.id);
    console.log("Transaction State:", transaction.state);
    console.log("Payment Page URL:", paymentPageUrl);

    return {
      type: "payment_page",
      url: paymentPageUrl,
      transactionId: transaction.id,
      state: transaction.state,
    };
  } catch (error) {
    console.error("Error creating Wallee transaction:", error);

    // Parse and log the actual error from Wallee
    const errorDetails = await parseWalleeError(error);
    console.error("Wallee API Error Details:", errorDetails);

    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message:
        errorDetails.message || t("WALLEE_TRANSACTION_CREATE_ERROR", lang),
    });
  }
};

/**
 * Get the status of a Wallee transaction
 * Transaction status is fetched from the merchant's space where the payment was created
 */
const getWalleeTransactionStatus = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { transactionId, entityId } = req.query;

  if (!transactionId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_TRANSACTION_ID_REQUIRED", lang),
    });
  }

  // If entityId is provided, fetch merchant's space ID
  // Otherwise, we'll need to find it from the transaction metadata or use platform space
  let transactionSpaceId = spaceId; // Fallback to platform space

  if (entityId) {
    try {
      const entity = await EntityDetails.findById(entityId).select(
        "walleeSpaceId"
      );
      if (entity?.walleeSpaceId) {
        transactionSpaceId = entity.walleeSpaceId;
        console.log("Using merchant space ID:", transactionSpaceId);
      } else {
        console.warn("Entity not found or no space ID, using platform space");
      }
    } catch (err) {
      console.error("Error fetching entity for transaction status:", err);
    }
  }

  try {
    // Try merchant space first, fallback to platform space if needed
    let transaction;
    try {
      transaction = await transactionsService.getPaymentTransactionsId({
        space: transactionSpaceId,
        id: Number(transactionId),
      });
    } catch (merchantSpaceError) {
      // If merchant space fails, try platform space as fallback
      if (transactionSpaceId !== spaceId) {
        console.warn(
          "Failed to fetch from merchant space, trying platform space"
        );
        transaction = await transactionsService.getPaymentTransactionsId({
          space: spaceId,
          id: Number(transactionId),
        });
      } else {
        throw merchantSpaceError;
      }
    }

    return {
      transactionId: transaction.id,
      state: transaction.state,
      currency: transaction.currency,
      authorizationAmount: transaction.authorizationAmount,
      completedOn: transaction.completedOn,
      failedOn: transaction.failedOn,
      failureReason: transaction.failureReason,
      spaceId: transactionSpaceId, // Return which space was used
    };
  } catch (error) {
    console.error("Error fetching Wallee transaction status:", error);
    const errorDetails = await parseWalleeError(error);
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message:
        errorDetails?.message ||
        error.message ||
        t("WALLEE_TRANSACTION_STATUS_ERROR", lang),
    });
  }
};

/**
 * Handle Wallee webhook for transaction state changes
 */

const handleWalleeWebhook = async (req) => {
  const lang = getLanguageFromRequest(req);
  const webhookStartTime = Date.now();

  console.log("\n");
  console.log(
    "╔══════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║          🎯 WALLEE WEBHOOK RECEIVED                         ║"
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝"
  );
  console.log("📅 Timestamp:", new Date().toISOString());
  console.log("🌐 Request Method:", req.method);
  console.log("📍 Request Path:", req.path);
  console.log("🔗 Request URL:", req.url);
  console.log("📋 Headers:", JSON.stringify(req.headers, null, 2));
  console.log("📦 Body Type:", typeof req.body);
  console.log("📦 Body Length:", req.body?.length || 0, "bytes");

  // 1️⃣ Get raw body content
  let contentToVerify;
  try {
    contentToVerify = req.body.toString("utf8");
    console.log("✅ Raw body extracted successfully");
    console.log("📄 Raw body length:", contentToVerify.length, "characters");
    console.log(
      "📄 Raw body preview:",
      contentToVerify.substring(0, 200) + "..."
    );
  } catch (bodyError) {
    console.error("❌ Error extracting raw body:", bodyError);
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Failed to extract webhook body",
    });
  }

  // 2️⃣ Check for x-signature header (Wallee uses ECDSA signature)
  // Format: algorithm=SHA256withECDSA, keyId=<uuid>, signature=<base64>
  console.log("\n🔐 STEP 1: SIGNATURE VERIFICATION");
  console.log("─────────────────────────────────────────────────────────────");
  const signatureHeader = req.headers["x-signature"];
  console.log("📝 x-signature header present:", !!signatureHeader);
  console.log("📝 x-signature value:", signatureHeader || "NOT PROVIDED");

  if (signatureHeader) {
    // Verify signature using Wallee SDK's ECDSA verification
    // The SDK fetches the public key from Wallee API using keyId and verifies
    try {
      console.log("🔄 Verifying webhook signature using Wallee SDK...");
      const verificationStartTime = Date.now();
      const isValid = await webhookEncryptionService.isContentValid(
        signatureHeader,
        contentToVerify
      );
      const verificationDuration = Date.now() - verificationStartTime;
      console.log(
        "⏱️ Signature verification took:",
        verificationDuration,
        "ms"
      );
      console.log(
        "✅ Signature verification result:",
        isValid ? "VALID ✅" : "INVALID ❌"
      );

      if (!isValid) {
        console.error("\n❌❌❌ WEBHOOK SIGNATURE VERIFICATION FAILED ❌❌❌");
        console.error("⚠️ This webhook may be fraudulent or tampered with!");
        throwError({
          status: STATUS_CODES.NOT_AUTHORIZED,
          message: "Invalid Wallee webhook signature",
        });
      }
      console.log(
        "✅ Webhook signature verified successfully - webhook is authentic"
      );
    } catch (verificationError) {
      console.error(
        "❌ ERROR DURING SIGNATURE VERIFICATION:",
        verificationError.message
      );
      throwError({
        status: STATUS_CODES.NOT_AUTHORIZED,
        message: "Webhook signature verification failed",
      });
    }
  } else {
    console.error("❌ NO X-SIGNATURE HEADER — rejecting unsigned webhook");
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Missing webhook signature",
    });
  }

  // 3️⃣ Parse payload
  console.log("\n📦 STEP 2: PAYLOAD PARSING");
  console.log("─────────────────────────────────────────────────────────────");
  let payload;
  try {
    const parseStartTime = Date.now();
    payload = JSON.parse(contentToVerify);
    const parseDuration = Date.now() - parseStartTime;
    console.log("✅ Payload parsed successfully in", parseDuration, "ms");
    console.log("📋 Payload keys:", Object.keys(payload).join(", "));
    console.log("📋 Full payload:", JSON.stringify(payload, null, 2));
  } catch (parseError) {
    console.error("\n❌❌❌ FAILED TO PARSE WEBHOOK PAYLOAD ❌❌❌");
    console.error("Parse error:", parseError.message);
    console.error("Raw body that failed:", contentToVerify.substring(0, 500));
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid JSON payload",
    });
  }

  const {
    listenerEntityId,
    entityId,
    listenerEntityTechnicalName,
    state,
    spaceId: webhookSpaceId,
  } = payload;

  console.log("\n📊 STEP 3: WEBHOOK DATA EXTRACTION");
  console.log("─────────────────────────────────────────────────────────────");
  console.log("🔑 listenerEntityId:", listenerEntityId);
  console.log("🆔 Transaction ID (entityId):", entityId);
  console.log("📛 Entity Type:", listenerEntityTechnicalName);
  console.log("📊 Transaction State:", state);
  console.log("🌐 Space ID (from webhook):", webhookSpaceId);
  console.log(
    "📋 Full webhook details:",
    JSON.stringify(
      {
        listenerEntityId,
        entityId,
        listenerEntityTechnicalName,
        webhookState: state,
        webhookSpaceId,
      },
      null,
      2
    )
  );

  try {
    // 4️⃣ Only handle Transaction webhooks
    console.log("\n🔍 STEP 4: WEBHOOK TYPE VALIDATION");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );
    console.log("🔎 Checking webhook type:", listenerEntityTechnicalName);

    if (listenerEntityTechnicalName !== "Transaction") {
      console.log(
        `⏭️ Skipping non-Transaction webhook: ${listenerEntityTechnicalName}`
      );
      console.log(
        "✅ Webhook received but not processed (not a Transaction webhook)"
      );
      return {
        received: true,
        skipped: true,
        reason: "Not a Transaction webhook",
        webhookType: listenerEntityTechnicalName,
      };
    }
    console.log("✅ Webhook type validated - this is a Transaction webhook");

    // Use space ID from webhook payload (this is the merchant's space where payment was created)
    // In this model, webhooks come from merchant spaces, not platform space
    const transactionSpaceId = webhookSpaceId;

    console.log("\n🌐 STEP 5: SPACE ID VALIDATION");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );
    console.log("🔍 Checking Space ID from webhook payload...");
    console.log("📝 Space ID value:", transactionSpaceId);
    console.log("📝 Space ID type:", typeof transactionSpaceId);

    if (!transactionSpaceId) {
      console.error("\n❌❌❌ WEBHOOK MISSING SPACE ID ❌❌❌");
      console.error("⚠️ Cannot fetch transaction without Space ID");
      console.error("📋 Webhook payload:", JSON.stringify(payload, null, 2));
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Webhook missing spaceId",
      });
    }

    const transactionSpaceIdNumber = Number(transactionSpaceId);
    if (isNaN(transactionSpaceIdNumber) || transactionSpaceIdNumber <= 0) {
      console.error("\n❌❌❌ INVALID SPACE ID FORMAT ❌❌❌");
      console.error("⚠️ Space ID must be a positive number");
      console.error("📝 Received Space ID:", transactionSpaceId);
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Invalid Space ID format in webhook",
      });
    }

    console.log("✅ Space ID validated:", transactionSpaceIdNumber);
    console.log(
      `\n╔══════════════════════════════════════════════════════════════╗`
    );
    console.log(
      `║   PROCESSING WEBHOOK FROM MERCHANT SPACE                    ║`
    );
    console.log(
      `╚══════════════════════════════════════════════════════════════╝`
    );
    console.log(`🏪 Merchant Space ID: ${transactionSpaceIdNumber}`);
    console.log(`🆔 Transaction ID: ${entityId}`);
    console.log(`📊 State: ${state}`);
    console.log(
      `─────────────────────────────────────────────────────────────`
    );

    // 5️⃣ Fetch transaction from merchant's Wallee space (source of truth)
    console.log("\n📥 STEP 6: FETCHING TRANSACTION FROM WALLEE");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );
    console.log(
      `🔄 Fetching transaction ${entityId} from merchant space ${transactionSpaceIdNumber}...`
    );

    let transaction;
    try {
      const fetchStartTime = Date.now();
      transaction = await transactionsService.getPaymentTransactionsId({
        space: transactionSpaceIdNumber,
        id: Number(entityId),
      });
      const fetchDuration = Date.now() - fetchStartTime;
      console.log(
        "✅ Transaction fetched successfully in",
        fetchDuration,
        "ms"
      );
    } catch (fetchError) {
      console.error("\n❌❌❌ FAILED TO FETCH TRANSACTION FROM WALLEE ❌❌❌");
      console.error("Space ID:", transactionSpaceIdNumber);
      console.error("Transaction ID:", entityId);
      console.error("Error:", fetchError.message);
      const errorDetails = await parseWalleeError(fetchError);
      console.error("Error details:", JSON.stringify(errorDetails, null, 2));
      throw fetchError;
    }

    console.log("\n📋 STEP 7: TRANSACTION DETAILS");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );
    console.log("✅ Transaction fetched successfully");
    console.log("🆔 Transaction ID:", transaction.id);
    console.log("📊 Transaction State:", transaction.state);
    console.log("💱 Currency:", transaction.currency);
    console.log("💰 Authorization Amount:", transaction.authorizationAmount);
    console.log("📅 Created On:", transaction.createdOn);
    console.log(
      "✅ Completed On:",
      transaction.completedOn || "Not completed yet"
    );
    console.log("❌ Failed On:", transaction.failedOn || "Not failed");
    console.log(
      "📝 Metadata:",
      JSON.stringify(transaction.metaData || {}, null, 2)
    );
    console.log(
      "📋 Full transaction object keys:",
      Object.keys(transaction).join(", ")
    );

    // Extract commission information from metadata
    console.log("\n💰 STEP 8: EXTRACTING COMMISSION DATA");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );
    const metadata = transaction.metaData || {};
    console.log("📝 Metadata present:", !!metadata);
    console.log("📝 Metadata keys:", Object.keys(metadata).join(", "));

    const metadataMerchantSpaceId = metadata.merchantSpaceId
      ? Number(metadata.merchantSpaceId)
      : null;
    const merchantAmount = metadata.merchantAmount
      ? Number(metadata.merchantAmount)
      : null;
    const platformCommission = metadata.platformCommission
      ? Number(metadata.platformCommission)
      : null;
    const totalAmount = metadata.totalAmount
      ? Number(metadata.totalAmount)
      : transaction.authorizationAmount;
    const eventId = metadata.eventId;
    const userId = metadata.userId;
    const entityIdFromMetadata = metadata.entityId;

    // Use space ID from webhook (merchant's space) - this is the actual space where payment was processed
    const merchantSpaceId = transactionSpaceIdNumber;

    console.log("📊 Commission Breakdown:");
    console.log("   Transaction Space ID (from webhook):", merchantSpaceId);
    console.log(
      "   Metadata Merchant Space ID:",
      metadataMerchantSpaceId || "Not in metadata"
    );
    console.log("   Total Amount:", totalAmount, transaction.currency);
    console.log(
      "   Platform Commission:",
      platformCommission || 0,
      transaction.currency
    );
    console.log(
      "   Merchant Amount:",
      merchantAmount || totalAmount,
      transaction.currency
    );
    console.log("   Event ID:", eventId || "Not in metadata");
    console.log("   User ID:", userId || "Not in metadata");
    console.log("   Entity ID:", entityIdFromMetadata || "Not in metadata");

    // Validate metadata has required fields
    if (!eventId || !entityIdFromMetadata) {
      console.warn("⚠️ WARNING: Missing critical metadata fields");
      console.warn("   Event ID missing:", !eventId);
      console.warn("   Entity ID missing:", !entityIdFromMetadata);
    }

    // 6️⃣ Handle states
    console.log("\n🔄 STEP 9: PROCESSING TRANSACTION STATE");
    console.log(
      "─────────────────────────────────────────────────────────────"
    );
    console.log("📊 Current Transaction State:", transaction.state);
    console.log("🔄 Processing state handler...");

    switch (transaction.state) {
      case "FULFILL":
      case "COMPLETED":
      case "CONFIRMED":
      case "AUTHORIZED":
        console.log(
          "\n╔══════════════════════════════════════════════════════════════╗"
        );
        console.log(
          "║          ✅ PAYMENT COMPLETED SUCCESSFULLY                  ║"
        );
        console.log(
          "╚══════════════════════════════════════════════════════════════╝"
        );
        console.log("🆔 Transaction ID:", transaction.id);
        console.log("📊 State:", transaction.state);
        console.log("💰 Amount:", totalAmount, transaction.currency);
        console.log(
          "💳 Payment Method: Card payments typically reach CONFIRMED state"
        );
        console.log(
          "💳 TWINT payments typically reach FULFILL/COMPLETED state"
        );

        // Full payment goes directly to merchant's Wallee space
        // Track commission separately for later collection/invoicing
        console.log("\n💰 STEP 10: COMMISSION TRACKING");
        console.log(
          "─────────────────────────────────────────────────────────────"
        );

        if (
          platformCommission &&
          platformCommission > 0 &&
          entityIdFromMetadata
        ) {
          console.log("✅ Commission tracking required");
          console.log(
            "   Platform Commission:",
            platformCommission,
            transaction.currency
          );
          console.log("   Entity ID:", entityIdFromMetadata);

          try {
            const entityIdObj = entityIdFromMetadata
              ? new mongoose.Types.ObjectId(entityIdFromMetadata)
              : null;
            const eventIdObj = eventId
              ? new mongoose.Types.ObjectId(eventId)
              : null;
            const userIdObj = userId
              ? new mongoose.Types.ObjectId(userId)
              : null;

            console.log("📝 Creating commission record...");
            console.log("   Entity ID Object:", entityIdObj);
            console.log("   Event ID Object:", eventIdObj);
            console.log("   User ID Object:", userIdObj);

            const commissionStartTime = Date.now();

            // Upsert commission record — one record per transaction
            // Webhook fires for each state change (AUTHORIZED → CONFIRMED → FULFILL)
            // We only want one commission record, updated with the latest state
            const commissionRecord = await Commission.findOneAndUpdate(
              { walleeTransactionId: transaction.id },
              {
                $set: {
                  entityId: entityIdObj,
                  eventId: eventIdObj,
                  userId: userIdObj,
                  walleeTransactionId: transaction.id,
                  totalAmount: totalAmount,
                  platformCommission: platformCommission,
                  merchantAmount: merchantAmount || totalAmount,
                  platformFeesPercent: metadata.platformFeesPercent
                    ? Number(metadata.platformFeesPercent)
                    : 0,
                  currency: transaction.currency,
                  status: "PENDING",
                  metadata: {
                    transactionState: transaction.state,
                    completedOn: transaction.completedOn,
                    paymentFlow: "MERCHANT_FULL_PAYMENT",
                    merchantSpaceId: merchantSpaceId,
                    transactionSpaceId: merchantSpaceId,
                  },
                },
              },
              { upsert: true, new: true }
            );

            const commissionDuration = Date.now() - commissionStartTime;
            console.log(
              "✅ Commission record created successfully in",
              commissionDuration,
              "ms"
            );

            console.log(
              "\n╔══════════════════════════════════════════════════════════════╗"
            );
            console.log(
              "║     💰 COMMISSION TRACKING (Merchant Space Model)            ║"
            );
            console.log(
              "╚══════════════════════════════════════════════════════════════╝"
            );
            console.log(
              `💰 Total Payment: ${totalAmount} ${transaction.currency}`
            );
            console.log(
              `   → Merchant receives: FULL AMOUNT (${totalAmount} ${transaction.currency})`
            );
            console.log(`   → Merchant Space ID: ${merchantSpaceId}`);
            console.log(
              `   → Platform commission (to be collected): ${platformCommission} ${transaction.currency}`
            );
            console.log(`   → Commission record ID: ${commissionRecord._id}`);
            console.log(
              `   → Status: PENDING (will be invoiced/collected later)`
            );
            console.log(`\n📋 Commission Details:`);
            console.log(`   Entity ID: ${entityIdObj}`);
            console.log(`   Event ID: ${eventIdObj}`);
            console.log(`   User ID: ${userIdObj}`);
            console.log(`   Merchant Space ID: ${merchantSpaceId}`);
            console.log(
              `   Commission Amount: ${platformCommission} ${transaction.currency}`
            );
            console.log(
              `   Commission Percentage: ${metadata.platformFeesPercent || 0}%`
            );
            console.log(`   Transaction ID: ${transaction.id}`);
            console.log(`   Created At: ${new Date().toISOString()}`);
            console.log(`✅ Commission tracking completed successfully`);

            // Notify admin dashboard — revenue changed
            try {
              io.to("admin_room").emit("adminDashboardUpdate", {
                action: "revenue_update",
                transactionId: transaction.id,
                amount: totalAmount,
                platformCommission: platformCommission,
                currency: transaction.currency,
                entityId: entityIdFromMetadata,
              });
            } catch (err) {
              console.error("Admin socket emit error:", err.message);
            }
          } catch (commissionError) {
            console.error("\n❌❌❌ ERROR CREATING COMMISSION RECORD ❌❌❌");
            console.error("Error:", commissionError.message);
            console.error("Error stack:", commissionError.stack);
            console.error("Commission data that failed:", {
              entityId: entityIdFromMetadata,
              eventId: eventId,
              userId: userId,
              platformCommission: platformCommission,
            });
            // Don't fail the webhook - log error for manual review
            console.warn(
              "⚠️ Webhook processing continues despite commission error"
            );
          }
        } else {
          console.log("\n⚠️ COMMISSION TRACKING SKIPPED");
          console.log(
            "   Reason:",
            !platformCommission
              ? "Platform commission is 0"
              : "Entity ID missing"
          );
          console.log("   Platform Commission:", platformCommission || 0);
          console.log(
            "   Entity ID from metadata:",
            entityIdFromMetadata || "Missing"
          );
        }

        // Update orders linked to this eventId to mark payment as completed
        // Orders are created with eventId, so we can find and update them
        console.log("\n📦 STEP 11: ORDER LOOKUP");
        console.log(
          "─────────────────────────────────────────────────────────────"
        );

        if (eventId) {
          try {
            console.log("🔍 Looking up orders for event:", eventId);
            const eventIdObj = new mongoose.Types.ObjectId(eventId);

            const orderLookupStartTime = Date.now();
            // Find orders for this event that are still in WAITING status
            const orders = await Order.find({
              eventId: eventIdObj,
              status: ORDER_STATUS.WAITING, // Only update orders that are waiting
            });
            const orderLookupDuration = Date.now() - orderLookupStartTime;

            console.log("⏱️ Order lookup took:", orderLookupDuration, "ms");
            console.log("📊 Orders found:", orders.length);

            if (orders.length > 0) {
              console.log(
                `\n✅ Found ${orders.length} order(s) linked to this payment`
              );
              console.log(
                `📋 Order IDs: ${orders
                  .map((o) => o._id.toString())
                  .join(", ")}`
              );
              console.log(
                `📋 Order Token Numbers: ${orders
                  .map((o) => o.tokenNumber)
                  .join(", ")}`
              );

              // Extract actual payment method name from Wallee transaction object
              // paymentConnectorConfiguration.paymentMethodConfiguration.name holds the real name (e.g. "TWINT", "VISA", "Mastercard")
              const paymentMethod =
                transaction.paymentConnectorConfiguration?.paymentMethodConfiguration?.name ||
                transaction.paymentConnectorConfiguration?.name ||
                null;

              console.log(`💳 Payment method from Wallee: ${paymentMethod || "unknown"}`);

              // Save payment method on all orders for this event
              await Order.updateMany(
                { eventId: eventIdObj, status: ORDER_STATUS.WAITING },
                { $set: { ...(paymentMethod && { paymentMethod }) } }
              );

              console.log(
                `✅ Payment confirmed for ${orders.length} order(s) linked to event ${eventId}${paymentMethod ? ` via ${paymentMethod}` : ""}`
              );
            } else {
              console.log(`ℹ️ No orders found for event ${eventId}`);
              console.log(
                `   This is normal if orders are created after payment verification`
              );
            }
          } catch (orderUpdateError) {
            console.error("\n❌❌❌ ERROR LOOKING UP ORDERS ❌❌❌");
            console.error("Error:", orderUpdateError.message);
            console.error("Error stack:", orderUpdateError.stack);
            console.error("Event ID that failed:", eventId);
            // Don't fail the webhook - log error for manual review
            console.warn(
              "⚠️ Webhook processing continues despite order lookup error"
            );
          }
        } else {
          console.log(
            "⚠️ Event ID missing from metadata - cannot lookup orders"
          );
        }

        // TODO: Send confirmation email/notification to user
        break;

      // Note: AUTHORIZED is now handled above in the success case (FULFILL/COMPLETED/CONFIRMED/AUTHORIZED)
      // This case should not be reached, but keeping commented for reference
      // case "AUTHORIZED":
      //   console.log("\n🟡 PAYMENT AUTHORIZED (pending capture)");
      //   console.log("─────────────────────────────────────────────────────────────");
      //   console.log("🆔 Transaction ID:", transaction.id);
      //   console.log("📊 State: AUTHORIZED");
      //   console.log("ℹ️ Payment is authorized but not yet captured");
      //   break;

      case "FAILED":
        console.log("\n❌ PAYMENT FAILED");
        console.log(
          "─────────────────────────────────────────────────────────────"
        );
        console.log("🆔 Transaction ID:", transaction.id);
        console.log("📊 State: FAILED");
        console.log(
          "❌ Failure reason:",
          transaction.failureReason || "Not provided"
        );
        console.log("📅 Failed On:", transaction.failedOn || "Not specified");

        // Track failed transaction in Commission for transaction logs
        if (entityIdFromMetadata) {
          try {
            const entityIdObj = new mongoose.Types.ObjectId(
              entityIdFromMetadata
            );
            const eventIdObj = eventId
              ? new mongoose.Types.ObjectId(eventId)
              : null;
            const userIdObj = userId
              ? new mongoose.Types.ObjectId(userId)
              : null;

            await Commission.findOneAndUpdate(
              { walleeTransactionId: transaction.id },
              {
                $set: {
                  entityId: entityIdObj,
                  eventId: eventIdObj,
                  userId: userIdObj,
                  walleeTransactionId: transaction.id,
                  totalAmount: totalAmount || 0,
                  platformCommission: 0,
                  merchantAmount: 0,
                  platformFeesPercent: metadata.platformFeesPercent
                    ? Number(metadata.platformFeesPercent)
                    : 0,
                  currency: transaction.currency,
                  status: "CANCELLED",
                  metadata: {
                    transactionState: transaction.state,
                    failedOn: transaction.failedOn,
                    failureReason: transaction.failureReason,
                    paymentFlow: "MERCHANT_FULL_PAYMENT",
                    merchantSpaceId: merchantSpaceId,
                    transactionSpaceId: merchantSpaceId,
                  },
                },
              },
              { upsert: true, new: true }
            );
            console.log("✅ Commission record upserted for FAILED transaction");
          } catch (err) {
            console.error(
              "❌ Error upserting commission for FAILED:",
              err.message
            );
          }
        }
        break;

      case "VOIDED":
        console.log("\n⚠️ PAYMENT VOIDED");
        console.log(
          "─────────────────────────────────────────────────────────────"
        );
        console.log("🆔 Transaction ID:", transaction.id);
        console.log("📊 State: VOIDED");
        console.log("ℹ️ Payment was voided/cancelled");

        // Track voided transaction in Commission for transaction logs
        if (entityIdFromMetadata) {
          try {
            const entityIdObj = new mongoose.Types.ObjectId(
              entityIdFromMetadata
            );
            const eventIdObj = eventId
              ? new mongoose.Types.ObjectId(eventId)
              : null;
            const userIdObj = userId
              ? new mongoose.Types.ObjectId(userId)
              : null;

            await Commission.findOneAndUpdate(
              { walleeTransactionId: transaction.id },
              {
                $set: {
                  entityId: entityIdObj,
                  eventId: eventIdObj,
                  userId: userIdObj,
                  walleeTransactionId: transaction.id,
                  totalAmount: totalAmount || 0,
                  platformCommission: 0,
                  merchantAmount: 0,
                  platformFeesPercent: metadata.platformFeesPercent
                    ? Number(metadata.platformFeesPercent)
                    : 0,
                  currency: transaction.currency,
                  status: "CANCELLED",
                  metadata: {
                    transactionState: transaction.state,
                    voidedOn: new Date().toISOString(),
                    paymentFlow: "MERCHANT_FULL_PAYMENT",
                    merchantSpaceId: merchantSpaceId,
                    transactionSpaceId: merchantSpaceId,
                  },
                },
              },
              { upsert: true, new: true }
            );
            console.log("✅ Commission record upserted for VOIDED transaction");
          } catch (err) {
            console.error(
              "❌ Error upserting commission for VOIDED:",
              err.message
            );
          }
        }
        break;

      case "DECLINE":
        console.log("\n⛔ PAYMENT DECLINED");
        console.log(
          "─────────────────────────────────────────────────────────────"
        );
        console.log("🆔 Transaction ID:", transaction.id);
        console.log("📊 State: DECLINE");
        console.log("❌ Payment was declined by payment provider");

        // Track declined transaction in Commission for transaction logs
        if (entityIdFromMetadata) {
          try {
            const entityIdObj = new mongoose.Types.ObjectId(
              entityIdFromMetadata
            );
            const eventIdObj = eventId
              ? new mongoose.Types.ObjectId(eventId)
              : null;
            const userIdObj = userId
              ? new mongoose.Types.ObjectId(userId)
              : null;

            await Commission.findOneAndUpdate(
              { walleeTransactionId: transaction.id },
              {
                $set: {
                  entityId: entityIdObj,
                  eventId: eventIdObj,
                  userId: userIdObj,
                  walleeTransactionId: transaction.id,
                  totalAmount: totalAmount || 0,
                  platformCommission: 0,
                  merchantAmount: 0,
                  platformFeesPercent: metadata.platformFeesPercent
                    ? Number(metadata.platformFeesPercent)
                    : 0,
                  currency: transaction.currency,
                  status: "CANCELLED",
                  metadata: {
                    transactionState: transaction.state,
                    declinedOn: new Date().toISOString(),
                    paymentFlow: "MERCHANT_FULL_PAYMENT",
                    merchantSpaceId: merchantSpaceId,
                    transactionSpaceId: merchantSpaceId,
                  },
                },
              },
              { upsert: true, new: true }
            );
            console.log(
              "✅ Commission record upserted for DECLINE transaction"
            );
          } catch (err) {
            console.error(
              "❌ Error upserting commission for DECLINE:",
              err.message
            );
          }
        }
        break;

      case "PENDING":
        console.log("\n⏳ PAYMENT PENDING");
        console.log(
          "─────────────────────────────────────────────────────────────"
        );
        console.log("🆔 Transaction ID:", transaction.id);
        console.log("📊 State: PENDING");
        console.log("ℹ️ Payment is still pending processing");

        // Track pending transaction in Commission for transaction logs
        if (entityIdFromMetadata) {
          try {
            const entityIdObj = new mongoose.Types.ObjectId(
              entityIdFromMetadata
            );
            const eventIdObj = eventId
              ? new mongoose.Types.ObjectId(eventId)
              : null;
            const userIdObj = userId
              ? new mongoose.Types.ObjectId(userId)
              : null;

            await Commission.findOneAndUpdate(
              { walleeTransactionId: transaction.id },
              {
                $set: {
                  entityId: entityIdObj,
                  eventId: eventIdObj,
                  userId: userIdObj,
                  walleeTransactionId: transaction.id,
                  totalAmount: totalAmount || 0,
                  platformCommission: 0,
                  merchantAmount: 0,
                  platformFeesPercent: metadata.platformFeesPercent
                    ? Number(metadata.platformFeesPercent)
                    : 0,
                  currency: transaction.currency,
                  status: "PENDING",
                  metadata: {
                    transactionState: transaction.state,
                    paymentFlow: "MERCHANT_FULL_PAYMENT",
                    merchantSpaceId: merchantSpaceId,
                    transactionSpaceId: merchantSpaceId,
                  },
                },
              },
              { upsert: true, new: true }
            );
            console.log(
              "✅ Commission record upserted for PENDING transaction"
            );
          } catch (err) {
            console.error(
              "❌ Error upserting commission for PENDING:",
              err.message
            );
          }
        }
        break;

      case "PROCESSING":
        console.log("\n🔄 PAYMENT PROCESSING");
        console.log(
          "─────────────────────────────────────────────────────────────"
        );
        console.log("🆔 Transaction ID:", transaction.id);
        console.log("📊 State: PROCESSING");
        console.log("ℹ️ Payment is currently being processed");

        // Track processing transaction in Commission for transaction logs
        if (entityIdFromMetadata) {
          try {
            const entityIdObj = new mongoose.Types.ObjectId(
              entityIdFromMetadata
            );
            const eventIdObj = eventId
              ? new mongoose.Types.ObjectId(eventId)
              : null;
            const userIdObj = userId
              ? new mongoose.Types.ObjectId(userId)
              : null;

            await Commission.findOneAndUpdate(
              { walleeTransactionId: transaction.id },
              {
                $set: {
                  entityId: entityIdObj,
                  eventId: eventIdObj,
                  userId: userIdObj,
                  walleeTransactionId: transaction.id,
                  totalAmount: totalAmount || 0,
                  platformCommission: 0,
                  merchantAmount: 0,
                  platformFeesPercent: metadata.platformFeesPercent
                    ? Number(metadata.platformFeesPercent)
                    : 0,
                  currency: transaction.currency,
                  status: "PENDING",
                  metadata: {
                    transactionState: transaction.state,
                    paymentFlow: "MERCHANT_FULL_PAYMENT",
                    merchantSpaceId: merchantSpaceId,
                    transactionSpaceId: merchantSpaceId,
                  },
                },
              },
              { upsert: true, new: true }
            );
            console.log(
              "✅ Commission record upserted for PROCESSING transaction"
            );
          } catch (err) {
            console.error(
              "❌ Error upserting commission for PROCESSING:",
              err.message
            );
          }
        }
        break;

      default:
        console.log("\n⚠️ UNHANDLED TRANSACTION STATE");
        console.log(
          "─────────────────────────────────────────────────────────────"
        );
        console.log("🆔 Transaction ID:", transaction.id);
        console.log("📊 State:", transaction.state);
        console.log("⚠️ This state is not explicitly handled");
    }

    const webhookDuration = Date.now() - webhookStartTime;
    console.log(
      "\n╔══════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║     ✅ WEBHOOK PROCESSED SUCCESSFULLY                        ║"
    );
    console.log(
      "╚══════════════════════════════════════════════════════════════╝"
    );
    console.log("⏱️ Total processing time:", webhookDuration, "ms");
    console.log("🆔 Transaction ID:", transaction.id);
    console.log("📊 Final State:", transaction.state);
    console.log("🌐 Space ID:", merchantSpaceId);
    console.log(
      "─────────────────────────────────────────────────────────────\n"
    );

    return {
      received: true,
      transactionId: transaction.id,
      state: transaction.state,
      processingTimeMs: webhookDuration,
      spaceId: merchantSpaceId,
    };
  } catch (error) {
    const webhookDuration = Date.now() - webhookStartTime;
    console.error(
      "\n╔══════════════════════════════════════════════════════════════╗"
    );
    console.error(
      "║     ❌ WEBHOOK PROCESSING FAILED                             ║"
    );
    console.error(
      "╚══════════════════════════════════════════════════════════════╝"
    );
    console.error("⏱️ Processing time before error:", webhookDuration, "ms");
    console.error("❌ Error:", error.message);
    console.error("📋 Error name:", error.name);
    console.error("📋 Error stack:", error.stack);

    if (error.response) {
      console.error("📡 HTTP Response Status:", error.response.status);
      console.error("📡 HTTP Response Status Text:", error.response.statusText);
    }

    if (error.status) {
      console.error("📊 Error Status Code:", error.status);
    }

    console.error(
      "─────────────────────────────────────────────────────────────\n"
    );

    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: error.message || t("WALLEE_WEBHOOK_ERROR", lang),
    });
  }
};

/**
 * Store merchant's Wallee Space ID
 * In this model, merchants create their own Wallee space on Wallee dashboard
 * and provide the Space ID to the platform for storage
 *
 * Flow:
 * 1. Merchant signs up on Wallee dashboard
 * 2. Merchant completes KYC and bank account setup
 * 3. Merchant creates a Wallee space
 * 4. Merchant shares their Space ID with platform
 * 5. Platform validates and stores the Space ID
 */
const createWalleeOnboardingLink = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    entityId,
    body: { spaceId },
  } = req;

  console.log("========== STORING MERCHANT SPACE ID ==========");
  console.log("Entity ID:", entityId);
  console.log("Space ID received:", spaceId);

  // Validate required fields
  if (!entityId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_MISSING_ENTITY_ID", lang),
    });
  }

  if (!spaceId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_MISSING_SPACE_ID", lang),
    });
  }

  // Validate spaceId is a number
  const spaceIdNumber = Number(spaceId);
  if (isNaN(spaceIdNumber) || spaceIdNumber <= 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_INVALID_SPACE_ID", lang),
    });
  }

  try {
    // Check if entity exists
    const entity = await EntityDetails.findById(entityId);
    if (!entity) {
      throwError({
        status: STATUS_CODES.NOT_FOUND,
        message: t("ENTITY_NOT_FOUND", lang),
      });
    }

    // Check if space ID is already stored
    if (entity.walleeSpaceId && entity.walleeSpaceId === spaceIdNumber) {
      console.log("✅ Space ID already stored for this entity");
      return {
        success: true,
        message: t("WALLEE_SPACE_ID_ALREADY_STORED", lang),
        spaceId: spaceIdNumber,
      };
    }

    console.log("Validating Space ID with Wallee API...");

    // Validate the Space ID exists in Wallee
    // This ensures the merchant provided a valid Space ID
    try {
      const space = await spacesService.getSpacesId({
        id: spaceIdNumber,
      });

      console.log("✅ Space ID validated successfully");
      console.log("========== SPACE DETAILS FROM WALLEE ==========");
      console.log("Full Space Object:", JSON.stringify(space, null, 2));
      console.log("Available Space Fields:", Object.keys(space).join(", "));
      console.log("==============================================");

      // Log key fields that are commonly available
      const spaceDetails = {
        id: space.id,
        name: space.name,
        state: space.state,
        primaryCurrency: space.primaryCurrency,
        requestLimit: space.requestLimit,
        createdOn: space.createdOn,
        updatedOn: space.updatedOn,
        // Address information
        postalAddress: space.postalAddress,
        // Administrator info
        administratorEmail: space.administratorEmail,
        administratorFirstName: space.administratorFirstName,
        administratorLastName: space.administratorLastName,
        administratorLocale: space.administratorLocale,
        // Technical contacts
        technicalContactAddresses: space.technicalContactAddresses,
        // Account reference
        account: space.account,
        // Payment configurations (if available)
        paymentMethodConfigurations: space.paymentMethodConfigurations,
        // Bank accounts (if available)
        bankAccounts: space.bankAccounts,
        // Additional fields
        timeZone: space.timeZone,
        logo: space.logo,
        plannedPurgeDate: space.plannedPurgeDate,
        version: space.version,
      };

      console.log("Key Space Details:", JSON.stringify(spaceDetails, null, 2));

      // Store the Space ID in EntityDetails
      await EntityDetails.updateOne(
        { _id: entityId },
        {
          walleeSpaceId: spaceIdNumber,
          // Clear old onboarding URL since merchant handles onboarding themselves
          walleeOnboardingUrl: null,
          bankLinkUrl: null,
        }
      );

      console.log("✅ Space ID stored successfully in database");

      return {
        success: true,
        message: t("WALLEE_SPACE_ID_STORED_SUCCESS", lang),
        spaceId: spaceIdNumber,
        spaceName: space.name,
        spaceState: space.state,
        // Additional space details available
        spaceDetails: {
          primaryCurrency: space.primaryCurrency,
          administratorEmail: space.administratorEmail,
          administratorName: `${space.administratorFirstName || ""} ${
            space.administratorLastName || ""
          }`.trim(),
          createdOn: space.createdOn,
          timeZone: space.timeZone,
          requestLimit: space.requestLimit,
          // Include postal address if available
          ...(space.postalAddress && { postalAddress: space.postalAddress }),
        },
      };
    } catch (walleeError) {
      console.error("❌ Error validating Space ID with Wallee:", walleeError);
      const errorDetails = await parseWalleeError(walleeError);

      // If space doesn't exist, return a helpful error
      if (walleeError.response?.status === 404) {
        throwError({
          status: STATUS_CODES.NOT_FOUND,
          message: t("WALLEE_SPACE_NOT_FOUND", lang),
        });
      }

      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message:
          errorDetails?.message || t("WALLEE_SPACE_VALIDATION_ERROR", lang),
      });
    }
  } catch (error) {
    console.error("Error storing Wallee Space ID:", error);

    // If error is already a throwError, re-throw it
    if (error.status) {
      throw error;
    }

    const errorDetails = await parseWalleeError(error);
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message:
        errorDetails?.message || t("WALLEE_SPACE_ID_STORAGE_ERROR", lang),
    });
  }
};

/**
 * Continue/resume Wallee merchant onboarding
 * Similar to Stripe's continueStripeOnboarding
 */
const continueWalleeOnboarding = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    entityId,
    body: { platform },
  } = req;

  if (!entityId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_MISSING_ENTITY_ID", lang),
    });
  }

  const entity = await EntityDetails.findById(entityId);
  if (!entity?.walleeSpaceId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_SPACE_NOT_FOUND_FOR_ENTITY", lang),
    });
  }

  try {
    const isMobile = platform === "app";
    const redirectUrl = isMobile
      ? `${process.env.HOST_URL}/bank`
      : `${process.env.HOST_URL}/app/profile/bank-account`;

    // Generate onboarding URL for existing space
    const onboardingUrl = `https://app-wallee.com/${
      entity.walleeSpaceId
    }/account/onboarding?returnUrl=${encodeURIComponent(redirectUrl)}`;

    await EntityDetails.updateOne(
      { _id: entityId },
      {
        walleeOnboardingUrl: onboardingUrl,
        bankLinkUrl: onboardingUrl, // Update bankLinkUrl for backward compatibility
      }
    );

    return {
      success: true,
      url: onboardingUrl,
      spaceId: entity.walleeSpaceId,
    };
  } catch (error) {
    console.error("Error continuing Wallee onboarding:", error);
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: error.message || t("WALLEE_ONBOARDING_CONTINUE_ERROR", lang),
    });
  }
};

/**
 * Check Wallee merchant account status
 * Similar to Stripe's checkStripeAccountMissingFields
 */
const checkWalleeAccountStatus = async (req) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { entityId } = req;

    if (!entityId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("WALLEE_MISSING_ENTITY_ID", lang),
      });
    }

    const entity = await EntityDetails.findById(entityId);
    if (!entity?.walleeSpaceId) {
      return {
        success: true,
        message: t("WALLEE_SPACE_NOT_ASSOCIATED", lang),
        hasMissingFields: true,
        missingFields: [],
        isOnboarded: false,
      };
    }

    try {
      // Fetch space details from Wallee
      const space = await spacesService.getSpacesId({
        id: entity.walleeSpaceId,
      });

      const missingFields = [];

      // Check if space is active
      if (space.state !== "ACTIVE") {
        missingFields.push("Space activation");
      }

      // Check if payment methods are configured
      // Note: This may require additional API calls depending on Wallee's API structure
      if (
        !space.paymentMethodConfigurations ||
        space.paymentMethodConfigurations.length === 0
      ) {
        missingFields.push("Payment method configuration");
      }

      // Check if bank account is configured
      // Note: Wallee may use different endpoints for bank account verification
      // This is a placeholder - adjust based on actual Wallee API structure
      if (!space.bankAccounts || space.bankAccounts.length === 0) {
        missingFields.push("Bank account");
      }

      return {
        success: true,
        message: t("WALLEE_ACCOUNT_CHECK_COMPLETE", lang),
        hasMissingFields: !!missingFields.length,
        missingFields,
        isOnboarded: space.state === "ACTIVE" && missingFields.length === 0,
        spaceState: space.state,
      };
    } catch (err) {
      console.error("Wallee space retrieve failed:", err);
      return {
        success: true,
        message: t("WALLEE_SPACE_INACCESSIBLE", lang),
        hasMissingFields: true,
        missingFields: [],
        isOnboarded: false,
      };
    }
  } catch (error) {
    console.error("Wallee Account Check Error:", error);
    throwError({
      status: STATUS_CODES.INTERNAL_SERVER_ERROR,
      message: t("WALLEE_ACCOUNT_CHECK_FAILED", lang),
    });
  }
};

/**
 * Get Wallee Space details by Space ID
 * Similar to Stripe's getStripeAccount
 */
const getWalleeSpace = async (req) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { spaceId } = req.query;

    if (!spaceId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("WALLEE_MISSING_SPACE_ID", lang),
      });
    }

    const spaceIdNumber = Number(spaceId);
    if (isNaN(spaceIdNumber) || spaceIdNumber <= 0) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("WALLEE_INVALID_SPACE_ID", lang),
      });
    }

    console.log("========== FETCHING WALLEE SPACE DETAILS ==========");
    console.log("Space ID:", spaceIdNumber);

    // Fetch space details from Wallee
    const space = await spacesService.getSpacesId({
      id: spaceIdNumber,
    });

    if (!space) {
      return {
        error: t("WALLEE_SPACE_NOT_FOUND", lang),
      };
    }

    console.log("✅ Space details fetched successfully");
    console.log("Space Name:", space.name);
    console.log("Space State:", space.state);

    // Format space details similar to Stripe account structure
    const spaceDetails = {
      id: space.id,
      name: space.name,
      state: space.state,
      primaryCurrency: space.primaryCurrency,
      requestLimit: space.requestLimit,
      timeZone: space.timeZone,
      administratorEmail: space.administratorEmail,
      administratorFirstName: space.administratorFirstName,
      administratorLastName: space.administratorLastName,
      administratorLocale: space.administratorLocale,
      technicalContactAddresses: space.technicalContactAddresses,
      postalAddress: space.postalAddress,
      account: space.account,
      createdOn: space.createdOn,
      updatedOn: space.updatedOn,
      version: space.version,
      // Additional fields
      logo: space.logo,
      plannedPurgeDate: space.plannedPurgeDate,
    };

    // Note: Bank accounts and payment methods may require separate API calls
    // For now, we return what's available in the space object
    return {
      space: spaceDetails,
      // Include payment method configurations if available
      paymentMethodConfigurations: space.paymentMethodConfigurations || [],
      // Include bank accounts if available (may be empty array if not in space object)
      bankAccounts: space.bankAccounts || [],
    };
  } catch (err) {
    console.error("Error fetching Wallee space:", err);
    const errorDetails = await parseWalleeError(err);

    // If space doesn't exist, return error
    if (err.response?.status === 404) {
      return {
        error: t("WALLEE_SPACE_NOT_FOUND", lang),
      };
    }

    return {
      error:
        errorDetails?.message ||
        err.message ||
        t("WALLEE_SPACE_FETCH_ERROR", lang),
    };
  }
};

module.exports = {
  createWalleeTransaction,
  getWalleeTransactionStatus,
  handleWalleeWebhook,
  createWalleeOnboardingLink,
  continueWalleeOnboarding,
  checkWalleeAccountStatus,
  getWalleeSpace,
};
