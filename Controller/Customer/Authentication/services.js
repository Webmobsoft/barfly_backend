const globalConstants = require("../../../Utils/globalConstants");
const { STATUS_CODES, ROLES, KEY_TYPE_PREFIXES, STATUS } = globalConstants;
const {
  hashPassword,
  comparePassword,
  getJwtToken,
} = require("../../../Utils/commonFunction");
const crypto = require("crypto");
const { createMail } = require("../../../Utils/mailer");
const {
  getVerificationCodeTemplate,
} = require("../../../Utils/emailTemplates/verificationCodeTemplate");
const {
  getWelcomeTemplate,
} = require("../../../Utils/emailTemplates/welcomeTemplate");
const throwError = require("../../../Utils/throwError");
const Otp = require("../../../Models/Otp");
const User = require("../../../Models/User");
const CountRTags = require("../../../Models/CountRTags");
const redisClient = require("./../../../redis");
const notificationSettings = require("../../../Models/notificationSettings");
const FavouriteEntity = require("../../../Models/FavouriteEntity");
const FavouriteItem = require("../../../Models/FavouriteItem");
const Cards = require("../../../Models/Cards");
const Location = require("../../../Models/Location");
const CustomerOrderReport = require("../../../Models/CustomerOrderReport");
const UserFeedback = require("../../../Models/UserFeedback");
const UserAppFeedback = require("../../../Models/UserAppFeedback");
const Order = require("../../../Models/Order");
const StripePayment = require("../../../Models/Stripe");
const { t, getLanguageFromRequest } = require("../../../Utils/translator");
const { io } = require("../../../app");

module.exports.register = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { email, firstName, lastName, password, dob, countrTag } = req.body;
  const emailLower = (email || "").trim().toLowerCase();

  const userExist = await User.findOne({
    email: emailLower,
    status: STATUS.ACTIVE,
    role: ROLES.CUSTOMER,
  }).lean();
  if (userExist) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("CUSTOMER_ALREADY_REGISTERED_EMAIL", lang),
    });
  }
  const countrTagExists = await User.findOne({
    countrTag,
    status: STATUS.ACTIVE,
  });
  if (countrTagExists) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("COUNTR_TAG_ALREADY_EXISTS", lang),
    });
  }

  const hashedPassword = hashPassword(password);

  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  const userObj = await User.create({
    role: ROLES.CUSTOMER,
    fullName: `${firstName} ${lastName}`,
    firstName,
    lastName,
    email: emailLower,
    password: hashedPassword,
    status: STATUS.ACTIVE,
    countrTag,
  });

  await notificationSettings.create({
    userId: userObj._id,
    isEmailOn: true,
    isPushOn: true,
    isPromotionalOn: true,
  });

  // Send welcome email
  try {
    const safeName = firstName || "";
    const welcomeHtmlTemplate = getWelcomeTemplate(safeName, lang);
    createMail({
      to: emailLower,
      subject: `${t("EMAIL_WELCOME_CUSTOMER_SUBJECT", lang)} 🎉`,
      html: welcomeHtmlTemplate,
      text: `${t("EMAIL_WELCOME_CUSTOMER_GREETING", lang)}${safeName ? ` ${safeName}` : ""}! ${t("EMAIL_WELCOME_CUSTOMER_INTRO", lang)}`,
    });
    console.log(`✅ Welcome email sent successfully to: ${emailLower}`);
  } catch (error) {
    console.error(`❌ Error sending welcome email to ${emailLower}:`, error.message);
    // Don't throw error - registration should succeed even if email fails
  }

  // Notify admin dashboard — new user registered
  try {
    io.to("admin_room").emit("adminDashboardUpdate", {
      action: "new_user",
      userId: userObj._id.toString(),
      name: `${firstName} ${lastName}`,
    });
  } catch (err) {
    console.error("Admin socket emit error:", err.message);
  }

  delete userObj.password;

  const token = getJwtToken(userObj, true);
  const { KEY_TYPE_PREFIXES } = require("../../../Utils/globalConstants");
  await redisClient.set(`${KEY_TYPE_PREFIXES.USER_TOKEN}:${userObj._id}`, "1");
  return { userObj, token };
};

module.exports.login = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { email, password } = req.body;
  const emailLower = (email || "").trim().toLowerCase();
  const userProjection = {
    role: 1,
    firstName: 1,
    lastName: 1,
    email: 1,
    password: 1,
    contactNumber: 1,
  };

  const user = await User.findOne(
    { email: emailLower, role: ROLES.CUSTOMER, status: STATUS.ACTIVE },
    { ...userProjection, status: 1 },
  ).lean();

  if (!user) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("CUSTOMER_NOT_FOUND", lang),
    });
  }

  if (user.status === STATUS.BLOCKED) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("CUSTOMER_BLOCKED_BY_ADMIN", lang),
    });
  }

  if (user.role !== ROLES.CUSTOMER) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("CUSTOMER_ONLY_LOGIN", lang),
    });
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("CUSTOMER_INVALID_PASSWORD", lang),
    });
  }

  const token = getJwtToken(user, true);
  const { KEY_TYPE_PREFIXES } = require("../../../Utils/globalConstants");
  await redisClient.set(`${KEY_TYPE_PREFIXES.USER_TOKEN}:${user._id}`, "1");
  delete user.password;
  return { user, token };
};

module.exports.checkAndProvideCountRTag = async (req) => {
  const { firstName, lastName } = req.query;

  const isUsernameExists = async (username) => {
    return User.exists({ countrTag: username, status: STATUS.ACTIVE });
  };

  const generateUniqueUsername = async (baseUsername) => {
    let uniqueUsername = baseUsername;
    let attempt = 1;

    while (await isUsernameExists(uniqueUsername)) {
      let randomNum = Math.floor(100 + Math.random() * 900);
      uniqueUsername = `${baseUsername}${randomNum}`;
      attempt++;
      if (attempt > 10) break;
    }

    return uniqueUsername;
  };

  let baseUsernames = [
    `@${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
    `@${lastName.toLowerCase()}.${firstName.toLowerCase()}`,
    `@${firstName.toLowerCase()}.${lastName.toLowerCase()}89`,
    `@${lastName.toLowerCase()}.${firstName.toLowerCase()}14`,
  ].filter(Boolean);

  let uniqueUsernames = [];
  for (let base of baseUsernames) {
    uniqueUsernames.push(await generateUniqueUsername(base));
  }

  const existingTags = await User.distinct("countrTag", {
    status: STATUS.ACTIVE,
  });

  const availableTags = uniqueUsernames.filter(
    (tag) => !existingTags.includes(tag),
  );

  return availableTags;
};

module.exports.logoutUser = async (req) => {
  const { userId } = req;
  const prefix = KEY_TYPE_PREFIXES.USER_TOKEN;
  await redisClient.del(`${prefix}:${userId}`);
};

module.exports.deleteAccount = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { userId } = req;
  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("CUSTOMER_DOES_NOT_EXIST", lang),
    });
  }

  // Check for active orders
  const activeOrder = await Order.findOne({
    userId,
    status: {
      $in: [
        globalConstants.ORDER_STATUS.PAYMENT_PROCESSING,
        globalConstants.ORDER_STATUS.WAITING,
        globalConstants.ORDER_STATUS.IN_PROGRESS,
        globalConstants.ORDER_STATUS.READY,
      ],
    },
  });

  if (activeOrder) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("CANNOT_DELETE_ACCOUNT_ACTIVE_ORDERS", lang),
    });
  }

  // Delete all user-related data and clear session info in parallel
  await Promise.all([
    // Update user: set status to DELETED, clear tokens/sessions
    User.updateOne(
      { _id: userId },
      {
        $set: {
          status: STATUS.DELETED,
          fcmToken: [],
          socketId: null,
        },
      },
    ),
    // Delete all user-related data in parallel (optimized)
    CountRTags.deleteMany({ userId }),
    FavouriteEntity.deleteMany({ userId }),
    FavouriteItem.deleteMany({ userId }),
    notificationSettings.deleteMany({ userId }),
    Cards.deleteMany({ userId }),
    Location.deleteMany({ userId }),
    CustomerOrderReport.deleteMany({ userId }),
    UserFeedback.deleteMany({ userId }),
    UserAppFeedback.deleteMany({ userId }),
    Otp.deleteMany({ userId }),
    Order.deleteMany({ userId }),
    StripePayment.deleteMany({ userId }),
    // Clear Redis token if exists
    redisClient.del(`${KEY_TYPE_PREFIXES.USER_TOKEN}:${userId}`),
  ]);
};

/**
 * Send OTP to Email (Reusable utility)
 * OTP valid for 2 minutes (120 seconds)
 */
const sendOtpToEmail = async (
  email,
  lang,
  subject = "Your Verification Code - countr",
) => {
  const redisKey = `${KEY_TYPE_PREFIXES.EMAIL_OTP}${email}`;
  const generatedOtp = crypto.randomInt(100000, 999999).toString();
  // console.log(`[OTP] Customer/Auth email=${email} otp=${generatedOtp}`); // Logs sensitive data

  await redisClient.setEx(redisKey, 120, generatedOtp);

  // Generate HTML email template with verification code
  const htmlTemplate = getVerificationCodeTemplate(generatedOtp, "2 minutes");

  const emailSent = await createMail({
    to: email,
    subject,
    html: htmlTemplate,
    text: `Your verification code is: ${generatedOtp}. It is valid for 2 minutes.`, // Plain text fallback
  });

  if (!emailSent) {
    await redisClient.del(redisKey);
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: t("EMAIL_SEND_ERROR", lang),
    });
  }

  return generatedOtp;
};

/**
 * Verify OTP from Redis and generate secure reset token
 * Reset token valid for 24 hours (86400 seconds)
 */
const verifyOtpFromRedis = async (email, otp, lang) => {
  const redisKey = `${KEY_TYPE_PREFIXES.EMAIL_OTP}${email}`;
  const storedOtp = await redisClient.get(redisKey);

  if (!storedOtp) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OTP_EXPIRED", lang),
    });
  }

  if (storedOtp !== otp) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OTP_INVALID", lang),
    });
  }

  // Generate secure reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenKey = `${KEY_TYPE_PREFIXES.EMAIL_OTP}${email}:resetToken`;

  // Delete OTP and store reset token with 24 hour expiry
  await Promise.all([
    redisClient.del(redisKey),
    redisClient.setEx(resetTokenKey, 86400, resetToken),
  ]);

  return resetToken;
};

/**
 * Send OTP to Email API (Single API for send + verify)
 * - Send OTP: { email }
 * - Verify OTP: { email, otp } -> Returns resetToken for password reset
 */
module.exports.sendEmailOtp = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { email, otp } = req.body;

  if (!email?.trim()) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("EMAIL_REQUIRED", lang),
    });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedOtp = otp?.trim();

  if (trimmedOtp) {
    const token = await verifyOtpFromRedis(trimmedEmail, trimmedOtp, lang);
    return {
      otpVerified: true,
      token,
      message: t("OTP_VERIFIED_SUCCESS", lang),
    };
  }

  await sendOtpToEmail(trimmedEmail, lang);
  return { otpSent: true, message: t("OTP_SENT_EMAIL_SUCCESS", lang) };
};

/**
 * Reset Password (requires resetToken from headers)
 * Headers: { token: "resetToken" }
 * Payload: { email, newPassword }
 */
module.exports.resetPassword = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { email, newPassword } = req.body;
  let resetToken = req.headers["token"];

  if (!resetToken?.trim()) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("RESET_TOKEN_REQUIRED", lang),
    });
  }

  // Remove Bearer prefix if present
  resetToken = resetToken.trim().replace(/^Bearer\s+/i, "");

  if (!email?.trim() || !newPassword?.trim()) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("EMAIL_AND_PASSWORD_REQUIRED", lang),
    });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const resetTokenKey = `${KEY_TYPE_PREFIXES.EMAIL_OTP}${trimmedEmail}:resetToken`;

  // Verify reset token
  const storedToken = await redisClient.get(resetTokenKey);
  // console.log("Reset Password Debug:", {...}); // Logs sensitive token data
  if (!storedToken || storedToken !== resetToken) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("INVALID_RESET_TOKEN", lang),
    });
  }

  const user = await User.findOne({
    email: trimmedEmail,
    status: STATUS.ACTIVE,
    role: ROLES.CUSTOMER,
  });

  if (!user) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("USER_NOT_FOUND", lang),
    });
  }

  user.password = hashPassword(newPassword.trim());
  await Promise.all([user.save(), redisClient.del(resetTokenKey)]);

  return { success: true, message: t("PASSWORD_RESET_SUCCESS", lang) };
};
