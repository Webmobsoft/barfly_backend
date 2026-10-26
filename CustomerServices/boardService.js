// Restaurant order board (Countr Plus / web panel): open orders of the
// caller's restaurant, ASAP tickets first, then one row per pickup slot.
// Layout rules live in Utils/ordering/board.js.

const mongoose = require("mongoose");
const Order = require("../Models/Order");
const Counter = require("../Models/Counter");
const ItemDetails = require("../Models/ItemDetails");
const { STATUS_CODES, ORDER_STATUS } = require("../Utils/globalConstants");
const throwError = require("../Utils/throwError");
const { t } = require("../Utils/translator");
const { buildBoard, getBoardSince } = require("../Utils/ordering");
const { getBookedCounts, getEntityTimezone } = require("./orderingService");
const { getMessageSummaries, SENDERS } = require("./messageService");

const { ObjectId } = mongoose.Types;

const BOARD_TABS = {
  live: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS],
  ready: [ORDER_STATUS.READY],
};

const ORDER_FIELDS = {
  tokenNumber: 1,
  status: 1,
  counterId: 1,
  entityId: 1,
  userId: 1,
  countrTag: 1,
  createdAt: 1,
  updatedAt: 1,
  totalAmount: 1,
  finalAmount: 1,
  isSelfPickup: 1,
  tableNo: 1,
  note: 1,
  pickupMode: 1,
  pickupSlotStart: 1,
  pickupSlotLength: 1,
  items: 1,
};

// Today's orders only (see getBoardSince): open orders from earlier days
// stay off the board and out of its tab counts.
const getBoardTimeFilter = async (entityId, now = new Date()) => {
  const since = getBoardSince({ now, timezone: await getEntityTimezone(entityId) });
  return {
    $or: [
      { pickupSlotStart: { $gte: since } },
      { pickupSlotStart: null, createdAt: { $gte: since } },
    ],
  };
};

const toBoardItem = (item, names) => ({
  itemId: item.itemId,
  itemName: item.itemName || names.get(String(item.itemId)) || "",
  quantity: item.quantity,
  note: item.note || "",
  categoryId: item.categoryId || null,
  categoryName: item.categoryName || "",
  categorySortIndex:
    typeof item.categorySortIndex === "number" ? item.categorySortIndex : null,
  extras: (item.extras || []).map((extra) => ({
    extraId: extra.extraId,
    name: extra.name,
    price: extra.price,
  })),
  unitPrice: item.unitPrice,
  lineTotal: item.lineTotal,
});

const getBoard = async (req, lang) => {
  const { entityId } = req;
  if (!entityId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("AUTH_TOKEN_INVALID", lang),
    });
  }
  const tab = req.query.status || "live";
  if (!BOARD_TABS[tab]) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("BOARD_STATUS_INVALID", lang),
      code: "BOARD_STATUS_INVALID",
    });
  }

  const counters = await Counter.find(
    { entityId },
    { counterName: 1, prepTimeMinutes: 1, ordersPerSlot: 1 },
  ).lean();
  const { counterId } = req.query;
  if (
    counterId &&
    !counters.some((counter) => String(counter._id) === String(counterId))
  ) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("BOARD_COUNTER_NOT_FOUND", lang),
      code: "BOARD_COUNTER_NOT_FOUND",
    });
  }

  const now = new Date();
  const orders = await Order.find(
    {
      entityId,
      status: { $in: BOARD_TABS[tab] },
      ...(counterId ? { counterId: ObjectId(String(counterId)) } : {}),
      ...(await getBoardTimeFilter(entityId, now)),
    },
    ORDER_FIELDS,
  ).lean();

  // Pre-1.0.3 orders have no item name snapshot.
  const missingNames = [
    ...new Set(
      orders
        .flatMap((order) => order.items || [])
        .filter((item) => !item.itemName && item.itemId)
        .map((item) => String(item.itemId)),
    ),
  ];
  const [itemDocs, summaries] = await Promise.all([
    missingNames.length
      ? ItemDetails.find({ _id: { $in: missingNames } }, { itemName: 1 }).lean()
      : [],
    getMessageSummaries(
      orders.map((order) => order._id),
      SENDERS.RESTAURANT,
    ),
  ]);
  const itemNames = new Map(itemDocs.map((item) => [String(item._id), item.itemName]));

  const counterInfo = new Map(
    counters.map((counter) => [String(counter._id), counter]),
  );
  const slotCounterIds = [
    ...new Set(
      orders
        .filter((order) => order.pickupMode === "slot" && order.counterId)
        .map((order) => String(order.counterId)),
    ),
  ];
  const bookedCounts = new Map(
    await Promise.all(
      slotCounterIds.map(async (id) => [
        id,
        await getBookedCounts({ counterId: id, now }),
      ]),
    ),
  );

  const boardOrders = orders.map((order) => {
    const summary = summaries.get(String(order._id));
    return {
      _id: order._id,
      tokenNumber: order.tokenNumber,
      status: order.status,
      counterId: order.counterId ? String(order.counterId) : null,
      counterName: counterInfo.get(String(order.counterId))?.counterName || "",
      countrTag: order.countrTag || "",
      userId: order.userId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      totalAmount: order.totalAmount,
      finalAmount: order.finalAmount,
      isSelfPickup: order.isSelfPickup,
      tableNo: order.tableNo,
      note: order.note || "",
      pickupMode: order.pickupMode || "asap",
      pickupSlotStart: order.pickupSlotStart || null,
      pickupSlotLength: order.pickupSlotLength || null,
      items: (order.items || []).map((item) => toBoardItem(item, itemNames)),
      latestMessage: summary?.latestMessage || null,
      unreadFromGuest: (summary?.unread || 0) > 0,
    };
  });

  const { asap, slots } = buildBoard({
    orders: boardOrders,
    counters: counterInfo,
    bookedCounts,
    now,
  });
  return { serverTime: now, status: tab, counterId: counterId || null, asap, slots };
};

module.exports = { BOARD_TABS, getBoard, getBoardTimeFilter };
