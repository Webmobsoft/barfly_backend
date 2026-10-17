const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../../Utils/globalConstants");
const {
  register,
  login,
  countRTag,
  logoutUser,
  checkAndProvideCountRTag,
  deleteAccount,
  sendEmailOtp,
  resetPassword,
} = require("./services");
const { t, getLanguageFromRequest } = require("../../../Utils/translator");

router.post("/login", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await login(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("CUSTOMER_LOGIN_SUCCESS", lang),
      token: response.token,
      userDetails: response.user,
    });
  } catch (error) {
    console.error("Error while Logging-in the user: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("CUSTOMER_LOGIN_ERROR", lang),
    });
  }
});

router.post("/register", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await register(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("CUSTOMER_REGISTER_SUCCESS", lang),
      userObj: response.userObj,
      token: response.token,
    });
  } catch (error) {
    console.error("Error while registering the user.: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("CUSTOMER_REGISTER_ERROR", lang),
    });
  }
});

router.post("/countR-tag", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await countRTag(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("COUNTR_TAG_ACCEPT_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while creating CountR-Tag: ", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("COUNTR_TAG_ACCEPT_ERROR", lang),
    });
  }
});

router.get("/check-and-generate-countR-tag", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const countRTag = await checkAndProvideCountRTag(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("COUNTR_TAG_GENERATE_SUCCESS", lang),
      availableTags: countRTag,
    });
  } catch (error) {
    console.error("Error while generated CountR-Tag: ", error);

    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("COUNTR_TAG_GENERATE_ERROR", lang),
    });
  }
});

router.post("/logout", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await logoutUser(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("CUSTOMER_LOGOUT_SUCCESS", lang), response });
  } catch (error) {
    console.error("Error while logging out the user: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("CUSTOMER_LOGOUT_ERROR", lang),
    });
  }
});

router.post("/delete-account", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await deleteAccount(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("CUSTOMER_DELETE_ACCOUNT_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while deleting the account: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("CUSTOMER_DELETE_ACCOUNT_ERROR", lang),
    });
  }
});

router.post("/send-email-otp", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await sendEmailOtp(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error in send email OTP: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("EMAIL_OTP_ERROR", lang),
    });
  }
});

router.post("/reset-password", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await resetPassword(req);
    return res.status(STATUS_CODES.OK).json(response);
  } catch (error) {
    console.error("Error in reset password: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("PASSWORD_RESET_ERROR", lang),
    });
  }
});

module.exports = router;
