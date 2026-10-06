const express = require("express");
const router = express.Router();
const { STATUS_CODES, ROLES, STATUS } = require("../../Utils/globalConstants");
const {
  getUpcomingEvents,
  getEventsByMonthAndYear,
  createMenuItem,
  getCreatedItems,
  createCounter,
  createCounterMenuCategory,
  getMenuCategory,
  getMenuCategoryItems,
  getCounterMenuQuantites,
  updateCounterSettings,
  getCounterSettings,
  createEvent,
  getParticularItemDetail,
  updateMenuItem,
  getDistinctMonthsOfYear,
  getMonthlyEventDetails,
  getOngoingEventDetails,
  getDistinctYears,
  createItems,
  getOrderDetailsOfEvents,
  createDiscountCoupon,
  getDiscountCoupon,
  editBusinessDetails,
  getBusinessUserDetails,
  addingTables,
  getTables,
  getUsersFeedback,
  addFeedbackQuestions,
  getCounters,
  emailExist,
  restaurantOpen,
  deleteEntityAccount,
  createItemSearchLogs,
  getItemsSearchLogs,
  editMobileBusinessDetails,
  removeSearchLogs,
  editTable,
  getCountersForTableManagement,
  getCountersForEvents,
  deleteFeedbackQuestions,
  getCounterAndCategory,
  restaurantCancelOrder,
  downloadSalesReport,
  getSalesReportHistory,
  editCategory,
  deleteEvent,
  editEvent,
  getDateWiseEventDetails,
  ownerAppFeedback,
  getFeedbackAppQuestions,
  getOwnerAppFeedbackAnswers,
} = require("./service");
const verifyToken = require("../../Utils/verifyToken");
const Counter = require("../../Models/Counter");
const multer = require("multer");
const ItemDetails = require("../../Models/ItemDetails");
const MenuItem = require("../../Models/MenuItem");
const { addExistingItemToMenu } = require("../Customer/service");
const MenuCategory = require("../../Models/MenuCategory");
// const { client } = require("../../Utils/bullQueue");
const { scheduleEmit } = require("../../Utils/emitQueue");
const client = require("../../redis");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { t, getLanguageFromRequest } = require("../../Utils/translator");
// router.use(verifyToken);
// router.use((req, res, next) => {
//   if (req.role != ROLES.STORE_OWNER) {
//     return res
//       .status(STATUS_CODES.NOT_AUTHORIZED)
//       .json({ message: "Only Owner can perform this action" });
//   }
//   return next();
// });

router.post("/create-counter", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await createCounter(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_COUNTER_CREATE_SUCCESS", lang, {
        counterName: response.counterName,
      }),
      data: response.counterName,
    });
  } catch (error) {
    console.error("Error while creating counter", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_COUNTER_CREATE_ERROR", lang),
    });
  }
});

router.post("/add-existing-item-to-menu", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await addExistingItemToMenu(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_ITEM_ADD_TO_CATEGORY_SUCCESS", lang),
    });
  } catch (error) {
    console.error("Error while adding item to category", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_ITEM_ADD_TO_CATEGORY_ERROR", lang),
    });
  }
});

router.post("/create-counter-menu-category", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await createCounterMenuCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_CATEGORY_CREATE_SUCCESS", lang),
      data: response,
    });
  } catch (error) {
    console.error("Error while creating counter category", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_CATEGORY_CREATE_ERROR", lang),
    });
  }
});

router.get("/get-counter", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const counter = await getCounters(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_COUNTER_FETCH_SUCCESS", lang),
      data: counter,
    });
  } catch (error) {
    console.error("Error while getting counters:", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_COUNTER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-menu-category", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const menuCategory = await getMenuCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_MENU_CATEGORY_FETCH_SUCCESS", lang),
      data: menuCategory,
    });
  } catch (error) {
    console.error("Error while fetching menu category", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_MENU_CATEGORY_FETCH_ERROR", lang),
    });
  }
});

router.post("/edit-category", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const message = await editCategory(req);
    return res.status(STATUS_CODES.OK).json({ message });
  } catch (error) {
    console.error("Error while updating category", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_CATEGORY_UPDATE_ERROR", lang),
    });
  }
});

router.get("/get-counter-and-category-list", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { filteredCategories, counters } = await getCounterAndCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_MENU_CATEGORY_FETCH_SUCCESS", lang),
      filteredCategories,
      counterDetails: counters,
    });
  } catch (error) {
    console.error("Error while fetching menu category", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_MENU_CATEGORY_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-menu-category-items", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const menuCategoryItems = await getMenuCategoryItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_MENU_ITEMS_FETCH_SUCCESS", lang),
      menuCategoryItems,
    });
  } catch (error) {
    console.error("Error while fetching menu items", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_MENU_ITEMS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-order-details-of-events", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const orderDetailsOfEvents = await getOrderDetailsOfEvents(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_ORDER_DETAILS_FETCH_SUCCESS", lang),
      orderDetailsOfEvents,
    });
  } catch (error) {
    console.error("Error while fetching order details", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_ORDER_DETAILS_FETCH_ERROR", lang),
    });
  }
});

router.post("/create-menu-items", upload.single("file"), async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const newItem = await createMenuItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_MENU_ITEM_CREATE_SUCCESS", lang),
      data: newItem,
    });
  } catch (error) {
    console.error("Error while creating items: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_MENU_ITEM_CREATE_ERROR", lang),
    });
  }
});

// router.post("/create-items", upload.single("file"), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(STATUS_CODES.BAD_REQUEST).send("No file uploaded.");
//     }
//     const newItem = await createItems(req);
//     return res.status(STATUS_CODES.OK).json({
//       message: "Item created successfully",
//       data: newItem,
//     });
//   } catch (error) {
//     console.error("Error while creating items: ", error);
//     return res
//       .status(error.status || 500)
//       .json({ message: error.message || "Error while creating items:" });
//   }
// });

router.get("/get-entity-items", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await getCreatedItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_ENTITY_ITEMS_FETCH_SUCCESS", lang),
      data: response,
    });
  } catch (error) {
    console.error("Error while getting items: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_ENTITY_ITEMS_FETCH_ERROR", lang),
    });
  }
});

router.post("/update-menu-item", upload.single("file"), async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await updateMenuItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_MENU_ITEM_UPDATE_SUCCESS", lang),
    });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_MENU_ITEM_UPDATE_ERROR", lang),
    });
  }
});

router.get("/update-entity-items", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const itemsId = await ItemDetails.find({ entityId: req.entityId }).lean();

    for (const item of itemsId) {
      await MenuItem.updateOne(
        { _id: item.itemId }, // Filter by itemId
        { $set: { price: item.price, currency: "CHF" } }
      );
    }
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ENTITY_ITEMS_UPDATE_SUCCESS", lang) });
  } catch (error) {
    console.log({ error });
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_ENTITY_ITEMS_UPDATE_ERROR", lang),
    });
  }
});

router.get("/get-menu-particular-item", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await getParticularItemDetail(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_ITEM_DETAILS_FETCH_SUCCESS", lang),
      particularItemDetails: response,
    });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_ITEM_DETAILS_FETCH_ERROR", lang),
    });
  }
});

router.post("/create-event", upload.single("file"), async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await createEvent(req);
    console.log(`Event created: ${response.eventName} at ${response.from}`);

    const redisKey = `upcoming_event:${response._id}`;
    await client.set(redisKey, JSON.stringify(response), "EX", 86400); // 24 hours TTL

    console.log(`Cached event with key: ${redisKey}`);

    // Schedule emit job
    scheduleEmit(response);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_EVENT_CREATE_SUCCESS", lang),
      data: response,
    });
  } catch (error) {
    console.error({ error, message: "Error occured in create event" });
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_EVENT_CREATE_ERROR", lang),
    });
  }
});

router.post("/delete-event", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await deleteEvent(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_EVENT_DELETE_SUCCESS", lang) });
  } catch (error) {
    console.error({ error, message: "Error occured in deleting event" });
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_EVENT_DELETE_ERROR", lang),
    });
  }
});
router.post("/edit-event", upload.single("file"), async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await editEvent(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("EVENT_UPDATE_SUCCESS", lang) });
  } catch (error) {
    console.error({ error, message: "Error occured in updating event" });
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("EVENT_UPDATE_ERROR", lang),
    });
  }
});

router.get("/get-upcoming-events", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const upcomingEvents = await getUpcomingEvents(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_UPCOMING_EVENTS_FETCH_SUCCESS", lang),
      upcomingEvents,
    });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_UPCOMING_EVENTS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-past-events-years", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const pastEventsYear = await getDistinctYears(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_PAST_EVENTS_YEARS_FETCH_SUCCESS", lang),
      pastEventsYear,
    });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_PAST_EVENTS_YEARS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-past-events-year-month", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const pastEventsMonths = await getDistinctMonthsOfYear(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_PAST_EVENTS_MONTHS_FETCH_SUCCESS", lang),
      pastEventsMonths,
    });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_PAST_EVENTS_MONTHS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-past-events-by-month", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await getEventsByMonthAndYear(req);

    // if (!response.length) {
    //   return res
    //     .status(STATUS_CODES.OK)
    //     .json({ message: `No events found for ${month}/${year}` });
    // }
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_PAST_EVENTS_FETCH_SUCCESS", lang),
      data: response,
    });
  } catch (error) {
    console.error("Error while getting past events:", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_PAST_EVENTS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-event-details-monthly", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const monthlyEventDetails = await getMonthlyEventDetails(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_MONTHLY_EVENT_DETAILS_FETCH_SUCCESS", lang),
      monthlyEventDetails,
    });
  } catch (error) {
    console.error("Error occured while fetching the monthly event details");
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message || t("OWNER_MONTHLY_EVENT_DETAILS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-ongoing-event-details", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const ongoingEventDetails = await getOngoingEventDetails(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_ONGOING_EVENTS_FETCH_SUCCESS", lang),
      ongoingEventDetails,
    });
  } catch (error) {
    console.error("Error occured in ongoing event details", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_ONGOING_EVENTS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-counter-list-quantity", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const counterListQuantity = await getCounterMenuQuantites(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_COUNTER_QUANTITY_FETCH_SUCCESS", lang),
      counterListQuantity,
    });
  } catch (error) {
    console.error("Error occured while fetching counter list quantity", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_COUNTER_QUANTITY_FETCH_ERROR", lang),
    });
  }
});

router.post("/update-counter-settings", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const counterSettings = await updateCounterSettings(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_COUNTER_UPDATE_SUCCESS", lang),
      counterSettings,
    });
  } catch (error) {
    console.error("Error occured while fetching counter list quantity", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_COUNTER_UPDATE_ERROR", lang),
    });
  }
});

router.get("/get-counter-settings", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const counterSettings = await getCounterSettings(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_COUNTER_SETTINGS_FETCH_SUCCESS", lang),
      counterSettings,
    });
  } catch (error) {
    console.error("Error occured while fetching counter list quantity", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_COUNTER_SETTINGS_FETCH_ERROR", lang),
    });
  }
});

router.post("/create-discount-coupon", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await createDiscountCoupon(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_DISCOUNT_CREATE_SUCCESS", lang),
    });
  } catch (error) {
    console.error("Error occured while creating discount coupon", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_DISCOUNT_CREATE_ERROR", lang),
    });
  }
});

router.post("/get-discount-coupons", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await getDiscountCoupon(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_DISCOUNT_FETCH_SUCCESS", lang),
    });
  } catch (error) {
    console.error("Error occured while fetching discount coupons", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_DISCOUNT_FETCH_ERROR", lang),
    });
  }
});

// const mongoose = require("mongoose");
// const express = require("express");
// const router = express.Router();
// const MenuCategory = require("../models/MenuCategory");
// const ItemDetails = require("../models/ItemDetails");

router.get("/get-counters-by-name", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const {
      entityId,
      query: { categoryName, itemName },
    } = req;

    if (!categoryName) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: t("OWNER_CATEGORY_NAME_REQUIRED", lang),
      });
    }

    if (!itemName) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: t("OWNER_ITEM_NAME_REQUIRED", lang),
      });
    }

    const menuCategories = await MenuCategory.find({ categoryName, entityId })
      .populate({
        path: "counterId",
        select: "counterName status",
      })
      .lean();

    if (!menuCategories.length) {
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: t("OWNER_MENU_CATEGORY_NAME_NOT_FOUND", lang),
      });
    }

    const menuCategoryIds = menuCategories.map((cat) => cat._id);

    const existingItems = await ItemDetails.find({
      menuCategoryId: { $in: menuCategoryIds },
      itemName,
    }).select("menuCategoryId");

    const menuCategoryIdsWithItem = new Set(
      existingItems.map((item) => item.menuCategoryId.toString())
    );

    // Filter and deduplicate counters
    const seenCounterIds = new Set();
    const filteredCounters = [];

    for (const cat of menuCategories) {
      const counter = cat.counterId;
      if (
        counter &&
        counter.status === STATUS.ACTIVE &&
        !menuCategoryIdsWithItem.has(cat._id.toString()) &&
        !seenCounterIds.has(counter._id.toString())
      ) {
        seenCounterIds.add(counter._id.toString());
        filteredCounters.push({
          counterId: counter._id.toString(),
          counterName: counter.counterName,
        });
      }
    }

    return res.status(STATUS_CODES.OK).json({ counters: filteredCounters });
  } catch (error) {
    console.error("Error fetching counters by category name:", error);
    res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_COUNTER_FETCH_ERROR_GENERIC", lang),
    });
  }
});

// router.post(
//   "/edit-business-details",
//   upload.single("file"),
//   async (req, res) => {
//     try {
//       await editBusinessDetails(req);
//       return res
//         .status(STATUS_CODES.OK)
//         .json({ message: "Business details updated successfully." });
//     } catch (error) {
//       console.error("Error while updating the details", error);
//       return res
//         .status(STATUS_CODES.SERVER_ERROR)
//         .json({ message: error.message });
//     }
//   }
// );

router.post(
  "/edit-business-details",
  upload.single("file"),
  async (req, res) => {
    const lang = getLanguageFromRequest(req);
    try {
      const message = await editBusinessDetails(req);
      return res
        .status(STATUS_CODES.OK)
        .json(
          message?.message
            ? message
            : { message: t("OWNER_BUSINESS_DETAILS_UPDATE_SUCCESS", lang) }
        );
    } catch (error) {
      console.error("Error while updating the details", error);
      return res.status(STATUS_CODES.SERVER_ERROR).json({
        message:
          error.message || t("OWNER_BUSINESS_DETAILS_UPDATE_ERROR", lang),
      });
    }
  }
);

router.get("/get-business-user-details", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await getBusinessUserDetails(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_BUSINESS_DETAILS_FETCH_SUCCESS", lang),
      response,
    });
  } catch (error) {
    console.error("Error while updating the details", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_BUSINESS_DETAILS_FETCH_ERROR", lang),
    });
  }
});

router.post("/adding-tables", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await addingTables(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_TABLES_ADD_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while adding the tables details", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_TABLES_ADD_ERROR", lang),
    });
  }
});

router.get("/get-remaining-counter-for-tables", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getCountersForTableManagement(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_COUNTER_FETCH_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetching the Counter list", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_COUNTER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-remaining-counter-for-tables", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getCountersForTableManagement(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_COUNTER_FETCH_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetching the Counter list", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_COUNTER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-counters-for-event", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getCountersForEvents(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_COUNTER_FETCH_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetching the Counter list", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_COUNTER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-tables", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getTables(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_TABLES_FETCH_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetching the tables details", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_TABLES_FETCH_ERROR", lang),
    });
  }
});

router.post("/edit-table", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await editTable(req);
    return res
      .status(STATUS_CODES.OK)
      .json(
        response?.message
          ? response
          : { message: t("OWNER_TABLE_EDIT_SUCCESS", lang) }
      );
  } catch (error) {
    console.error("Error while adding the tables details", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_TABLE_EDIT_ERROR", lang),
    });
  }
});

router.get("/get-feedbacks-from-users", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getUsersFeedback(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_FEEDBACK_FETCH_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetching the users feedback details", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_FEEDBACK_FETCH_ERROR", lang),
    });
  }
});

router.post("/add-feedback-questions", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await addFeedbackQuestions(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_FEEDBACK_ADD_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while adding the feedback questions.", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_FEEDBACK_ADD_ERROR", lang),
    });
  }
});

router.post("/delete-feedback-questions", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await deleteFeedbackQuestions(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_FEEDBACK_DELETE_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while deleting the feedback questions.", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_FEEDBACK_DELETE_ERROR", lang),
    });
  }
});

router.post("/restaurant-open", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await restaurantOpen(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_RESTAURANT_UPDATE_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while updating the restaurant.", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_RESTAURANT_UPDATE_ERROR", lang),
    });
  }
});

router.post("/email-exist", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await emailExist(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_EMAIL_EXIST_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetching the data.", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_EMAIL_EXIST_ERROR", lang),
    });
  }
});

router.post("/delete-entity-account", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await deleteEntityAccount(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_ENTITY_DELETE_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while deleting the account: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_ENTITY_DELETE_ERROR", lang),
    });
  }
});

router.post("/create-items-search-logs", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await createItemSearchLogs(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_LOG_CREATE_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while creating logs: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_LOG_CREATE_ERROR", lang),
    });
  }
});

router.get("/get-items-search-logs", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const searchedEntitiesLogs = await getItemsSearchLogs(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_LOG_FETCH_SUCCESS", lang),
      searchedEntitiesLogs,
    });
  } catch (error) {
    console.error("Error while fetched logs: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_LOG_FETCH_ERROR", lang),
    });
  }
});

router.post("/remove-search-logs", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await removeSearchLogs(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_LOG_REMOVE_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while removing logs: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_LOG_REMOVE_ERROR", lang),
    });
  }
});

router.post("/restaurant-cancel-order", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await restaurantCancelOrder(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OWNER_ORDER_CANCEL_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while cancelling the order", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_ORDER_CANCEL_ERROR", lang),
    });
  }
});

router.get("/get-sales-report-history", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await getSalesReportHistory(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_SALES_REPORT_HISTORY_FETCH_SUCCESS", lang),
      response,
    });
  } catch (error) {
    console.error("Error while fetching the sales report", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message:
        error.message || t("OWNER_SALES_REPORT_HISTORY_FETCH_ERROR", lang),
    });
  }
});

router.get("/download-sales-report", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await downloadSalesReport(req, res);
    return res.status(STATUS_CODES.OK).json({
      message: t("OWNER_SALES_REPORT_DOWNLOAD_SUCCESS", lang),
      response,
    });
  } catch (error) {
    console.error("Error while downloading the sales report", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OWNER_SALES_REPORT_DOWNLOAD_ERROR", lang),
    });
  }
});
router.post("/owner-app-feedback", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await ownerAppFeedback(req);
    res
      .status(STATUS_CODES.OK)
      .json({ message: t("USER_FEEDBACK_SUBMIT_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while submitting the feedabck: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("USER_FEEDBACK_SUBMIT_ERROR", lang),
    });
  }
});

router.get("/get-feedback-app-questions", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getFeedbackAppQuestions(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("FEEDBACK_QUESTIONS_FETCH_SUCCESS", lang),
      data,
    });
  } catch (error) {
    console.error("Error occured while getting feedback questions: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("FEEDBACK_QUESTIONS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-user-app-feedback-answers", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getOwnerAppFeedbackAnswers(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("USER_FEEDBACK_FETCH_SUCCESS", lang),
      data,
    });
  } catch (error) {
    console.error(
      "Error occured while getting owner feedback answers: ",
      error
    );
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("USER_FEEDBACK_FETCH_ERROR", lang),
    });
  }
});

module.exports = router;
