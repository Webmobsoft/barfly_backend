const express = require("express");
const mongoose = require("mongoose");

const router = express.Router({ caseSensitive: true });

const {
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
} = require("../CustomerServices/orderService");

const { STATUS_CODES, ORDER_STATUS } = require("../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("../Utils/translator");

const verifyToken = require("../Utils/verifyToken");
const { orderSocket } = require("../server");
const { io } = require("../app");
const User = require("../Models/User");

router.use((req, res, next) => {
  req.userId = req.id;
  return next();
});

router.post("/create-order", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  const session = await mongoose.startSession();
  try {
    let response;
    await session.withTransaction(async () => {
      response = await createOrder(req, session);
    });
    console.log({ response });
    // Only notify owner if payment is already confirmed (non-Wallee orders)
    // For Wallee payment orders, notification is deferred to webhook SUCCESS handler
    if (response[0].status !== ORDER_STATUS.PAYMENT_PROCESSING) {
      io.to(response[0].entityId.toString()).emit("newOrder", response);
    }
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ORDER_CREATE_SUCCESS", lang), response });
  } catch (error) {
    console.error("Error while adding order", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_CREATE_ERROR", lang),
    });
  } finally {
    session.endSession();
  }
});

router.post("/create-offline-order", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const response = await createOfflineOrder(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("OFFLINE_ORDER_CREATE_SUCCESS", lang), response });
  } catch (error) {
    console.error("Error while creating order logs:", error);
    return res.status(STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OFFLINE_ORDER_CREATE_ERROR", lang),
    });
  }
});

router.post("/update-status-of-order", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await updateStatusOfOrder(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ORDER_STATUS_UPDATE_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while updating order status", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_STATUS_UPDATE_ERROR", lang),
    });
  }
});

router.get("/get-entity-orders", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const {
      data,
      orderProcessCount,
      readyOrders,
      completedOrders,
      cancelledOrders,
    } = await getEntityOrders(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ORDER_FETCH_SUCCESS", lang),
      data,
      orderProcessCount,
      readyOrders,
      completedOrders,
      cancelledOrders,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-offline-orders", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { data, preparing, readyOrders, completedOrders } =
      await getOfflineOrders(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("OFFLINE_ORDER_FETCH_SUCCESS", lang),
      data,
      preparing,
      readyOrders,
      completedOrders,
    });
  } catch (error) {
    console.error("Error while fetching offline orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("OFFLINE_ORDER_FETCH_ERROR", lang),
    });
  }
});

router.post("/update-offline-status-of-order", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await updateOfflineOrders(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ORDER_STATUS_UPDATE_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while updating order status", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_STATUS_UPDATE_ERROR", lang),
    });
  }
});

router.get("/get-users-restaurant-orders-count", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const userOrders = await getRestaurantOrdersAndCount(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("USER_ORDERS_FETCH_SUCCESS", lang),
      userOrders,
    });
  } catch (error) {
    console.error("Error while fetching user orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("USER_ORDERS_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-users-orders-group-by-years", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const previosuOrdersList = await getOrderGroupByYears(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ORDER_FETCH_SUCCESS", lang),
      previosuOrdersList,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-users-orders-group-by-months", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const ordersByMonthAndEntity = await getOrderGroupByMonths(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("MONTHLY_ORDER_FETCH_SUCCESS", lang),
      ordersByMonthAndEntity,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-entity-orders-group-by-years", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const previosuOrdersList = await getOrderGroupByYearsForEntity(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ORDER_FETCH_SUCCESS", lang),
      previosuOrdersList,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-live-orders-user", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const liveOrders = await getLiveOrdersUsers(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ORDER_FETCH_SUCCESS", lang),
      liveOrders,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-particular-live-order-details", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const liveOrders = await particularOrderDetails(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ORDER_FETCH_SUCCESS", lang),
      liveOrders,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-particular-live-order-details-customer", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const particularLiveOrder = await particularOrderDetailsCustomer(req);
    console.log({ ...particularLiveOrder }, particularLiveOrder.itemId);
    return res.status(STATUS_CODES.OK).json({
      message: t("ORDER_FETCH_SUCCESS", lang),
      particularLiveOrder,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_FETCH_ERROR", lang),
    });
  }
});

router.get("/get-past-ticket-years-customer", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const pastTicketYearsData = await pastTicketYears(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ORDER_FETCH_SUCCESS", lang),
      pastTicketYearsData,
    });
  } catch (error) {
    console.error("Error while fetching orders", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_FETCH_ERROR", lang),
    });
  }
});

router.post("/cancel-order", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    await cancelOrder(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ORDER_CANCEL_SUCCESS", lang) });
  } catch (error) {
    console.error("Error while cancelling the order", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("ORDER_CANCEL_ERROR", lang),
    });
  }
});

router.get("/get-event-order-summary", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const data = await getEventOrderSummary(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("EVENT_REVENUE_FETCH_SUCCESS", lang), data });
  } catch (error) {
    console.error("Error while generating the revenue", error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t("EVENT_REVENUE_FETCH_ERROR", lang),
    });
  }
});

module.exports = router;
