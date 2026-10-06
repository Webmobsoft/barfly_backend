const {
  hashPassword,
  comparePassword,
  getJwtToken,
  generateOTP,
  sendFirebaseNotification,
} = require("../../../Utils/commonFunction");
const crypto = require("crypto");
const OtpSession = require("../../../Models/sessions");
const { createMail, sendSMS } = require("../../../Utils/mailer");
const {
  getVerificationCodeTemplate,
} = require("../../../Utils/emailTemplates/verificationCodeTemplate");
const {
  getOwnerWelcomeTemplate,
} = require("../../../Utils/emailTemplates/ownerWelcomeTemplate");
const redisClient = require("./../../../redis");

const User = require("../../../Models/User");
const {
  STATUS_CODES,
  ROLES,
  STATUS,
  KEY_TYPE_PREFIXES,
} = require("../../../Utils/globalConstants");
const throwError = require("../../../Utils/throwError");
const Otp = require("../../../Models/Otp");
const EntityDetails = require("../../../Models/EntityDetails");
const MenuCategory = require("../../../Models/MenuCategory");
const { uploadBufferToS3 } = require("../../aws-service");
const NotificationSettings = require("../../../Models/notificationSettings");
const { t, getLanguageFromRequest } = require("../../../Utils/translator");
const { io } = require("../../../app");

module.exports.register = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    file,
    body: {
      email,
      fullName,
      password,
      contactNumber,
      city,
      zipcode,
      entityName,
      entityType,
      entityContactNumber,
      // plotNo,
      floor,
      country,
      buildingName,
      landmark,
      enteredOtp,
      state,
      location,
      sessionId,
    },
  } = req;

  const query = { status: STATUS.ACTIVE, role: ROLES.STORE_OWNER };
  if (email) query.email = email;
  if (contactNumber) query.contactNumber = contactNumber;

  const user = await User.findOne(query);

  if (user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_ALREADY_REGISTERED", lang),
    });
  }

  let message = "";

  // Only look up an OTP record when we actually have a contactNumber to match
  // on. Without this guard, Mongoose strips the undefined and findOne returns
  // an arbitrary (usually expired) Otp doc, which sends us down the wrong
  // branch on the final register call.
  let otpRecord = contactNumber
    ? await Otp.findOne({ contactNumber })
    : null;

  if (!enteredOtp && contactNumber) {
    const otp = crypto.randomInt(100000, 999999).toString();
    // console.log(`[OTP] Owner/Auth contactNumber=${contactNumber} otp=${otp}`); // Logs sensitive data
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    otpRecord = await Otp.findOneAndUpdate(
      { contactNumber },
      { otp, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const msg = `Use this code to verify your countr account: ${otp}. It is valid for 5 minutes.`;

    const smsMessage = t("OTP_SMS_MESSAGE", lang, { otp });

    await sendSMS({ toPhoneNumber: contactNumber, message: smsMessage });

    return {
      otpSent: true,
      message: t("OTP_SENT_SUCCESS", lang),
      otp,
    };
  }

  if (otpRecord) {
    if (otpRecord.expiresAt < Date.now()) {
      await Otp.deleteOne({ contactNumber });
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OTP_EXPIRED", lang),
      });
    }

    // if (enteredOtp && enteredOtp != otpRecord.otp) {
    //   throwError({
    //     status: STATUS_CODES.BAD_REQUEST,
    //     message: "Invalid OTP, Please try again.",
    //   });
    // }

    if (enteredOtp == otpRecord.otp) {
      await Otp.deleteOne({ contactNumber });
      const newSessionId = crypto.randomUUID();

      await OtpSession.create({ sessionId: newSessionId, contactNumber });

      return {
        otpVerified: true,
        message: t("OTP_VERIFIED_SUCCESS", lang),
        sessionId: newSessionId,
      };
    }
  }

  // Reached the "create the account" branch — sessionId is required and the
  // entity payload must be present, otherwise we'd silently create a half-set
  // entity. Surface a 400 instead of a confusing 500 from downstream Mongoose
  // validation.
  if (!sessionId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OTP_SESSION_INVALID", lang),
    });
  }
  if (!entityName || !entityType) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_REGISTER_FIELDS_MISSING", lang),
    });
  }

  const sessionData = await OtpSession.findOne({ sessionId });

  if (!sessionData || !sessionData.contactNumber) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OTP_SESSION_INVALID", lang),
    });
  }

  const newUser = {
    role: ROLES.STORE_OWNER,
    fullName,
    email,
    status: STATUS.ACTIVE,
    contactNumber: sessionData.contactNumber,
  };
  if (password) {
    newUser.password = hashPassword(password);
  }

  // Upload the logo first so a slow/failing S3 doesn't leave us with an
  // orphaned User row that blocks all future registration retries.
  let fileName = "";
  if (file) {
    fileName = `${Date.now()}_${file.originalname.replace(/ /g, "_")}`;

    try {
      const data = await uploadBufferToS3(file.buffer, fileName);
      if (!data.Location) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("FILE_UPLOAD_ERROR", lang),
        });
      }
    } catch (error) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FILE_UPLOAD_FAILED", lang),
      });
    }
  }

  const userDetails = await User.create(newUser);

  let entityDetails;
  try {
    entityDetails = await EntityDetails.create({
      city,
      zipcode,
      entityName,
      entityType,
      owner: userDetails._id,
      image: fileName.replace(" ", "_"),
      entityContactNumber,
      // plotNo,
      floor,
      country,
      buildingName,
      landMark: landmark,
      userId: userDetails._id,
      status: STATUS.ACTIVE,
      state,
      location,
    });
  } catch (err) {
    // Roll the user back so the next attempt isn't blocked by
    // "OWNER_ALREADY_REGISTERED" against an orphan record.
    await User.deleteOne({ _id: userDetails._id }).catch(() => {});
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: err.message || t("OWNER_REGISTER_ERROR", lang),
    });
  }

  await NotificationSettings.create({
    userId: userDetails._id,
    isEmailOn: true,
    isPushOn: true,
    isPromotionalOn: true,
  });

  // Create default categories for the new entity
  try {
    const defaultCategories = await MenuCategory.insertMany([
      {
        categoryName: t("DEFAULT_CATEGORY_FOOD", lang),
        entityId: entityDetails._id,
      },
      {
        categoryName: t("DEFAULT_CATEGORY_SOFT_DRINKS", lang),
        entityId: entityDetails._id,
      },
    ]);
    console.log("Default categories created:", defaultCategories);
  } catch (err) {
    console.error("Error creating default categories:", err.message);
  }

  // Send welcome email to owner (non-blocking)
  try {
    if (email) {
      const welcomeHtml = getOwnerWelcomeTemplate(fullName || "", lang);
      createMail({
        to: email,
        subject: `${t("EMAIL_WELCOME_OWNER_SUBJECT", lang)} 🎉`,
        html: welcomeHtml,
      });
    }
  } catch (err) {
    console.error("Owner welcome email error:", err.message);
  }

  // Send Firebase notification to customer_entity topic for new entity (non-blocking)
  try {
    sendFirebaseNotification({
      topic: "customer_entity",
      showNotification: false,
      title: "New Entity Added",
      body: `A new entity "${entityName}" has been added.`,
      data: {
        action: "entity_create",
        screen: "entity_screen",
        entityId: entityDetails._id.toString(),
        entityName: entityName,
        entityType: entityType,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: "customer_entity",
      },
    });
  } catch (err) {
    console.error("Firebase notification error:", err.message);
  }

  // Notify admin dashboard — new entity/restaurant added
  try {
    io.to("admin_room").emit("adminDashboardUpdate", {
      action: "new_entity",
      entityId: entityDetails._id.toString(),
      entityName: entityName,
      entityType: entityType,
    });
  } catch (err) {
    console.error("Admin socket emit error:", err.message);
  }

  userDetails.entityDetails = entityDetails;
  const token = getJwtToken(userDetails, false);
  const { KEY_TYPE_PREFIXES } = require("../../../Utils/globalConstants");
  await redisClient.set(`${KEY_TYPE_PREFIXES.USER_TOKEN}:${userDetails._id}`, "1");

  return {
    message: t("OWNER_REGISTRATION_SUCCESS", lang),
    entity: entityDetails,
    token,
    isRegistered: true,
  };
};

module.exports.login = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { email, contactNumber, password } = req.body;

  const query = { role: ROLES.STORE_OWNER, status: STATUS.ACTIVE };
  if (email) query.email = email;
  if (contactNumber) query.contactNumber = contactNumber;
  if (!Object.keys(query)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_LOGIN_IDENTIFIER_REQUIRED", lang),
    });
  }

  const user = await User.findOne(query);

  if (!user)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("OWNER_INVALID_IDENTIFIER", lang),
    });

  if (user.status === STATUS.BLOCKED) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("OWNER_BLOCKED_BY_ADMIN", lang),
    });
  }

  const entityDetails = await EntityDetails.findOne(
    {
      userId: user._id,
      status: STATUS.ACTIVE,
    },
    { _id: 1 },
  );

  if (!entityDetails)
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("OWNER_ENTITY_NOT_FOUND", lang),
    });

  if (user.role !== ROLES.STORE_OWNER) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("OWNER_ONLY_LOGIN", lang),
    });
  }

  if (password) {
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid)
      throwError({
        status: STATUS_CODES.NOT_AUTHORIZED,
        message: t("OWNER_INVALID_PASSWORD", lang),
      });
  }
  user.entityDetails = entityDetails;

  const token = getJwtToken(user, false);
  const { KEY_TYPE_PREFIXES } = require("../../../Utils/globalConstants");
  await redisClient.set(`${KEY_TYPE_PREFIXES.USER_TOKEN}:${user._id}`, "1");

  return { user, entityDetails, token };
};

module.exports.logoutEntity = async (req) => {
  let userId = req.userId || req.id;
  if (!userId && req.entityId) {
    const entity = await EntityDetails.findById(req.entityId, { userId: 1 }).lean();
    userId = entity?.userId;
  }
  if (userId) {
    const prefix = KEY_TYPE_PREFIXES.USER_TOKEN;
    await redisClient.del(`${prefix}:${userId}`);
  }
};

/**
 * Send OTP to Email (Reusable utility)
 * @param {string} email - Email address to send OTP
 * @param {string} lang - Language for messages
 * @param {string} subject - Email subject (optional)
 * @returns {Promise<string>} - Generated OTP
 */
const sendOtpToEmail = async (
  email,
  lang,
  subject = "Your Verification Code - countr",
) => {
  const redisKey = `${KEY_TYPE_PREFIXES.EMAIL_OTP}${email}`;
  const generatedOtp = crypto.randomInt(100000, 999999).toString();
  console.log(`[OTP] Owner/AuthEmail email=${email} otp=${generatedOtp}`);

  // Store OTP in Redis with 2 minutes TTL (120 seconds)
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
 * @param {string} email - Email address
 * @param {string} otp - OTP to verify
 * @param {string} lang - Language for messages
 * @returns {Promise<string>} - Reset token
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

  // Validate email
  if (!email?.trim()) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("EMAIL_REQUIRED", lang),
    });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedOtp = otp?.trim();

  // If OTP provided -> Verify and return token, else -> Send OTP
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

  // Validate reset token from headers
  if (!resetToken?.trim()) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("RESET_TOKEN_REQUIRED", lang),
    });
  }

  // Remove Bearer prefix if present
  resetToken = resetToken.trim().replace(/^Bearer\s+/i, "");

  // Validate inputs
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
  if (!storedToken || storedToken !== resetToken) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("INVALID_RESET_TOKEN", lang),
    });
  }

  // Find user
  const user = await User.findOne({
    email: trimmedEmail,
    status: STATUS.ACTIVE,
    role: ROLES.STORE_OWNER,
  });

  if (!user) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("USER_NOT_FOUND", lang),
    });
  }

  // Update password and clear reset token
  user.password = hashPassword(newPassword.trim());
  await Promise.all([user.save(), redisClient.del(resetTokenKey)]);

  return { success: true, message: t("PASSWORD_RESET_SUCCESS", lang) };
};
