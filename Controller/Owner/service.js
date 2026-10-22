const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Event = require("../../Models/Event");
const InsiderElement = require("../../Models/MenuCategory");
const MenuItem = require("../../Models/MenuItem");
const crypto = require("crypto");
const {
  STATUS_CODES,
  INSIDER_TYPE,
  EDIT_ACTION,
  STATUS,
  ORDER_STATUS,
} = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");

const Counter = require("../../Models/Counter");
const MenuCategory = require("../../Models/MenuCategory");
const ItemDetails = require("../../Models/ItemDetails");
const {
  uploadBufferToS3,
  generatePresignedUrl,
  downloadBufferFromS3,
} = require("../aws-service");
const {
  shiftArrayRight,
  comparePassword,
  sendFirebaseNotification,
} = require("../../Utils/commonFunction");
const Order = require("../../Models/Order");
const Discount = require("../../Models/Discount");
const EntityDetails = require("../../Models/EntityDetails");
const User = require("../../Models/User");
const Tables = require("../../Models/Tables");
const Feedbacks = require("../../Models/UserFeedback");
const FeedbackQuestions = require("../../Models/FeedbackQuestions");
const globalConstants = require("../../Utils/globalConstants");
const { emitOrderUpdated } = require("../../CustomerServices/orderingService");
const ItemSearchLogs = require("../../Models/ItemSearchLogs");
const Otp = require("../../Models/Otp");
const { createMail, sendSMS } = require("../../Utils/mailer");
// const { path } = require("pdfkit");
const path = require("path");
const { io } = require("../../app");
const { messaging } = require("firebase-admin");
const { messagingPlus } = require("../../firebaseAdmin");
const SalesReport = require("../../Models/SalesReport");
const { t, getLanguageFromRequest } = require("../../Utils/translator");

const ALL_ANSWER_TYPES = globalConstants.ALL_ANSWER_TYPES;
const APP_FEEDBACK_QUESTIONS = globalConstants.APP_FEEDBACK_QUESTIONS;
const OWNER_APP_FEEDBACK_QUESTIONS =
  globalConstants.OWNER_APP_FEEDBACK_QUESTIONS;
const ANSWER_TYPES = globalConstants.ANSWER_TYPES;
const OwnerAppFeedback = require("../../Models/OwnerAppFeedback");
const OfflineOrder = require("../../Models/OfflineOrder");
const notificationSettings = require("../../Models/notificationSettings");
const Cards = require("../../Models/Cards");
const Location = require("../../Models/Location");
const FavouriteEntity = require("../../Models/FavouriteEntity");
const FavouriteItem = require("../../Models/FavouriteItem");
const CountRTags = require("../../Models/CountRTags");
const CustomerOrderReport = require("../../Models/CustomerOrderReport");
const UserAppFeedback = require("../../Models/UserAppFeedback");
const FeedbackAppQuestion = require("../../Models/FeedbackAppQuestion");
const searchLogs = require("../../Models/searchLogs");
const StripePayment = require("../../Models/Stripe");
const redisClient = require("../../redis");
const { KEY_TYPE_PREFIXES } = require("../../Utils/globalConstants");

module.exports.createCounter = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    counterName,
    isTableService,
    isSelfPickUp,
    tableFrom,
    tableTo,
    tableSectionName,
  } = req.body;

  if (!counterName) {
    throw {
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_COUNTER_NAME_REQUIRED", lang),
    };
  }

  const existingCounter = await Counter.findOne(
    {
      counterName,
      ownerId: req.userId,
      entityId: req.entityId,
      status: STATUS.ACTIVE,
    },
    { _id: 1 }
  );

  if (existingCounter) {
    throw {
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_COUNTER_NAME_EXISTS", lang),
    };
  }

  if (Number(tableFrom) >= Number(tableTo)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_TABLE_RANGE_INVALID", lang),
    });
  }

  const tableNumbers = Array.from(
    { length: Number(tableTo) - Number(tableFrom) + 1 },
    (_, i) => String(Number(tableFrom) + i)
  );

  // A new counter starts with the opening hours of the first counter.
  const firstCounter = await Counter.findOne(
    { entityId: req.entityId, status: STATUS.ACTIVE },
    { openingHours: 1, prepTimeMinutes: 1 }
  )
    .sort({ createdAt: 1 })
    .lean();

  const newCounter = await Counter.create({
    counterName,
    ownerId: req.userId,
    entityId: req.entityId,
    isTableService,
    isSelfPickUp,
    status: STATUS.ACTIVE,
    tableCount: tableNumbers,
    tableSectionName,
    ...(firstCounter?.openingHours?.length
      ? {
          openingHours: firstCounter.openingHours.map((day) => ({
            day: day.day,
            enabled: day.enabled,
            blocks: (day.blocks || []).map(({ _id, ...block }) => block),
          })),
          prepTimeMinutes: firstCounter.prepTimeMinutes,
        }
      : {}),
  });

  const categoryList = await MenuCategory.find({
    entityId: req.entityId,
  }).select("categoryName nutritionType sortIndex");

  const uniqueCategoriesMap = new Map();

  // Use a Map to ensure uniqueness based on categoryName
  for (const item of categoryList) {
    if (!uniqueCategoriesMap.has(item.categoryName)) {
      uniqueCategoriesMap.set(item.categoryName, item);
    }
  }

  // Now iterate and create new categories
  for (const [categoryName, category] of uniqueCategoriesMap.entries()) {
    await MenuCategory.create({
      counterId: newCounter._id,
      entityId: req.entityId,
      categoryName,
      nutritionType: category.nutritionType,
      sortIndex: category.sortIndex || 0,
    });
  }

  io.to(newCounter.entityId.toString()).emit("newCounter", newCounter);

  // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
  io.to(`entity_${newCounter.entityId}`).emit("counterUpdate", {
    action: "create",
    counter: newCounter,
    entityId: newCounter.entityId.toString(),
  });

  if (isTableService) {
    const lastTable = await Tables.findOne(
      { entityId: req.entityId },
      { tableSetionNo: 1 }
    ).sort({ createdAt: -1 });

    const newTableSectionNo = lastTable ? lastTable.tableSetionNo + 1 : 1;

    await Tables.create({
      tableCount: tableNumbers,
      tableSectionName,
      userId: req.userId,
      entityId: req.entityId,
      counterIds: [newCounter._id],
      tableSetionNo: newTableSectionNo,
      status: STATUS.ACTIVE,
    });
  }

  // const owner = await User.findOne(
  //   {
  //     _id: newCounter.ownerId,
  //     fcmToken: { $exists: true, $not: { $size: 0 } },
  //   },
  //   { fcmToken: 1 }
  // );

  sendFirebaseNotification({
    topic: `owner_entity_${newCounter.entityId}`,
    showNotification: false,
    title: "New Counter Added",
    body: "You have a new counter added. Tap to view.",
    data: {
      action: "counter_update",
      screen: "landing_home",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${newCounter.entityId}`,
    },
  });

  // Send same notification to entity_ topic for customer app
  sendFirebaseNotification({
    topic: `entity_${newCounter.entityId}`,
    showNotification: false,
    title: "New Counter Added",
    body: "You have a new counter added. Tap to view.",
    data: {
      action: "counter_update",
      screen: "landing_home",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `entity_${newCounter.entityId}`,
    },
  });
  // if (!owner?.fcmToken?.length) return newCounter.toObject();

  // const notificationPayload = (token) => ({
  //   notification: {
  //     title: "New Counter Created",
  //     body: `Counter "${counterName}" is now available.`,
  //   },
  //   data: {
  //     screen: "counter",
  //     entityId: req.entityId.toString(),
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
  //         alert: {
  //           title: "New Counter Created",
  //           body: `Counter "${counterName}" is now available.`,
  //         },
  //         category: "FLUTTER_NOTIFICATION_CLICK",
  //         mutableContent: 1,
  //       },
  //     },
  //   },
  // });

  // for (const token of owner.fcmToken) {
  //   try {
  //     await messagingPlus.send(notificationPayload(token));
  //     console.log(`Notification sent to token: ${token}`);
  //   } catch (err) {
  //     console.error("FCM push failed for token:", token, err.message);

  //     // Optional: Remove invalid tokens
  //     if (
  //       err.code === "messaging/invalid-argument" ||
  //       err.code === "messaging/registration-token-not-registered" ||
  //       err.code === "messaging/invalid-recipient"
  //     ) {
  //       await User.updateOne(
  //         { _id: newCounter.ownerId },
  //         { $pull: { fcmToken: token } }
  //       );
  //     }
  //   }
  // }

  return newCounter.toObject();
};

module.exports.createCounterMenuCategory = async (req) => {
  const lang = getLanguageFromRequest(req);
  const {
    entityId,
    body: { categories },
  } = req;

  if (!Array.isArray(categories) || categories.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_CATEGORIES_REQUIRED", lang),
    });
  }

  const counters = await Counter.find({
    entityId: req.entityId,
    status: { $ne: STATUS.DELETED },
  }).select("_id");
  const counterIds = counters.map((counter) => counter._id.toString());

  for (const category of categories) {
    const { categoryName } = category;
    if (
      !categoryName ||
      !Array.isArray(counterIds) ||
      counterIds.length === 0
    ) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_COUNTERS_REQUIRED", lang),
      });
    }

    const existingCategory = await MenuCategory.findOne({
      entityId,
      categoryName,
    });

    if (existingCategory) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_CATEGORY_ALREADY_EXISTS_FOR_COUNTER", lang, {
          categoryName,
        }),
      });
    }
  }

  // New categories go to the end of the menu order.
  const lastCategory = await MenuCategory.findOne(
    { entityId },
    { sortIndex: 1 }
  )
    .sort({ sortIndex: -1 })
    .lean();
  const firstSortIndex = (lastCategory?.sortIndex || 0) + 1;

  const categoryObjects = categories.flatMap(
    ({ categoryName, nutritionType }, index) =>
      counterIds.map((counterId) => ({
        categoryName,
        nutritionType,
        counterId,
        entityId,
        sortIndex: firstSortIndex + index,
      }))
  );

  // const

  const createdCategories = await MenuCategory.insertMany(categoryObjects);

  io.to(createdCategories[0].entityId.toString()).emit(
    "newCategory",
    createdCategories
  );

  // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
  io.to(`entity_${createdCategories[0].entityId}`).emit("categoryUpdate", {
    action: "create",
    categories: createdCategories,
    entityId: createdCategories[0].entityId.toString(),
  });

  sendFirebaseNotification({
    topic: `owner_entity_${createdCategories[0].entityId}`,
    showNotification: false,
    title: "New Category Added",
    body: "You have a new category added. Tap to view.",
    data: {
      action: "category_update",
      screen: "category_screen",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${createdCategories[0].entityId}`,
    },
  });

  // Send same notification to entity_ topic for customer app
  sendFirebaseNotification({
    topic: `entity_${createdCategories[0].entityId}`,
    showNotification: false,
    title: "New Category Added",
    body: "You have a new category added. Tap to view.",
    data: {
      action: "category_update",
      screen: "category_screen",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `entity_${createdCategories[0].entityId}`,
    },
  });

  return createdCategories;
};

module.exports.getCounters = async (req) => {
  const {
    userId,
    entityId,
    query: { isItemRequired = "false", isSettings = "false" },
  } = req;

  const query = { ownerId: userId, entityId };

  if (isSettings === "true") {
    query.$or = [{ status: STATUS.ACTIVE }, { status: STATUS.INACTIVE }];
  } else {
    query.status = STATUS.ACTIVE;
  }

  const fetchCounters = await Counter.find(query, {
    counterName: 1,
    isSelfPickUp: 1,
    isTableService: 1,
    tableCount: 1,
    status: 1,
    tableSectionName: 1,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (isItemRequired !== "true") {
    return fetchCounters;
  }

  // Map of counterId -> []
  const counterIds = fetchCounters.map((counter) => counter._id);

  const items = await ItemDetails.find(
    {
      entityId,
      counterId: { $in: counterIds },
    },
    { itemName: 1, inStock: 1, counterId: 1 }
  ).lean();

  // Build mapping of counterId to its items
  const itemMapping = {};
  items.forEach((item) => {
    const counterIdStr = item.counterId.toString();
    if (!itemMapping[counterIdStr]) {
      itemMapping[counterIdStr] = [];
    }
    itemMapping[counterIdStr].push({
      itemName: item.itemName,
      inStock: item.inStock,
      _id: item._id,
    });
  });

  // Attach items to counters
  const counterDetails = fetchCounters.map((counter) => ({
    ...counter,
    items: itemMapping[counter._id.toString()] || [],
  }));

  return counterDetails;
};

module.exports.getInsiderElements = async (insiderId, lang) => {
  try {
    if (!insiderId) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_INSIDER_ID_REQUIRED", lang),
      });
    }
    const elements = await InsiderElement.find({ insiderId }).lean();
    return elements;
  } catch (error) {
    throw {
      status: error.status || STATUS_CODES.BAD_REQUEST,
      message: error.message || t("OWNER_INSIDER_FETCH_ERROR", lang),
    };
  }
};

// module.exports.createMenuItem = async (req) => {
//   const {
//     file,
//     body: {
//       itemName,
//       price,
//       description,
//       currency,
//       menuCategoryIds,
//       quantity,
//       isVegan,
//       unit,
//       nutritionType,
//       counterIds,
//     },
//   } = req;

//   let fileName = "";

//   if (file) {
//     const fileBuffer = file.buffer;
//     fileName = `${req.entityId}_${Date.now()}_${file.originalname.replace(
//       / /g,
//       "_"
//     )}`;

//     try {
//       const data = await uploadBufferToS3(fileBuffer, fileName);
//       if (!data.Location) {
//         throwError({
//           status: STATUS_CODES.BAD_REQUEST,
//           message: "Error occurred while uploading the file",
//         });
//       }
//     } catch (error) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "File upload failed",
//       });
//     }
//   }

//   if (menuCategoryIds.length === 0) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "At least one menu category is required",
//     });
//   }

//   const menuCategories = await MenuCategory.find({
//     _id: { $in: menuCategoryIds },
//   });

//   // if (menuCategories.length != menuCategoryIds.length) {
//   //   throwError({
//   //     status: STATUS_CODES.NOT_FOUND,
//   //     message: "One or more menu categories not found",
//   //   });
//   // }

//   const existingItem = await ItemDetails.findOne({
//     itemName,
//     menuCategoryId: { $in: menuCategoryIds },
//   });

//   if (existingItem) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Same item exists in one of the selected menu categories",
//     });
//   }

//   const createdItems = await Promise.all(
//     menuCategories.map(async (category) => {
//       return ItemDetails.create({
//         itemName,
//         price,
//         currency: "CHF",
//         menuCategoryId: category._id,
//         entityId: req.entityId,
//         counterId: category.counterId,
//         counterIds,
//         image: fileName,
//         isVegan,
//         unit,
//         description,
//         nutritionType,
//         inStock: true,
//         quantity,
//       });
//     })
//   );

//   io.to(createdItems[0].entityId.toString()).emit("newItem", createdItems);

//   sendFirebaseNotification({
//     titleText: "New item added",
//     body: "New Item Added in the menu list",
//     data: {
//       action: "item created",
//       click_action: "FLUTTER_NOTIFICATION_CLICK",
//     },
//     token: "",
//     showNotification: false,
//   });

//   return createdItems;
// };

module.exports.createMenuItem = async (req) => {
  const {
    file,
    body: {
      itemName,
      price,
      description,
      currency,
      // menuCategoryIds,
      quantity,
      isVegan,
      unit,
      nutritionType,
      counterIds,
      categoryName,
      isAlcohol18,
      isAlcohol16,
    },
  } = req;

  const lang = getLanguageFromRequest(req);

  let fileName = "";

  // Upload image to S3 if provided
  if (file) {
    const fileBuffer = file.buffer;
    fileName = `${req.entityId}_${Date.now()}_${file.originalname.replace(
      / /g,
      "_"
    )}`;

    try {
      const data = await uploadBufferToS3(fileBuffer, fileName);
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

  // Get menu categories by IDs
  const menuCategories = await MenuCategory.find({
    categoryName: categoryName,
    entityId: req.entityId,
    counterId: { $in: counterIds },
  });

  // if (menuCategories.length !== menuCategoryIds.length) {
  //   throwError({
  //     status: STATUS_CODES.NOT_FOUND,
  //     message: "One or more menu categories not found",
  //   });
  // }

  // Check duplicate item per category
  const menuCategoryIds = menuCategories.map((cat) => cat._id);

  const existingItem = await ItemDetails.findOne({
    itemName,
    menuCategoryId: { $in: menuCategoryIds },
  });

  if (existingItem) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_MENU_ITEM_DUPLICATE_CATEGORY", lang),
    });
  }

  // A new item goes to the end of its category.
  const lastItem = await ItemDetails.findOne(
    { entityId: req.entityId, menuCategoryId: { $in: menuCategoryIds } },
    { sortIndex: 1 }
  )
    .sort({ sortIndex: -1 })
    .lean();
  const sortIndex = (lastItem?.sortIndex || 0) + 1;

  // Create item once per category, assign all counterIds, and category's own counterId if available

  // console.log({menuCategoryIds});
  const createdItems = await Promise.all(
    menuCategories.map(async (category) => {
      return ItemDetails.create({
        itemName,
        price,
        currency: currency || "CHF",
        menuCategoryId: category._id,
        entityId: req.entityId,
        counterIds,
        counterId: category.counterId, // If your MenuCategory has counterId, else you can remove this line
        image: fileName,
        isVegan,
        isAlcohol18,
        isAlcohol16,
        unit,
        description,
        nutritionType,
        inStock: true,
        quantity,
        sortIndex,
      });
    })
  );

  // Emit socket event to entity room (for owner)
  io.to(req.entityId.toString()).emit("newItem", createdItems);

  // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
  io.to(`entity_${req.entityId}`).emit("itemUpdate", {
    action: "create",
    items: createdItems,
    entityId: req.entityId.toString(),
    categoryName: categoryName,
  });

  sendFirebaseNotification({
    topic: `owner_entity_${req.entityId}`,
    showNotification: false,
    title: "New Item Added",
    body: "You have a new item added. Tap to view.",
    data: {
      action: "item_update",
      screen: "item_screen",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${req.entityId}`,
      entityId: req.entityId,
    },
  });

  // Send same notification to entity_ topic for customer app
  sendFirebaseNotification({
    topic: `entity_${req.entityId}`,
    showNotification: false,
    title: "New Item Added",
    body: "You have a new item added. Tap to view.",
    data: {
      action: "item_update",
      screen: "item_screen",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `entity_${req.entityId}`,
      entityId: req.entityId,
    },
  });

  return createdItems;
};

// module.exports.createItems = async (req) => {
//   const { itemName, quantity, description, type, price, currency } = req.body;

//   const existingItem = await ItemDetails.findOne({ itemName }, { _id: 1 });
//   if (existingItem) {
//     return throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Same Item Name already exists",
//     });
//   }
//   const fileBuffer = req.file.buffer;
//   const fileName = `${req.entityId}_${new Date()}_${req.file.originalname}`;
//   const data = await uploadBufferToS3(fileBuffer, fileName);
//   if (!data.Location) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Error occured while uplaoding the file",
//     });
//   }
//   await ItemDetails.create({
//     entityId: req.entityId,
//     itemName,
//     quantity,
//     type,
//     price,
//     currency,
//     description,
//     image: fileName.replace(" ", "_"),
//   });
// };

module.exports.updateMenuItem = async (req) => {
  const {
    file,
    body: {
      itemId,
      itemName,
      price,
      description,
      nutritionType,
      currency,
      quantity,
      action,
      inStock,
      counterIds,
      categoryName,
      unit,
      isCounterRemove,
      isAlcohol18,
      isAlcohol16,
      isVegan,
      removeImage,
    },
  } = req;

  const lang = getLanguageFromRequest(req);

  const item = await ItemDetails.findOne({ _id: itemId });
  if (!item) {
    return throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("OWNER_ITEM_NOT_FOUND", lang),
    });
  }

  // Check if trying to change category or counters
  const isChangingCategory =
    categoryName !== undefined && categoryName !== null;

  // Get reference item name to find all items with same name for this entity (since we update all of them)
  const referenceItemName = item.itemName;
  const itemsWithSameName = await ItemDetails.find({
    itemName: referenceItemName,
    entityId: req.entityId,
  });
  const allItemIds = itemsWithSameName.map((it) => it._id);

  // Block all edits if item is in any active order
  const activeOrders = await Order.find({
    "items.itemId": { $in: allItemIds },
    status: {
      $in: [ORDER_STATUS.WAITING, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.READY],
    },
  });

  // Switching stock on or off must always work, also mid-service: open
  // orders keep their snapshot, only new guests stop seeing the item.
  const isStockOnlyChange =
    action === EDIT_ACTION.EDIT &&
    inStock !== undefined &&
    !file &&
    [
      itemName,
      price,
      description,
      nutritionType,
      currency,
      quantity,
      counterIds,
      categoryName,
      unit,
      isAlcohol18,
      isAlcohol16,
      isVegan,
      removeImage,
    ].every((value) => value === undefined);

  if (activeOrders.length > 0 && !isStockOnlyChange) {
    return throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_ITEM_CANNOT_EDIT_ACTIVE_ORDER", lang),
    });
  }

  // If changing category, find the new category
  let newMenuCategoryId = item.menuCategoryId;
  if (isChangingCategory) {
    // Get counterIds to use (new ones if provided, otherwise existing ones)
    const countersToUse =
      counterIds && counterIds.length > 0 ? counterIds : item.counterIds;

    if (!countersToUse || countersToUse.length === 0) {
      return throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_COUNTER_IDS_REQUIRED", lang),
      });
    }

    // Find categories matching the new categoryName and counterIds
    const menuCategories = await MenuCategory.find({
      categoryName: categoryName,
      entityId: req.entityId,
      counterId: { $in: countersToUse },
    });

    if (menuCategories.length === 0) {
      return throwError({
        status: STATUS_CODES.NOT_FOUND,
        message: t("OWNER_MENU_CATEGORY_NOT_FOUND", lang),
      });
    }

    // Use the first matching category (or you could match by counterId if needed)
    // If multiple categories exist with same name but different counters,
    // we'll use the one that matches the first counterId
    const matchingCategory =
      menuCategories.find((cat) =>
        countersToUse.some((cid) => cid.toString() === cat.counterId.toString())
      ) || menuCategories[0];

    newMenuCategoryId = matchingCategory._id;
  }

  // itemsWithSameName already fetched above
  const items = itemsWithSameName;

  const fileName = file
    ? `${req.entityId}_${Date.now()}_${file.originalname.replace(/ /g, "_")}`
    : null;

  if (file) {
    try {
      const data = await uploadBufferToS3(file.buffer, fileName);
      if (!data.Location) {
        return throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("FILE_UPLOAD_ERROR", lang),
        });
      }
    } catch (error) {
      return throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FILE_UPLOAD_FAILED", lang),
      });
    }
  }

  // When adding a new counter to an existing item, create ItemDetails for the new counter(s)
  // so the item is displayed on the customer side (items are queried by counterId)
  const counterIdsArray = Array.isArray(counterIds)
    ? counterIds
    : counterIds
    ? [counterIds]
    : [];

  if (action === EDIT_ACTION.EDIT && counterIdsArray.length > 0) {
    const existingCounterIds = items
      .map((i) => i.counterId?.toString())
      .filter(Boolean);
    const newCounterIds = counterIdsArray.filter(
      (cid) => cid && !existingCounterIds.includes(cid.toString())
    );

    if (newCounterIds.length > 0) {
      const referenceItem = items[0];
      const categoryToUse = await MenuCategory.findById(
        referenceItem.menuCategoryId,
        { categoryName: 1 }
      ).lean();
      const itemCategoryName = categoryName ?? categoryToUse?.categoryName;

      if (itemCategoryName) {
        const newCategories = await MenuCategory.find({
          entityId: req.entityId,
          counterId: { $in: newCounterIds },
          categoryName: itemCategoryName,
        }).lean();

        const createdItems = [];
        for (const newCat of newCategories) {
          const newItem = await ItemDetails.create({
            itemName: itemName ?? referenceItem.itemName,
            price: price ?? referenceItem.price,
            description: description ?? referenceItem.description,
            nutritionType: nutritionType ?? referenceItem.nutritionType,
            currency: currency ?? referenceItem.currency,
            quantity: quantity ?? referenceItem.quantity,
            menuCategoryId: newCat._id,
            entityId: req.entityId,
            counterIds: counterIdsArray,
            counterId: newCat.counterId,
            image: fileName ?? referenceItem.image ?? "",
            isVegan: isVegan ?? referenceItem.isVegan ?? false,
            isAlcohol18: isAlcohol18 ?? referenceItem.isAlcohol18 ?? false,
            isAlcohol16: isAlcohol16 ?? referenceItem.isAlcohol16 ?? false,
            unit: unit ?? referenceItem.unit,
            inStock: inStock ?? referenceItem.inStock ?? true,
          });
          createdItems.push(newItem);
        }

        if (createdItems.length > 0) {
          const entityIdForEmit = referenceItem.entityId;
          io.to(entityIdForEmit.toString()).emit("newItem", createdItems);
          io.to(`entity_${entityIdForEmit}`).emit("itemUpdate", {
            action: "create",
            items: createdItems,
            entityId: entityIdForEmit.toString(),
          });
          sendFirebaseNotification({
            topic: `owner_entity_${entityIdForEmit}`,
            showNotification: false,
            title: "Item Added to Counter",
            body: "An item has been added to a new counter. Tap to view.",
            data: {
              action: "item_update",
              screen: "item_screen",
              click_action: "FLUTTER_NOTIFICATION_CLICK",
              topic: `owner_entity_${entityIdForEmit}`,
            },
          });
          sendFirebaseNotification({
            topic: `entity_${entityIdForEmit}`,
            showNotification: false,
            title: "Item Added to Counter",
            body: "An item has been added to a new counter. Tap to view.",
            data: {
              action: "item_update",
              screen: "item_screen",
              click_action: "FLUTTER_NOTIFICATION_CLICK",
              topic: `entity_${entityIdForEmit}`,
            },
          });
        }
      }
    }
  }

  if (isCounterRemove) {
    if (action === EDIT_ACTION.EDIT) {
      if (itemName !== undefined) item.itemName = itemName;
      if (price !== undefined) item.price = price;
      if (description !== undefined) item.description = description;
      if (nutritionType !== undefined) item.nutritionType = nutritionType;
      if (currency !== undefined) item.currency = currency;
      if (quantity !== undefined) item.quantity = quantity;
      if (counterIds !== undefined) item.counterIds = counterIds;
      if (isChangingCategory) item.menuCategoryId = newMenuCategoryId;
      if (inStock !== undefined) item.inStock = inStock;
      if (unit !== undefined) item.unit = unit;
      if (fileName) item.image = fileName;
      else if (removeImage === "true" || removeImage === true) item.image = "";
      if (isAlcohol18 !== undefined) item.isAlcohol18 = isAlcohol18;
      if (isAlcohol16 !== undefined) item.isAlcohol16 = isAlcohol16;
      if (isVegan !== undefined) item.isVegan = isVegan;

      await item.save();
      io.to(item.entityId.toString()).emit("menuItemUpdated", item);
      // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
      io.to(`entity_${item.entityId}`).emit("itemUpdate", {
        action: "edit",
        item: item,
        entityId: item.entityId.toString(),
      });
      sendFirebaseNotification({
        topic: `owner_entity_${item.entityId}`,
        showNotification: false,
        title: "Item Updated",
        body: "An item has been updated. Tap to view.",
        data: {
          action: "item_update",
          screen: "item_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `owner_entity_${item.entityId}`,
        },
      });

      // Send same notification to entity_ topic for customer app
      sendFirebaseNotification({
        topic: `entity_${item.entityId}`,
        showNotification: false,
        title: "Item Updated",
        body: "An item has been updated. Tap to view.",
        data: {
          action: "item_update",
          screen: "item_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `entity_${item.entityId}`,
        },
      });
    } else if (action === EDIT_ACTION.DELETE) {
      const deletedItemId = item._id;
      const entityId = item.entityId;
      await ItemDetails.deleteOne({ _id: item._id });
      io.to(entityId.toString()).emit("menuItemUpdated", {
        itemId: deletedItemId,
      });
      // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
      io.to(`entity_${entityId}`).emit("itemUpdate", {
        action: "delete",
        itemId: deletedItemId.toString(),
        entityId: entityId.toString(),
      });
      sendFirebaseNotification({
        topic: `owner_entity_${entityId}`,
        showNotification: false,
        title: "Item Deleted",
        body: "An item has been deleted. Tap to view.",
        data: {
          action: "item_update",
          screen: "item_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `owner_entity_${entityId}`,
        },
      });

      // Send same notification to entity_ topic for customer app
      sendFirebaseNotification({
        topic: `entity_${entityId}`,
        showNotification: false,
        title: "Item Deleted",
        body: "An item has been deleted. Tap to view.",
        data: {
          action: "item_update",
          screen: "item_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `entity_${entityId}`,
        },
      });
    }
    return;
  }

  for (const item of items) {
    if (action === EDIT_ACTION.EDIT) {
      if (itemName !== undefined) item.itemName = itemName;
      if (price !== undefined) item.price = price;
      if (description !== undefined) item.description = description;
      if (nutritionType !== undefined) item.nutritionType = nutritionType;
      if (currency !== undefined) item.currency = currency;
      if (quantity !== undefined) item.quantity = quantity;
      if (counterIds !== undefined) item.counterIds = counterIds;
      if (isChangingCategory) item.menuCategoryId = newMenuCategoryId;
      if (inStock !== undefined) item.inStock = inStock;
      if (unit !== undefined) item.unit = unit;
      if (fileName) item.image = fileName;
      else if (removeImage === "true" || removeImage === true) item.image = "";
      if (isAlcohol18 !== undefined) item.isAlcohol18 = isAlcohol18;
      if (isAlcohol16 !== undefined) item.isAlcohol16 = isAlcohol16;
      if (isVegan !== undefined) item.isVegan = isVegan;

      await item.save();
      io.to(item.entityId.toString()).emit("menuItemUpdated", item);
      // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
      io.to(`entity_${item.entityId}`).emit("itemUpdate", {
        action: "edit",
        item: item,
        entityId: item.entityId.toString(),
      });
      sendFirebaseNotification({
        topic: `owner_entity_${item.entityId}`,
        showNotification: false,
        title: "Item Updated",
        body: "An item has been updated. Tap to view.",
        data: {
          action: "item_update",
          screen: "item_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `owner_entity_${item.entityId}`,
        },
      });

      // Send same notification to entity_ topic for customer app
      sendFirebaseNotification({
        topic: `entity_${item.entityId}`,
        showNotification: false,
        title: "Item Updated",
        body: "An item has been updated. Tap to view.",
        data: {
          action: "item_update",
          screen: "item_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `entity_${item.entityId}`,
        },
      });
    } else if (action === EDIT_ACTION.DELETE) {
      const deletedItemId = item._id;
      const entityId = item.entityId;
      await ItemDetails.deleteOne({ _id: item._id });
      io.to(entityId.toString()).emit("menuItemUpdated", {
        itemId: deletedItemId,
      });
      // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
      io.to(`entity_${entityId}`).emit("itemUpdate", {
        action: "delete",
        itemId: deletedItemId.toString(),
        entityId: entityId.toString(),
      });
      sendFirebaseNotification({
        topic: `owner_entity_${entityId}`,
        showNotification: false,
        title: "Item Deleted",
        body: "An item has been deleted. Tap to view.",
        data: {
          action: "item_update",
          screen: "item_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `owner_entity_${entityId}`,
        },
      });

      // Send same notification to entity_ topic for customer app
      sendFirebaseNotification({
        topic: `entity_${entityId}`,
        showNotification: false,
        title: "Item Deleted",
        body: "An item has been deleted. Tap to view.",
        data: {
          action: "item_update",
          screen: "item_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `entity_${entityId}`,
        },
      });
    }
  }
};

module.exports.getCreatedItems = async (req) => {
  const {
    entityId,
    query: {
      itemId,
      pageNo = 1,
      pageLimit = 8,
      inStock,
      searchTerm,
      searchedId,
      menuCategoryName,
    },
  } = req;

  if (itemId) {
    const item = await ItemDetails.findOne({ _id: itemId, entityId })
      .populate({
        path: "menuCategoryId",
        select: "categoryName counterId",
        model: "CounterMenuCategory",
        populate: {
          path: "counterId",
          select: "status counterName",
          model: "Counter",
        },
      })
      .lean();

    if (!item || item.menuCategoryId?.counterId?.status !== STATUS.ACTIVE) {
      return { itemsList: [], totalCount: 0 };
    }

    const itemWithImage = {
      ...item,
      image: item.image ? generatePresignedUrl(item.image) : null,
    };

    return { itemsList: [itemWithImage], totalCount: 1 };
  }
  let menuCategoryIds;
  if (menuCategoryName) {
    console.log("menuCategoryName received:", menuCategoryName);
    console.log("entityId:", entityId);
    // Escape regex metacharacters so names like "Pizza Canapa (Hanfteig)" match literally
    const escapedCategoryName = menuCategoryName
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const categories = await MenuCategory.find(
      {
        categoryName: {
          $regex: new RegExp(`^\\s*${escapedCategoryName}\\s*$`, "i"),
        },
        entityId,
      },
      { _id: 1 }
    );
    console.log("categories found:", categories);
    menuCategoryIds = categories.map((cat) => cat._id);
    console.log("menuCategoryIds:", menuCategoryIds);
    if (!menuCategoryIds.length) {
      console.log("No categories found, returning empty");
      return { itemsList: [], totalCount: 0 };
    }
  }

  const query = { entityId };

  if (searchedId) {
    query._id = { $ne: searchedId };
  }

  if (menuCategoryName && menuCategoryIds?.length) {
    query.menuCategoryId = { $in: menuCategoryIds };
  }

  if (inStock !== undefined) {
    query.inStock = inStock;
  }

  if (searchTerm) {
    query.itemName = { $regex: searchTerm, $options: "i" };
  }
  console.log(query);

  const createdItems = (
    await ItemDetails.find(query)
      .sort({ sortIndex: 1, _id: 1 })
      .populate({
        path: "menuCategoryId",
        select: "categoryName counterId sortIndex",
        model: "CounterMenuCategory",
        populate: {
          path: "counterId",
          select: "status counterName",
          model: "Counter",
        },
      })
      .lean()
  ).sort(
    // Stable: keeps the item order inside each category.
    (a, b) =>
      (a.menuCategoryId?.sortIndex || 0) - (b.menuCategoryId?.sortIndex || 0)
  );

  if (searchedId && pageNo == 1 && !menuCategoryName) {
    const searchedIdItem = await ItemDetails.findById(searchedId)
      .sort({ _id: -1 })
      .populate({
        path: "menuCategoryId",
        select: "categoryName counterId",
        model: "CounterMenuCategory",
        populate: {
          path: "counterId",
          select: "status counterName",
          model: "Counter",
        },
      })
      .lean();
    if (searchedIdItem) {
      createdItems.unshift(searchedIdItem); // Use unshift() to add item to the start of the array
    }
  }

  const alreadyAddedItems = {};

  const filteredItems = createdItems.filter((item) => {
    // const isActive = item.menuCategoryId?.counterId?.status === STATUS.ACTIVE;
    const isNewItem = !alreadyAddedItems[item.itemName];

    if (isNewItem) {
      alreadyAddedItems[item.itemName] = true;
      return true;
    }

    return false;
  });

  const totalCount = filteredItems.length;

  const paginatedItems = filteredItems.slice(
    (pageNo - 1) * pageLimit,
    pageNo * pageLimit
  );

  const itemsList = paginatedItems.map((item) => ({
    ...item,
    image: item.image ? generatePresignedUrl(item.image) : null,
  }));

  return { itemsList, totalCount };
};

module.exports.getParticularItemDetail = async (req) => {
  const { menuItemId } = req.query;
  const itemDetails = await ItemDetails.findById(menuItemId).populate({
    path: "itemId",
  });
  if (itemDetails) {
    itemDetails.itemId.image = generatePresignedUrl(itemDetails.itemId.image);
  }
  // const itemDetails=
  return itemDetails;
};

// module.exports.getUpcomingEvents = async (req) => {
//   const currentDateTime = new Date();
//   const {
//     ownerId,
//     entityId,
//     query: { filterBy },
//   } = req;

//   let startDate = currentDateTime;
//   let endDate = null;

//   if (filterBy === "week") {
//     const dayOfWeek = currentDateTime.getDay();
//     const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
//     startDate = new Date(currentDateTime);
//     startDate.setDate(currentDateTime.getDate() + diffToMonday);
//     startDate.setHours(0, 0, 0, 0);

//     endDate = new Date(startDate);
//     endDate.setDate(startDate.getDate() + 6);
//     endDate.setHours(23, 59, 59, 999);
//   } else if (filterBy === "month") {
//     startDate = new Date(
//       currentDateTime.getFullYear(),
//       currentDateTime.getMonth(),
//       1
//     );
//     endDate = new Date(
//       currentDateTime.getFullYear(),
//       currentDateTime.getMonth() + 1,
//       0
//     );
//     endDate.setHours(23, 59, 59, 999);
//   }

//   const dateFilter = endDate
//     ? { $gte: startDate, $lte: endDate }
//     : { $gte: startDate };

//   console.log({ dateFilter });

//   const upcomingEvents = await Event.find({
//     ownerId,
//     entityId,
//     from: dateFilter,
//   }).sort({ createdAt: -1 });

//   upcomingEvents.forEach((event) => {
//     if (event.image) {
//       event.image = generatePresignedUrl(event.image);
//     }
//   });
//   console.log({ sssss: upcomingEvents });

//   return upcomingEvents;
// };

// module.exports.getOngoingEventDetails = async (req) => {
//   const currentTime = new Date();

//   const events = await Event.find(
//     {
//       from: { $lte: currentTime },
//       to: { $gte: currentTime },
//       entityId: req.entityId,
//     },
//     null,
//     { sort: { from: -1 }, lean: true }
//   );
//   console.log({ events });

//   const eventIds = new Map();

//   const ongoingEvents = events?.filter((event) => {
//     if (event.isRepetitive === true) {
//       const day = currentTime.getDay();
//       if (!event.repetitiveDays || event.repetitiveDays[day] === false) {
//         return false;
//       }
//     }

//     eventIds.set(event._id.toString(), {
//       isRepetitive: event.isRepetitive,
//       from: event.from,
//       to: event.to,
//       eventName: event.eventName,
//       activeUsers: event.activeUsers,
//       ageLimit: event.ageLimit,
//       image: generatePresignedUrl(event.image),
//     });
//     return true;
//   });
//   console.log({ ongoingEvents: ongoingEvents });

//   const startingTime = new Date();
//   startingTime.setHours(0, 0, 0, 0);
//   const endingTime = new Date();
//   endingTime.setDate(endingTime.getDate() + 1);
//   endingTime.setHours(0, 0, 0, 0);

//   const ordersOfEvents = await Order.find({
//     eventId: { $in: Array.from(eventIds.keys()) },
//   });
//   console.log({ ordersOfEvents: ordersOfEvents });

//   const ongoingEventDetailsWithOrders = ordersOfEvents?.reduce((acc, order) => {
//     const eventKey = order.eventId.toString();

//     if (!acc[eventKey]) {
//       const eventDetails = eventIds.get(eventKey);
//       acc[eventKey] = {
//         eventId: order.eventId,
//         from: eventDetails.from,
//         to: eventDetails.to,
//         eventName: eventDetails.eventName,
//         activeUsers: eventDetails.activeUsers,
//         totalOrders: 0,
//         ageLimit: eventDetails.ageLimit,
//         image: generatePresignedUrl(eventDetails.image),
//       };
//     }
//     acc[eventKey].totalOrders += 1;
//     return acc;
//   }, {});

//   return [ongoingEventDetailsWithOrders, ongoingEvents];
// };

module.exports.getCounterAndCategory = async (req) => {
  const { userId, entityId } = req;
  const menuCategories = await MenuCategory.find(
    { entityId: req.entityId },
    { entityId: 0, createdAt: 0, updatedAt: 0 },
    { sort: { _id: -1 }, lean: true }
  ).populate({
    path: "counterId",
    select: "counterName status",
    model: "Counter",
  });

  const filteredCategories = menuCategories.filter(
    (category) => category.counterId?.status === STATUS.ACTIVE
  );

  const query = { ownerId: userId, entityId };

  query.status = STATUS.ACTIVE;
  const counters = await Counter.find(query, {
    counterName: 1,
    // isSelfPickUp: 1,
    // isTableService: 1,
    // tableCount: 1,
    status: 1,
    // tableSectionName: 1,
  })
    .sort({ createdAt: -1 })
    .lean();

  return { filteredCategories, counters };
};

module.exports.getMenuCategory = async (req) => {
  const menuCategories = await MenuCategory.find(
    { entityId: req.entityId },
    { entityId: 0, createdAt: 0, updatedAt: 0 }
  )
    .sort({ sortIndex: 1, _id: 1 })
    .lean()
    .populate({
      path: "counterId",
      select: "counterName status",
      model: "Counter",
    });

  // Group categories by name and collect all linked counters
  const categoryMap = {};

  for (const category of menuCategories) {
    const isValidCategory =
      !category.counterId || category.counterId?.status === STATUS.ACTIVE;
    if (!isValidCategory) continue;

    if (!categoryMap[category.categoryName]) {
      categoryMap[category.categoryName] = {
        _id: category._id,
        categoryName: category.categoryName,
        nutritionType: category.nutritionType,
        sortIndex: category.sortIndex || 0,
        __v: category.__v,
        counterIds: [],
      };
    }

    if (category.counterId) {
      const alreadyAdded = categoryMap[category.categoryName].counterIds.some(
        (c) => c._id.toString() === category.counterId._id.toString()
      );
      if (!alreadyAdded) {
        categoryMap[category.categoryName].counterIds.push(category.counterId);
      }
    }
  }

  return Object.values(categoryMap);
};

module.exports.editCategory = async (req) => {
  const { action, categoryName, newCategoryName } = req.body;
  const lang = getLanguageFromRequest(req);
  let message = "";

  if (!action || !categoryName) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_CATEGORY_ACTION_REQUIRED", lang),
    });
  }

  // Find categories by name AND entityId (entity-based, not global)
  const categories = await MenuCategory.find({
    categoryName,
    entityId: req.entityId,
  });

  if (!categories.length) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_CATEGORY_NOT_FOUND_BY_NAME", lang),
    });
  }

  if (action === EDIT_ACTION.EDIT) {
    // Check for active orders on items in this category
    const categoryIds = categories.map((c) => c._id);
    const itemsInCategory = await ItemDetails.find({
      menuCategoryId: { $in: categoryIds },
    }).select("_id");

    if (itemsInCategory.length > 0) {
      const itemIds = itemsInCategory.map((i) => i._id);
      const activeOrders = await Order.findOne({
        "items.itemId": { $in: itemIds },
        status: {
          $in: [
            ORDER_STATUS.WAITING,
            ORDER_STATUS.IN_PROGRESS,
            ORDER_STATUS.READY,
          ],
        },
      });

      if (activeOrders) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("OWNER_CATEGORY_ACTIVE_ORDERS", lang),
        });
      }
    }

    // Check if newCategoryName already exists for this entity
    if (newCategoryName) {
      const duplicateCategory = await MenuCategory.findOne({
        entityId: req.entityId,
        categoryName: newCategoryName,
      });
      if (duplicateCategory) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("OWNER_CATEGORY_ALREADY_EXISTS_FOR_COUNTER", lang, {
            categoryName: newCategoryName,
          }),
        });
      }
    }
    // Update all categories with this name for this entity (all counters)
    for (const category of categories) {
      if (newCategoryName) category.categoryName = newCategoryName;
      await category.save();
    }
    // Socket emit to owner for real-time UI update
    io.to(req.entityId.toString()).emit("categoryUpdate", {
      action: "edit",
      categories: categories,
      oldCategoryName: categoryName,
      newCategoryName: newCategoryName,
      entityId: req.entityId.toString(),
    });
    // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
    io.to(`entity_${req.entityId}`).emit("categoryUpdate", {
      action: "edit",
      categories: categories,
      oldCategoryName: categoryName,
      newCategoryName: newCategoryName,
      entityId: req.entityId.toString(),
    });
    // Send Firebase notification to entity_{entityId} topic for category edit
    sendFirebaseNotification({
      topic: `owner_entity_${req.entityId}`,
      showNotification: false,
      title: "Category Updated",
      body: `Category "${categoryName}" has been updated.`,
      data: {
        action: "category_update",
        screen: "category_screen",
        oldCategoryName: categoryName,
        newCategoryName: newCategoryName || categoryName,
        entityId: req.entityId.toString(),
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `owner_entity_${req.entityId}`,
      },
    });

    // Send same notification to entity_ topic for customer app
    sendFirebaseNotification({
      topic: `entity_${req.entityId}`,
      showNotification: false,
      title: "Category Updated",
      body: `Category "${categoryName}" has been updated.`,
      data: {
        action: "category_update",
        screen: "category_screen",
        oldCategoryName: categoryName,
        newCategoryName: newCategoryName || categoryName,
        entityId: req.entityId.toString(),
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `entity_${req.entityId}`,
      },
    });
    message = t("OWNER_CATEGORIES_UPDATE_SUCCESS", lang);
  } else if (action === EDIT_ACTION.DELETE) {
    // Find all category IDs with this name for this entity
    const categoriesToDelete = await MenuCategory.find({
      categoryName,
      entityId: req.entityId,
    }).select("_id");
    const categoryIds = categoriesToDelete.map((c) => c._id);

    // Check if any items in these categories have active orders
    const itemsInCategory = await ItemDetails.find({
      menuCategoryId: { $in: categoryIds },
    }).select("_id");

    if (itemsInCategory.length > 0) {
      const itemIds = itemsInCategory.map((i) => i._id);
      const activeOrders = await Order.findOne({
        "items.itemId": { $in: itemIds },
        status: {
          $in: [
            ORDER_STATUS.WAITING,
            ORDER_STATUS.IN_PROGRESS,
            ORDER_STATUS.READY,
          ],
        },
      });

      if (activeOrders) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("OWNER_CATEGORY_ACTIVE_ORDERS", lang),
        });
      }

      // Unlink items from these categories (don't delete items)
      await ItemDetails.updateMany(
        { menuCategoryId: { $in: categoryIds } },
        { $unset: { menuCategoryId: "" } }
      );
    }

    // Delete all categories with this name for this entity (all counters)
    await MenuCategory.deleteMany({
      categoryName,
      entityId: req.entityId,
    });
    // Socket emit to owner for real-time UI update
    io.to(req.entityId.toString()).emit("categoryUpdate", {
      action: "delete",
      categoryName: categoryName,
      entityId: req.entityId.toString(),
    });
    // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
    io.to(`entity_${req.entityId}`).emit("categoryUpdate", {
      action: "delete",
      categoryName: categoryName,
      entityId: req.entityId.toString(),
    });
    // Send Firebase notification to entity_{entityId} topic for category delete
    sendFirebaseNotification({
      topic: `owner_entity_${req.entityId}`,
      showNotification: false,
      title: "Category Deleted",
      body: `Category "${categoryName}" has been removed.`,
      data: {
        action: "category_update",
        screen: "category_screen",
        categoryName: categoryName,
        entityId: req.entityId.toString(),
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `owner_entity_${req.entityId}`,
      },
    });

    // Send same notification to entity_ topic for customer app
    sendFirebaseNotification({
      topic: `entity_${req.entityId}`,
      showNotification: false,
      title: "Category Deleted",
      body: `Category "${categoryName}" has been removed.`,
      data: {
        action: "category_update",
        screen: "category_screen",
        categoryName: categoryName,
        entityId: req.entityId.toString(),
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `entity_${req.entityId}`,
      },
    });
    message = t("OWNER_CATEGORIES_DELETE_SUCCESS", lang);
  } else {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_CATEGORY_INVALID_ACTION", lang),
    });
  }

  return message;
};

module.exports.getMenuCategoryItems = async (req) => {
  const { menuCategoryId } = req.query;
  const menuItems = await ItemDetails.find(
    { menuCategoryId, entityId: req.entityId },
    { menuCategoryId: 0 },
    {
      sort: { updatedAt: -1 },
      lean: true,
    }
  ).populate("itemId");

  const menuItemsResp = menuItems.reduce((acc, menuItem) => {
    const itemDetails = menuItem.itemId;
    delete menuItem.itemId;
    itemDetails.image = generatePresignedUrl(itemDetails.image);
    acc.push({
      ...itemDetails,
      ...menuItem,
    });
    return acc;
  }, []);
  // const itemDetails= menuItems.itemId;
  // delete menuItems

  return menuItemsResp;
};

module.exports.getCounterMenuQuantites = async (req) => {
  const { itemId } = req.query;
  const lang = getLanguageFromRequest(req);
  const itemDetails = await ItemDetails.find(
    { entityId: req.entityId, itemId },
    { counterId: 1, quantity: 1 },
    { lean: 1 }
  );
  if (!itemDetails.length) {
    throwError({
      message: t("OWNER_ITEM_NOT_IN_ENTITY", lang),
      status: 404,
    });
  }
  const counterListOfEntity = await Counter.find(
    { entityId: req.entityId },
    { counterName: 1, _id: 1 },
    { sort: { _id: -1 }, lean: 1 }
  );
  const counterListQuantity = counterListOfEntity.reduce(
    (acc, counterDetails) => {
      const id = counterDetails._id.toString();
      const length = acc.length;
      itemDetails.forEach((itemDetail) => {
        if (itemDetail.counterId.toString() === id) {
          acc.push({
            counterName: counterDetails.counterName,
            quantity: itemDetail.quantity,
            // availableQuantity: itemDetail.availableQuantity,
            _id: counterDetails._id,
          });
          return;
        }
      });
      if (length == acc.length) {
        acc.push({
          counterName: counterDetails.counterName,
          quantity: 0,
          // availableQuantity: 0,
          _id: counterDetails._id,
        });
      }
      return acc;
    },
    []
  );
  return counterListQuantity;
};

module.exports.updateCounterSettings = async (req) => {
  const {
    isTableService,
    isSelfPickUp,
    counterId,
    action,
    counterName,
    status,
    tableSectionName,
    tableFrom,
    tableTo,
  } = req.body;

  const lang = getLanguageFromRequest(req);

  const counter = await Counter.findOne({ _id: counterId });
  if (!counter) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_COUNTER_NOT_FOUND", lang),
    });
  }

  if (action === EDIT_ACTION.EDIT) {
    // Check for active orders
    const activeOrders = await Order.findOne({
      counterId,
      status: {
        $nin: [
          globalConstants.ORDER_STATUS.COMPLETED,
          globalConstants.ORDER_STATUS.CANCELLED,
          globalConstants.ORDER_STATUS.PAYMENT_FAILED,
          globalConstants.ORDER_STATUS.PAYMENT_PROCESSING,
        ],
      },
    });

    if (activeOrders) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_COUNTER_ACTIVE_ORDERS", lang),
      });
    }

    if (counterName) {
      const duplicate = await Counter.findOne({
        _id: { $ne: counterId },
        entityId: req.entityId,
        counterName: { $regex: `^${counterName}$`, $options: "i" },
        status: { $ne: STATUS.DELETED },
      });

      if (duplicate) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("OWNER_COUNTER_NAME_ALREADY_EXISTS", lang),
        });
      }
    }

    // Update basic fields
    if (isTableService !== undefined) counter.isTableService = isTableService;
    if (isSelfPickUp !== undefined) counter.isSelfPickUp = isSelfPickUp;
    if (counterName !== undefined) counter.counterName = counterName;
    if (status !== undefined) counter.status = status;

    // Table section validation
    if (
      tableSectionName !== undefined &&
      counter.isTableService &&
      counter.tableSectionName === tableSectionName
    ) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_TABLE_NAME_EXISTS", lang),
      });
    }

    if (tableSectionName !== undefined) {
      counter.tableSectionName = tableSectionName;
    }

    // Numeric conversion and validation
    let newFrom, newTo;
    try {
      const currentFrom =
        counter.tableCount?.length > 0
          ? parseInt(counter.tableCount[0], 10)
          : 0;

      const currentTo =
        counter.tableCount?.length > 0
          ? parseInt(counter.tableCount[counter.tableCount.length - 1], 10)
          : 0;

      newFrom =
        tableFrom !== undefined ? parseInt(String(tableFrom), 10) : currentFrom;

      newTo = tableTo !== undefined ? parseInt(String(tableTo), 10) : currentTo;

      if (isNaN(newFrom) || isNaN(newTo)) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("OWNER_TABLE_NUMBER_INVALID", lang),
        });
      }

      if (newFrom < 0 || newTo < 0) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("OWNER_TABLE_NUMBER_NEGATIVE", lang),
        });
      }

      if (counter.isTableService) {
        if (newFrom >= newTo) {
          throwError({
            status: STATUS_CODES.BAD_REQUEST,
            message: t("OWNER_TABLE_RANGE_INVALID_COMPARISON", lang, {
              from: newFrom,
              to: newTo,
            }),
          });
        }

        if (newTo - newFrom < 0) {
          throwError({
            status: STATUS_CODES.BAD_REQUEST,
            message: t("OWNER_TABLE_RANGE_MINIMUM", lang),
          });
        }
      }
    } catch (error) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_TABLE_NUMBER_FORMAT_INVALID", lang),
      });
    }

    // Update table numbers
    if (tableFrom !== undefined || tableTo !== undefined) {
      const tableNumbers = [];
      for (let i = newFrom; i <= newTo; i++) {
        tableNumbers.push(i.toString());
      }
      counter.tableCount = tableNumbers;
    }

    await counter.save();
    io.to(counter.entityId.toString()).emit("counterUpdate", { counterId });
    // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
    io.to(`entity_${counter.entityId}`).emit("counterUpdate", {
      action: "edit",
      counter: counter,
      counterId: counterId,
      entityId: counter.entityId.toString(),
    });
    sendFirebaseNotification({
      topic: `owner_entity_${counter.entityId}`,
      showNotification: false,
      title: "Counter Updated",
      body: "A counter has been updated. Tap to view.",
      data: {
        action: "counter_update",
        screen: "counter_screen",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `owner_entity_${counter.entityId}`,
      },
    });

    // Send same notification to entity_ topic for customer app
    sendFirebaseNotification({
      topic: `entity_${counter.entityId}`,
      showNotification: false,
      title: "Counter Updated",
      body: "A counter has been updated. Tap to view.",
      data: {
        action: "counter_update",
        screen: "counter_screen",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `entity_${counter.entityId}`,
      },
    });

    if (
      tableFrom !== undefined ||
      tableTo !== undefined ||
      tableSectionName !== undefined
    ) {
      const conflictingTables = await Tables.find({
        counterIds: counter._id,
        status: { $ne: STATUS.DELETED },
      });

      const isConflict = conflictingTables.some(
        (table) => table.counterIds.length > 1
      );

      if (isConflict) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("OWNER_TABLE_COUNTER_CONFLICT", lang),
        });
      }

      let existingTable = await Tables.findOne({
        counterIds: counter._id,
        status: { $ne: STATUS.DELETED },
      });

      if (existingTable) {
        existingTable.tableCount = counter.tableCount;
        if (tableSectionName !== undefined) {
          existingTable.tableSectionName = tableSectionName;
        }
        await existingTable.save();
      } else {
        // Table service was just enabled - create new table record
        const lastTable = await Tables.findOne(
          { entityId: counter.entityId },
          { tableSetionNo: 1 }
        ).sort({ createdAt: -1 });

        const newTableSectionNo = lastTable ? lastTable.tableSetionNo + 1 : 1;

        await Tables.create({
          tableCount: counter.tableCount,
          tableSectionName: counter.tableSectionName || tableSectionName || "",
          userId: req.userId,
          entityId: counter.entityId,
          counterIds: [counter._id],
          tableSetionNo: newTableSectionNo,
          status: STATUS.ACTIVE,
        });
      }
    }

    // return {
    //   success: true,
    //   message: "Counter settings updated successfully",
    //   tableRange: counter.tableCount,
    // };
  } else if (action === EDIT_ACTION.DELETE) {
    // 1. Check for active orders
    const activeOrders = await Order.findOne({
      counterId,
      status: {
        $nin: [
          globalConstants.ORDER_STATUS.COMPLETED,
          globalConstants.ORDER_STATUS.CANCELLED,
          globalConstants.ORDER_STATUS.PAYMENT_FAILED,
          globalConstants.ORDER_STATUS.PAYMENT_PROCESSING,
        ],
      },
    });

    if (activeOrders) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_COUNTER_ACTIVE_ORDERS", lang),
      });
    }

    // 2. Unlink items - remove this counter from items' counterIds
    await ItemDetails.updateMany(
      { counterIds: counterId },
      { $pull: { counterIds: counterId } }
    );

    // 3. Unlink tables - remove this counter from tables' counterIds
    await Tables.updateMany(
      { counterIds: counterId },
      { $pull: { counterIds: counterId } }
    );

    // 4. Unlink events - remove this counter from events' counterIds
    await Event.updateMany(
      { counterIds: counterId },
      { $pull: { counterIds: counterId } }
    );

    // 5. Unlink categories - remove counterId reference
    await MenuCategory.updateMany(
      { counterId: counterId },
      { $unset: { counterId: "" } }
    );

    // 6. Soft delete counter
    await Counter.updateOne(
      { _id: counterId },
      { $set: { status: STATUS.DELETED } }
    );

    io.to(counter.entityId.toString()).emit("counterUpdate", { counterId });
    // Emit socket event to entity_{entityId} topic (for customers subscribed to this entity)
    io.to(`entity_${counter.entityId}`).emit("counterUpdate", {
      action: "delete",
      counterId: counterId,
      entityId: counter.entityId.toString(),
    });
    sendFirebaseNotification({
      topic: `owner_entity_${counter.entityId}`,
      showNotification: false,
      title: "Counter Deleted",
      body: "A counter has been removed",
      data: {
        action: "counter_update",
        screen: "counter_screen",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `owner_entity_${counter.entityId}`,
      },
    });

    // Send same notification to entity_ topic for customer app
    sendFirebaseNotification({
      topic: `entity_${counter.entityId}`,
      showNotification: false,
      title: "Counter Deleted",
      body: "A counter has been removed",
      data: {
        action: "counter_update",
        screen: "counter_screen",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `entity_${counter.entityId}`,
      },
    });

    return {
      success: true,
      message: t("OWNER_COUNTER_DELETE_SUCCESS", lang),
    };
  }
};

module.exports.getCounterSettings = async (req) => {
  const { counterId } = req.query;
  const counterSettings = await Counter.findOne(
    { _id: counterId },
    { counterName: 1, isTableService: 1, isSelfPickUp: 1, totalTables: 1 },
    { lean: 1 }
  );
  return counterSettings;
};

module.exports.createDiscountCoupon = async (req) => {
  const {
    entityId,
    userId,
    body: {
      code,
      type,
      value,
      maxDiscount,
      minAmount,
      usageLimit,
      startDate,
      endDate,
      // entityId,
      // userId,
      description,
      colourTheme,
    },
  } = req;

  const existingCoupon = await Discount.findOne({
    code,
    status: STATUS.ACTIVE,
  });
  if (existingCoupon) {
    throw new Error("Coupon code already exists");
  }

  const couponObj = {
    code,
    type,
    value,
    maxDiscount,
    minAmount,
    usageLimit,
    startDate,
    endDate,
    entityId,
    userId,
    description,
    colourTheme,
    status: STATUS.ACTIVE,
  };

  return Discount.create(couponObj);
};

module.exports.getDiscountCoupon = async (req) => {
  const { entityId, userId } = req;

  let currentDate = new Date();

  const coupons = await Discount.find({
    entityId,
    userId,
    status: STATUS.ACTIVE,
    endDate: { $gte: currentDate },
  });

  return coupons;
};

// module.exports.editBusinessDetails = async (req) => {
//   const {
//     entityId,
//     userId,
//     file,
//     body: {
//       email,
//       entityContactNumber,
//       password,
//       action,
//       location,
//       zipcode,
//       floor,
//       buildingName,
//       landMark,
//     },
//   } = req;

//   const entity = await EntityDetails.findOne({
//     _id: entityId,
//     userId,
//   });

//   const user = await User.findOne({ _id: userId });

//   if (!entity) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Restaurant doesn't exists.",
//     });
//   }

//   let fileName = "";

//   if (action === EDIT_ACTION.EDIT && file) {
//     // Handle image upload
//     const fileBuffer = file.buffer;
//     fileName = `${req.entityId}_${Date.now()}_${file.originalname.replace(
//       / /g,
//       "_"
//     )}`;

//     try {
//       const data = await uploadBufferToS3(fileBuffer, fileName);
//       if (!data.Location) {
//         throwError({
//           status: STATUS_CODES.BAD_REQUEST,
//           message: "Error occurred while uploading the file",
//         });
//       }

//       // Update entity image in DB
//       await EntityDetails.updateOne(
//         { _id: entityId },
//         { $set: { image: fileName } }
//       );
//     } catch (error) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "File upload failed",
//       });
//     }
//   } else if (action === EDIT_ACTION.DELETE) {
//     try {
//       await EntityDetails.updateOne({ _id: entityId }, { $set: { image: "" } });
//     } catch (error) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "Image deletion failed",
//       });
//     }
//   }

//   if (email) {
//     user.email = email;
//     await user.save();
//   }
//   if (entityContactNumber) {
//     entity.entityContactNumber = entityContactNumber;
//     await entity.save();
//   }
//   if (password) {
//     const oldPass = await comparePassword(password, user.password);
//     if (oldPass) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "We don't accept old password as new password.",
//       });
//     }
//     const hashPassword = bcrypt.hashSync(password, 10);
//     entity.password = hashPassword;
//     await user.save();
//   }
//   if (location) {
//     entity.location = location;
//     await entity.save();
//   }
//   if (floor) {
//     entity.floor = floor;
//     await entity.save();
//   }
//   if (buildingName) {
//     entity.buildingName = buildingName;
//     await entity.save();
//   }
//   if (landMark) {
//     entity.landMark = landMark;
//     await entity.save();
//   }
//   if (zipcode) {
//     entity.zipcode = zipcode;
//     await entity.save();
//   }
// };

// module.exports.editBusinessDetails = async (req) => {
//   const {
//     entityId,
//     userId,
//     file,
//     body: {
//       email,
//       entityContactNumber,
//       password,
//       action,
//       location,
//       zipcode,
//       floor,
//       buildingName,
//       landmark,
//       plotNo,
//     },
//   } = req;

//   const [entity, user] = await Promise.all([
//     EntityDetails.findOne({ _id: entityId, userId }),
//     User.findById(userId),
//   ]);

//   if (!entity) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Restaurant doesn't exist.",
//     });
//   }

//   const updateEntityFields = {};
//   const updateUserFields = {};

//   if (action === EDIT_ACTION.EDIT && file) {
//     const fileName = `${entityId}_${Date.now()}_${file.originalname.replace(
//       / /g,
//       "_"
//     )}`;
//     try {
//       const { Location } = await uploadBufferToS3(file.buffer, fileName);
//       if (!Location) throw new Error("File upload failed");
//       updateEntityFields.image = fileName;
//     } catch (error) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "File upload failed",
//       });
//     }
//   } else if (action === EDIT_ACTION.DELETE) {
//     updateEntityFields.image = "";
//   }

//   if (password) {
//     const isSamePassword = await comparePassword(password, user.password);
//     if (isSamePassword) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "We don't accept old password as new password.",
//       });
//     }
//     updateUserFields.password = bcrypt.hashSync(password, 10);
//   }

//   if (email) {
//     updateEntityFields.email = email;
//     updateUserFields.email = email;
//   }

//   if (entityContactNumber) {
//     updateEntityFields.entityContactNumber = entityContactNumber;
//     updateUserFields.contactNumber = entityContactNumber;
//   }

//   if (location) updateEntityFields.location = location;
//   if (floor) updateEntityFields.floor = floor;
//   if (buildingName) updateEntityFields.buildingName = buildingName;
//   if (landmark) updateEntityFields.landMark = landmark;
//   if (zipcode) updateEntityFields.zipcode = zipcode;
//   if (plotNo) updateEntityFields.plotNo = plotNo;

//   await Promise.all([
//     Object.keys(updateEntityFields).length > 0
//       ? EntityDetails.updateOne({ _id: entityId }, { $set: updateEntityFields })
//       : Promise.resolve(),
//     Object.keys(updateUserFields).length > 0
//       ? User.updateOne({ _id: userId }, { $set: updateUserFields })
//       : Promise.resolve(),
//   ]);
// };

module.exports.editBusinessDetails = async (req) => {
  const {
    userId,
    entityId,
    file,
    body: {
      email,
      contactNumber,
      newPassword,
      enteredOtp,
      entityContactNumber,
      action,
      location,
      zipcode,
      floor,
      buildingName,
      landmark,
      // plotNo,
      country,
    },
  } = req;

  const lang = getLanguageFromRequest(req);

  let message = "";
  const updateEntityFields = {};

  if (newPassword) {
    const userPass = await User.findOne({ _id: userId });
    if (!userPass) {
      throwError({
        status: STATUS_CODES.NOT_FOUND,
        message: t("USER_NOT_FOUND", lang),
      });
    }

    const passwordCompare = await comparePassword(
      newPassword,
      userPass.password
    );
    if (passwordCompare) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("PASSWORD_REUSE_ERROR", lang),
      });
    }

    const passwordChange = bcrypt.hashSync(newPassword, 10);
    userPass.password = passwordChange;
    await userPass.save();

    message = t("PASSWORD_UPDATE_SUCCESS", lang);
    io.to(entityId.toString()).emit("passwordUpdated", { message });
    sendFirebaseNotification({
      topic: `owner_entity_${entityId}`,
      showNotification: false,
      title: "New Profile Details Added",
      body: "You have a new entity details added. Tap to view.",
      data: {
        action: "profile_update",
        screen: "counter_screen",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `owner_entity_${entityId}`,
      },
    });

    return { message };
  }

  const entity = await EntityDetails.findOne({
    _id: entityId,
    status: STATUS.ACTIVE,
  }).lean();
  if (!entity) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("ENTITY_NOT_FOUND", lang),
    });
  }

  if (action === EDIT_ACTION.EDIT && file) {
    const fileName = `${entityId}_${Date.now()}_${file.originalname.replace(
      / /g,
      "_"
    )}`;
    try {
      const { Location } = await uploadBufferToS3(file.buffer, fileName);
      if (!Location) throw new Error("File upload failed");
      updateEntityFields.image = fileName;
    } catch (error) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FILE_UPLOAD_FAILED", lang),
      });
    }
  } else if (action === EDIT_ACTION.DELETE) {
    updateEntityFields.image = "";
  }

  if (location) updateEntityFields.location = location;
  if (floor) updateEntityFields.floor = floor;
  if (buildingName) updateEntityFields.buildingName = buildingName;
  if (landmark) updateEntityFields.landMark = landmark;
  if (zipcode) updateEntityFields.zipcode = zipcode;
  // if (plotNo) updateEntityFields.plotNo = plotNo;
  if (country) updateEntityFields.country = country;

  // await EntityDetails.updateOne({ _id: entityId }, updateEntityFields);
  if (Object.keys(updateEntityFields).length) {
    await EntityDetails.updateOne({ _id: entityId }, updateEntityFields);
    io.to(entityId.toString()).emit("entityDetailsUpdated", updateEntityFields);
    sendFirebaseNotification({
      topic: `owner_entity_${entityId}`,
      showNotification: false,
      title: "New Profile Updated",
      body: "You have a new entity details added. Tap to view.",
      data: {
        action: "entity_details_update",
        screen: "entity_details_screen",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `owner_entity_${entityId}`,
      },
    });
  }

  const unifiedContactNumber = contactNumber || entityContactNumber;
  if (unifiedContactNumber) {
    if (!enteredOtp) {
      const otp = crypto.randomInt(100000, 999999).toString();
      console.log(`[OTP] Owner/MobileUpdate contactNumber=${unifiedContactNumber} otp=${otp}`);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await Otp.findOneAndUpdate(
        { contactNumber: unifiedContactNumber },
        { otp, userId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const msg = `Your OTP for updating contact number on countr is: ${otp} (Valid for 5 minutes)`;

      await sendSMS({ toPhoneNumber: unifiedContactNumber, message: msg });

      await User.updateOne(
        { _id: userId },
        { contactNumber: unifiedContactNumber, contactOtpVerified: false }
      );
      message = t("OWNER_CONTACT_OTP_SENT", lang);
      return { message, otp, otpSent: true };
    } else {
      const otpRecord = await Otp.findOne({
        contactNumber: unifiedContactNumber,
      });
      if (
        !otpRecord ||
        String(otpRecord.otp) !== String(enteredOtp) ||
        new Date() > otpRecord.expiresAt
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("INVALID_OR_EXPIRED_OTP", lang),
        });
      }
      await Otp.deleteOne({ contactNumber: unifiedContactNumber });
      await User.updateOne(
        { _id: userId },
        { contactNumber: unifiedContactNumber, contactOtpVerified: true }
      );

      updateEntityFields.contactNumber = unifiedContactNumber;
      updateEntityFields.entityContactNumber = unifiedContactNumber;

      await EntityDetails.updateOne(
        { _id: entityId },
        { entityContactNumber: unifiedContactNumber, contactOtpVerified: true }
      );

      message = t("OWNER_CONTACT_UPDATE_SUCCESS", lang);
      io.to(entityId.toString()).emit("contactNumberUpdated", {
        contactNumber: unifiedContactNumber,
      });

      sendFirebaseNotification({
        topic: `owner_entity_${entityId}`,
        showNotification: false,
        title: "New Profile Updated",
        body: "You have a new entity details added. Tap to view.",
        data: {
          action: "entity_details_update",
          screen: "entity_details_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `owner_entity_${entityId}`,
        },
      });

      return { message, otpVerified: true };
    }
  }

  if (email) {
    if (!enteredOtp) {
      const query = { status: STATUS.ACTIVE };
      if (email) query.email = email;

      const user = await User.findOne(query);
      if (user) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("EMAIL_ALREADY_EXISTS", lang, { email }),
        });
      }
      const otp = crypto.randomInt(100000, 999999).toString();
      console.log(`[OTP] Owner/EmailUpdate email=${email} otp=${otp}`);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await Otp.findOneAndUpdate(
        { email },
        { otp, userId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const mail_data = {
        to: email,
        subject: "countr: OTP for Email Update",
        text: `Please use the below OTP to verify your identity for updating your email on countr: \n\n ${otp} \n\n (Valid for 5 minutes)`,
      };
      createMail(mail_data);
      await User.updateOne({ _id: userId }, { emailOtpVerified: false });

      return {
        message: t("OTP_SENT_NEW_EMAIL", lang),
        otp,
        otpSent: true,
      };
    } else {
      const otpRecord = await Otp.findOne({ email });
      if (
        !otpRecord ||
        String(otpRecord.otp) !== String(enteredOtp) ||
        new Date() > otpRecord.expiresAt
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("INVALID_OR_EXPIRED_OTP", lang),
        });
      }
      await Otp.deleteOne({ email });
      await User.updateOne({ _id: userId }, { email, emailOtpVerified: true });
      // return { message: "Email updated successfully.", otpVerified: true };

      message = t("EMAIL_UPDATE_SUCCESS", lang);
      io.to(entityId.toString()).emit("emailUpdated", { email });
      sendFirebaseNotification({
        topic: `owner_entity_${entityId}`,
        showNotification: false,
        title: "New Profile Updated",
        body: "You have a new entity details added. Tap to view.",
        data: {
          action: "entity_details_update",
          screen: "entity_details_screen",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          topic: `owner_entity_${entityId}`,
        },
      });

      return { message, otpVerified: true };
    }
  }

  return { message: t("OWNER_BUSINESS_DETAILS_UPDATE_SUCCESS", lang) };
};

module.exports.getBusinessUserDetails = async (req) => {
  const { entityId, userId } = req;
  const entity = await EntityDetails.findOne(
    {
      _id: entityId,
      userId,
      status: STATUS.ACTIVE,
    },
    { owner: 0, userId: 0 }
  ).lean();
  const user = await User.findOne(
    {
      _id: userId,
      status: STATUS.ACTIVE,
    },
    { fcmToken: 0 }
  ).lean();

  entity.image = generatePresignedUrl(entity.image);
  user.password = "";

  return { ...entity, ...user };
};

module.exports.addingTables = async (req) => {
  const {
    userId,
    entityId,
    body: { tableFrom, tableTo, counterIds, tableSectionName },
  } = req;

  const lang = getLanguageFromRequest(req);

  const entity = await EntityDetails.findById(entityId);
  if (!entity) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ENTITY_NOT_FOUND", lang),
    });
  }

  if (!Array.isArray(counterIds) || counterIds.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_COUNTER_IDS_REQUIRED", lang),
    });
  }

  const counters = await Counter.find({ _id: { $in: counterIds } });
  if (counters.length !== counterIds.length) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_COUNTERS_NOT_FOUND", lang),
    });
  }

  if (Number(tableFrom) >= Number(tableTo)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_TABLE_RANGE_INVALID", lang),
    });
  }

  const tableNumbers = Array.from(
    { length: Number(tableTo) - Number(tableFrom) + 1 },
    (_, i) => String(Number(tableFrom) + i)
  );

  const tablesExists = await Tables.find({
    counterIds: { $in: counterIds },
    status: { $ne: STATUS.DELETED },
  });

  if (tablesExists.length > 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_TABLE_SERVICE_ALREADY_EXISTS", lang),
    });
  }
  const lastTable = await Tables.findOne(
    { entityId },
    { tableSetionNo: 1, tableSectionName: 1 }
  ).sort({ createdAt: -1 });

  const newTableSectionNo = lastTable ? lastTable.tableSetionNo + 1 : 1;
  if (lastTable?.tableSectionName === tableSectionName) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_TABLE_NAME_EXISTS", lang),
    });
  }

  const tableObj = {
    tableCount: tableNumbers,
    userId,
    entityId,
    counterIds,
    tableSetionNo: newTableSectionNo,
    tableSectionName,
    status: STATUS.ACTIVE,
  };

  const newTable = await Tables.create(tableObj);
  io.to(newTable.entityId.toString()).emit("newTable", newTable);
  sendFirebaseNotification({
    topic: `owner_entity_${newTable.entityId}`,
    showNotification: false,
    title: "New Profile Updated",
    body: "You have a new table added. Tap to view.",
    data: {
      action: "table_update",
      screen: "table_screen",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${newTable.entityId}`,
    },
  });

  // Send same notification to entity_ topic for customer app
  sendFirebaseNotification({
    topic: `entity_${newTable.entityId}`,
    showNotification: false,
    title: "New Profile Updated",
    body: "You have a new table added. Tap to view.",
    data: {
      action: "table_update",
      screen: "table_screen",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `entity_${newTable.entityId}`,
    },
  });

  await Counter.updateMany(
    { _id: { $in: counterIds } },
    {
      $set: {
        tableSectionName,
        tableCount: tableNumbers,
        isTableService: true,
      },
    }
  );

  return newTable;
};

module.exports.getCountersForTableManagement = async (req) => {
  const { entityId } = req;
  const { tableId } = req.query;

  const tableManagement = await Tables.find({ entityId }).lean();

  const assignedCounterIds = new Set();
  let currentTableCounterIds = [];

  tableManagement.forEach((table) => {
    if (table.status == STATUS.DELETED) return;
    const isCurrentTable = tableId && table._id.toString() === tableId;
    if (isCurrentTable) {
      currentTableCounterIds = table.counterIds.map((id) => id.toString());
    } else {
      table.counterIds.forEach((counterId) => {
        assignedCounterIds.add(counterId.toString());
      });
    }
  });

  const counterList = await Counter.find({
    _id: { $nin: Array.from(assignedCounterIds) },
    entityId: entityId,
    status: STATUS.ACTIVE,
  });

  return counterList.map((counter) => ({
    ...counter.toObject(),
    isAssignedToCurrentTable: currentTableCounterIds.includes(
      counter._id.toString()
    ),
  }));
};

module.exports.getTables = async (req) => {
  const { entityId, userId } = req;

  const tables = await Tables.find({
    userId,
    entityId,
    status: STATUS.ACTIVE,
  })
    .populate({
      path: "counterIds",
      select: "counterName",
      model: "Counter",
    })
    .select("tableCount tableSectionName tableSetionNo counterIds")
    .sort({ createdAt: -1 });

  if (!tables) return [];

  return tables;
};

module.exports.editTable = async (req) => {
  const {
    tableId,
    action,
    tableSectionName,
    tableFrom,
    tableTo,
    counterIds,
    status,
  } = req.body;

  const lang = getLanguageFromRequest(req);
  let message = "";

  const tableData = await Tables.findById(tableId);
  if (!tableData) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_TABLE_NOT_FOUND", lang),
    });
  }

  if (action === EDIT_ACTION.EDIT) {
    if (tableSectionName !== undefined) {
      const duplicate = await Tables.findOne({
        entityId: tableData.entityId,
        tableSectionName,
        _id: { $ne: tableId },
        status: { $ne: STATUS.DELETED },
      });
      if (duplicate) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("OWNER_TABLE_NAME_EXISTS", lang),
        });
      }
      tableData.tableSectionName = tableSectionName;
    }

    if (counterIds !== undefined) {
      if (!Array.isArray(counterIds) || counterIds.length === 0) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("OWNER_COUNTER_IDS_REQUIRED", lang),
        });
      }
      tableData.counterIds = counterIds;
    }

    const currentFrom =
      Array.isArray(tableData.tableCount) && tableData.tableCount.length > 0
        ? Number(tableData.tableCount[0])
        : 0;

    const currentTo =
      Array.isArray(tableData.tableCount) && tableData.tableCount.length > 0
        ? Number(tableData.tableCount[tableData.tableCount.length - 1])
        : 0;

    const newFrom = tableFrom !== undefined ? Number(tableFrom) : currentFrom;
    const newTo = tableTo !== undefined ? Number(tableTo) : currentTo;

    if (newFrom >= newTo) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_TABLE_RANGE_INVALID", lang),
      });
    }

    let updatedTableCount;
    if (tableFrom !== undefined || tableTo !== undefined) {
      updatedTableCount = Array.from({ length: newTo - newFrom + 1 }, (_, i) =>
        String(newFrom + i)
      );
      tableData.tableCount = updatedTableCount;
    }

    const counterUpdate = {};
    if (tableSectionName !== undefined)
      counterUpdate.tableSectionName = tableData.tableSectionName;
    if (updatedTableCount !== undefined)
      counterUpdate.tableCount = updatedTableCount;

    if (Object.keys(counterUpdate).length > 0 && tableData.counterIds?.length) {
      await Counter.updateMany(
        { _id: { $in: tableData.counterIds } },
        { $set: counterUpdate }
      );
    }
    message = t("OWNER_TABLE_EDIT_SUCCESS", lang);
    io.to(tableData.entityId.toString()).emit("tableUpdate", { tableId });
    sendFirebaseNotification({
      topic: `owner_entity_${tableData.entityId}`,
      showNotification: false,
      title: "New Profile Updated",
      body: "You have a new table added. Tap to view.",
      data: {
        action: "table_update",
        screen: "table_screen",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `owner_entity_${tableData.entityId}`,
      },
    });

    // Send same notification to entity_ topic for customer app
    sendFirebaseNotification({
      topic: `entity_${tableData.entityId}`,
      showNotification: false,
      title: "New Profile Updated",
      body: "You have a new table added. Tap to view.",
      data: {
        action: "table_update",
        screen: "table_screen",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `entity_${tableData.entityId}`,
      },
    });
    await tableData.save();
  } else if (action === EDIT_ACTION.DELETE) {
    if (!Array.isArray(counterIds) || counterIds.length === 0) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_COUNTER_IDS_REQUIRED_FOR_DELETION", lang),
      });
    }

    const counters = await Counter.find({ _id: { $in: counterIds } });

    if (!counters.length) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_COUNTERS_NOT_FOUND", lang),
      });
    }

    const anyTableService = counters.some((counter) => counter.isTableService);

    if (anyTableService) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_TABLE_DELETE_COUNTERS_ACTIVE", lang),
      });
    }

    // Unlink counters from this table so they can be reassigned
    tableData.counterIds = tableData.counterIds.filter(
      (cId) => !counterIds.some((id) => id.toString() === cId.toString())
    );
    tableData.status = status;

    await tableData.save();

    // Socket emit to owner for real-time UI update
    io.to(tableData.entityId.toString()).emit("tableUpdate", {
      action: "delete",
      tableId: tableId,
      entityId: tableData.entityId.toString(),
    });
    // Send Firebase notification for table delete
    sendFirebaseNotification({
      topic: `owner_entity_${tableData.entityId}`,
      showNotification: false,
      title: "Table Deleted",
      body: "A table has been removed.",
      data: {
        action: "table_update",
        screen: "table_screen",
        tableId: tableId.toString(),
        entityId: tableData.entityId.toString(),
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `owner_entity_${tableData.entityId}`,
      },
    });

    // Send same notification to entity_ topic for customer app
    sendFirebaseNotification({
      topic: `entity_${tableData.entityId}`,
      showNotification: false,
      title: "Table Deleted",
      body: "A table has been removed.",
      data: {
        action: "table_update",
        screen: "table_screen",
        tableId: tableId.toString(),
        entityId: tableData.entityId.toString(),
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `entity_${tableData.entityId}`,
      },
    });

    message = t("OWNER_TABLE_DELETE_SUCCESS", lang);
  }
  return { message };
};

// module.exports.getUsersFeedback = async (req) => {
//   const {
//     entityId,
//     query: { from, to },
//   } = req;

//   let fromDate = from ? new Date(from) : null;
//   let toDate = to ? new Date(to) : null;
//   if (toDate) toDate.setHours(23, 59, 59, 999);

//   const dateFilter = {};
//   if (fromDate instanceof Date && !isNaN(fromDate)) {
//     dateFilter.$gte = fromDate;
//   }
//   if (toDate instanceof Date && !isNaN(toDate)) {
//     dateFilter.$lte = toDate;
//   }

//   const query = { entityId };
//   if (Object.keys(dateFilter).length) {
//     query.createdAt = dateFilter;
//   }

//   const feedbacks = await Feedbacks.find(query)
//     .populate({
//       path: "answers.questionId",
//       select: "question answerType",
//     })
//     .sort({ createdAt: -1 });

//   const feedbackStats = {};

//   const ratingValues = globalConstants.ANSWER_TYPES.RATING.map(String);
//   const feedbackValues = globalConstants.ANSWER_TYPES.FEEDBACK.map((v) =>
//     v.toUpperCase()
//   );
//   const booleanValues = globalConstants.ANSWER_TYPES.BOOLEAN.map((v) =>
//     v.toUpperCase()
//   );

//   for (const fb of feedbacks) {
//     for (const answer of fb.answers) {
//       const { value, questionId } = answer;
//       if (!value || !questionId) continue;

//       const valueStr =
//         typeof value === "string"
//           ? value.trim().toUpperCase()
//           : String(value).trim().toUpperCase();

//       const questionStats = feedbackStats[questionId._id] || {
//         question: questionId.question,
//         RATING: { total: 0, count: 0, values: {} },
//         FEEDBACK: { GOOD: 0, DECENT: 0, BAD: 0 },
//         BOOLEAN: { TRUE: 0, FALSE: 0, NEUTRAL: 0 },
//       };

//       if (ratingValues.includes(valueStr)) {
//         const ratingValue = parseInt(valueStr, 10);
//         if (!isNaN(ratingValue) && ratingValue >= 1 && ratingValue <= 10) {
//           questionStats.RATING.total += ratingValue;
//           questionStats.RATING.count += 1;
//           questionStats.RATING.values[ratingValue] =
//             (questionStats.RATING.values[ratingValue] || 0) + 1;
//         }
//       } else if (feedbackValues.includes(valueStr)) {
//         questionStats.FEEDBACK[valueStr] += 1;
//       } else if (booleanValues.includes(valueStr)) {
//         questionStats.BOOLEAN[valueStr] += 1;
//       }

//       feedbackStats[questionId._id] = questionStats;
//     }
//   }

//   const finalStats = {};
//   for (const questionId in feedbackStats) {
//     const stats = feedbackStats[questionId];

//     const totalAnswers =
//       stats.RATING.count +
//       stats.FEEDBACK.GOOD +
//       stats.FEEDBACK.DECENT +
//       stats.FEEDBACK.BAD +
//       stats.BOOLEAN.TRUE +
//       stats.BOOLEAN.FALSE +
//       stats.BOOLEAN.NEUTRAL;

//     if (totalAnswers === 0) continue;

//     const avgRating =
//       stats.RATING.count > 0
//         ? (stats.RATING.total / stats.RATING.count).toFixed(2)
//         : 0;

//     const distribution = {};
//     for (let i = 1; i <= 10; i++) {
//       const valCount = stats.RATING.values[i] || 0;
//       distribution[i] = stats.RATING.count
//         ? ((valCount / stats.RATING.count) * 100).toFixed(2) + "%"
//         : "0%";
//     }

//     const totalFeedbacks =
//       stats.FEEDBACK.GOOD + stats.FEEDBACK.DECENT + stats.FEEDBACK.BAD;
//     const feedbackStatsPercentage = {
//       GOOD: totalFeedbacks
//         ? ((stats.FEEDBACK.GOOD / totalFeedbacks) * 100).toFixed(2) + "%"
//         : "0%",
//       DECENT: totalFeedbacks
//         ? ((stats.FEEDBACK.DECENT / totalFeedbacks) * 100).toFixed(2) + "%"
//         : "0%",
//       BAD: totalFeedbacks
//         ? ((stats.FEEDBACK.BAD / totalFeedbacks) * 100).toFixed(2) + "%"
//         : "0%",
//     };

//     const totalBooleans =
//       stats.BOOLEAN.TRUE + stats.BOOLEAN.FALSE + stats.BOOLEAN.NEUTRAL;
//     const booleanStatsPercentage = {
//       TRUE: totalBooleans
//         ? ((stats.BOOLEAN.TRUE / totalBooleans) * 100).toFixed(2) + "%"
//         : "0%",
//       FALSE: totalBooleans
//         ? ((stats.BOOLEAN.FALSE / totalBooleans) * 100).toFixed(2) + "%"
//         : "0%",
//       NEUTRAL: totalBooleans
//         ? ((stats.BOOLEAN.NEUTRAL / totalBooleans) * 100).toFixed(2) + "%"
//         : "0%",
//     };

//     const type =
//       stats.RATING.count > 0
//         ? "RATING"
//         : stats.FEEDBACK.GOOD + stats.FEEDBACK.DECENT + stats.FEEDBACK.BAD > 0
//         ? "FEEDBACK"
//         : "BOOLEAN";

//     finalStats[questionId] = {
//       question: stats.question,
//       type,
//       RATING: {
//         average: avgRating,
//         distribution,
//       },
//       FEEDBACK: feedbackStatsPercentage,
//       BOOLEAN: booleanStatsPercentage,
//     };
//   }

//   return {
//     feedbacks,
//     feedbackStats: finalStats,
//   };
// };

module.exports.getUsersFeedback = async (req) => {
  const {
    entityId,
    query: { from, to, year, month },
  } = req;

  let fromDate = from ? new Date(from) : null;
  let toDate = to ? new Date(to) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  const dateFilter = {};
  if (fromDate instanceof Date && !isNaN(fromDate)) {
    dateFilter.$gte = fromDate;
  }
  if (toDate instanceof Date && !isNaN(toDate)) {
    dateFilter.$lte = toDate;
  }

  const query = { entityId };

  if (year && month) {
    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    startOfMonth.setHours(0, 0, 0, 0);
    endOfMonth.setHours(23, 59, 59);
    dateFilter.$gte = startOfMonth;
    dateFilter.$lte = endOfMonth;
  }

  if (Object.keys(dateFilter).length) {
    query.createdAt = dateFilter;
  }

  const feedbacks = await Feedbacks.find(query)
    .populate({
      path: "answers.questionId",
      select: "question answerType createdAt",
    })
    .sort({ createdAt: -1 });

  const totalReviews = feedbacks.length;

  const feedbackStats = {};

  const ratingValues = globalConstants.ANSWER_TYPES.RATING.map(String);
  const feedbackValues = globalConstants.ANSWER_TYPES.FEEDBACK.map((v) =>
    v.toUpperCase()
  );
  const booleanValues = globalConstants.ANSWER_TYPES.BOOLEAN.map((v) =>
    v.toUpperCase()
  );
  let yearMonth;

  for (const fb of feedbacks) {
    yearMonth = `${fb.createdAt.getFullYear()}-${fb.createdAt.getMonth() + 1}`;
    for (const answer of fb.answers) {
      const { value, questionId } = answer;
      if (!value || !questionId) continue;

      const valueStr =
        typeof value === "string"
          ? value.trim().toUpperCase()
          : String(value).trim().toUpperCase();

      if (!feedbackStats[yearMonth]) {
        feedbackStats[yearMonth] = {};
      }

      const questionStats = feedbackStats[yearMonth][questionId._id] || {
        question: questionId.question,
        createdAt: questionId.createdAt,
        RATING: { total: 0, count: 0, values: {} },
        FEEDBACK: { GOOD: 0, DECENT: 0, BAD: 0 },
        BOOLEAN: { TRUE: 0, FALSE: 0, NEUTRAL: 0 },
      };

      if (ratingValues.includes(valueStr)) {
        const ratingValue = parseInt(valueStr, 10);
        if (!isNaN(ratingValue) && ratingValue >= 1 && ratingValue <= 10) {
          questionStats.RATING.total += ratingValue;
          questionStats.RATING.count += 1;
          questionStats.RATING.values[ratingValue] =
            (questionStats.RATING.values[ratingValue] || 0) + 1;
        }
      } else if (feedbackValues.includes(valueStr)) {
        questionStats.FEEDBACK[valueStr] += 1;
      } else if (booleanValues.includes(valueStr)) {
        questionStats.BOOLEAN[valueStr] += 1;
      }

      feedbackStats[yearMonth][questionId._id] = questionStats;
    }
  }

  let finalStats = {};

  for (const yearMonth in feedbackStats) {
    const statsByMonth = feedbackStats[yearMonth];
    finalStats[yearMonth] = {};

    for (const questionId in statsByMonth) {
      const stats = statsByMonth[questionId];

      const totalAnswers =
        stats.RATING.count +
        stats.FEEDBACK.GOOD +
        stats.FEEDBACK.DECENT +
        stats.FEEDBACK.BAD +
        stats.BOOLEAN.TRUE +
        stats.BOOLEAN.FALSE +
        stats.BOOLEAN.NEUTRAL;

      if (totalAnswers === 0) continue;

      const avgRating =
        stats.RATING.count > 0
          ? (stats.RATING.total / stats.RATING.count).toFixed(2)
          : 0;

      const distribution = {};
      for (let i = 1; i <= 10; i++) {
        const valCount = stats.RATING.values[i] || 0;
        distribution[i] = stats.RATING.count
          ? ((valCount / stats.RATING.count) * 100).toFixed(2) + "%"
          : "0%";
      }

      const totalFeedbacks =
        stats.FEEDBACK.GOOD + stats.FEEDBACK.DECENT + stats.FEEDBACK.BAD;
      const feedbackStatsPercentage = {
        GOOD: totalFeedbacks
          ? ((stats.FEEDBACK.GOOD / totalFeedbacks) * 100).toFixed(2) + "%"
          : "0%",
        DECENT: totalFeedbacks
          ? ((stats.FEEDBACK.DECENT / totalFeedbacks) * 100).toFixed(2) + "%"
          : "0%",
        BAD: totalFeedbacks
          ? ((stats.FEEDBACK.BAD / totalFeedbacks) * 100).toFixed(2) + "%"
          : "0%",
      };

      const totalBooleans =
        stats.BOOLEAN.TRUE + stats.BOOLEAN.FALSE + stats.BOOLEAN.NEUTRAL;
      const booleanStatsPercentage = {
        TRUE: totalBooleans
          ? ((stats.BOOLEAN.TRUE / totalBooleans) * 100).toFixed(2) + "%"
          : "0%",
        FALSE: totalBooleans
          ? ((stats.BOOLEAN.FALSE / totalBooleans) * 100).toFixed(2) + "%"
          : "0%",
        NEUTRAL: totalBooleans
          ? ((stats.BOOLEAN.NEUTRAL / totalBooleans) * 100).toFixed(2) + "%"
          : "0%",
      };

      const type =
        stats.RATING.count > 0
          ? "RATING"
          : stats.FEEDBACK.GOOD + stats.FEEDBACK.DECENT + stats.FEEDBACK.BAD > 0
          ? "FEEDBACK"
          : "BOOLEAN";
      finalStats[yearMonth][questionId] = {
        question: stats.question,
        type,
        createdAt: stats.createdAt,
        RATING: {
          average: avgRating,
          distribution,
        },
        FEEDBACK: feedbackStatsPercentage,
        BOOLEAN: booleanStatsPercentage,
      };
    }
  }

  const feedbackQuestions = await FeedbackQuestions.find({
    entityId: req.entityId,
  });

  if (feedbackQuestions.length) {
    let firstMonthKey;
    let monthStats;

    if (Object.keys(finalStats).length === 0) {
      // You need to define yearMonth (maybe from req.query or current month)
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${now.getMonth() + 1}`; // e.g., "2025-4"

      firstMonthKey = yearMonth;
      finalStats = {
        [firstMonthKey]: {},
      };
      monthStats = finalStats[firstMonthKey];
    } else {
      [firstMonthKey, monthStats] = Object.entries(finalStats)[0];
    }

    feedbackQuestions.forEach((feedbackQuestion) => {
      if (!monthStats[feedbackQuestion._id]) {
        monthStats[feedbackQuestion._id] = {
          question: feedbackQuestion.question,
          type: "NO_DATA",
          createdAt: feedbackQuestion.createdAt,
          RATING: {
            average: 0,
            distribution: {
              1: "0%",
              2: "0%",
              3: "0%",
              4: "0%",
              5: "0%",
              6: "0%",
              7: "0%",
              8: "0%",
              9: "0%",
              10: "0%",
            },
          },
          FEEDBACK: {
            GOOD: "0%",
            DECENT: "0%",
            BAD: "0%",
          },
          BOOLEAN: {
            TRUE: "0%",
            FALSE: "0%",
            NEUTRAL: "0%",
          },
        };
      }
    });
  }

  // console.log({ finalStats });
  // if (finalStats && finalStats[0]) {
  //   const [firstMonthKey, monthStats] = Object.entries(finalStats)[0];
  //   console.log({ mm: monthStats, firstMonthKey });
  //   feedbackQuestions.forEach((feedbackQuestion) => {
  //     if (!monthStats[feedbackQuestion._id]) {
  //       // finalStats[firstMonthKey]
  //       finalStats[firstMonthKey][feedbackQuestion._id] = {
  //         question: feedbackQuestion.question,
  //         type: "NO_DATA",
  //         createdAt: feedbackQuestion.createdAt,
  //         RATING: {
  //           average: 0,
  //           distribution: {
  //             1: "0%",
  //             2: "0%",
  //             3: "0%",
  //             4: "0%",
  //             5: "0%",
  //             6: "0%",
  //             7: "0%",
  //             8: "0%",
  //             9: "0%",
  //             10: "0%",
  //           },
  //         },
  //         FEEDBACK: {
  //           GOOD: "0%",
  //           DECENT: "0%",
  //           BAD: "0%",
  //         },
  //         BOOLEAN: {
  //           TRUE: "0%",
  //           FALSE: "0%",
  //           NEUTRAL: "0%",
  //         },
  //       };
  //     }
  //   });
  // }

  return {
    // feedbacks,
    feedbackStats: finalStats,
    totalReviews,
  };
};

module.exports.addFeedbackQuestions = async (req) => {
  const { entityId, userId, body } = req;
  const lang = getLanguageFromRequest(req);

  if (!body) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_FEEDBACK_BODY_REQUIRED", lang),
    });
  }

  const { question, answerType, comment } = body;

  if (!ALL_ANSWER_TYPES || !Array.isArray(ALL_ANSWER_TYPES)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_FEEDBACK_ANSWER_TYPES_UNAVAILABLE", lang),
    });
  }

  if (!Array.isArray(answerType)) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_FEEDBACK_INVALID_ANSWER_TYPE", lang),
    });
  }

  const invalidAnswers = answerType.filter(
    (ans) => !ALL_ANSWER_TYPES.includes(ans)
  );
  if (invalidAnswers.length > 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_FEEDBACK_INVALID_ANSWER_VALUES", lang, {
        values: invalidAnswers.join(", "),
        allowedValues: ALL_ANSWER_TYPES.join(", "),
      }),
    });
  }

  const existingQuestion = await FeedbackQuestions.findOne({
    entityId,
    question: question.trim(),
  });
  if (existingQuestion) {
    throwError({
      status: STATUS_CODES.CONFLICT,
      message: t("OWNER_FEEDBACK_QUESTION_EXISTS", lang),
    });
  }

  const questionCount = await FeedbackQuestions.countDocuments({ entityId });
  if (questionCount >= 5) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_FEEDBACK_MAX_LIMIT", lang),
    });
  }

  const feedback = await FeedbackQuestions.create({
    userId,
    entityId,
    question: question.trim(),
    answerType,
    comment,
  });
  io.to(entityId.toString()).emit("newFeedbackQuestions", feedback);
  sendFirebaseNotification({
    topic: `owner_entity_${entityId}`,
    showNotification: false,
    title: "New Profile Updated",
    body: "You have a new feedback added. Tap to view.",
    data: {
      action: "feedback_update",
      screen: "feedback_screen",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${entityId}`,
    },
  });

  return feedback;
};

// module.exports.deleteFeedbackQuestions = async (req) => {
//   const { questionId, feedbackId } = req.body;

//   if (questionId) {
//     const question = await FeedbackQuestions.findOne({ _id: questionId });
//     if (!question) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "Question not found.",
//       });
//     }

//     await FeedbackQuestions.deleteOne({ _id: questionId });
//   }

//   if (feedbackId) {
//     const feedback = await Feedbacks.findOne({ _id: feedbackId });
//     if (!feedback) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "Feedback not found.",
//       });
//     }

//     await Feedbacks.deleteOne({ _id: feedbackId });
//   }

//   if (!questionId && !feedbackId) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "At least one of questionId or feedbackId is required.",
//     });
//   }
// };

module.exports.deleteFeedbackQuestions = async (req) => {
  const { questionId } = req.body;
  const lang = getLanguageFromRequest(req);

  if (!questionId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_FEEDBACK_QUESTION_ID_REQUIRED", lang),
    });
  }

  const question = await FeedbackQuestions.findOne({ _id: questionId });
  if (!question) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_FEEDBACK_QUESTION_NOT_FOUND", lang),
    });
  }

  const entityId = question.entityId;

  await FeedbackQuestions.deleteOne({ _id: questionId });

  await Feedbacks.updateMany(
    { "answers.questionId": questionId },
    { $pull: { answers: { questionId } } }
  );

  // Socket emit to owner for real-time UI update
  io.to(entityId.toString()).emit("feedbackQuestionsUpdate", {
    action: "delete",
    questionId: questionId.toString(),
    entityId: entityId.toString(),
  });
  // Send Firebase notification for feedback question delete
  sendFirebaseNotification({
    topic: `owner_entity_${entityId}`,
    showNotification: false,
    title: "Feedback Question Deleted",
    body: "A feedback question has been removed.",
    data: {
      action: "feedback_delete",
      screen: "feedback_screen",
      questionId: questionId.toString(),
      entityId: entityId.toString(),
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${entityId}`,
    },
  });
};

module.exports.restaurantOpen = async (req) => {
  const {
    entityId,
    body: { isOpen },
  } = req;
  const lang = getLanguageFromRequest(req);
  const restaurant = await EntityDetails.findById(entityId);
  if (!restaurant) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ENTITY_NOT_FOUND", lang),
    });
  }
  if (!isOpen) {
    const activeOrders = await Order.countDocuments({
      entityId,
      status: {
        $nin: [
          globalConstants.ORDER_STATUS.COMPLETED,
          globalConstants.ORDER_STATUS.CANCELLED,
          globalConstants.ORDER_STATUS.PAYMENT_FAILED,
        ],
      },
    });

    if (activeOrders > 0) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("OWNER_RESTAURANT_CLOSE_ACTIVE_ORDERS", lang),
      });
    }
  }
  await EntityDetails.updateOne({ _id: entityId }, { $set: { isOpen } });
};

module.exports.emailExist = async (req) => {
  const { email, contactNumber, countrTag } = req.body;

  const query = {
    status: STATUS.ACTIVE,
  };

  if (email) {
    query.email = email;
    const users = await User.find(query).lean();

    const emailExist = users.some(
      (u) => u.role === globalConstants.ROLES.STORE_OWNER
    );

    return {
      emailExist,
    };
  }

  if (contactNumber) {
    query.contactNumber = contactNumber;
    const users = await User.find(query).lean();
    const phoneExist = users.some(
      (u) => u.role === globalConstants.ROLES.STORE_OWNER
    );

    return {
      phoneExist,
    };
  }

  if (countrTag) {
    query.countrTag = countrTag;
    query.role = globalConstants.ROLES.CUSTOMER;
    const exists = await User.exists(query);
    return { countrTagExists: !!exists };
  }

  return {};
};

module.exports.deleteEntityAccount = async (req) => {
  const { entityId, userId } = req;
  const lang = getLanguageFromRequest(req);

  const entity = await EntityDetails.findOne({ _id: entityId, userId }).lean();
  if (!entity) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("OWNER_ENTITY_NOT_ASSOCIATED", lang),
    });
  }

  // Check for active orders (online + offline)
  const [activeOrder, activeOfflineOrder] = await Promise.all([
    Order.findOne({
      entityId,
      status: {
        $in: [
          ORDER_STATUS.WAITING,
          ORDER_STATUS.IN_PROGRESS,
          ORDER_STATUS.READY,
        ],
      },
    }),
    OfflineOrder.findOne({
      entityId,
      status: {
        $in: [
          ORDER_STATUS.WAITING,
          ORDER_STATUS.IN_PROGRESS,
          ORDER_STATUS.READY,
        ],
      },
    }),
  ]);

  if (activeOrder || activeOfflineOrder) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("CANNOT_DELETE_ACCOUNT_ACTIVE_ORDERS", lang),
    });
  }

  // Delete all owner/entity-related data in parallel
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
      }
    ),
    // Update entity: set status to DELETED
    EntityDetails.updateOne(
      { _id: entityId },
      {
        $set: {
          status: STATUS.DELETED,
        },
      }
    ),
    // Delete entity-related operational data
    Counter.deleteMany({ entityId }),
    MenuCategory.deleteMany({ entityId }),
    MenuItem.deleteMany({ entityId }),
    ItemDetails.deleteMany({ entityId }),
    Tables.deleteMany({ entityId }),
    Event.deleteMany({ entityId }),
    Discount.deleteMany({ entityId }),
    // Delete feedback and survey data
    FeedbackQuestions.deleteMany({ entityId }),
    Feedbacks.deleteMany({ entityId }),
    OwnerAppFeedback.deleteMany({ userId }),
    FeedbackAppQuestion.deleteMany({ userId }),
    // Delete order and reporting data
    Order.deleteMany({ entityId }),
    OfflineOrder.deleteMany({ entityId }),
    SalesReport.deleteMany({ entityId }),
    CustomerOrderReport.deleteMany({ entityId }),
    // Delete search logs
    ItemSearchLogs.deleteMany({ entityId }),
    searchLogs.deleteMany({ entityId }),
    // Delete user-related data
    notificationSettings.deleteMany({ userId }),
    Cards.deleteMany({ userId }),
    Location.deleteMany({ userId }),
    FavouriteEntity.deleteMany({ userId }),
    FavouriteItem.deleteMany({ userId }),
    CountRTags.deleteMany({ userId }),
    UserAppFeedback.deleteMany({ userId }),
    Otp.deleteMany({ userId }),
    StripePayment.deleteMany({ userId }),
    // Clear Redis token if exists
    redisClient.del(`${KEY_TYPE_PREFIXES.USER_TOKEN}:${userId}`),
  ]);
};

module.exports.createItemSearchLogs = async (req) => {
  const {
    entityId,
    body: { itemId },
  } = req;

  const existingLog = await ItemSearchLogs.findOne({ itemId });

  if (existingLog) {
    return ItemSearchLogs.updateOne(
      { _id: existingLog._id },
      { $set: { createdAt: new Date(), isRemoved: false } }
    );
  }

  return ItemSearchLogs.create({ itemId, entityId });
};

module.exports.getItemsSearchLogs = async (req) => {
  const { entityId } = req;
  const logs = await ItemSearchLogs.find({ entityId, isRemoved: false })
    .sort({ createdAt: -1 })
    .populate({
      path: "itemId",
      select: "itemName image menuCategoryId",
      model: "ItemDetails",
      populate: {
        path: "menuCategoryId",
        select: "categoryName",
        model: "CounterMenuCategory",
      },
    });

  logs.map((items) => {
    if (!items.itemId || !items.itemId.image) {
      return items;
    }
    items.itemId.image = generatePresignedUrl(items.itemId.image);
    return items;
  });

  return logs;
};

exports.removeSearchLogs = async (req) => {
  const {
    entityId,
    body: { itemId, isRemoved },
  } = req;
  const lang = getLanguageFromRequest(req);

  const logs = await ItemSearchLogs.findOne({
    itemId,
    entityId,
    isRemoved: false,
  });
  if (!logs) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("LOGS_NOT_FOUND", lang),
    });
  }
  if (isRemoved) logs.isRemoved = isRemoved;

  return logs.save();
};

module.exports.restaurantCancelOrder = async (req) => {
  const { orderId } = req.body;
  const lang = getLanguageFromRequest(req);

  const order = await Order.findOne({
    _id: orderId,
    entityId: req.entityId,
    status: { $in: [globalConstants.ORDER_STATUS.WAITING] },
  });

  if (!order) {
    throwError({
      status: STATUS_CODES.NOT_ACCEPTABLE,
      message: t("ORDER_NOT_FOUND", lang),
    });
  }

  if (
    [
      globalConstants.ORDER_STATUS.IN_PROGRESS,
      globalConstants.ORDER_STATUS.READY,
      globalConstants.ORDER_STATUS.COMPLETED,
      globalConstants.ORDER_STATUS.CANCELLED,
    ].includes(order.status)
  ) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ORDER_CANNOT_CANCEL", lang),
    });
  }

  await Order.updateOne(
    { _id: orderId },
    { $set: { status: globalConstants.ORDER_STATUS.CANCELLED } }
  );

  io.to(order.entityId.toString()).emit("cancelOrder", {
    orderId: order._id,
    status: globalConstants.ORDER_STATUS.CANCELLED,
  });
  emitOrderUpdated(order, globalConstants.ORDER_STATUS.CANCELLED);

  // Send Firebase notification to the user who placed the order

  console.log({ order_details: order });
  sendFirebaseNotification({
    topic: `user_${order.userId}`,
    showNotification: true,
    alertSound: true,
    title: "Order Cancelled",
    body: `Your order #${order.tokenNumber} has been cancelled by the restaurant.`,
    data: {
      orderId: order._id.toString(),
      status: globalConstants.ORDER_STATUS.CANCELLED,
      entityId: order.entityId.toString(),
      tokenNumber: order.tokenNumber?.toString() || "",
      finalAmount: order.finalAmount?.toString() || "",
      action: "order_cancelled",
      screen: "order_details",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `user_${order.userId}`,
    },
  });

  sendFirebaseNotification({
    topic: `owner_entity_${order.entityId}`,
    showNotification: true,
    title: "New Cancel Order",
    body: "You have a new cancel added. Tap to view.",
    data: {
      action: "cancel_update",
      screen: "cancel_screen",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      topic: `owner_entity_${order.entityId}`,
    },
  });
};

module.exports.getSalesReportHistory = async (req) => {
  const { userId } = req;

  const history = await SalesReport.find({ userId }).sort({ createdAt: -1 });

  if (!history || history.length === 0) return [];

  const enrichedHistory = history.map((item) => {
    const url = generatePresignedUrl(`reports/${userId}/${item.filename}`);
    return {
      ...item.toObject(),
      url,
    };
  });

  return enrichedHistory;
};

module.exports.downloadSalesReport = async (req, res) => {
  try {
    const { key } = req.query;
    const url = generatePresignedUrl(key);
    return { url };
  } catch (error) {
    throw new Error("Failed to generate presigned URL");
  }
};

module.exports.ownerAppFeedback = async (req) => {
  const userId = req.userId || req.id;
  const { answers } = req.body;
  const lang = getLanguageFromRequest(req);

  if (!userId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("USER_NOT_AUTHENTICATED", lang),
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("USER_DOES_NOT_EXIST", lang),
    });
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("FEEDBACK_ANSWERS_REQUIRED", lang),
    });
  }

  for (const answer of answers) {
    if (!answer.questionId || answer.answer === undefined) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FEEDBACK_INVALID_ANSWER", lang),
      });
    }
    // Validate questionId exists in hardcoded questions (check both arrays since IDs are the same)
    const question =
      OWNER_APP_FEEDBACK_QUESTIONS.find((q) => q.id === answer.questionId) ||
      APP_FEEDBACK_QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FEEDBACK_QUESTION_NOT_FOUND", lang),
      });
    }
    // Validate answer type (must be number or string)
    if (
      typeof answer.answer !== "number" &&
      typeof answer.answer !== "string"
    ) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FEEDBACK_INVALID_ANSWER_TYPE", lang),
      });
    }
  }

  const feedbackObj = {
    userId,
    answers,
  };

  const feedbackFromUser = await OwnerAppFeedback.create(feedbackObj);
  return feedbackFromUser;
};

module.exports.getFeedbackAppQuestions = async (req) => {
  const userId = req.userId || req.id;
  const lang = getLanguageFromRequest(req);

  if (!userId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("USER_NOT_AUTHENTICATED", lang),
    });
  }

  // Return translated questions based on user's language (using owner-specific order)
  const translatedQuestions = OWNER_APP_FEEDBACK_QUESTIONS.map((question) => {
    const questionNumber = question.id.replace("appFeedback", "");
    // Use owner-specific translation keys (app_feedback_owner_q1, etc.) for questions 1-3
    // Question 4 is shared between customer and owner
    const translationKey =
      questionNumber === "4"
        ? `app_feedback_q${questionNumber}`
        : `app_feedback_owner_q${questionNumber}`;

    const result = {
      id: question.id,
      question: t(translationKey, lang),
      answerType: question.answerType,
    };

    // Add translated options for FRIENDLY answer type
    if (question.answerType === "FRIENDLY" && ANSWER_TYPES.FRIENDLY) {
      result.options = ANSWER_TYPES.FRIENDLY.map((option) => {
        const translatedValue = t(option, lang);
        return {
          value: translatedValue, // Use translated value for submission
          label: translatedValue, // Use translated value for display
        };
      });
    }

    return result;
  });

  return translatedQuestions;
};

module.exports.getOwnerAppFeedbackAnswers = async (req) => {
  const userId = req.userId || req.id;
  const lang = getLanguageFromRequest(req);

  if (!userId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("USER_NOT_AUTHENTICATED", lang),
    });
  }

  // Find the most recent feedback submission from this owner
  const ownerFeedback = await OwnerAppFeedback.findOne({ userId })
    .sort({ createdAt: -1 })
    .lean();

  if (!ownerFeedback) {
    return null;
  }

  // Translate answers to current user language
  const translatedAnswers = ownerFeedback.answers.map((answer) => {
    const question =
      OWNER_APP_FEEDBACK_QUESTIONS.find((q) => q.id === answer.questionId) ||
      APP_FEEDBACK_QUESTIONS.find((q) => q.id === answer.questionId);

    // For FRIENDLY type answers, check if the answer is a translatable option
    if (question && question.answerType === "FRIENDLY") {
      // Check if answer exists in any language's FRIENDLY options
      const isTranslatableOption = ANSWER_TYPES.FRIENDLY.some(
        (option) =>
          t(option, "en") === answer.answer || t(option, "de") === answer.answer
      );

      if (isTranslatableOption) {
        // Find the original English key
        let originalKey = answer.answer;
        for (const option of ANSWER_TYPES.FRIENDLY) {
          if (
            t(option, "en") === answer.answer ||
            t(option, "de") === answer.answer
          ) {
            originalKey = option;
            break;
          }
        }
        // Translate to current language
        return {
          questionId: answer.questionId,
          answer: t(originalKey, lang),
        };
      }
    }

    // Return as-is for other types or non-translatable strings
    return answer;
  });

  return {
    feedbackId: ownerFeedback._id,
    submittedAt: ownerFeedback.createdAt,
    answers: translatedAnswers,
  };
};
