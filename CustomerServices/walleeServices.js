const {
  TransactionsService,
  Configuration,
  HttpBearerAuth,
  WebhookEncryptionKeysService,
  SpacesService,
  ApplicationUsersService,
  AccountsService,
  AccountScope,
  PaymentMethodConfigurationsService,
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
const { getIo } = require("../Utils/socket");
const { sendFirebaseNotification } = require("../Utils/commonFunction");
const {
  genrateCustomerOrderReport,
} = require("../PdfServices/customerOrderReport");

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
const paymentMethodConfigurationsService =
  new PaymentMethodConfigurationsService(config);

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
    body: { amount, currency, eventId, orderId },
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
    console.error("Wallee: merchant space ID missing for entity", entityId);
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_MERCHANT_SPACE_NOT_FOUND", lang),
    });
  }

  // Validate spaceId is a valid number
  const merchantSpaceIdNumber = Number(merchantSpaceId);
  if (isNaN(merchantSpaceIdNumber) || merchantSpaceIdNumber <= 0) {
    console.error(
      "Wallee: invalid space ID",
      merchantSpaceId,
      "for entity",
      entityId
    );
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_INVALID_SPACE_ID", lang),
    });
  }

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

    // Resolve a Wallee locale for the transaction. The request language is a short
    // code (e.g. "en"/"de"); Wallee expects a full locale. An unset language can
    // break the native SDK sheet rendering, so always set it explicitly.
    const localeMap = { de: "de-CH", en: "en-US" };
    const transactionLanguage = localeMap[lang] || "en-US";

    // Optional: restrict the payment methods offered in the SDK sheet. Set
    // WALLEE_ALLOWED_PAYMENT_METHOD_CONFIGS to a comma-separated list of Wallee
    // payment method configuration IDs (space-specific) to limit the sheet to
    // those methods only. Leave unset to offer all configured methods.
    const allowedPaymentMethodConfigurations = (
      process.env.WALLEE_ALLOWED_PAYMENT_METHOD_CONFIGS || ""
    )
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);

    // Create transaction object
    const transactionCreate = {
      lineItems: lineItems,
      autoConfirmationEnabled: true,
      currency: currency.toUpperCase(),
      language: transactionLanguage,
      customerEmailAddress: customerEmail || undefined,
      ...(allowedPaymentMethodConfigurations.length > 0 && {
        allowedPaymentMethodConfigurations,
      }),
      metaData: {
        userId: reqUserId,
        eventId: eventId,
        orderId: orderId || undefined,
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

    const transaction = await transactionsService.postPaymentTransactions({
      space: merchantSpaceIdNumber, // Use validated number
      transactionCreate: transactionCreate,
    });

    // Get the payment page URL from merchant's space
    const paymentPageUrl =
      await transactionsService.getPaymentTransactionsIdPaymentPageUrl({
        space: merchantSpaceIdNumber, // Use validated number
        id: transaction.id,
      });

    // Generate the short-lived credentials token for the native Wallee Mobile SDK.
    // Same transaction + same merchant space used for creation. This is additive:
    // if it fails, the app falls back to the WebView via paymentPageUrl, so we do
    // not fail the request (the transaction is already created).
    let mobileSdkToken = "";
    try {
      mobileSdkToken =
        await transactionsService.getPaymentTransactionsIdCredentials({
          space: merchantSpaceIdNumber, // Use validated number
          id: transaction.id,
        });
      // Never log the token value itself — only confirm it is a non-empty string.
      console.log(
        `Wallee mobile SDK token generated for transaction ${transaction.id}: ${
          typeof mobileSdkToken === "string" && mobileSdkToken.length > 0
            ? "ok"
            : "empty"
        }`
      );
    } catch (credError) {
      mobileSdkToken = "";
      console.error(
        `Failed to generate Wallee mobile SDK token for transaction ${transaction.id}; app will fall back to WebView:`,
        credError?.message || credError
      );
    }

    return {
      type: "payment_page",
      url: paymentPageUrl,
      transactionId: transaction.id,
      state: transaction.state,
      mobileSdkToken,
    };
  } catch (error) {
    const errorDetails = await parseWalleeError(error);
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
  const { transactionId, entityId, eventId } = req.query;

  if (!transactionId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("WALLEE_TRANSACTION_ID_REQUIRED", lang),
    });
  }

  // Resolve which Wallee space the transaction lives in.
  // Primary: eventId -> event.entityId.walleeSpaceId. This is the SAME chain
  // create-payment uses to decide where the transaction is created, so create
  // and status always resolve to the same space (see createWalleeTransaction).
  // Secondary: entityId -> EntityDetails.walleeSpaceId (backward compatible).
  // Platform space is only a last-resort candidate (e.g. countr's own space).
  const candidateSpaces = [];
  const pushSpace = (id) => {
    const n = Number(id);
    if (n && !isNaN(n) && n > 0 && !candidateSpaces.includes(n)) {
      candidateSpaces.push(n);
    }
  };

  if (eventId) {
    try {
      const event = await Event.findById(eventId).populate({
        path: "entityId",
        select: "walleeSpaceId",
      });
      if (event?.entityId?.walleeSpaceId) {
        pushSpace(event.entityId.walleeSpaceId);
      }
    } catch (err) {
      console.error(
        "Error resolving space from eventId for transaction status:",
        err.message
      );
    }
  }

  // Also resolve from the webhook-recorded Commission (keyed by the Wallee
  // transaction id, which the client always sends). The webhook stores the
  // space it fetched the transaction from, so this resolves the space even
  // when eventId/entityId are absent — provided at least one webhook has
  // already been received for this transaction.
  try {
    const commission = await Commission.findOne({
      walleeTransactionId: Number(transactionId),
    }).select("metadata");
    if (commission?.metadata?.merchantSpaceId) {
      pushSpace(commission.metadata.merchantSpaceId);
    }
  } catch (err) {
    console.error(
      "Error resolving space from Commission for transaction status:",
      err.message
    );
  }

  if (entityId) {
    try {
      const entity = await EntityDetails.findById(entityId).select(
        "walleeSpaceId"
      );
      if (entity?.walleeSpaceId) {
        pushSpace(entity.walleeSpaceId);
      }
    } catch (err) {
      console.error(
        "Error fetching entity for transaction status:",
        err.message
      );
    }
  }

  // Last-resort candidate: the platform space (countr's own transactions).
  pushSpace(spaceId);

  try {
    // Try each candidate space until the transaction is found. Because the
    // merchant space (from eventId) is tried first, this returns the correct
    // state without ever silently checking the wrong space.
    let transaction;
    let usedSpaceId;
    let lastError;
    for (const candidate of candidateSpaces) {
      try {
        transaction = await transactionsService.getPaymentTransactionsId({
          space: candidate,
          id: Number(transactionId),
        });
        usedSpaceId = candidate;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!transaction) {
      throw lastError || new Error("Transaction not found in any known space");
    }

    return {
      transactionId: transaction.id,
      state: transaction.state,
      currency: transaction.currency,
      authorizationAmount: transaction.authorizationAmount,
      completedOn: transaction.completedOn,
      failedOn: transaction.failedOn,
      failureReason: transaction.failureReason,
      spaceId: usedSpaceId, // Return which space the transaction was found in
    };
  } catch (error) {
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

  // 1. Extract and verify raw body
  let contentToVerify;
  try {
    contentToVerify = req.body.toString("utf8");
  } catch (bodyError) {
    console.error("Webhook: failed to extract body", bodyError.message);
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Failed to extract webhook body",
    });
  }

  // 2. Verify signature
  const signatureHeader = req.headers["x-signature"];
  if (!signatureHeader) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Missing webhook signature",
    });
  }

  try {
    const isValid = await webhookEncryptionService.isContentValid(
      signatureHeader,
      contentToVerify
    );
    if (!isValid) {
      throwError({
        status: STATUS_CODES.NOT_AUTHORIZED,
        message: "Invalid Wallee webhook signature",
      });
    }
  } catch (verificationError) {
    if (verificationError.status) throw verificationError;
    console.error(
      "Webhook: signature verification error",
      verificationError.message
    );
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: "Webhook signature verification failed",
    });
  }

  // 3. Parse payload
  let payload;
  try {
    payload = JSON.parse(contentToVerify);
  } catch (parseError) {
    console.error("Webhook: invalid JSON payload", parseError.message);
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: "Invalid JSON payload",
    });
  }

  const {
    entityId,
    listenerEntityTechnicalName,
    spaceId: webhookSpaceId,
  } = payload;

  try {
    // 4. Only handle Transaction webhooks
    if (listenerEntityTechnicalName !== "Transaction") {
      return {
        received: true,
        skipped: true,
        reason: "Not a Transaction webhook",
        webhookType: listenerEntityTechnicalName,
      };
    }

    // 5. Validate space ID
    if (!webhookSpaceId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Webhook missing spaceId",
      });
    }

    const transactionSpaceIdNumber = Number(webhookSpaceId);
    if (isNaN(transactionSpaceIdNumber) || transactionSpaceIdNumber <= 0) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: "Invalid Space ID format in webhook",
      });
    }

    // 6. Fetch transaction from Wallee
    let transaction;
    try {
      transaction = await transactionsService.getPaymentTransactionsId({
        space: transactionSpaceIdNumber,
        id: Number(entityId),
      });
    } catch (fetchError) {
      console.error(
        "Webhook: failed to fetch transaction",
        entityId,
        "from space",
        transactionSpaceIdNumber,
        fetchError.message
      );
      throw fetchError;
    }

    // 7. Extract metadata
    const metadata = transaction.metaData || {};
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
    const orderId = metadata.orderId;
    const entityIdFromMetadata = metadata.entityId;
    const merchantSpaceId = transactionSpaceIdNumber;

    console.log(
      `Webhook: txn=${transaction.id} state=${transaction.state} orderId=${
        orderId || "N/A"
      } amount=${totalAmount} ${transaction.currency}`
    );

    // 8. Handle states
    switch (transaction.state) {
      case "FULFILL":
      case "COMPLETED":
      case "AUTHORIZED": {
        // Commission tracking
        if (
          platformCommission &&
          platformCommission > 0 &&
          entityIdFromMetadata
        ) {
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

            // Notify admin dashboard
            try {
              getIo()?.to("admin_room").emit("adminDashboardUpdate", {
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
            console.error(
              "Webhook: commission tracking error",
              commissionError.message
            );
          }
        }

        // Order update + notifications
        if (orderId) {
          try {
            const order = await Order.findOne({
              _id: new mongoose.Types.ObjectId(orderId),
              status: ORDER_STATUS.PAYMENT_PROCESSING,
            });
            const orders = order ? [order] : [];

            if (orders.length > 0) {
              const paymentMethod =
                transaction.paymentConnectorConfiguration
                  ?.paymentMethodConfiguration?.name ||
                transaction.paymentConnectorConfiguration?.name ||
                null;

              await Order.updateOne(
                {
                  _id: new mongoose.Types.ObjectId(orderId),
                  status: ORDER_STATUS.PAYMENT_PROCESSING,
                },
                {
                  $set: {
                    status: ORDER_STATUS.WAITING,
                    ...(paymentMethod && { paymentMethod }),
                  },
                }
              );

              console.log(
                `Webhook: order ${orderId} -> WAITING${
                  paymentMethod ? ` via ${paymentMethod}` : ""
                }`
              );

              orders.forEach((o) => {
                o.status = ORDER_STATUS.WAITING;
              });

              for (const order of orders) {
                getIo()
                  ?.to(order.entityId.toString())
                  .emit("newOrder", [order]);
              }

              // Firebase notification to owner
              const entityIdStr = orders[0].entityId.toString();
              sendFirebaseNotification({
                topic: `owner_entity_${entityIdStr}`,
                showNotification: true,
                alertSound: true,
                title: "Order received",
                body: "You have a new order. Tap to view.",
                data: {
                  action: "order_create",
                  screen: "order_screen",
                  orderId: orders[0]._id.toString(),
                  entityId: entityIdStr,
                  click_action: "FLUTTER_NOTIFICATION_CLICK",
                  topic: `owner_entity_${entityIdStr}`,
                },
              });

              // Generate customer order report
              for (const order of orders) {
                genrateCustomerOrderReport({
                  userId: order.userId,
                  entityId: order.entityId,
                  orders: order,
                  mode: "Online",
                });
              }
            }
          } catch (orderUpdateError) {
            console.error(
              "Webhook: order update error",
              orderUpdateError.message
            );
          }
        }
        break;
      }

      case "FAILED": {
        console.log(
          `Webhook: FAILED txn=${transaction.id} reason=${
            transaction.failureReason || "N/A"
          }`
        );

        // Track failed transaction in Commission
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
          } catch (err) {
            console.error(
              "Webhook: commission upsert error (FAILED):",
              err.message
            );
          }
        }

        // Update order to PAYMENT_FAILED
        if (orderId) {
          try {
            const orderIdObj = new mongoose.Types.ObjectId(orderId);
            const failedOrder = await Order.findOne({
              _id: orderIdObj,
              status: ORDER_STATUS.PAYMENT_PROCESSING,
            });
            if (failedOrder) {
              await Order.updateOne(
                { _id: orderIdObj, status: ORDER_STATUS.PAYMENT_PROCESSING },
                { $set: { status: ORDER_STATUS.PAYMENT_FAILED } }
              );
              sendFirebaseNotification({
                topic: `user_${failedOrder.userId}`,
                showNotification: true,
                title: "Payment Failed",
                body: `Your payment for order #${failedOrder.tokenNumber} has failed.`,
                data: {
                  orderId: failedOrder._id.toString(),
                  status: ORDER_STATUS.PAYMENT_FAILED,
                  action: "payment_failed",
                  screen: "status",
                  click_action: "FLUTTER_NOTIFICATION_CLICK",
                },
              });
            }
          } catch (err) {
            console.error("Webhook: order update error (FAILED):", err.message);
          }
        }
        break;
      }

      case "VOIDED": {
        console.log(`Webhook: VOIDED txn=${transaction.id}`);

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
          } catch (err) {
            console.error(
              "Webhook: commission upsert error (VOIDED):",
              err.message
            );
          }
        }

        if (orderId) {
          try {
            const orderIdObj = new mongoose.Types.ObjectId(orderId);
            const failedOrder = await Order.findOne({
              _id: orderIdObj,
              status: ORDER_STATUS.PAYMENT_PROCESSING,
            });
            if (failedOrder) {
              await Order.updateOne(
                { _id: orderIdObj, status: ORDER_STATUS.PAYMENT_PROCESSING },
                { $set: { status: ORDER_STATUS.PAYMENT_FAILED } }
              );
              sendFirebaseNotification({
                topic: `user_${failedOrder.userId}`,
                showNotification: true,
                title: "Payment Failed",
                body: `Your payment for order #${failedOrder.tokenNumber} has failed.`,
                data: {
                  orderId: failedOrder._id.toString(),
                  status: ORDER_STATUS.PAYMENT_FAILED,
                  action: "payment_failed",
                  screen: "status",
                  click_action: "FLUTTER_NOTIFICATION_CLICK",
                },
              });
            }
          } catch (err) {
            console.error("Webhook: order update error (VOIDED):", err.message);
          }
        }
        break;
      }

      case "DECLINE": {
        console.log(`Webhook: DECLINED txn=${transaction.id}`);

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
          } catch (err) {
            console.error(
              "Webhook: commission upsert error (DECLINE):",
              err.message
            );
          }
        }

        if (orderId) {
          try {
            const orderIdObj = new mongoose.Types.ObjectId(orderId);
            const failedOrder = await Order.findOne({
              _id: orderIdObj,
              status: ORDER_STATUS.PAYMENT_PROCESSING,
            });
            if (failedOrder) {
              await Order.updateOne(
                { _id: orderIdObj, status: ORDER_STATUS.PAYMENT_PROCESSING },
                { $set: { status: ORDER_STATUS.PAYMENT_FAILED } }
              );
              sendFirebaseNotification({
                topic: `user_${failedOrder.userId}`,
                showNotification: true,
                title: "Payment Declined",
                body: `Your payment for order #${failedOrder.tokenNumber} was declined.`,
                data: {
                  orderId: failedOrder._id.toString(),
                  status: ORDER_STATUS.PAYMENT_FAILED,
                  action: "payment_failed",
                  screen: "status",
                  click_action: "FLUTTER_NOTIFICATION_CLICK",
                },
              });
            }
          } catch (err) {
            console.error(
              "Webhook: order update error (DECLINE):",
              err.message
            );
          }
        }
        break;
      }

      case "CONFIRMED":
        // Auto-confirmation fires before payment — no action needed
        break;

      case "PENDING": {
        // Track pending transaction in Commission
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
          } catch (err) {
            console.error(
              "Webhook: commission upsert error (PENDING):",
              err.message
            );
          }
        }
        break;
      }

      case "PROCESSING": {
        // Track processing transaction in Commission
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
          } catch (err) {
            console.error(
              "Webhook: commission upsert error (PROCESSING):",
              err.message
            );
          }
        }
        break;
      }

      default:
        console.log(
          `Webhook: unhandled state ${transaction.state} for txn=${transaction.id}`
        );
    }

    return {
      received: true,
      transactionId: transaction.id,
      state: transaction.state,
      spaceId: merchantSpaceId,
    };
  } catch (error) {
    console.error(`Webhook error: ${error.message}`, error.stack);
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
      return {
        success: true,
        message: t("WALLEE_SPACE_ID_ALREADY_STORED", lang),
        spaceId: spaceIdNumber,
      };
    }

    // Validate the Space ID exists in Wallee
    try {
      const space = await spacesService.getSpacesId({
        id: spaceIdNumber,
      });

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
    console.error("Wallee onboarding error:", error.message);
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
      console.error("Wallee space retrieve failed:", err.message);
      return {
        success: true,
        message: t("WALLEE_SPACE_INACCESSIBLE", lang),
        hasMissingFields: true,
        missingFields: [],
        isOnboarded: false,
      };
    }
  } catch (error) {
    console.error("Wallee Account Check Error:", error.message);
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

    const space = await spacesService.getSpacesId({
      id: spaceIdNumber,
    });

    if (!space) {
      return {
        error: t("WALLEE_SPACE_NOT_FOUND", lang),
      };
    }

    // Format space details
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

/**
 * List the payment method configurations for a merchant space. Diagnostic helper
 * to discover the numeric configuration IDs used by
 * WALLEE_ALLOWED_PAYMENT_METHOD_CONFIGS (to restrict the SDK payment sheet).
 *
 * Space resolution (in priority order):
 *   1) req.query.eventId  -> event.entityId.walleeSpaceId (same chain as create-payment)
 *   2) req.query.spaceId  -> used directly
 */
const getWalleePaymentMethodConfigurations = async (req) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { eventId, spaceId } = req.query;

    let resolvedSpaceId;
    if (eventId) {
      const event = await Event.findById(eventId).populate({
        path: "entityId",
        select: "walleeSpaceId",
      });
      resolvedSpaceId = event?.entityId?.walleeSpaceId;
    } else if (spaceId) {
      resolvedSpaceId = spaceId;
    }

    const spaceIdNumber = Number(resolvedSpaceId);
    if (isNaN(spaceIdNumber) || spaceIdNumber <= 0) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("WALLEE_INVALID_SPACE_ID", lang),
      });
    }

    const response =
      await paymentMethodConfigurationsService.getPaymentMethodConfigurations({
        space: spaceIdNumber,
      });

    const configurations = (response?.data || []).map((config) => ({
      id: config.id,
      name: config.name,
      state: config.state,
    }));

    return {
      spaceId: spaceIdNumber,
      // Only ACTIVE configs are offered in the payment sheet; those are the ones
      // worth putting in WALLEE_ALLOWED_PAYMENT_METHOD_CONFIGS.
      activeConfigurationIds: configurations
        .filter((c) => c.state === "ACTIVE")
        .map((c) => c.id),
      configurations,
    };
  } catch (err) {
    const errorDetails = await parseWalleeError(err);
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
  getWalleePaymentMethodConfigurations,
};
