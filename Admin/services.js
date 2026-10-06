const bcrypt = require("bcrypt");

const Admin = require("../Models/Admin");
const Stripe = require("../Models/Stripe");
const Commission = require("../Models/Commission");
const User = require("../Models/User");
const EntityDetails = require("../Models/EntityDetails");
const redisClient = require("../redis");

const {
  ORDER_STATUS,
  ROLES,
  STATUS_CODES,
  STATUS,
  EDIT_ACTION,
  KEY_TYPE_PREFIXES,
} = require("../Utils/globalConstants");
const throwError = require("./../Utils/throwError");
const { comparePassword, getJwtToken } = require("../Utils/commonFunction");
const Order = require("../Models/Order");
const ItemDetails = require("../Models/ItemDetails");
const Counter = require("../Models/Counter");
const mongoose = require("mongoose");
const { generatePresignedUrl } = require("../Controller/aws-service");
const { createMail } = require("../Utils/mailer");
const crypto = require("crypto");
const {
  getVerificationCodeTemplate,
} = require("../Utils/emailTemplates/verificationCodeTemplate");
const {
  getAccountStatusTemplate,
} = require("../Utils/emailTemplates/accountStatusTemplate");
const {
  getAdminWelcomeTemplate,
} = require("../Utils/emailTemplates/adminWelcomeTemplate");
const { io } = require("../app");
const { t, getLanguageFromRequest } = require("../Utils/translator");
const {
  TransactionsService,
  Configuration,
  HttpBearerAuth,
} = require("wallee");

// Wallee API config for fetching transaction details (lazy init)
let walleeTransactionsService = null;
const getWalleeTransactionsService = () => {
  if (!walleeTransactionsService) {
    const userId = Number(process.env.WALLEE_USER_ID);
    const apiSecret = process.env.WALLEE_API_SECRET;
    if (userId && apiSecret) {
      const httpBearerAuth = new HttpBearerAuth(userId, apiSecret);
      const walleeConfig = new Configuration({ httpBearerAuth });
      walleeTransactionsService = new TransactionsService(walleeConfig);
    }
  }
  return walleeTransactionsService;
};

const addAdmin = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { firstName, lastName, password, email, phoneNumber } = req.body;
  const admin = await Admin.findOne({ email }).lean();
  if (admin) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ADMIN_EMAIL_EXISTS_ERROR", lang),
    });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  const adminObj = {
    firstName,
    lastName,
    password: hashedPassword,
    email,
    phoneNumber,
    status: STATUS.ACTIVE,
    isAdmin: true,
  };

  const newAdmin = await Admin.create(adminObj);

  // Send welcome email to new admin (non-blocking)
  try {
    if (email) {
      const welcomeHtml = getAdminWelcomeTemplate(firstName || "", lang);
      createMail({
        to: email,
        subject: `${t("EMAIL_WELCOME_ADMIN_SUBJECT", lang)} 🎉`,
        html: welcomeHtml,
      });
    }
  } catch (err) {
    console.error("Admin welcome email error:", err.message);
  }

  return newAdmin;
};

const loginAdmin = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { email, password } = req.body;
  const admin = await Admin.findOne(
    { email, status: STATUS.ACTIVE },
    {
      firstName: 1,
      lastName: 1,
      email: 1,
      phoneNumber: 1,
      password: 1,
      isAdmin: 1,
    }
  ).lean();
  if (!admin) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ADMIN_NOT_FOUND_ERROR", lang),
    });
  }

  const isPasswordValid = await comparePassword(password, admin.password);
  if (!isPasswordValid) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("ADMIN_INVALID_PASSWORD_ERROR", lang),
    });
  }

  const token = getJwtToken(admin, true);
  delete admin.password;
  return { token, isAdmin: true };
};

const getAdmins = async (req) => {
  let {
    query: { pageNo = 1, pageLimit = 10, searchTerm },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }
  const skip = +(pageNo - 1) * +pageLimit;
  const query = { status: STATUS.ACTIVE };
  if (searchTerm) {
    query.$or = [
      { firstName: { $regex: searchTerm, $options: "i" } },
      { lastName: { $regex: searchTerm, $options: "i" } },
    ];
  }

  const admins = await Admin.find(query)
    .sort({ _id: -1 })
    .skip(skip)
    .limit(pageLimit)
    .lean();
  admins.forEach((pass) => {
    delete pass.password;
  });
  const totalCount = await Admin.countDocuments(query);
  return { data: admins, totalCount };
};

const editAdmin = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    adminId,
    email,
    phoneNumber,
    firstName,
    lastName,
    status,
    action,
    password,
  } = req.body;

  let msg = "";
  const admin = await Admin.findOne({ _id: adminId });
  if (!admin) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ADMIN_NOT_FOUND_ERROR", lang),
    });
  }
  if (action === EDIT_ACTION.EDIT) {
    if (firstName) admin.firstName = firstName;
    if (lastName) admin.lastName = lastName;
    if (email) admin.email = email;
    if (phoneNumber) admin.phoneNumber = phoneNumber;
    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      admin.password = hashedPassword;
    }

    await admin.save();
    return { message: t("ADMIN_UPDATE_SUCCESS", lang) };
  } else if (action === EDIT_ACTION.DELETE) {
    if (status) admin.status = status;
    admin.blockUnblockDate = new Date();

    await admin.save();
    return { message: t("ADMIN_DELETE_SUCCESS", lang) };
  }
  throwError({
    status: STATUS_CODES.BAD_REQUEST,
    message: t("ADMIN_INVALID_ACTION_ERROR", lang),
  });
};

const getUsers = async (req) => {
  let {
    query: { pageNo = 1, pageLimit = 10, searchTerm, status },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }

  const skip = +(pageNo - 1) * +pageLimit;
  const query = {
    status: { $in: [STATUS.ACTIVE, STATUS.BLOCKED] },
    role: ROLES.CUSTOMER,
  };
  if (status) {
    query.status = status;
  }

  if (searchTerm) {
    query.fullName = { $regex: searchTerm, $options: "i" };
  }
  const [users, totalCount] = await Promise.all([
    User.find(query).sort({ firstName: 1 }).skip(skip).limit(pageLimit).lean(),
    User.countDocuments(query),
  ]);
  return { users, totalCount };
};

const getRestaurants = async (req) => {
  let {
    query: { pageNo = 1, pageLimit = 10, searchTerm, status },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }
  const skip = +(pageNo - 1) * +pageLimit;

  const query = { status: { $in: [STATUS.ACTIVE, STATUS.BLOCKED] } };
  if (status) {
    query.status = status;
  }

  if (searchTerm) {
    query.entityName = { $regex: searchTerm, $options: "i" };
  }
  const [entity, totalCount] = await Promise.all([
    EntityDetails.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .populate({ path: "userId", select: "email", model: "User" })
      .lean(),
    EntityDetails.countDocuments(query),
  ]);
  entity.map((logo) => {
    logo.image = generatePresignedUrl(logo.image);
  });
  return { entity, totalCount };
};

const getRestaurantOrders = async (req) => {
  let { entityId, pageNo = 1, pageLimit = 10, searchTerm } = req.query;

  pageNo = parseInt(pageNo, 10);
  pageLimit = parseInt(pageLimit, 10);
  const skip = (pageNo - 1) * pageLimit;

  const filter = entityId ? { entityId } : {};

  if (searchTerm) {
    const searchRegex = new RegExp(searchTerm, "i");
    const searchConditions = [];

    // Search by order _id if searchTerm is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(searchTerm)) {
      searchConditions.push({ _id: new mongoose.Types.ObjectId(searchTerm) });
    }

    // Search by item name
    const matchingItems = await ItemDetails.find(
      { itemName: { $regex: searchRegex } },
      { _id: 1 }
    ).lean();
    if (matchingItems.length > 0) {
      const matchingItemIds = matchingItems.map((item) => item._id);
      searchConditions.push({ "items.itemId": { $in: matchingItemIds } });
    }

    // Search by counter name (scoped to entity if entityId provided)
    const counterQuery = { counterName: { $regex: searchRegex } };
    if (entityId) counterQuery.entityId = entityId;
    const matchingCounters = await Counter.find(counterQuery, {
      _id: 1,
    }).lean();
    if (matchingCounters.length > 0) {
      const matchingCounterIds = matchingCounters.map((c) => c._id);
      searchConditions.push({ counterId: { $in: matchingCounterIds } });
    }

    if (searchConditions.length > 0) {
      filter.$or = searchConditions;
    } else {
      // searchTerm provided but nothing matched → return empty
      filter._id = null;
    }
  }

  const orders = await Order.find(filter)
    .populate({ path: "counterId", select: "counterName" })
    .populate({ path: "items.itemId", select: "itemName quantity currency" })
    .skip(skip)
    .limit(pageLimit)
    .sort({ createdAt: -1 })
    .lean();

  if (!orders.length) {
    return { orders: [], totalOrders: 0, totalRevenue: 0 };
  }

  const totalOrders = await Order.countDocuments(filter);

  const [revenueData] = await Order.aggregate([
    {
      $match: {
        ...filter,
        status: {
          $in: [
            ORDER_STATUS.COMPLETED,
            ORDER_STATUS.WAITING,
            ORDER_STATUS.IN_PROGRESS,
            ORDER_STATUS.READY,
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$finalAmount" },
      },
    },
  ]);

  const totalRevenue = revenueData?.totalRevenue || 0;

  return { orders, totalOrders, totalRevenue };
};

const getTransactionLogs = async (req) => {
  let {
    query: { pageNo = 1, pageLimit = 10, searchTerm },
  } = req;

  if (typeof pageLimit === "string") {
    pageLimit = parseInt(pageLimit, 10);
  }
  const skip = +(pageNo - 1) * +pageLimit;

  // Build filter — if searchTerm provided, find matching users first
  const filter = {};
  if (searchTerm && searchTerm.trim()) {
    const searchRegex = new RegExp(searchTerm.trim(), "i");
    const matchingUsers = await User.find(
      { fullName: { $regex: searchRegex } },
      { _id: 1 }
    ).lean();
    const matchingEntities = await EntityDetails.find(
      { entityName: { $regex: searchRegex } },
      { _id: 1 }
    ).lean();
    const userIds = matchingUsers.map((u) => u._id);
    const entityIds = matchingEntities.map((e) => e._id);
    filter.$or = [
      ...(userIds.length ? [{ userId: { $in: userIds } }] : []),
      ...(entityIds.length ? [{ entityId: { $in: entityIds } }] : []),
    ];
    if (!filter.$or.length) {
      return { response: [], totalCount: 0 };
    }
  }

  // Wallee transaction logs from Commission model
  const [commissions, totalCount] = await Promise.all([
    Commission.find(filter)
      .populate({
        path: "userId",
        select: "fullName email",
        model: "User",
      })
      .populate({
        path: "entityId",
        select: "entityName",
        model: "EntityDetails",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Commission.countDocuments(filter),
  ]);

  // Enrich with Wallee transaction details (payment method, state, customer info)
  const transactions = await Promise.all(
    commissions.map(async (commission) => {
      const merchantSpaceId = commission.metadata?.merchantSpaceId;
      const walleeTransactionId = commission.walleeTransactionId;

      let walleeDetails = {};
      const txService = getWalleeTransactionsService();
      if (txService && merchantSpaceId && walleeTransactionId) {
        try {
          const transaction = await txService.getPaymentTransactionsId({
            space: Number(merchantSpaceId),
            id: Number(walleeTransactionId),
            expand: new Set(["paymentConnectorConfiguration"]),
          });
          const connectorName =
            transaction.paymentConnectorConfiguration?.name || null;
          walleeDetails = {
            paymentMethod: connectorName
              ? connectorName.replace(/^Wallee\s*-\s*/i, "")
              : null,
            paymentMethodImage:
              transaction.paymentConnectorConfiguration?.imagePath || null,
            transactionState: transaction.state,
            transactionDate:
              transaction.completedOn ||
              transaction.failedOn ||
              transaction.confirmedOn ||
              transaction.authorizedOn ||
              transaction.createdOn,
            customerEmail: transaction.customerEmailAddress,
            authorizedAmount: transaction.authorizationAmount,
            completedAmount: transaction.completedAmount,
            createdOn: transaction.createdOn,
            completedOn: transaction.completedOn,
            failedOn: transaction.failedOn,
            failureReason: transaction.failureReason,
            lineItems: transaction.lineItems,
          };
        } catch (err) {
          console.error(
            `Failed to fetch Wallee transaction ${walleeTransactionId}:`,
            err.message
          );
          // Fallback to commission metadata
          walleeDetails = {
            transactionState: commission.metadata?.transactionState || null,
            transactionDate:
              commission.metadata?.completedOn ||
              commission.metadata?.failedOn ||
              commission.metadata?.voidedOn ||
              commission.metadata?.declinedOn ||
              commission.createdAt,
          };
        }
      } else {
        walleeDetails = {
          transactionState: commission.metadata?.transactionState || null,
          transactionDate:
            commission.metadata?.completedOn ||
            commission.metadata?.failedOn ||
            commission.metadata?.voidedOn ||
            commission.metadata?.declinedOn ||
            commission.createdAt,
        };
      }

      return {
        _id: commission._id,
        walleeTransactionId: commission.walleeTransactionId,
        totalAmount: commission.totalAmount,
        platformCommission: commission.platformCommission,
        merchantAmount: commission.merchantAmount,
        platformFeesPercent: commission.platformFeesPercent,
        currency: commission.currency,
        commissionStatus: commission.status,
        userId: commission.userId,
        entityId: commission.entityId,
        eventId: commission.eventId,
        createdAt: commission.createdAt,
        ...walleeDetails,
      };
    })
  );

  return { transactions, totalCount };

  // -- Stripe transaction logs (commented out) --
  // const transactions = await Stripe.find()
  //   .populate({
  //     path: "userId",
  //     select: "fullName",
  //     model: "User",
  //   })
  //   .sort({ _id: -1 })
  //   .skip(skip)
  //   .limit(pageLimit);
  // const totalCount = await Stripe.countDocuments();
  // return { transactions, totalCount };
};

const getAdminUserDetails = async (req) => {
  const { userId } = req;
  const adminDetails = await Admin.findOne({ _id: userId }).lean();
  adminDetails.platformFees = global.PLATFORM_FEES;
  delete adminDetails.password;
  return adminDetails;
};

const getDashboardAnalytics = async (req) => {
  const query = { status: STATUS.ACTIVE, role: ROLES.CUSTOMER };

  const users = await User.countDocuments(query);
  const entities = await EntityDetails.countDocuments({
    status: STATUS.ACTIVE,
  });
  // Total revenue from Wallee commissions (one record per transaction via upsert)
  const [revenue] = await Commission.aggregate([
    { $group: { _id: null, totalRevenue: { $sum: "$platformCommission" } } },
  ]);
  const totalRevenue = parseFloat((revenue?.totalRevenue || 0).toFixed(2));
  return { users, entities, totalRevenue };

  // -- Old: Stripe-era revenue from Order.platformFees (commented out) --
  // const [revenue] = await Order.aggregate([
  //   {
  //     $match: {
  //       status: {
  //         $in: [ORDER_STATUS.COMPLETED, ORDER_STATUS.WAITING,
  //               ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.READY],
  //       },
  //     },
  //   },
  //   { $group: { _id: null, totalRevenue: { $sum: "$platformFees" } } },
  // ]);
  // const totalRevenue = revenue?.totalRevenue || 0;
};

const editRestaurantsOrUsers = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { entityId, userId, status } = req.body;

  const updateOperations = [];
  let message = "";
  const blockUnblockDate = new Date();
  let statusCode = STATUS_CODES.OK;
  let entity = null;
  let user = null;

  if (entityId) {
    entity = await EntityDetails.findOne({
      _id: entityId,
      status: { $in: [STATUS.ACTIVE, STATUS.BLOCKED] },
    }).lean();

    if (!entity) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("ADMIN_ENTITY_NOT_FOUND_ERROR", lang),
      });
    }
    updateOperations.push(
      EntityDetails.updateOne(
        { _id: entityId },
        { $set: { status, blockUnblockDate } }
      )
    );

    if (entity.userId) {
      updateOperations.push(
        User.updateOne(
          { _id: entity.userId },
          { $set: { status } } // Set to either ACTIVE or BLOCKED
        )
      );
      // Invalidate owner's session when entity is blocked
      if (status === STATUS.BLOCKED) {
        const { KEY_TYPE_PREFIXES } = require("../Utils/globalConstants");
        updateOperations.push(
          redisClient.del(`${KEY_TYPE_PREFIXES.USER_TOKEN}:${entity.userId}`)
        );
      }
    }

    statusCode =
      status === STATUS.BLOCKED
        ? STATUS_CODES.NOT_AUTHENTICATED
        : STATUS_CODES.OK;
    io.to(entityId.toString()).emit("restaurantUpdate", {
      status: status,
      statusCode,
    });
  }

  if (userId) {
    user = await User.findOne({
      _id: userId,
      status: { $in: [STATUS.ACTIVE, STATUS.BLOCKED] },
      role: ROLES.CUSTOMER,
    }).lean();

    if (!user) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("ADMIN_USER_NOT_FOUND_ERROR", lang),
      });
    }

    updateOperations.push(
      User.updateOne({ _id: userId }, { $set: { status, blockUnblockDate } })
    );
    statusCode =
      status === STATUS.BLOCKED
        ? STATUS_CODES.NOT_AUTHENTICATED
        : STATUS_CODES.OK;
    io.to(userId.toString()).emit("restaurantUpdate", {
      status: status,
      statusCode,
    });

    // Invalidate user's session/token when blocked so they are logged out immediately
    if (status === STATUS.BLOCKED) {
      const { KEY_TYPE_PREFIXES } = require("../Utils/globalConstants");
      updateOperations.push(
        redisClient.del(`${KEY_TYPE_PREFIXES.USER_TOKEN}:${userId}`)
      );
    }
  }

  await Promise.all(updateOperations);

  // Send email notification about account status change
  try {
    if (entityId && entity) {
      const owner = entity.userId
        ? await User.findOne(
            { _id: entity.userId },
            { email: 1, firstName: 1 }
          ).lean()
        : null;
      if (owner?.email) {
        const html = getAccountStatusTemplate(
          entity.entityName || owner.firstName || "User",
          status,
          "entity"
        );
        await createMail({
          to: owner.email,
          subject: `countr - Your entity has been ${status === STATUS.BLOCKED ? "blocked" : "unblocked"}`,
          html,
        });
      }
    }

    if (userId && user?.email) {
      const html = getAccountStatusTemplate(
        user.firstName || "User",
        status,
        "account"
      );
      await createMail({
        to: user.email,
        subject: `countr - Your account has been ${status === STATUS.BLOCKED ? "blocked" : "unblocked"}`,
        html,
      });
    }
  } catch (err) {
    console.error("Status change email error:", err.message);
  }

  return { statusCode };
};

const resetPassword = async (req) => {
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

  // Verify reset token from send-email-otp
  const storedToken = await redisClient.get(resetTokenKey);
  if (!storedToken || storedToken !== resetToken) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("INVALID_RESET_TOKEN", lang),
    });
  }

  // Find admin
  const adminUser = await Admin.findOne({
    email: trimmedEmail,
    status: STATUS.ACTIVE,
  });

  if (!adminUser) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ADMIN_NOT_FOUND_ERROR", lang),
    });
  }

  // Update password and clear reset token
  adminUser.password = bcrypt.hashSync(newPassword.trim(), 10);
  await Promise.all([adminUser.save(), redisClient.del(resetTokenKey)]);

  return { message: t("ADMIN_PASSWORD_UPDATE_SUCCESS", lang) };
  return message;
};

const logoutAdmin = async (req) => {
  const { userId } = req;
  const admin = await Admin.findById(userId, { _id: 1, status: 1 });
  if (admin.status === STATUS.DELETED) {
    throwError({
      status: STATUS_CODES.NOT_AUTHENTICATED,
      message: t("ADMIN_BLOCKED_ERROR", lang),
    });
  }
  const prefix = KEY_TYPE_PREFIXES.USER_TOKEN;
  await redisClient.del(`${prefix}:${admin._id}`);
};

const platformmFees = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    userId,
    body: { platformFees },
  } = req;
  const admin = await Admin.findById(userId);
  if (!admin) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ADMIN_NOT_FOUND_ERROR", lang),
    });
  }
  if (platformFees) admin.platformFees = platformFees;
  await admin.save();
  global.PLATFORM_FEES = platformFees;
};

const sendEmailOtp = async (req) => {
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

  // If OTP provided -> Verify and return reset token
  if (trimmedOtp) {
    const redisKey = `${KEY_TYPE_PREFIXES.EMAIL_OTP}${trimmedEmail}`;
    const storedOtp = await redisClient.get(redisKey);

    if (!storedOtp) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OTP_EXPIRED", lang),
      });
    }

    if (storedOtp !== trimmedOtp) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OTP_INVALID", lang),
      });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenKey = `${KEY_TYPE_PREFIXES.EMAIL_OTP}${trimmedEmail}:resetToken`;

    await Promise.all([
      redisClient.del(redisKey),
      redisClient.setEx(resetTokenKey, 86400, resetToken),
    ]);

    return {
      otpVerified: true,
      token: resetToken,
      message: t("OTP_VERIFIED_SUCCESS", lang),
    };
  }

  // Check admin exists with this email
  const adminUser = await Admin.findOne(
    { email: trimmedEmail, status: STATUS.ACTIVE },
    { _id: 1 }
  );

  if (!adminUser) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ADMIN_NOT_FOUND_ERROR", lang),
    });
  }

  // Send OTP
  const redisKey = `${KEY_TYPE_PREFIXES.EMAIL_OTP}${trimmedEmail}`;
  const generatedOtp = crypto.randomInt(100000, 999999).toString();
  console.log(`[OTP] Admin email=${trimmedEmail} otp=${generatedOtp}`);

  await redisClient.setEx(redisKey, 120, generatedOtp);

  const htmlTemplate = getVerificationCodeTemplate(generatedOtp, "2 minutes");

  const emailSent = await createMail({
    to: trimmedEmail,
    subject: "Your Verification Code - countr",
    html: htmlTemplate,
    text: `Your verification code is: ${generatedOtp}. It is valid for 2 minutes.`,
  });

  if (!emailSent) {
    await redisClient.del(redisKey);
    throwError({
      status: STATUS_CODES.SERVER_ERROR,
      message: t("EMAIL_SEND_ERROR", lang),
    });
  }

  return { otpSent: true, message: t("OTP_SENT_EMAIL_SUCCESS", lang) };
};

module.exports = {
  addAdmin,
  loginAdmin,
  getAdmins,
  editAdmin,
  getUsers,
  getRestaurants,
  getRestaurantOrders,
  getTransactionLogs,
  getAdminUserDetails,
  getDashboardAnalytics,
  editRestaurantsOrUsers,
  resetPassword,
  logoutAdmin,
  platformmFees,
  sendEmailOtp,
};
