const mongoose = require("mongoose");
const express = require("express");
const router = express.Router({ caseSensitive: true });

const { STATUS_CODES } = require("../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("../Utils/translator");
const {
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
} = require("./services");

router.post("/add-admin", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await addAdmin(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ADMIN_ADD_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while registering the admin", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({
        message: error.message || t("ADMIN_ADD_ERROR", lang),
      });
  }
});

router.post("/login-admin", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await loginAdmin(req);
    return res
      .status(STATUS_CODES.OK)
      .json({
        message: t("ADMIN_LOGIN_SUCCESS", lang),
        ...response,
      });
  } catch (error) {
    console.error("Error while login the admin", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({
        message: error.message || t("ADMIN_LOGIN_ERROR", lang),
      });
  }
});

router.get("/get-admins", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getAdmins(req);
    return res
      .status(STATUS_CODES.OK)
      .json({
        message: t("ADMIN_LIST_FETCH_SUCCESS", lang),
        ...data,
      });
  } catch (error) {
    console.error("Error while getting the admins", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({
        message: error.message || t("ADMIN_LIST_FETCH_ERROR", lang),
      });
  }
});

router.post("/edit-admin", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await editAdmin(req);
    return res.status(STATUS_CODES.OK).json(
      response?.message
        ? response
        : { message: t("ADMIN_UPDATE_SUCCESS", lang) }
    );
  } catch (error) {
    console.error("Error while editiing the admin", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({
        message: error.message || t("ADMIN_UPDATE_ERROR", lang),
      });
  }
});

router.get("/get-users", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { users, totalCount } = await getUsers(req);
    return res
      .status(STATUS_CODES.OK)
      .json({
        message: t("ADMIN_USERS_FETCH_SUCCESS", lang),
        users,
        totalCount,
      });
  } catch (error) {
    console.error("Error while getting the users", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({
        message: error.message || t("ADMIN_USERS_FETCH_ERROR", lang),
      });
  }
});

router.get("/get-restaurants", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { entity, totalCount } = await getRestaurants(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ADMIN_RESTAURANTS_FETCH_SUCCESS", lang),
      entity,
      totalCount,
    });
  } catch (error) {
    console.error("Error while getting the restaurants", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message || t("ADMIN_RESTAURANTS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-restaurants-orders", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getRestaurantOrders(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ADMIN_RESTAURANT_ORDERS_FETCH_SUCCESS", lang),
      ...data,
    });
  } catch (error) {
    console.error("Error while getting the restaurants", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message ||
        t("ADMIN_RESTAURANT_ORDERS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-transaction-logs", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getTransactionLogs(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ADMIN_TRANSACTIONS_FETCH_SUCCESS", lang),
      ...data,
    });
  } catch (error) {
    console.error("Error while fetching the transaction logs:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message ||
        t("ADMIN_TRANSACTIONS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-admin-user-details", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getAdminUserDetails(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ADMIN_DETAILS_FETCH_SUCCESS", lang),
      data,
    });
  } catch (error) {
    console.error("Error while fetching the admin details:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message || t("ADMIN_DETAILS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-dashboard-analytics", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getDashboardAnalytics(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ADMIN_ANALYTICS_FETCH_SUCCESS", lang),
      ...data,
    });
  } catch (error) {
    console.error("Error while fetching the analytics:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message || t("ADMIN_ANALYTICS_FETCH_ERROR", lang),
    });
  }
});

router.post("/edit-restaurants-or-users", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await editRestaurantsOrUsers(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ADMIN_RESTAURANT_UPDATE_SUCCESS", lang),
      ...data,
    });
  } catch (error) {
    console.error("Error while updating the restaurants or users:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message ||
        t("ADMIN_RESTAURANT_UPDATE_ERROR", lang),
    });
  }
});

router.post("/reset-password", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const message = await resetPassword(req);
    return res.status(STATUS_CODES.OK).json(
      message?.message
        ? message
        : { message: t("ADMIN_PASSWORD_UPDATE_SUCCESS", lang) }
    );
  } catch (error) {
    console.error("Error while resetting the password:", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message ||
        t("ADMIN_PASSWORD_RESET_ERROR", lang),
    });
  }
});

router.post("/logout-admin", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await logoutAdmin(req);
    return res
      .status(STATUS_CODES.OK)
      .json({
        message: t("ADMIN_LOGOUT_SUCCESS", lang),
        response,
      });
  } catch (error) {
    console.error("Error while logging out the admin: ", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({
        message:
          error.message ||
          t("ADMIN_LOGOUT_ERROR", lang),
      });
  }
});

router.post("/add-platform-fees", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await platformmFees(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ADMIN_PLATFORM_FEES_ADD_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while adding platform fees", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({
        message:
          error.message ||
          t("ADMIN_PLATFORM_FEES_ADD_ERROR", lang),
      });
  }
});

router.post("/send-email-otp", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await sendEmailOtp(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error in admin send email OTP:", error);
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({
        message: error.message || t("ADMIN_OTP_ERROR", lang),
      });
  }
});

module.exports = router;
