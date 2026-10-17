const express = require("express");
const mongoose = require("mongoose");

const router = express.Router({ caseSensitive: true });

const {
  totalRevenueOfEntity,
  getOrdersAndMoneySpent,
} = require("../CustomerServices/adminService");
const { STATUS_CODES } = require("../Utils/globalConstants");
const verifyToken = require("../Utils/verifyToken");
const { t, getLanguageFromRequest } = require("../Utils/translator");

router.use(verifyToken);

router.get("/total-revenue-of-entity", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const totalAmount = await totalRevenueOfEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ADMIN_REVENUE_FETCH_SUCCESS", lang), totalAmount });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || t("ADMIN_REVENUE_FETCH_ERROR", lang) });
  }
});

router.get("/get-owners", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const totalAmount = await totalRevenueOfEntity(req);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t("ADMIN_REVENUE_FETCH_SUCCESS", lang), totalAmount });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || t("ADMIN_REVENUE_FETCH_ERROR", lang) });
  }
});

router.post("/get-money-spent-by-user", async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    const { noOfOrders, moneySpent } = await getOrdersAndMoneySpent(req);
    return res.status(STATUS_CODES.OK).json({
      message: t("ADMIN_REVENUE_FETCH_SUCCESS", lang),
      noOfOrders,
      moneySpent,
    });
  } catch (error) {
    return res
      .status(error.status || STATUS_CODES.SERVER_ERROR)
      .json({ message: error.message || t("ADMIN_REVENUE_FETCH_ERROR", lang) });
  }
});

module.exports = router;
