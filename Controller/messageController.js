// Order chat between the restaurant and the guest, mounted at /api/orders:
//   GET  /:orderId/messages        thread (owner of the order's restaurant or its guest)
//   POST /:orderId/messages        { text, viaVoice? } send
//   POST /:orderId/messages/read   mark the other side's messages read
// Owner tokens carry an entityId; everyone else is treated as the guest.

const express = require("express");
const { STATUS_CODES } = require("../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("../Utils/translator");
const {
  listMessages,
  sendMessage,
  markMessagesRead,
} = require("../CustomerServices/messageService");

const router = express.Router();

const sendError = (res, error, lang, fallbackKey) =>
  res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
    message: error.message || t(fallbackKey, lang),
    ...(error.code ? { code: error.code } : {}),
    ...(error.data ? { data: error.data } : {}),
  });

router.get("/:orderId/messages", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await listMessages(req, lang);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("MESSAGE_FETCH_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetching order messages", error);
    return sendError(res, error, lang, "MESSAGE_FETCH_ERROR");
  }
});

router.post("/:orderId/messages", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await sendMessage(req, lang);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("MESSAGE_SEND_SUCCESS", lang), data });
  } catch (error) {
    if (!error.code) console.error("Error while sending order message", error);
    return sendError(res, error, lang, "MESSAGE_SEND_ERROR");
  }
});

router.post("/:orderId/messages/read", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await markMessagesRead(req, lang);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("MESSAGE_READ_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while marking order messages read", error);
    return sendError(res, error, lang, "MESSAGE_FETCH_ERROR");
  }
});

module.exports = router;
