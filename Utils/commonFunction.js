const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { appClient } = require("../redis");
const SECRET_KEY = "BARFLY@WEBMOB456";
const Event = require("../Models/Event");
const { STATUS, ROLES, STATUS_CODES } = require("./globalConstants");
const Discount = require("../Models/Discount");
const User = require("../Models/User");
const crypto = require("crypto");
const { messaging, messagingPlus } = require("../firebaseAdmin");
const { getLanguageFromRequest, t } = require("./translator");
const throwError = require("./throwError");
const hashPassword = (password) => {
  return bcrypt.hashSync(password, 10);
};

const comparePassword = async (inputPassword, storedPassword) => {
  return bcrypt.compare(inputPassword, storedPassword);
};

const shiftArrayRight = (arr) => {
  // Check if the array is not empty
  if (arr.length === 0) return arr;

  // Remove the last element and store it
  const lastElement = arr.pop();

  // Insert the last element at the beginning of the array
  arr.unshift(lastElement);

  return arr;
};

const getJwtToken = (user, isUser = false) => {
  let payload = {
    id: user._id,
    userId: user._id,
    role: user.role,
    email: user.email,
    contactNumber: user.contactNumber,
    isAdmin: user.isAdmin === true,
    countrTag: user.countrTag,
  };
  if (!isUser) {
    payload = {
      ...payload,
      entityName: user.entityDetails.entityName,
      entityType: user.entityDetails.entityType,
      entityId: user.entityDetails._id,
    };
  }
  return jwt.sign(payload, SECRET_KEY);
};

const performEndOfDayTask = async () => {
  try {
    const today = new Date();
    today.setUTCDate(today.getUTCDate());
    const startOfDay = new Date(today);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const pipeline = [
      {
        $match: {
          $and: [
            { from: { $gte: startOfDay } },
            { to: { $lte: endOfDay } },
            { entityId: { $exists: true } },
          ],
        },
      },
      {
        $lookup: {
          from: "entitydetails",
          localField: "entityId",
          foreignField: "_id",
          as: "entityDetails",
        },
      },
      {
        $unwind: "$entityDetails",
      },
      {
        $project: {
          _id: "$entityId",
          entityDetails: {
            _id: 1,
            city: 1,
            street: 1,
            entityName: 1,
            entityType: 1,
          },
          event: {
            _id: "$_id",
            locationName: "$locationName",
            eventName: "$eventName",
            date: "$date",
            from: "$from",
            to: "$to",
            insiders: "$insiders",
            ageLimit: "$ageLimit",
            ownerId: "$ownerId",
          },
        },
      },
    ];

    const entityDataList = await Event.aggregate(pipeline).exec();

    if (entityDataList.length) {
      await appClient
        .set("LIVE_ENTITY", JSON.stringify(entityDataList))
        .catch((error) => console.error(error));
    }
  } catch (error) {
    console.error("Error performing end of day task:", error);
  }
};

const haversineDistance = async (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// async function sendFirebaseNotification(token, title, body) {
//   const message = {
//     notification: { title, body },
//     token: token,
//   };

//   try {
//     const response = await admin.messaging().send(message);
//     console.log("Successfully sent notification:", response);
//   } catch (error) {
//     console.error("Error sending notification:", error);
//   }
// }

const validateCoupon = async (couponCode, totalAmount) => {
  if (!couponCode) return { discountAmount: 0 };

  const discount = await Discount.findOne({
    code: couponCode,
    status: STATUS.ACTIVE,
  });
  if (!discount) {
    throw new Error("Invalid or expired coupon");
  }

  const currentDate = new Date();

  if (currentDate < discount.startDate || currentDate > discount.endDate) {
    throw new Error("Coupon is not valid at this time");
  }

  // if (discount.usedCount >= discount.usageLimit) {
  //   throw new Error("Coupon usage limit reached");
  // }

  // if (totalAmount < discount.minAmount) {
  //   throw new Error(`Minimum order amount should be ${discount.minAmount}`);
  // }

  let discountAmount = 0;

  if (discount.type === "percentage") {
    discountAmount = (totalAmount * discount.value) / 100;
    // if (discount.maxDiscount) {
    //   discountAmount = Math.min(discountAmount, discount.maxDiscount);
    // }
  } else if (discount.type === "fixed") {
    discountAmount = discount.value;
  }

  return { discountAmount, couponCode };
};

const algorithm = "aes-256-cbc";
const secretKey = process.env.SECRET_KEY || "8b970064a0ba362dceae1c279aa6cbb4";
const iv = crypto.randomBytes(16);

// Function to encrypt data
const encrypt = (text) => {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
};

// Function to decrypt data
const decrypt = (encryptedText) => {
  const [ivHex, encrypted] = encryptedText.split(":");
  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(secretKey),
    Buffer.from(ivHex, "hex"),
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// const sendFirebaseNotification = async ({
//   isOwner = false,
//   titleText = "",
//   body = "",
//   data = {},
//   ownerToken = "",
//   customerToken = "",
//   isCustomer = false,
//   showNotification = false,
//   topic = "",
// }) => {
//   try {
//     if (token == "") {
//       console.error("No fcm token found");
//       return;
//     }
//     const payload = {
//       token: ownerToken,
//       data: data,
//     };

//     if (showNotification) {
//       payload.notification = {
//         title: titleText,
//         body: body,
//       };

//       payload.android = {
//         priority: "high",
//         notification: {
//           click_action: "FLUTTER_NOTIFICATION_CLICK",
//         },
//       };

//       payload.apns = {
//         payload: {
//           aps: {
//             alert: {
//               title: titleText,
//               body: body,
//             },
//             category: "FLUTTER_NOTIFICATION_CLICK",
//             mutableContent: 1,
//             content_available: true,
//           },
//         },
//       };
//     } else {
//       payload.android = {
//         priority: "high",
//       };

//       payload.apns = {
//         headers: {
//           "apns-priority": "5",
//         },
//         payload: {
//           aps: {
//             contentAvailable: true,
//           },
//         },
//       };
//     }
//     if (isOwner) {
//       await messagingPlus.send(payload);
//       console.info("Notification Pushed for admin");
//     } else if (isCustomer) {
//       payload.token = customerToken;
//       await messaging.send(payload);
//       console.info("Notifiaction pushed for customer");
//     }
//   } catch (err) {
//     console.error("Push Notification Error:", err.message);

//     if (
//       err.code === "messaging/invalid-argument" ||
//       err.code === "messaging/registration-token-not-registered" ||
//       err.code === "messaging/invalid-recipient"
//     ) {
//       // Remove invalid token from user
//       await User.updateOne(
//         { _id: entityDetails.userId },
//         { $unset: { fcmToken: "" } }
//       );
//     }
//   }
// };

const sendFirebaseNotification = async ({
  title = "",
  body = "",
  data = {},
  topic = "",
  showNotification = true,
  alertSound = false,
}) => {
  try {
    if (!topic) {
      console.warn("⚠️ No topic provided for notification.");
      return;
    }

    // Keep user_ and entity_ topics as-is, only prefix others with entity_
    // const topicName = topic.startsWith("entity_") || topic.startsWith("user_") ? topic : `entity_${topic}`;

    const payload = {
      notification: showNotification
        ? {
            title,
            body,
          }
        : undefined,

      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },

      android: {
        priority: "high",
        notification: showNotification
          ? {
              click_action: "FLUTTER_NOTIFICATION_CLICK",
            }
          : undefined,
      },

      apns: showNotification
        ? {
            headers: {
              "apns-priority": "10",
            },
            payload: {
              aps: {
                alert: {
                  title,
                  body,
                },
                category: "FLUTTER_NOTIFICATION_CLICK",
                mutableContent: 1,
                content_available: true,
              },
            },
          }
        : {
            headers: {
              "apns-push-type": "background",
              "apns-priority": "5",
            },
            payload: {
              aps: {
                "content-available": 1,
              },
            },
          },
      topic: topic,
    };

    // User-facing alerts (order status / cancelled / offline order) must play a
    // sound and vibrate. Silent data refreshes must never pass alertSound.
    // "order_alert" is the "ding" bundled in both the Customer and Countr Plus apps
    // (Android res/raw/order_alert.wav, iOS order_alert.caf). App builds without the
    // file fall back to the default sound.
    if (alertSound && showNotification) {
      Object.assign(payload.android.notification, {
        channelId: "order_alert_chime",
        sound: "order_alert",
        defaultVibrateTimings: true,
      });
      payload.apns.headers["apns-push-type"] = "alert";
      payload.apns.payload.aps.sound = "order_alert.caf";
    }

    await messagingPlus.send(payload);
    await messaging.send(payload);
    console.info(`✅ Notification sent to topic: ${topic}`);
  } catch (err) {
    console.error("❌ Push Notification Error:", err.message);
  }
};

const {
  genrateCustomerOrderReport,
} = require("../PdfServices/customerOrderReport");

const verifyTokenWithoutResponse = async (req) => {
  const token = req.headers["token"];
  const lang = getLanguageFromRequest(req);

  if (!token) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("AUTH_TOKEN_MISSING", lang),
    });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.id = decoded.id;
    req.userId = decoded.userId;
    req.role = decoded.role;
    req.email = decoded.email;
    req.entityName = decoded.entityName;
    req.entityId = decoded.entityId;
    req.entityType = decoded.entityType;
    req.isAdmin = decoded.role === ROLES.ADMIN || decoded.isAdmin === true;
    req.countrTag = decoded.countrTag;

    // Skip Redis check for admins (they use Admin model)
    if (!req.isAdmin) {
      const redisClient = require("../redis");
      const { KEY_TYPE_PREFIXES } = require("./globalConstants");
      const redisKey = `${KEY_TYPE_PREFIXES.USER_TOKEN}:${decoded.userId}`;
      const sessionExists = await redisClient.get(redisKey);
      if (!sessionExists) {
        const user = await User.findById(decoded.userId, { status: 1 }).lean();
        if (user?.status === STATUS.BLOCKED) {
          throwError({
            status: STATUS_CODES.NOT_AUTHORIZED,
            message: t("USER_ACCOUNT_BLOCKED", lang),
          });
        }
        await redisClient.set(redisKey, "1");
      }
    }
  } catch (err) {
    if (err.status) throw err;
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("AUTH_TOKEN_INVALID", lang),
    });
  }
};
module.exports = {
  hashPassword,
  comparePassword,
  getJwtToken,
  sendFirebaseNotification,
  // generateOTP,
  genrateCustomerOrderReport,
  SECRET_KEY,
  sleep,
  performEndOfDayTask,
  shiftArrayRight,
  haversineDistance,
  sendFirebaseNotification,
  validateCoupon,
  encrypt,
  decrypt,
  verifyTokenWithoutResponse,
};
