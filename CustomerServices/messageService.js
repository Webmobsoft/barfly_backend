// Chat between the restaurant and the guest about one order. The restaurant
// always writes first; the guest can only reply, and the thread locks once the
// order is Completed or Cancelled.

const mongoose = require("mongoose");
const Order = require("../Models/Order");
const OrderMessage = require("../Models/OrderMessage");
const EntityDetails = require("../Models/EntityDetails");
const { STATUS_CODES, ORDER_STATUS } = require("../Utils/globalConstants");
const throwError = require("../Utils/throwError");
const { t } = require("../Utils/translator");
const { getIo } = require("../Utils/socket");
const { sendFirebaseNotification } = require("../Utils/commonFunction");

const { ObjectId } = mongoose.Types;

const SENDERS = { RESTAURANT: "restaurant", GUEST: "guest" };
const MAX_MESSAGE_LENGTH = 500;
const OPEN_STATUSES = [
  ORDER_STATUS.WAITING,
  ORDER_STATUS.IN_PROGRESS,
  ORDER_STATUS.READY,
];

const MESSAGE_ERRORS = {
  ORDER_NOT_FOUND: "MESSAGE_ORDER_NOT_FOUND",
  CHAT_CLOSED: "MESSAGE_CHAT_CLOSED",
  GUEST_CANNOT_START: "MESSAGE_GUEST_CANNOT_START",
  TEXT_INVALID: "MESSAGE_TEXT_INVALID",
};

const fail = (status, code, lang, data) =>
  throwError({ status, message: t(code, lang), code, ...(data ? { data } : {}) });

const toMessage = (message) => ({
  _id: message._id,
  orderId: message.orderId,
  sender: message.sender,
  text: message.text,
  viaVoice: Boolean(message.viaVoice),
  readAt: message.readAt || null,
  createdAt: message.createdAt,
});

const toLatest = (message) =>
  message
    ? {
        sender: message.sender,
        text: message.text,
        createdAt: message.createdAt,
        viaVoice: Boolean(message.viaVoice),
      }
    : null;

/**
 * Per order: whether there is a thread, the latest message, and how many
 * messages from the other side are unread.
 * @param viewer "restaurant" | "guest" — whose unread messages to count.
 * @returns Map<orderId, { hasMessages, latestMessage, unread }>
 */
const getMessageSummaries = async (orderIds, viewer) => {
  const ids = [...new Set((orderIds || []).map(String))]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => ObjectId(id));
  const result = new Map();
  if (!ids.length) return result;
  const otherSide =
    viewer === SENDERS.GUEST ? SENDERS.RESTAURANT : SENDERS.GUEST;
  const rows = await OrderMessage.aggregate([
    { $match: { orderId: { $in: ids } } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: "$orderId",
        latest: { $first: "$$ROOT" },
        unread: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$sender", otherSide] },
                  { $not: [{ $ifNull: ["$readAt", false] }] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  rows.forEach((row) => {
    result.set(String(row._id), {
      hasMessages: true,
      latestMessage: toLatest(row.latest),
      unread: row.unread,
    });
  });
  return result;
};

const EMPTY_SUMMARY = { hasMessages: false, latestMessage: null, unread: 0 };

// Adds hasMessages / unreadMessages / latestMessage to guest order objects.
const withGuestMessageInfo = async (orders) => {
  const list = (orders || []).filter(Boolean);
  const summaries = await getMessageSummaries(
    list.map((order) => order._id),
    SENDERS.GUEST,
  );
  return (orders || []).map((order) => {
    if (!order) return order;
    const summary = summaries.get(String(order._id)) || EMPTY_SUMMARY;
    return {
      ...order,
      hasMessages: summary.hasMessages,
      unreadMessages: summary.unread,
      latestMessage: summary.latestMessage,
    };
  });
};

// The order the caller may chat about, or a 404. The owner sees orders of
// their own restaurant, the guest only their own orders.
const findOrderForCaller = async (req, lang) => {
  const { orderId } = req.params;
  const isOwner = Boolean(req.entityId);
  const userId = req.userId || req.id;
  if (!ObjectId.isValid(orderId) || (!isOwner && !userId)) {
    fail(STATUS_CODES.NOT_FOUND, MESSAGE_ERRORS.ORDER_NOT_FOUND, lang);
  }
  const order = await Order.findOne(
    isOwner
      ? { _id: orderId, entityId: req.entityId }
      : { _id: orderId, userId },
    { status: 1, entityId: 1, userId: 1, tokenNumber: 1, counterId: 1 },
  ).lean();
  if (!order) fail(STATUS_CODES.NOT_FOUND, MESSAGE_ERRORS.ORDER_NOT_FOUND, lang);
  return {
    order,
    sender: isOwner ? SENDERS.RESTAURANT : SENDERS.GUEST,
  };
};

const listMessages = async (req, lang) => {
  const { order, sender } = await findOrderForCaller(req, lang);
  const messages = await OrderMessage.find({ orderId: order._id })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const chatOpen = OPEN_STATUSES.includes(order.status);
  const hasRestaurantMessage = messages.some(
    (message) => message.sender === SENDERS.RESTAURANT,
  );
  return {
    orderId: order._id,
    status: order.status,
    chatOpen,
    canSend:
      chatOpen && (sender === SENDERS.RESTAURANT || hasRestaurantMessage),
    messages: messages.map(toMessage),
  };
};

const normalizeText = (text, lang) => {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value || value.length > MAX_MESSAGE_LENGTH) {
    fail(STATUS_CODES.BAD_REQUEST, MESSAGE_ERRORS.TEXT_INVALID, lang, {
      maxLength: MAX_MESSAGE_LENGTH,
    });
  }
  return value;
};

const emitToBoth = (order, event, payload) => {
  const io = getIo();
  if (!io) return;
  io.to(String(order.entityId)).emit(event, payload);
  io.to(`user_${order.userId}`).emit(event, payload);
};

const notifyNewMessage = async (order, message) => {
  const orderId = String(order._id);
  const entityId = String(order.entityId);
  if (message.sender === SENDERS.RESTAURANT) {
    const entity = await EntityDetails.findById(order.entityId, {
      entityName: 1,
    }).lean();
    sendFirebaseNotification({
      topic: `user_${order.userId}`,
      showNotification: true,
      alertSound: true,
      title: entity?.entityName || "Countr",
      body: message.text,
      data: {
        action: "order_message",
        screen: "order_chat",
        orderId,
        entityId,
        orderNo: String(order.tokenNumber || ""),
        topic: `user_${order.userId}`,
      },
    });
    return;
  }
  sendFirebaseNotification({
    topic: `owner_entity_${entityId}`,
    showNotification: false,
    title: "New message",
    body: message.text,
    data: {
      action: "order_message",
      screen: "order_board",
      orderId,
      entityId,
      orderNo: String(order.tokenNumber || ""),
      topic: `owner_entity_${entityId}`,
    },
  });
};

const sendMessage = async (req, lang) => {
  const { order, sender } = await findOrderForCaller(req, lang);
  const text = normalizeText(req.body?.text, lang);
  if (!OPEN_STATUSES.includes(order.status)) {
    fail(STATUS_CODES.BAD_REQUEST, MESSAGE_ERRORS.CHAT_CLOSED, lang);
  }
  if (sender === SENDERS.GUEST) {
    const started = await OrderMessage.exists({
      orderId: order._id,
      sender: SENDERS.RESTAURANT,
    });
    if (!started) {
      fail(STATUS_CODES.BAD_REQUEST, MESSAGE_ERRORS.GUEST_CANNOT_START, lang);
    }
  }

  const created = await OrderMessage.create({
    orderId: order._id,
    entityId: order.entityId,
    userId: order.userId,
    sender,
    text,
    viaVoice: sender === SENDERS.RESTAURANT && req.body?.viaVoice === true,
  });
  const message = toMessage(created.toObject());

  emitToBoth(order, "orderMessage", {
    orderId: String(order._id),
    entityId: String(order.entityId),
    message,
  });
  notifyNewMessage(order, message).catch((error) =>
    console.error("Order message push failed", error),
  );
  return message;
};

// Marks the other side's messages as read for the caller.
const markMessagesRead = async (req, lang) => {
  const { order, sender } = await findOrderForCaller(req, lang);
  const otherSide =
    sender === SENDERS.GUEST ? SENDERS.RESTAURANT : SENDERS.GUEST;
  const readAt = new Date();
  const { nModified = 0 } = await OrderMessage.updateMany(
    { orderId: order._id, sender: otherSide, readAt: null },
    { $set: { readAt } },
  );
  if (nModified > 0) {
    emitToBoth(order, "orderMessagesRead", {
      orderId: String(order._id),
      entityId: String(order.entityId),
      reader: sender,
      readAt,
    });
  }
  return { orderId: order._id, marked: nModified };
};

module.exports = {
  SENDERS,
  MESSAGE_ERRORS,
  MAX_MESSAGE_LENGTH,
  getMessageSummaries,
  withGuestMessageInfo,
  listMessages,
  sendMessage,
  markMessagesRead,
};
