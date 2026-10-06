const express = require("express");
const router = express.Router();
const { STATUS_CODES, ROLES } = require("../../Utils/globalConstants");
const {
  // addFavouriteEntity,
  getFavouriteEvents,
  removeFavouriteEvents,
  visitorCount,
  getEntities,
  counterList,
  getCounterMenuCategory,
  getMenuItems,
  eventOpened,
  eventClosed,
  updateFavouriteItem,
  getFavouriteItems,
  getUserCards,
  editOrDeleteCards,
  getUserDetails,
  updateUserDetails,
  addCards,
  processLocationForUser,
  addFavouriteEntity,
  userFeedback,
  getAllcountries,
  getCitiesOfStates,
  getCountryByIsoCode,
  getRecommendedItems,
  createSearchLogs,
  getSearchLogs,
  removeLogs,
  newlyAddedEntities,
  popularEntities,
  entityOffers,
  getFeedbackQuestions,
  getTablesUserSide,
  fetchNotificationSettings,
  updateNotificationSettings,
  userAppFeedback,
  getFeedbackAppQuestions,
  getUserAppFeedbackAnswers,
  getPlatformFee,
} = require("./service");
const { t, getLanguageFromRequest } = require("../../Utils/translator");

router.get("/fetch-notification-settings", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const notificationSettingsDetails = await fetchNotificationSettings(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("NOTIFICATION_SETTINGS_FETCH_SUCCESS", lang),
      notificationSettingsDetails,
    });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("NOTIFICATION_SETTINGS_FETCH_ERROR", lang),
    });
  }
});

router.post("/update-notification-settings", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await updateNotificationSettings(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("NOTIFICATION_SETTINGS_UPDATE_SUCCESS", lang),
    });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("NOTIFICATION_SETTINGS_UPDATE_ERROR", lang),
    });
  }
});

router.get("/get-entities", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  // console.log(lang, "lang"); // Debug log
  try {
    const response = await getEntities(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ENTITIES_FETCH_SUCCESS", lang),
      entityEvents: response,
    });
  } catch (error) {
    console.error("Error occured while getting Entiities", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ENTITIES_FETCH_ERROR", lang),
    });
  }
});

router.post("/event-opened", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await eventOpened(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("EVENT_OPENED_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while event opened api", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("EVENT_OPENED_ERROR", lang),
    });
  }
});

router.post("/event-closed", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await eventClosed(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("EVENT_CLOSED_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while event opened api", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("EVENT_CLOSED_ERROR", lang),
    });
  }
});

router.post("/add-favourite-entity", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await addFavouriteEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("FAVOURITE_ENTITY_ADD_SUCCESS", lang) });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("FAVOURITE_ENTITY_ADD_ERROR", lang),
    });
  }
});

// router.get("/get-favourite-entity", async (req, res) => {
//   try {
//     const response = await getFavouriteEvents(req);
//     return res.status(STATUS_CODES.OK).json({
//       message: "Favourite events successfully fetched",
//       data: response,
//     });
//   } catch (error) {
//     return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({ message: error.message });
//   }
// });

router.get("/counter-list-items", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await addFavouriteEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("FAVOURITE_ENTITY_ADD_SUCCESS", lang) });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("FAVOURITE_ENTITY_ADD_ERROR", lang),
    });
  }
});
// router.put("/remove-favourite-events", async (req, res) => {
//   try {
//     await removeFavouriteEvents(req);
//     return res.status(STATUS_CODES.OK).json({
//       message: "Favourite events removed successfully",
//     });
//   } catch (error) {
//     return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({ message: error.message });
//   }
// });

router.post("/visitor-count", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await visitorCount(req);
    return res.status(STATUS_CODES.OK).json({
      message: "",
    });
  } catch (error) {
    console.error("Error occured while incrementing visitor count", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("VISITOR_COUNT_ERROR", lang),
    });
  }
});

router.post("/add-existing-item", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await addExisitngItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("EXISTING_ITEM_ADD_SUCCESS", lang),
    });
  } catch (error) {
    console.error("Error occured while incrementing visitor count", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("EXISTING_ITEM_ADD_ERROR", lang),
    });
  }
});

router.get("/get-counter-list", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const counterLists = await counterList(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("COUNTER_LIST_FETCH_SUCCESS", lang),
      counterLists,
    });
  } catch (error) {
    console.error("Error occured while get counter list", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("COUNTER_LIST_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-counter-menu-category", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const menuLists = await getCounterMenuCategory(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("MENU_CATEGORIES_FETCH_SUCCESS", lang),
      menuLists,
    });
  } catch (error) {
    console.error("Error occured while getting counter category", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("MENU_CATEGORIES_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-menu-category-items", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const menuItems = await getMenuItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("MENU_ITEMS_FETCH_SUCCESS", lang),
      menuItems,
    });
  } catch (error) {
    console.error("Error occured while getting menu items", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("MENU_ITEMS_FETCH_ERROR", lang),
    });
  }
});

router.get("/recommended-items", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const items = await getRecommendedItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("RECOMMENDED_ITEMS_FETCH_SUCCESS", lang),
      menuItems: items,
    });
  } catch (error) {
    console.error("Error occured while getting recommended items", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("RECOMMENDED_ITEMS_FETCH_ERROR", lang),
    });
  }
});

router.post("/update-language", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await getMenuItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("LANGUAGE_UPDATE_SUCCESS", lang),
    });
  } catch (error) {
    console.error("Error occured while updating language", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("LANGUAGE_UPDATE_ERROR", lang),
    });
  }
});

router.post("/update-favourite-items", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await updateFavouriteItem(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("FAVOURITE_ITEM_UPDATE_SUCCESS", lang),
    });
  } catch (error) {
    console.error("Error occured while updating favourites list", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("FAVOURITE_ITEM_UPDATE_ERROR", lang),
    });
  }
});

router.get("/get-favourite-items", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const menuItems = await getFavouriteItems(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("FAVOURITE_ITEMS_FETCH_SUCCESS", lang),
      menuItems,
    });
  } catch (error) {
    console.error("Error occured while fetching favourite items", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("FAVOURITE_ITEMS_FETCH_ERROR", lang),
    });
  }
});

router.post("/add-card", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const message = await addCards(req);
    return res.status(STATUS_CODES.OK).json({
      message: message || t("CARD_ADDED_SUCCESS", lang),
    });
  } catch (error) {
    console.error("Error occured while adding card details: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("CARD_ADD_ERROR", lang),
    });
  }
});

router.get("/get-user-cards", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const cards = await getUserCards(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("CARDS_FETCH_SUCCESS", lang),
      cards,
    });
  } catch (error) {
    console.error("Error occured while getting card details: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("CARDS_FETCH_ERROR", lang),
    });
  }
});

router.post("/edit-card", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const message = await editOrDeleteCards(req);
    return res.status(STATUS_CODES.OK).json({ message });
  } catch (error) {
    console.error("Error while updating details of card: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("CARD_UPDATE_ERROR", lang),
    });
  }
});

router.get("/get-user-details", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await getUserDetails(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("USER_DETAILS_FETCH_SUCCESS", lang),
      response,
    });
  } catch (error) {
    console.error("Error while fetching user details: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("USER_DETAILS_FETCH_ERROR", lang),
    });
  }
});

router.post("/update-user-details", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const message = await updateUserDetails(req);
    return res.status(STATUS_CODES.OK).json({ message });
  } catch (error) {
    console.error("Error while updating user details: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("USER_DETAILS_UPDATE_ERROR", lang),
    }); 
  }
});

router.post("/location", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const result = await processLocationForUser(req);
    res.status(STATUS_CODES.OK).json({
      message: t("LOCATION_FETCH_SUCCESS", lang),
      result,
    });
  } catch (error) {
    console.error("Error while finding the location: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("LOCATION_FETCH_ERROR", lang),
    });
  }
});

router.post("/user-feedback", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await userFeedback(req);
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
router.post("/user-app-feedback", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await userAppFeedback(req);
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
router.get("/get-all-countries", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { data } = getAllcountries();
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("COUNTRIES_FETCH_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetching countries: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("COUNTRIES_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-cities-of-state", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const cities = await getCitiesOfStates(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("CITIES_FETCH_SUCCESS", lang), cities });
  } catch (error) {
    console.error("Error while fetching cities: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("CITIES_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-iso-code", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { data } = await getCountryByIsoCode({ req });
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ISO_CODE_FETCH_SUCCESS", lang), stateList: data });
  } catch (error) {
    console.error("Error while fetching iso code: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ISO_CODE_FETCH_ERROR", lang),
    });
  }
});

router.post("/create-search-logs", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await createSearchLogs(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("SEARCH_LOG_CREATE_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while creating logs: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("SEARCH_LOG_CREATE_ERROR", lang),
    });
  }
});

router.get("/get-search-logs", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const searchedEntitiesLogs = await getSearchLogs(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("SEARCH_LOG_FETCH_SUCCESS", lang),
      searchedEntitiesLogs,
    });
  } catch (error) {
    console.error("Error while fetched logs: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("SEARCH_LOG_FETCH_ERROR", lang),
    });
  }
});

router.post("/remove-search-logs", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await removeLogs(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("SEARCH_LOG_REMOVE_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetched logs: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("SEARCH_LOG_REMOVE_ERROR", lang),
    });
  }
});

router.get("/newly-added-entities", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await newlyAddedEntities();
    return res.status(STATUS_CODES.OK).json({
      message: t("NEW_ENTITIES_FETCH_SUCCESS", lang),
      data,
    });
  } catch (error) {
    console.error("Error occured while getting newly added entities: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("NEW_ENTITIES_FETCH_ERROR", lang),
    });
  }
});

router.get("/popular-entities", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await popularEntities();
    return res.status(STATUS_CODES.OK).json({
      message: t("POPULAR_ENTITIES_FETCH_SUCCESS", lang),
      data,
    });
  } catch (error) {
    console.error("Error occured while getting popular entities: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("POPULAR_ENTITIES_FETCH_ERROR", lang),
    });
  }
});

router.get("/entity-offers", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await entityOffers();
    return res.status(STATUS_CODES.OK).json({
      message: t("ENTITY_OFFERS_FETCH_SUCCESS", lang),
      entityOffers: data,
    });
  } catch (error) {
    console.error("Error occured while getting entities offers: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ENTITY_OFFERS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-feedback-questions", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getFeedbackQuestions(req);
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
router.get("/get-feedback-app-questions", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getFeedbackAppQuestions(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("FEEDBACK_QUESTIONS_FETCH_SUCCESS", lang),
      data,
    });
  } catch (error) {
    console.error(
      "Error occured while getting feedback  app questions: ",
      error
    );
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("FEEDBACK_QUESTIONS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-user-app-feedback-answers", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getUserAppFeedbackAnswers(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("USER_FEEDBACK_FETCH_SUCCESS", lang),
      data,
    });
  } catch (error) {
    console.error("Error occured while getting user feedback answers: ", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("USER_FEEDBACK_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-platform-fee", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await getPlatformFee(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("PLATFORM_FEE_FETCH_SUCCESS", lang),
      platformFee: response.platformFee,
    });
  } catch (error) {
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("PLATFORM_FEE_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-tables-user-side", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getTablesUserSide(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("TABLES_FETCH_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while fetching the tables details", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("TABLES_FETCH_ERROR", lang),
    });
  }
});

module.exports = router;
