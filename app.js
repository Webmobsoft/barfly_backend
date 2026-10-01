const express = require("express");
require("./db");
require("./redis");
require("./cron/emitEvent");
require("./server");
require("./Utils/bullQueue");
require("./Utils/emitProcessor");
// const setupCron = require("./cron/cron");

const path = require("path");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");

// Enable CORS first (before any routes)
app.use(cors());

// IMPORTANT: Wallee webhook must be registered BEFORE bodyParser.json()
// because it needs the raw body (Buffer) for signature verification
const { handleWalleeWebhook } = require("./CustomerServices/walleeServices");

// Log ALL requests to /api/wallee/webhook for debugging
// app.use("/api/wallee/webhook", (req, res, next) => {
//   console.log("📥 Webhook request received at:", new Date().toISOString());
//   next();
// });

// Wallee webhook endpoint - must use express.raw() to preserve raw body for signature verification
app.post(
  "/api/wallee/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const result = await handleWalleeWebhook(req);
      return res.status(200).json(result);
    } catch (error) {
      console.error("Webhook error:", error);
      return res.status(error.status || 500).json({ message: error.message });
    }
  },
);

// Fallback handler for webhook if express.raw() doesn't match
// app.post("/api/wallee/webhook-fallback", express.json(), async (req, res) => {
//   try {
//     console.log(">>> Wallee webhook FALLBACK handler hit!");
//     console.log(">>> Body:", JSON.stringify(req.body));
//     // Convert JSON body back to string for processing
//     req.body = Buffer.from(JSON.stringify(req.body));
//     const result = await handleWalleeWebhook(req);
//     return res.status(200).json(result);
//   } catch (error) {
//     console.error("Webhook fallback error:", error);
//     return res.status(error.status || 500).json({ message: error.message });
//   }
// });

// Stripe webhook - Commented out, using Wallee instead
// app.post(
//   "/webhooks",
//   express.raw({ type: "application/json" }),
//   async (req, res) => {
//     const sig = req.headers["stripe-signature"];

//     try {
//       const event = stripe.webhooks.constructEvent(
//         req.body,
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );

//       // Handle event
//       const intent = event.data.object;
//       switch (event.type) {
//         case "payment_intent.created":
//           await StripeModel.updateOne(
//             { stripePaymentIntentId: intent.id },
//             { $set: { paymentStatus: STRIPE_PAYMENT_STATUS.CREATED } }
//           );
//           break;
//         case "payment_intent.succeeded":
//           await StripeModel.updateOne(
//             { stripePaymentIntentId: intent.id },
//             { $set: { paymentStatus: STRIPE_PAYMENT_STATUS.SUCCESSFUL } }
//           );
//           break;
//         case "payment_intent.payment_failed":
//           await StripeModel.updateOne(
//             { stripePaymentIntentId: intent.id },
//             { $set: { paymentStatus: STRIPE_PAYMENT_STATUS.FAILED } }
//           );
//           break;

//         case "payment_intent.canceled":
//           await StripeModel.updateOne(
//             { stripePaymentIntentId: intent.id },
//             { $set: { paymentStatus: STRIPE_PAYMENT_STATUS.CANCELLED } }
//           );
//           break;

//         default:
//           console.log(`Unhandled event: ${event.type}`);
//       }

//       res.sendStatus(200);
//     } catch (err) {
//       console.error(`⚠️ Webhook error: ${err.message}`);
//       return res.status(400).send(`Webhook Error: ${err.message}`);
//     }
//   }
// );

// Note: cors() is already applied at the top before the webhook route
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
const { setIo } = require("./Utils/socket");
// const stripe = require("stripe"); // Commented out - using Wallee instead
// const StripeModel = require("./Models/Stripe"); // Commented out - using Wallee instead

const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  transports: ["websocket", "polling"],
});

const { orderSocket } = require("./server");
orderSocket(io);
setIo(io);

// setupCron(io);
module.exports = { io };

const orderController = require("./Controller/orderController");
// const StripeController = require("./Controller/stripeController"); // Commented out - using Wallee instead
const WalleeController = require("./Controller/walleeController");
const Counter = require("./Models/Counter");
const adminController = require("./Admin/controller");
const multer = require("multer");
const {
  uploadBufferToS3,
  generatePresignedUrl,
} = require("./Controller/aws-service");
const ItemDetails = require("./Models/ItemDetails");
const MenuItem = require("./Models/MenuItem");
const Admin = require("./Models/Admin");
const {
  STATUS_CODES,
  ORDER_STATUS,
  STRIPE_PAYMENT_STATUS,
} = require("./Utils/globalConstants");
const { ownerTrades } = require("./PdfServices/ownerTrades");
const verifyToken = require("./Utils/verifyToken");
const { sendFirebaseNotification } = require("./Utils/commonFunction");
const { t, getLanguageFromRequest } = require("./Utils/translator");
const User = require("./Models/User");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// const admin = require("./firebaseConfig");

const unProtectedApis = {
  "/api/customer/auth/login": true,
  "/api/customer/auth/register": true,
  "/api/customer/auth/countR-tag": true,
  "/api/customer/auth/send-email-otp": true,
  "/api/customer/auth/reset-password": true,
  "/api/get-entities": true,
  // "/api/customer/entities/get-entities": true,
  "/api/customer/entities/get-entity": true,
  "/api/customer/entities/visitor-count": true,
  "/api/customer/entities/get-counter-list": true,
  "/api/customer/entities/get-counter-menu-category": true,
  "/api/customer/entities/get-menu-category-items": true,
  "/api/customer/entities/recommended-items": true,
  "/api/customer/entities/newly-added-entities": true,
  "/api/customer/entities/popular-entities": true,
  "/api/customer/entities/entity-offers": true,
  "/api/customer/entities/get-tables-user-side": true,
  "/api/customer/entities/get-platform-fee": true,

  "/api/customer/entities/get-entities": true,
  "/api/owner/auth/register": true,
  "/api/owner/auth/login": true,
  "/api/owner/auth/send-email-otp": true,
  "/api/owner/auth/reset-password": true,
  "/api/customer/auth/check-and-generate-countR-tag": true,

  "/api/customer/entities/get-menu-category-items": true,
  "/api/customer/entities/recommended-items": true,
  // "/api/get-trade-pdf": true,
  "/api/owner/restaurant/email-exist": true,
  "/api/admins/login-admin": true,
  "/api/admins/reset-password": true,
  "/api/admins/send-email-otp": true,
  // "/api/admins/add-admin": true,

  // "/api/stripe/get-stripe-accounts": true, // Commented out - using Wallee instead
  // "/webhooks": true, // Stripe webhook - Commented out
  "/api/wallee/webhook": true, // Wallee webhook
};

app.use("/api/health-check", (req, res) => {
  return res.status(STATUS_CODES.OK).json({
    message: `countr service running...!`,
    time: new Date(),
  });
});

app.use("/.well-known", express.static(path.join(__dirname, ".well-known")));

// Optional: root route
app.get("/", (req, res) => {
  res.send("Apple Pay Domain Verification Running");
});

app.use((req, res, next) => {
  // Skip auth for unprotected APIs
  if (unProtectedApis[req.path]) return next();

  // Explicitly skip auth for Wallee webhook (handles both exact and with query params)
  if (
    req.path === "/api/wallee/webhook" ||
    req.path.startsWith("/api/wallee/webhook")
  ) {
    return next();
  }
  // console.log({ req: req.path }); // Noisy: logs every authenticated request

  return verifyToken(req, res, next);
});

app.use(
  "/api/owner/auth",
  require("./Controller/Owner/Authentication/controller"),
);
app.use("/api/survey", require("./Controller/Owner/Feedback/controller"));
app.use("/api/owner/restaurant", require("./Controller/Owner/controller"));
app.use(
  "/api/customer/auth",
  require("./Controller/Customer/Authentication/controller"),
);
app.use("/api/customer/entities", require("./Controller/Customer/controller"));

app.use("/api/orders", orderController);
// app.use("/api/stripe", StripeController); // Commented out - using Wallee instead
app.use("/api/wallee", WalleeController);
app.use("/api/admins", adminController);

const preloadPlatformFees = async () => {
  const admin = await Admin.findOne({ isAdmin: true }).lean();
  global.PLATFORM_FEES = admin?.platformFees || 0;
};

preloadPlatformFees();

app.post("/api/update-menu-items", async (req, res) => {
  try {
    const getMenuitems = await Counter.updateMany(
      {},
      { $set: { isTableService: false, isSelfPickUp: true, totalTables: 0 } },
    );
    return res.status(200).json(getMenuitems);
  } catch (error) {
    console.log("error occured in update-menu",error);
    return res.status(500).json({ error });
  }
});

app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    if (!req.file) {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: t("FILE_UPLOAD_MISSING", lang) });
    }
    const fileBuffer = req.file.buffer;
    const fileName = "coca-cola.png";

    const data = await uploadBufferToS3(fileBuffer, fileName);
    return res.status(200).json({
      message: t("FILE_UPLOAD_SUCCESS", lang),
      location: data.Location,
    });
  } catch (error) {
    console.log("error occured in update-menu", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("FILE_UPLOAD_FAILED", lang),
    });
  }
});

app.get("/api/download-file", async (req, res) => {
  try {
    const { fileName } = req.query;
    const fileStream = generatePresignedUrl(fileName);
    return res.status(200).json({ fileStream });
  } catch (error) {
    console.log("error occured in update-menu", error);
    return res.status(500).json({ error });
  }
});

app.post("/update-entity-items", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    // console.log({ ee: req.entityId });
    const itemsId = await ItemDetails.find({ entityId: req.entityId }).lean();
    // console.log({ itemsId });
    const itemIds = itemsId.map((item) => item.itemId);
    await MenuItem.updateMany(
      { _id: { $in: itemIds } },
      { $set: { entityId: req.entityId } },
    );
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ENTITY_ITEMS_UPDATE_SUCCESS", lang) });
  } catch (error) {
    return res
      .status(STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message });
  }
});

app.get("/api/get-trade-and-download-pdf", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const signedUrl = await ownerTrades(req);
    return res.status(STATUS_CODES.OK).json({ downloadUrl: signedUrl });
  } catch (error) {
    console.error("Error occurred while creating trade PDF", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("TRADE_PDF_GENERATION_ERROR", lang),
    });
  }
});

app.post("/send-firebase-notification", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  const { token, title, body } = req.body;

  if (!token)
    return res
      .status(STATUS_CODES.BAD_REQUEST)
      .json({ message: t("FCM_TOKEN_REQUIRED", lang) });

  await sendFirebaseNotification(token, title, body);
  res.json({
    success: true,
    message: t("FIREBASE_NOTIFICATION_SENT", lang),
  });
});

app.post("/api/register-token", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  const { fcmToken } = req.body;

  if (!fcmToken) {
    throw {
      status: STATUS_CODES.BAD_REQUEST,
      message: t("FCM_TOKEN_REQUIRED", lang),
    };
  }

  await User.updateOne({ _id: req.userId }, { $addToSet: { fcmToken } });

  return { message: t("FCM_TOKEN_REGISTER_SUCCESS", lang) };
});

// app.post(
//   "/webhooks",
//   express.raw({ type: "application/json" }),
//   async (req, res) => {
//     let event;

//     try {
//       const sig = req.headers["stripe-signature"];
//       event = stripe.webhooks.constructEvent(
//         req.body, // ← This was missing in your code (needs to be the first parameter)
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       console.error("Webhook signature verification failed.", err.message);
//       return res
//         .status(STATUS_CODES.BAD_REQUEST)
//         .send(`Webhook Error: ${err.message}`);
//     }

//     const intent = event.data.object;
//     const paymentIntentId = intent.id;

//     switch (event.type) {
//       case "payment_intent.succeeded":
//         await StripeModel.updateOne(
//           { stripePaymentIntentId: paymentIntentId },
//           { $set: { paymentStatus: STRIPE_PAYMENT_STATUS.SUCCESSFUL } }
//         );
//         break;

//       case "payment_intent.payment_failed":
//         await StripeModel.updateOne(
//           { stripePaymentIntentId: paymentIntentId },
//           { $set: { paymentStatus: STRIPE_PAYMENT_STATUS.FAILED } }
//         );
//         break;

//       case "payment_intent.canceled":
//         await StripeModel.updateOne(
//           { stripePaymentIntentId: paymentIntentId },
//           { $set: { paymentStatus: STRIPE_PAYMENT_STATUS.CANCELLED } }
//         );
//         break;

//       default:
//         console.log(`Unhandled event type ${event.type}`);
//     }

//     res.sendStatus(STATUS_CODES.OK);
//   }
// );

// Global error handler — guarantees every error becomes a JSON response so
// nginx never has to render its default HTML 500 page. Must be registered
// AFTER all routes.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const lang = getLanguageFromRequest(req);
  console.error("Unhandled error:", err);
  const status = err.status || err.statusCode || STATUS_CODES.SERVER_ERROR;
  return res.status(status).json({
    message: err.message || t("SERVER_ERROR", lang) || "Internal Server Error",
  });
});

// Crash safety nets — log instead of taking the process down (which would
// trigger pm2 restart and drop in-flight requests).
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

const port = process.env.PORT;

server.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
