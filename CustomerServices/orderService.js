const EntityDetails = require("../Models/EntityDetails");
const Order = require("../Models/Order");
const {
  STATUS_CODES,
  ORDER_STATUS,
  STATUS,
} = require("../Utils/globalConstants");
const throwError = require("../Utils/throwError");
const mongoose = require("mongoose");
const ItemDetails = require("../Models/ItemDetails");
const Counter = require("../Models/Counter");
const { generatePresignedUrl } = require("../Controller/aws-service");
const { ObjectId } = mongoose.Types;

const {
  validateCoupon,
  sendFirebaseNotification,
  genrateCustomerOrderReport,
} = require("../Utils/commonFunction");
const Discount = require("../Models/Discount");
const { messaging, messagingPlus } = require("../firebaseAdmin");
const { io } = require("../app");
const OfflineOrders = require("../Models/OfflineOrder");
const User = require("../Models/User");
const { t, getLanguageFromRequest } = require("../Utils/translator");

const PAYMENT_PROCESSING_TTL_MS = 30 * 60 * 1000; // 30 minutes

const createOrder = async (req, session) => {
  const lang = getLanguageFromRequest(req);
  const {
    items,
    eventId,
    tableNo,
    isSelfPickup,
    note,
    couponCode,
    walleeTransactionId,
  } = req.body;
  const itemsIds = items?.map((doc) => doc.itemId);
  if (!itemsIds) return;

  // Idempotency: if an order already exists for this Wallee transaction,
  // return it instead of creating a duplicate. Safe for retries / double-taps.
  if (walleeTransactionId) {
    const existing = await Order.findOne({
      walleeTransactionId: Number(walleeTransactionId),
    }).session(session);
    if (existing) {
      return [existing];
    }
  }

  const menuItems = await ItemDetails.find({ _id: { $in: itemsIds } })
    .populate({ path: "menuCategoryId" })
    .lean();

  if (!menuItems.length) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_ITEM_NOT_FOUND", lang),
    });
  }

  const itemNameMapper = {};
  menuItems.forEach((item) => {
    if (!item.inStock) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("ORDER_ITEM_OUT_OF_STOCK", lang, {
          itemName: item.itemName,
        }),
      });
    }
    itemNameMapper[`${item._id}`] = item;
  });

  let counterId;
  let entityId;
  let msg = "";
  let amount = 0;

  items.forEach((doc) => {
    const menuItem = itemNameMapper[`${doc.itemId}`];
    if (menuItem) {
      entityId = menuItem?.entityId;
      // counterId = menuItem?.menuCategoryId?.counterId || menuItems?.counterId;
      counterId = menuItem?.menuCategoryId?.counterId;

      // if (menuItem.availableQuantity < doc.quantity) {
      //   msg += `${menuItem.itemName}, not in stock, Please add less item aur wait for restock.`;
      // }
      amount += doc.quantity * menuItem.price;
    }
  });

  if (msg) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: msg
        ? `${msg} ${t("ORDER_ITEMS_INSUFFICIENT_STOCK_SUFFIX", lang)}`
        : t("ORDER_ITEMS_INSUFFICIENT_STOCK", lang),
    });
  }

  const entityDetails = await EntityDetails.findOne({
    _id: entityId,
  })
    .populate("owner")
    .lean();
  if (entityDetails && !entityDetails.isOpen) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_RESTAURANT_CLOSED", lang),
    });
  }

  const lastOrder = await Order.find(
    { entityId },
    { tokenNumber: 1 },
    { sort: { _id: -1 } },
  ).limit(1);
  let tokenNumber = lastOrder[0] ? lastOrder[0].tokenNumber + 1 : 1;

  const originalAmount = amount;
  let discountAmount = 0;

  if (couponCode) {
    const couponValidation = await validateCoupon(couponCode, originalAmount);
    discountAmount = couponValidation.discountAmount;
  }

  const platformFees = global.PLATFORM_FEES || 0;
  const finalAmount =
    parseFloat(originalAmount) -
    parseFloat(discountAmount) +
    parseFloat(platformFees);

  // Attach itemName + itemPrice snapshot so data survives item deletion
  const itemsWithSnapshot = items.map((doc) => {
    const menuItem = itemNameMapper[`${doc.itemId}`];
    return {
      ...doc,
      itemName: menuItem?.itemName,
      itemPrice: menuItem?.price,
    };
  });

  const orderData = {
    status: ORDER_STATUS.PAYMENT_PROCESSING,
    items: itemsWithSnapshot,
    counterId,
    entityId,
    tokenNumber,
    userId: req.userId,
    totalAmount: originalAmount,
    discountAmount,
    finalAmount,
    couponCode,
    eventId,
    tableNo,
    isSelfPickup,
    note,
    platformFees: global.PLATFORM_FEES,
    walleeTransactionId: walleeTransactionId
      ? Number(walleeTransactionId)
      : undefined,
    // Client timezone (IANA) for rendering the receipt; read by the Wallee
    // webhook later when the PDF is generated. Falls back to default if absent.
    timezone: req.headers?.["timezone"] || undefined,
  };

  const createdOrder = await Order.create([orderData], { session });
  if (couponCode) {
    await Discount.updateOne({ code: couponCode }, { $inc: { usedCount: 1 } });
  }

  const topic = `entity_${entityDetails._id}`; // always prefix with a letter to avoid numeric-only topic names
  console.log({ topic });

  // sendFirebaseNotification({
  //   topic: topic,
  //   title: "Order received",
  //   body: "You have a new order. Tap to view.",
  //   data: {
  //     orderId: `${createdOrder[0]._id}`,
  //     data: JSON.stringify(createdOrder[0]),
  //     screen: "landing_home",
  //     click_action: "FLUTTER_NOTIFICATION_CLICK",
  //     topic: topic,
  //   },
  // });

  // Note: Socket emit "newOrder" is handled in orderController.js after transaction commits

  // Owner notification and report generation are deferred until payment is confirmed
  // via the Wallee webhook (walleeServices.js SUCCESS handler)

  return createdOrder;
};

const createOfflineOrder = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    userId,
    entityId,
    body: { items, counterId, internalNumber, countrTag },
  } = req;
  const itemIds = items?.map((item) => item.itemId);
  if (!itemIds) return;

  const itemDetails = await ItemDetails.find({ _id: { $in: itemIds } });
  if (!itemDetails.length) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OFFLINE_ORDER_ITEMS_NOT_FOUND", lang),
    });
  }

  const mapper = {};
  itemDetails.forEach((item) => {
    if (!item.inStock) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("ORDER_ITEM_OUT_OF_STOCK", lang, {
          itemName: item.itemName,
        }),
      });
    }
    mapper[item._id] = item;
  });

  let amount = 0;

  items.forEach((doc) => {
    const itemDetails = mapper[`${doc.itemId}`];
    if (itemDetails) {
      amount += doc.quantity * itemDetails.price;
    }
  });

  const offlineOrderObjCreated = await OfflineOrders.create({
    items,
    counterId,
    internalNumber,
    countrTag,
    entityId,
    userId,
    totalAmount: amount,
    // finalAmount: amount,
    status: ORDER_STATUS.IN_PROGRESS,
    // Client timezone (IANA) for rendering the receipt PDF; falls back to
    // default if absent.
    timezone: req.headers?.["timezone"] || undefined,
  });
  const offlineOrderObj = await OfflineOrders.findOne({
    _id: offlineOrderObjCreated._id,
  }).lean();
  // off

  // Send Firebase data message to owner for real-time update
  sendFirebaseNotification({
    topic: `owner_entity_${entityId}`,
    showNotification: true,
    title: "New Offline Order",
    body: "A new offline order has been placed.",
    data: {
      action: "offline_order_create",
      screen: "order_screen",
      orderId: offlineOrderObj._id.toString(),
      entityId: entityId.toString(),
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${entityId}`,
    },
  });

  // Socket emit to owner for real-time UI update
  io.to(entityId.toString()).emit("offlineOrderUpdate", {
    action: "create",
    order: offlineOrderObj,
    entityId: entityId.toString(),
  });

  // Notify the customer (resolved via countrTag, not the auth-derived userId
  // which is the owner/staff placing the order on their behalf).
  const customer = countrTag
    ? await User.findOne({ countrTag }, { _id: 1 }).lean()
    : null;
  const customerId = customer?._id?.toString();
  if (customerId) {
    const orderRef = internalNumber ? `#${internalNumber}` : "";
    sendFirebaseNotification({
      topic: `user_${customerId}`,
      showNotification: true,
      alertSound: true,
      title: "New Offline Order",
      body: orderRef
        ? `Offline order ${orderRef} has been placed on your account.`
        : "An offline order has been placed on your account.",
      data: {
        orderId: offlineOrderObj._id.toString(),
        internalNumber: (internalNumber || "").toString(),
        status: ORDER_STATUS.IN_PROGRESS,
        action: "offline_order_create",
        screen: "status",
        isOffline: "true",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `user_${customerId}`,
      },
    });
  } else {
    console.warn(
      `[OfflineOrder] No customer found for countrTag=${countrTag} — skipping customer create notification`,
    );
  }

  genrateCustomerOrderReport({
    userId: userId,
    entityId: entityId,
    orders: { ...offlineOrderObj, finalAmount: amount },
    mode: "Offline",
  });
  return offlineOrderObj;
};

const updateStatusOfOrder = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { orderId, status } = req.body;

  if (
    ![
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.READY,
      ORDER_STATUS.IN_PROGRESS,
      ORDER_STATUS.CANCELLED,
    ].includes(status)
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_STATUS_INVALID", lang),
    });
  }

  const order = await Order.findOne({ _id: orderId });

  if (!order) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_NOT_FOUND_FOR_ENTITY", lang),
    });
  }

  if (
    order.status === ORDER_STATUS.PAYMENT_PROCESSING ||
    order.status === ORDER_STATUS.PAYMENT_FAILED
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_PAYMENT_NOT_CONFIRMED", lang),
    });
  }

  const updatedOrder = await Order.findOneAndUpdate(
    { _id: orderId },
    { $set: { status } },
    { new: true },
  ).populate("userId");

  io.to(order.entityId.toString()).emit("orderStatusUpdate", {
    orderId: order._id,
    status,
  });

  // Send Firebase notification to owner app for order status update
  sendFirebaseNotification({
    topic: `owner_entity_${order.entityId}`,
    showNotification: false,
    title: "Order Status Updated",
    body: `Order #${order.tokenNumber} is now ${status}.`,
    data: {
      action: "order_status_update",
      screen: "order_screen",
      orderId: orderId.toString(),
      status: status,
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${order.entityId}`,
    },
  });

  const userId = updatedOrder?.userId?._id;
  const orderNo = updatedOrder?.tokenNumber || order?.tokenNumber;

  sendFirebaseNotification({
    topic: `user_${userId}`,
    showNotification: true,
    alertSound: true,
    title: "Order Status Updated",
    body: `Order No: ${orderNo} is ${status}!`,
    data: {
      orderId: orderId,
      status: status,
      action: "order_status_update",
      screen: "status",
      orderNo: orderNo?.toString() || "",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `user_${userId}`,
    },
  });

  // if (!Array.isArray(userTokens) || userTokens.length === 0) {
  //   console.warn("No valid FCM tokens found. Skipping push.");
  //   return;
  // }

  // const payloadTemplate = (token) => ({
  //   notification: {
  //     title: "Order Status Updated",
  //     body: `Your order is now ${status}. Tap to view details.`,
  //   },
  //   data: {
  //     orderId: orderId,
  //     status: status,
  //     screen: "status",
  //     click_action: "FLUTTER_NOTIFICATION_CLICK",
  //   },
  //   token,
  //   android: {
  //     priority: "high",
  //     notification: {
  //       click_action: "FLUTTER_NOTIFICATION_CLICK",
  //     },
  //   },
  //   apns: {
  //     payload: {
  //       aps: {
  //         content_available: true,
  //         category: "FLUTTER_NOTIFICATION_CLICK",
  //         mutableContent: 1,
  //         alert: {
  //           title: "Order Status Updated",
  //           body: `Your order is now ${status}. Tap to view details.`,
  //         },
  //       },
  //     },
  //   },
  // });

  // for (const token of userTokens) {
  //   try {
  //     await messaging.send(payloadTemplate(token));
  //   } catch (error) {
  //     console.error("Push failed for token:", token, error.message);

  //     if (
  //       error.code === "messaging/invalid-argument" ||
  //       error.code === "messaging/registration-token-not-registered"
  //     ) {
  //       await User.updateOne(
  //         { _id: updatedOrder.userId._id },
  //         { $pull: { fcmToken: token } }
  //       );
  //       console.warn(
  //         "Removed invalid fcmToken for user",
  //         updatedOrder.userId._id
  //       );
  //     }
  //   }
  // }
};

// const getEntityOrders = async (req) => {
//   const {
//     entityId,
//     query: { pageNo = 1, pageLimit = 10, status, counterId },
//   } = req;

//   const limit = Math.max(Number(pageLimit), 1);
//   const skip = (Math.max(Number(pageNo), 1) - 1) * limit;

//   const query = { entityId };
//   query.status = status
//     ? status
//     : {
//         $in: [
//           ORDER_STATUS.IN_PROGRESS,
//           ORDER_STATUS.WAITING,
//           ORDER_STATUS.CANCELLED,
//         ],
//       };

//   if (counterId) {
//     query.counterId = counterId;
//   }

//   const [
//     data,
//     orderProcessCount,
//     readyOrders,
//     completedOrders,
//     cancelledOrders,
//   ] = await Promise.all([
//     Order.find(query)
//       .populate({
//         path: "items.itemId",
//         select: "itemName quantity description type currency image createdAt",
//         model: "ItemDetails",
//       })
//       .populate({
//         path: "counterId",
//         select: "counterName",
//         model: "Counter",
//       })
//       .sort({ tokenNumber: -1 })
//       .skip(skip)
//       .limit(limit),
//     Order.countDocuments({
//       entityId,
//       status: {
//         $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS],
//       },
//     }),
//     Order.countDocuments({ entityId, status: ORDER_STATUS.READY }),
//     Order.countDocuments({ entityId, status: ORDER_STATUS.COMPLETED }),
//     Order.countDocuments({ entityId, status: ORDER_STATUS.CANCELLED }),
//   ]);
//   return {
//     data,
//     orderProcessCount,
//     readyOrders,
//     completedOrders,
//     cancelledOrders,
//   };
// };

const getEntityOrders = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    entityId,
    query: {
      pageNo = 1,
      pageLimit = 10,
      status,
      counterId,
      searchTerm,
      selectedOrderId,
    },
  } = req;

  const limit = Math.max(Number(pageLimit), 1);
  const skip = (Math.max(Number(pageNo), 1) - 1) * limit;

  const query = { entityId };
  let sorting = -1;

  if (counterId) {
    query.counterId = counterId;
  }

  if (status) {
    query.status = status;
  } else {
    query.status = {
      $in: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.WAITING],
    };
    sorting = 1;
  }
  if (status && status !== ORDER_STATUS.COMPLETED) {
    sorting = 1;
  }

  if (selectedOrderId) {
    query._id = { $ne: selectedOrderId };
  }

  if (searchTerm) {
    const searchRegex = new RegExp(searchTerm, "i");
    const searchConditions = [];

    if (mongoose.Types.ObjectId.isValid(searchTerm)) {
      searchConditions.push({ _id: new mongoose.Types.ObjectId(searchTerm) });
    }

    // Search by tokenNumber if searchTerm is a valid number
    const tokenNum = Number(searchTerm);
    if (!isNaN(tokenNum)) {
      searchConditions.push({ tokenNumber: tokenNum });
    }

    // Search by item name
    const matchingItems = await ItemDetails.find(
      { itemName: { $regex: searchRegex } },
      { _id: 1 },
    ).lean();
    if (matchingItems.length > 0) {
      const matchingItemIds = matchingItems.map((item) => item._id);
      searchConditions.push({ "items.itemId": { $in: matchingItemIds } });
    }

    // Search by counter name
    const matchingCounters = await Counter.find(
      { counterName: { $regex: searchRegex }, entityId },
      { _id: 1 },
    ).lean();
    if (matchingCounters.length > 0) {
      const matchingCounterIds = matchingCounters.map((c) => c._id);
      searchConditions.push({ counterId: { $in: matchingCounterIds } });
    }

    if (searchConditions.length > 0) {
      query.$or = searchConditions;
    } else {
      // searchTerm provided but nothing matched → return no results
      query._id = null;
    }
  }

  const data = await Order.find(query)
    .populate({
      path: "items.itemId",
      select: "itemName quantity description type currency image createdAt",
      model: "ItemDetails",
    })
    .populate({
      path: "counterId",
      select: "counterName",
      model: "Counter",
    })
    .sort({ tokenNumber: sorting })
    .skip(skip)
    .limit(limit);

  if (selectedOrderId && pageNo == 1 && !status) {
    const selected = await Order.findOne({ _id: selectedOrderId, entityId })
      .populate({
        path: "items.itemId",
        select: "itemName quantity description type currency image createdAt",
        model: "ItemDetails",
      })
      .populate({
        path: "counterId",
        select: "counterName",
        model: "Counter",
      });
    if (!selected) {
      throwError({
        status: STATUS_CODES.NOT_FOUND,
        message: t("ORDER_NOT_BELONG_TO_ENTITY", lang),
      });
    }

    if (selected) {
      data.unshift(selected);
    }
  }

  const baseQuery = { ...query };
  delete baseQuery.status;
  delete baseQuery._id;

  const [orderProcessCount, readyOrders, completedOrders, cancelledOrders] =
    await Promise.all([
      Order.countDocuments({
        ...baseQuery,
        status: {
          $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS],
        },
      }),
      Order.countDocuments({ ...baseQuery, status: ORDER_STATUS.READY }),
      Order.countDocuments({ ...baseQuery, status: ORDER_STATUS.COMPLETED }),
      Order.countDocuments({ ...baseQuery, status: ORDER_STATUS.CANCELLED }),
    ]);

  return {
    data,
    orderProcessCount,
    readyOrders,
    completedOrders,
    cancelledOrders,
  };
};

const getOfflineOrders = async (req) => {
  const {
    entityId,
    query: { pageNo = 1, pageLimit = 10, counterId, status, searchTerm },
  } = req;

  const limit = Math.max(Number(pageLimit), 1);
  const skip = (Math.max(Number(pageNo), 1) - 1) * limit;

  const query = { entityId };
  let sorting = -1;
  if (counterId) {
    query.counterId = counterId;
  }

  if (status) {
    query.status = status;
    if (status !== ORDER_STATUS.COMPLETED) {
      sorting = 1;
    }
  }
  if (searchTerm) {
    const searchRegex = new RegExp(searchTerm, "i");
    const searchConditions = [];

    if (mongoose.Types.ObjectId.isValid(searchTerm)) {
      searchConditions.push({ _id: new mongoose.Types.ObjectId(searchTerm) });
    }

    const matchingItems = await ItemDetails.find(
      { itemName: { $regex: searchRegex } },
      { _id: 1 },
    ).lean();

    if (matchingItems.length > 0) {
      const matchingItemIds = matchingItems.map((item) => item._id);
      searchConditions.push({ "items.itemId": { $in: matchingItemIds } });
    }

    if (searchConditions.length > 0) {
      query.$or = searchConditions;
    }
  }

  const data = await OfflineOrders.find(query)
    .populate({
      path: "items.itemId",
      select: "itemName quantity description type currency image createdAt",
      model: "ItemDetails",
    })
    .populate({
      path: "counterId",
      select: "counterName",
      model: "Counter",
    })
    .sort({ createdAt: sorting })
    .skip(skip)
    .limit(limit);

  const baseQuery = { ...query };

  const [preparing, readyOrders, completedOrders] = await Promise.all([
    OfflineOrders.countDocuments({
      ...baseQuery,
      status: ORDER_STATUS.IN_PROGRESS,
    }),
    OfflineOrders.countDocuments({
      ...baseQuery,
      status: ORDER_STATUS.READY,
    }),
    OfflineOrders.countDocuments({
      ...baseQuery,
      status: ORDER_STATUS.COMPLETED,
    }),
  ]);

  return {
    data,
    preparing,
    readyOrders,
    completedOrders,
  };
};

const updateOfflineOrders = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    entityId,
    body: { orderId, status },
  } = req;

  if (
    ![
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.READY,
      ORDER_STATUS.IN_PROGRESS,
    ].includes(status)
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_STATUS_INVALID", lang),
    });
  }

  const order = await OfflineOrders.findOne({ _id: orderId });

  if (!order) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_NOT_FOUND_FOR_ENTITY", lang),
    });
  }

  const updatedOrder = await OfflineOrders.findOneAndUpdate(
    { _id: orderId },
    { $set: { status } },
    { new: true },
  ).populate("userId");

  // Emit socket event for offline order status update
  io.to(entityId.toString()).emit("orderStatusUpdate", {
    orderId: orderId,
    status,
    isOffline: true,
  });

  // Send Firebase notification to owner app for offline order status update
  sendFirebaseNotification({
    topic: `owner_entity_${entityId}`,
    showNotification: false,
    title: "Order Status Updated",
    body: `Offline order status is now ${status}.`,
    data: {
      action: "order_status_update",
      screen: "order_screen",
      orderId: orderId.toString(),
      status: status,
      isOffline: "true",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${entityId}`,
    },
  });

  // The offline order's `userId` is the owner/staff who placed the order, not
  // the customer. The customer is linked via `countrTag`. Resolve to the
  // customer User so the notification reaches the right FCM topic.
  const customer = updatedOrder?.countrTag
    ? await User.findOne({ countrTag: updatedOrder.countrTag }, { _id: 1 }).lean()
    : null;
  const customerId = customer?._id?.toString();

  if (customerId) {
    const orderInternalNumber = updatedOrder?.internalNumber || "";
    const orderRef = orderInternalNumber ? `#${orderInternalNumber}` : "";
    sendFirebaseNotification({
      topic: `user_${customerId}`,
      showNotification: true,
      alertSound: true,
      title: "Offline Order Status Updated",
      body: orderRef
        ? `Order ${orderRef} status is ${status}`
        : `Order Status is ${status}`,
      data: {
        orderId: orderId.toString(),
        internalNumber: orderInternalNumber.toString(),
        status: status,
        action: "order_status_update",
        screen: "status",
        isOffline: "true",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `user_${customerId}`,
      },
    });
  } else {
    console.warn(
      `[OfflineOrder] No customer found for countrTag=${updatedOrder?.countrTag} — skipping customer notification`,
    );
  }
};

const getLiveOrdersUsers = async (req) => {
  const {
    userId,
    query: { searchTerm },
  } = req;

  const paymentProcessingCutoff = new Date(
    Date.now() - PAYMENT_PROCESSING_TTL_MS
  );

  let searchConditions = [];
  if (searchTerm && searchTerm.trim() !== "") {
    searchConditions = [
      {
        entityId: {
          $in: await EntityDetails.find({
            entityName: { $regex: searchTerm, $options: "i" },
          }).distinct("_id"),
        },
      },
      {
        "items.itemId": {
          $in: await ItemDetails.find({
            itemName: { $regex: searchTerm, $options: "i" },
          }).distinct("_id"),
        },
      },
    ];
  }

  const liveOrders = await Order.find({
    userId,
    $or: [
      // Show PAYMENT_PROCESSING only if created within last 15 min
      {
        status: ORDER_STATUS.PAYMENT_PROCESSING,
        createdAt: { $gte: paymentProcessingCutoff },
      },
      // Show PAYMENT_FAILED only if updated within last 15 min
      {
        status: ORDER_STATUS.PAYMENT_FAILED,
        updatedAt: { $gte: paymentProcessingCutoff },
      },
      // Always show active order statuses
      {
        status: {
          $in: [
            ORDER_STATUS.WAITING,
            ORDER_STATUS.IN_PROGRESS,
            ORDER_STATUS.READY,
          ],
        },
      },
    ],
    ...(searchConditions.length > 0
      ? {
          $and: [
            { $or: searchConditions },
          ],
        }
      : {}),
  })
    .populate({
      path: "items.itemId",
      select: "currency itemId itemName quantity isVegan price",
    })
    .populate({
      path: "entityId",
      select: "entityName city image state country",
      model: "EntityDetails",
    })
    .sort({ updatedAt: -1 });

  const updatedLiveOrders = liveOrders.map((order) => {
    if (order.entityId && order.entityId.image) {
      return {
        ...order.toObject(),
        finalAmount: order.finalAmount,
        entityId: {
          ...order.entityId.toObject(),
          image: order.entityId.image.includes("X-Amz-Signature")
            ? order.entityId.image
            : generatePresignedUrl(order.entityId.image),
        },
      };
    }
    return order;
  });

  return updatedLiveOrders;
};

const particularOrderDetails = async (req) => {
  const {
    query: { entityId },
    userId,
  } = req;

  const orderDetails = await Order.find({
    userId,
    status: {
      $in: [
        ORDER_STATUS.PAYMENT_PROCESSING,
        ORDER_STATUS.WAITING,
        ORDER_STATUS.IN_PROGRESS,
      ],
    },
    entityId,
  })
    .populate({
      path: "items.itemId",
      select: "currency itemId itemName quantity type image",
      populate: {
        path: "items.itemId.itemId",
        select: "itemName quantity description type image",
      },
    })
    .sort({ tokenNumber: -1 })
    .lean();

  for (const order of orderDetails) {
    for (const item of order.items) {
      const itemDetail = await ItemDetails.findOne({ _id: item.itemId._id })
        .select("price")
        .lean();

      const itemPrice = itemDetail ? itemDetail.price : 0;
      item.totalPrice = itemPrice * (item.quantity || 1);
    }
    order.finalAmount = order.finalAmount;
  }

  return orderDetails;
};

const particularOrderDetailsCustomer = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    userId,
    query: { orderId },
  } = req;

  const orderDetails = await Order.findOne(
    {
      userId,
      status: {
        $in: [
          ORDER_STATUS.PAYMENT_PROCESSING,
          ORDER_STATUS.PAYMENT_FAILED,
          ORDER_STATUS.WAITING,
          ORDER_STATUS.IN_PROGRESS,
          ORDER_STATUS.READY,
          ORDER_STATUS.COMPLETED,
          ORDER_STATUS.CANCELLED,
        ],
      },
      _id: orderId,
    },
    {
      _id: 1,
      tableNo: 1,
      status: 1,
      items: 1,
      tokenNumber: 1,
      totalAmount: 1,
      isSelfPickup: 1,
      createdAt: 1,
      updatedAt: 1,
      entityId: 1,
      note: 1,
      finalAmount: 1,
      discountAmount: 1,
      platformFees: 1,
    },
  )
    .populate({
      path: "items.itemId",
      select: "currency itemId itemName quantity isVegan price",
      model: "ItemDetails",
    })
    .populate({
      path: "entityId",
      select: "entityName city image",
      model: "EntityDetails",
    })
    .sort({ tokenNumber: -1 })
    .lean();

  if (!orderDetails) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("ORDER_NOT_FOUND", lang),
    });
  }
  if (orderDetails.entityId && orderDetails.entityId.image) {
    orderDetails.entityId.image = generatePresignedUrl(
      orderDetails.entityId.image,
    );
    orderDetails.finalAmount = orderDetails.finalAmount;
  }
  return orderDetails;
};

const getRestaurantOrdersAndCount = async (req) => {
  const {
    userId,
    query: { year, searchTerm },
  } = req;

  const orders = await Order.find(
    {
      userId,
      createdAt: {
        $gte: new Date(`${year}-01-01T00:00:00.000Z`),
        $lt: new Date(`${year}-12-31T23:59:59.999Z`),
      },
    },
    { entityId: 1 },
  );

  if (orders.length === 0) return [];

  const entityOrderCount = orders.reduce((acc, order) => {
    acc[order.entityId] = (acc[order.entityId] || 0) + 1;
    return acc;
  }, {});

  const entityIds = Object.keys(entityOrderCount);

  const searchQuery = {
    _id: { $in: entityIds },
  };
  if (searchTerm) {
    searchQuery.entityName = { $regex: searchTerm, $options: "i" }; // Case-insensitive search
  }

  const entities = await EntityDetails.find(searchQuery, {
    entityType: 1,
    entityName: 1,
    city: 1,
    state: 1,
    country: 1,
    image: 1,
  }).lean();

  return entities.map((entity) => ({
    entityName: entity.entityName,
    city: entity.city,
    entityId: entity._id,
    state: entity.state,
    country: entity.country,
    image: entity.image ? generatePresignedUrl(entity.image) : "",
    orderCount: entityOrderCount[entity._id],
  }));
};

const getOrderGroupByYears = async (req) => {
  const {
    userId,
    query: { entityId },
  } = req;

  const entityIds = (
    await Order.find({ userId, entityId }, { entityId: 1 }).lean()
  ).map((doc) => doc.entityId);

  let orderFilter = { userId };
  if (entityId) {
    orderFilter.entityId = entityId;
  }

  let allOrders = await Order.find(orderFilter, {
    items: 1,
    tokenNumber: 1,
    updatedAt: 1,
    entityId: 1,
  })
    .populate({
      path: "items.itemId",
      select: "itemName description",
      model: "ItemDetails",
    })
    .lean();

  const entities = await EntityDetails.find(
    { _id: { $in: entityIds } },
    { entityName: 1, entityType: 1 },
  ).lean();

  const entityMapper = {};
  entities.forEach((doc) => {
    entityMapper[`${doc._id}`] = doc;
  });

  allOrders = allOrders.map((doc) => {
    return {
      ...doc,
      year: new Date(doc.updatedAt).getFullYear(),
    };
  });

  const orderMapper = {};
  allOrders.forEach((doc) => {
    if (!orderMapper[doc.year]) {
      orderMapper[doc.year] = {};
    }
    if (!orderMapper[doc.year][doc.entityId]) {
      orderMapper[doc.year][doc.entityId] = {
        entityDetails: entityMapper[doc.entityId],
        orders: [],
      };
    }
    orderMapper[doc.year][doc.entityId].orders.push(doc);
  });

  return orderMapper;
};

const getOrderGroupByMonths = async (req) => {
  const {
    userId,
    query: { year, entityId },
  } = req;

  const entityIds = await Order.distinct("entityId", { userId });

  const entities = await EntityDetails.find(
    { _id: { $in: entityIds } },
    { entityName: 1, entityType: 1 },
  ).lean();

  const entityMapper = Object.fromEntries(
    entities.map((doc) => [doc._id.toString(), doc]),
  );

  const ordersByMonthAndEntity = await Order.aggregate([
    {
      $match: {
        userId: ObjectId(userId),
        entityId: ObjectId(entityId),
        createdAt: {
          $gte: new Date(`${year}-01-01T00:00:00.000Z`),
          $lt: new Date(`${year}-12-31T23:59:59.999Z`),
        },
      },
    },
    { $addFields: { month: { $month: "$createdAt" } } },
    {
      $lookup: {
        from: "itemdetails",
        localField: "items.itemId",
        foreignField: "_id",
        as: "itemDetails",
      },
    },
    {
      $addFields: {
        items: {
          $map: {
            input: "$items",
            as: "item",
            in: {
              itemId: {
                _id: "$$item.itemId",
                itemName: {
                  $arrayElemAt: [
                    "$itemDetails.itemName",
                    { $indexOfArray: ["$itemDetails._id", "$$item.itemId"] },
                  ],
                },
              },
              quantity: "$$item.quantity",
            },
          },
        },
      },
    },
    {
      $group: {
        _id: { month: "$month", entityId: "$entityId" },
        orders: {
          $push: {
            _id: "$_id",
            status: "$status",
            tokenNumber: "$tokenNumber",
            items: "$items",
            totalAmount: "$totalAmount",
            createdAt: "$createdAt",
            finalAmount: "$finalAmount",
          },
        },
      },
    },
    {
      $group: {
        _id: "$_id.month",
        entities: { $push: { entityId: "$_id.entityId", orders: "$orders" } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  ordersByMonthAndEntity.forEach((doc) => {
    doc.entities.forEach((entity) => {
      entity.entityDetails = entityMapper[entity.entityId];
      delete entity.entityId;
    });
  });

  return ordersByMonthAndEntity;
};

const getOrderGroupByYearsForEntity = async (req) => {
  let { entityId } = req;
  if (req.query.entityId) {
    entityId = req.body.entityId;
  }
  const menuItemsIds = [];
  const entityIds = [];
  let allOrders = await Order.find(
    { entityId },
    { items: 1, tokenNumber: 1, updatedAt: 1, status: 1 },
  ).lean();
  allOrders.forEach((doc) => {
    doc.items.forEach((item) => {
      menuItemsIds.push(item.itemId);
    });
  });
  const allItemDetails = await ItemDetails.find({ _id: menuItemsIds })
    .populate({
      path: "itemId",
    })
    .lean();
  const itemDetailsMapper = {};
  allItemDetails.forEach((doc) => {
    itemDetailsMapper[`${doc._id}`] = {
      price: doc.price,
      currency: doc.currency,
      itemName: doc.itemId.itemName,
      image: doc.itemId.image,
      type: doc.itemId.type,
      description: doc.itemId.description,
      quantityLable: doc.itemId.quantity,
    };
  });
  allOrders = allOrders.map((doc) => {
    const data = { ...doc };
    data.items = doc.items.map((item) => {
      return { quantity: item.quantity, ...itemDetailsMapper[item.itemId] };
    });
    data.year = new Date(doc.updatedAt).getFullYear();
    return data;
  });

  const mapper = {};
  allOrders.forEach((doc) => {
    if (!mapper[doc.year]) {
      mapper[doc.year] = { orders: [] };
    }
    mapper[doc.year].orders.push(doc);
  });
  return mapper;
};

const pastTicketYears = async (req) => {
  const { userId } = req;
  const orderList = await Order.find(
    { userId },
    { createdAt: 1 },
    { sort: { _id: -1 } },
  );
  const yearList = [];
  orderList.map((orders) => {
    const year = orders.createdAt.getFullYear();
    if (!yearList.includes(year)) {
      yearList.push(year);
    }
  });
  return yearList;
};

const cancelOrder = async (req) => {
  const lang = getLanguageFromRequest(req);
  const { orderId } = req.body;

  const order = await Order.findOne({
    _id: orderId,
    status: {
      $in: [

        ORDER_STATUS.WAITING,
        ORDER_STATUS.IN_PROGRESS,
      ],
    },
  }).populate({
    path: "entityId",
    select: "userId fcmToken",
    model: "EntityDetails",
  });

  if (!order) {
    throwError({
      status: STATUS_CODES.NOT_ACCEPTABLE,
      message: t("ORDER_NOT_FOUND", lang),
    });
  }

  if (
    [
      ORDER_STATUS.READY,
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCELLED,
    ].includes(order.status)
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_CANNOT_CANCEL", lang),
    });
  }

  await Order.updateOne(
    { _id: orderId },
    { $set: { status: ORDER_STATUS.CANCELLED } },
  );
  console.log({ id: order.entityId });

  // Only notify owner if the order was visible to them (not PAYMENT_PROCESSING)
  if (order.status !== ORDER_STATUS.PAYMENT_PROCESSING) {
    io.to(order.entityId._id.toString()).emit("cancelOrder", {
      orderId: order._id,
      status: ORDER_STATUS.CANCELLED,
    });

    // Notify owner (restaurant) via Firebase topic so FE can refetch orders
    sendFirebaseNotification({
      topic: `owner_entity_${order.entityId._id}`,
      showNotification: true,
      title: "Order Cancelled",
      body: `A customer has cancelled order #${order.tokenNumber || order._id}.`,
      data: {
        orderId: `${order._id}`,
        status: ORDER_STATUS.CANCELLED,
        action: "order_cancelled",
        screen: "landing_home",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    });

    // Notify customer who cancelled via Firebase topic so their FE can refetch
    // sendFirebaseNotification({
    //   topic: `user_${order.userId}`,
    //   showNotification: false,
    //   title: "Order Cancelled",
    //   body: "Your order has been cancelled.",
    //   data: {
    //     orderId: `${order._id}`,
    //     status: ORDER_STATUS.CANCELLED,
    //     action: "order_cancelled",
    //     screen: "landing_home",
    //     click_action: "FLUTTER_NOTIFICATION_CLICK",
    //   },
    // });

    const tokens = Array.isArray(order.entityId.userId.fcmToken)
      ? order.entityId.userId.fcmToken.filter(Boolean)
      : [];

    const payload = {
      notification: {
        title: "Order Cancelled.",
        body: `Order Cancelled. Tap to view details.`,
      },
      data: {
        orderId: `${order._id}`,
        data: JSON.stringify(order),
        action: "order_cancelled",
        screen: "landing_home",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      android: {
        priority: "high",
        notification: {
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            content_available: true,
            category: "FLUTTER_NOTIFICATION_CLICK",
            mutableContent: 1,
            alert: {
              title: "Order Cancelled.",
              body: `Order cancelled. Tap to view details.`,
            },
          },
        },
      },
    };

    try {
      if (tokens.length > 0) {
        const response = await messagingPlus.sendEachForMulticast({
          tokens,
          ...payload,
        });

        console.info("Notification Pushed");

        // Remove invalid tokens
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
          }
        });

        if (failedTokens.length) {
          await User.updateOne(
            { _id: order.entityId.userId._id },
            { $pull: { fcmToken: { $in: failedTokens } } },
          );
        }
      }
    } catch (err) {
      console.error("Push Notification Error:", err.message);
    }
  }
};

// const getEventOrderSummary = async (req) => {
//   const { eventId, counterId } = req.query;

//   const query = { eventId };
//   if (counterId) {
//     query.counterId = counterId;
//   }

//   const orders = await Order.find(query)
//     .populate({
//       path: "counterId",
//       select: "counterName status isTableService isSelfPickUp",
//       model: "Counter",
//     })
//     .populate({
//       path: "items.itemId",
//       select: "itemName price",
//       model: "ItemDetails",
//     })
//     .lean();

//   const counterSummary = {};
//   let totalOrders = 0;
//   let totalAmount = 0;

//   const orderDetails = orders
//     .filter((order) => order.counterId?.status === STATUS.ACTIVE)
//     .map((order) => {
//       const {
//         counterId,
//         totalAmount: orderTotalAmount,
//         finalAmount,
//         tokenNumber,
//         items,
//         tableNo,
//         status,
//         isSelfPickup,
//         createdAt,
//       } = order;

//       if (!counterId) return null;

//       const counterKey = counterId._id.toString();
//       const counterName = counterId.counterName;
//       const counterTableService = counterId.isTableService;
//       const counterSelfPickup = counterId.isSelfPickUp;

//       if (!counterSummary[counterKey]) {
//         counterSummary[counterKey] = {
//           counterName,
//           totalOrders: 0,
//           totalAmount: 0,
//         };
//       }

//       if (orders.status !== ORDER_STATUS.CANCELLED) {
//         counterSummary[counterKey].totalOrders += 1;
//         counterSummary[counterKey].totalAmount += orderTotalAmount;

//         totalOrders += 1;
//         totalAmount += orderTotalAmount;
//       }

//       return {
//         orderId: order._id,
//         tokenNumber,
//         totalAmount: orderTotalAmount,
//         counterId: counterKey,
//         counterName,
//         tableNo,
//         status,
//         isSelfPickUp: counterSelfPickup,
//         isTableService: counterTableService,
//         isSelfPickup,
//         currency: "CHF",
//         createdAt,
//         items: items.map((item) => ({
//           itemId: item.itemId?._id,
//           itemName: item.itemId?.itemName,
//           price: item.itemId?.price,
//           quantity: item.quantity,
//           totalPrice: item.quantity * item.itemId?.price,
//         })),
//       };
//     })
//     .filter(Boolean);

//   const counters = Object.entries(counterSummary).map(([counterId, data]) => ({
//     counterId,
//     counterName: data.counterName,
//     totalOrders: data.totalOrders,
//     totalAmount: data.totalAmount,
//   }));

//   const result = {
//     eventId,
//     totalOrders,
//     totalAmount,
//     counters,
//     orders: counterId ? orderDetails : [],
//   };

//   return result;
// };

const getEventOrderSummary = async (req) => {
  const { eventId, counterId } = req.query;

  const query = { eventId };
  if (counterId) query.counterId = counterId;

  const orders = await Order.find(query)
    .populate({
      path: "counterId",
      select: "counterName status isTableService isSelfPickUp",
      model: "Counter",
    })
    .populate({
      path: "items.itemId",
      select: "itemName price",
      model: "ItemDetails",
    })
    .lean();

  const counterSummary = {};
  let totalOrders = 0;
  let totalAmount = 0;

  const orderDetails = orders
    .filter((order) => order.counterId?.status === STATUS.ACTIVE)
    .map((order) => {
      const {
        counterId,
        totalAmount: orderTotalAmount,
        tokenNumber,
        items,
        tableNo,
        status,
        isSelfPickup,
        createdAt,
      } = order;

      if (!counterId) return null;

      const counterKey = counterId._id.toString();
      const counterName = counterId.counterName;
      const counterTableService = counterId.isTableService;
      const counterSelfPickup = counterId.isSelfPickUp;

      if (!counterSummary[counterKey]) {
        counterSummary[counterKey] = {
          counterName,
          totalOrders: 0,
          totalAmount: 0,
        };
      }

      if (
        ![
          ORDER_STATUS.CANCELLED,
          ORDER_STATUS.WAITING,
          ORDER_STATUS.PAYMENT_PROCESSING,
          ORDER_STATUS.PAYMENT_FAILED,
        ].includes(status)
      ) {
        counterSummary[counterKey].totalOrders += 1;
        counterSummary[counterKey].totalAmount += orderTotalAmount;

        totalOrders += 1;
        totalAmount += orderTotalAmount;
      }

      return {
        orderId: order._id,
        tokenNumber,
        totalAmount: orderTotalAmount,
        counterId: counterKey,
        counterName,
        tableNo,
        status,
        isSelfPickUp: counterSelfPickup,
        isTableService: counterTableService,
        isSelfPickup,
        currency: "CHF",
        createdAt,
        items: items.map((item) => ({
          itemId: item.itemId?._id,
          itemName: item.itemId?.itemName,
          price: item.itemId?.price,
          quantity: item.quantity,
          totalPrice: item.quantity * item.itemId?.price,
        })),
      };
    })
    .filter(Boolean);

  // ✅ UTC based date formatters
  const getDateHourKey = (date) => {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1)
      .toString()
      .padStart(2, "0")}-${d.getUTCDate().toString().padStart(2, "0")} ${d
      .getUTCHours()
      .toString()
      .padStart(2, "0")}:00`;
  };

  const getDateKey = (date) => {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1)
      .toString()
      .padStart(2, "0")}-${d.getUTCDate().toString().padStart(2, "0")}`;
  };

  const overallHourly = {};
  const overallDaily = {};
  const overallDailySummary = {};

  const perCounterHourly = {};
  const perCounterDaily = {};
  const perCounterDailySummary = {};

  orderDetails
    .filter(
      (order) =>
        ![
          ORDER_STATUS.CANCELLED,
          ORDER_STATUS.WAITING,
          ORDER_STATUS.PAYMENT_PROCESSING,
          ORDER_STATUS.PAYMENT_FAILED,
        ].includes(order.status),
    )
    .forEach((order) => {
      const orderHour = getDateHourKey(order.createdAt);
      const orderDay = getDateKey(order.createdAt);

      overallHourly[orderHour] = (overallHourly[orderHour] || 0) + 1;
      overallDaily[orderDay] = (overallDaily[orderDay] || 0) + 1;

      if (!overallDailySummary[orderDay]) {
        overallDailySummary[orderDay] = { totalOrders: 0, totalAmount: 0 };
      }
      overallDailySummary[orderDay].totalOrders += 1;
      overallDailySummary[orderDay].totalAmount += order.totalAmount;

      perCounterHourly[order.counterId] =
        perCounterHourly[order.counterId] || {};
      perCounterDaily[order.counterId] = perCounterDaily[order.counterId] || {};
      perCounterDailySummary[order.counterId] =
        perCounterDailySummary[order.counterId] || {};

      perCounterHourly[order.counterId][orderHour] =
        (perCounterHourly[order.counterId][orderHour] || 0) + 1;
      perCounterDaily[order.counterId][orderDay] =
        (perCounterDaily[order.counterId][orderDay] || 0) + 1;

      if (!perCounterDailySummary[order.counterId][orderDay]) {
        perCounterDailySummary[order.counterId][orderDay] = {
          totalOrders: 0,
          totalAmount: 0,
        };
      }
      perCounterDailySummary[order.counterId][orderDay].totalOrders += 1;
      perCounterDailySummary[order.counterId][orderDay].totalAmount +=
        order.totalAmount;
    });

  const counters = Object.entries(counterSummary).map(([counterId, data]) => ({
    counterId,
    counterName: data.counterName,
    totalOrders: data.totalOrders,
    totalAmount: data.totalAmount,
    graphData: {
      hourly: perCounterHourly[counterId] || {},
      daily: perCounterDaily[counterId] || {},
    },
    dailySummary: perCounterDailySummary[counterId] || {},
  }));

  const result = {
    eventId,
    totalOrders,
    totalAmount,
    graphData: {
      hourly: overallHourly,
      daily: overallDaily,
    },
    dailySummary: overallDailySummary,
    counters,
    orders: orderDetails,
  };

  if (counterId) {
    result.orders = orderDetails.filter((o) => o.counterId === counterId);
    result.graphData.hourly = perCounterHourly[counterId] || {};
    result.graphData.daily = perCounterDaily[counterId] || {};
    result.dailySummary = perCounterDailySummary[counterId] || {};
    result.counters = counters.filter((c) => c.counterId === counterId);
  }

  return result;
};

module.exports = {
  createOrder,
  updateStatusOfOrder,
  getEntityOrders,
  getOrderGroupByYears,
  getLiveOrdersUsers,
  particularOrderDetails,
  getOrderGroupByYearsForEntity,
  pastTicketYears,
  cancelOrder,
  getOrderGroupByMonths,
  getRestaurantOrdersAndCount,
  particularOrderDetailsCustomer,
  getEventOrderSummary,
  createOfflineOrder,
  getOfflineOrders,
  updateOfflineOrders,
};
