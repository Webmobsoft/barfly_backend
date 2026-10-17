const express = require("express");
const router = express.Router();
const { STATUS_CODES } = require("../../../Utils/globalConstants");
const {
  register,
  login,
  logoutEntity,
  sendEmailOtp,
  resetPassword,
} = require("./service");
const { t, getLanguageFromRequest } = require("../../../Utils/translator");

const multer = require("multer");
// Cap uploads at 10MB so a giant phone-camera image can't OOM the worker
// (memoryStorage buffers the whole file in RAM). PM2 would otherwise restart
// the process mid-request and nginx would render its default HTML 500 page.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Convert Multer errors into a JSON 400 instead of falling through to
// Express's default HTML error handler.
const handleUpload = (field) => (req, res, next) => {
  upload.single(field)(req, res, (err) => {
    if (!err) return next();
    const lang = getLanguageFromRequest(req);
    const isLimit = err.code === "LIMIT_FILE_SIZE";
    return res
      .status(isLimit ? STATUS_CODES.BAD_REQUEST : STATUS_CODES.SERVER_ERROR)
      .json({
        message: isLimit
          ? t("FILE_TOO_LARGE", lang)
          : err.message || t("FILE_UPLOAD_FAILED", lang),
      });
  });
};

router.post("/login", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await login(req);
    console.log({ response });
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_LOGIN_SUCCESS", lang),
      token: response.token,
      userDetails: response.entityDetails,
    });
  } catch (error) {
    console.error("Error while login", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_LOGIN_ERROR", lang),
    });
  }
});

router.post("/register", handleUpload("file"), async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const message = await register(req);
    return res.status(STATUS_CODES.OK).json(message);
  } catch (error) {
    console.error("Error while registering the user: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_REGISTER_ERROR", lang),
    });
  }
});

router.post("/logout", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await logoutEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ENTITY_LOGOUT_SUCCESS", lang), response });
  } catch (error) {
    console.error("Error while logging out the entity: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ENTITY_LOGOUT_ERROR", lang),
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
