const Orders = require("../Models/Order");
const User = require("../Models/User");
const { ORDER_STATUS, ROLES } = require("../Utils/globalConstants");

const totalRevenueOfEntity = async (req) => {
  const { entityId } = req.body;
  const query = { status: ORDER_STATUS.COMPLETED };
  if (entityId) {
    query.entityId = entityId;
  }
  const totalRevenue = await Orders.aggregate([
    { $match: query },
    { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
  ]);

  return totalRevenue[0]?.totalRevenue || 0;
};

const getUsers = async (req) => {
  const {
    body: { pageNo = 1, pageLimit = 10, role },
  } = req;
  const skip = +(pageNo - 1) * +pageLimit;
  const query = { role };
  const [users, totalCount] = await Promise.all([
    User.find(query).sort({ firstName: 1 }).skip(skip).limit(pageLimit).lean(),
    User.countDocuments(query),
  ]);
  return { users, totalCount };
};

const getOrdersAndMoneySpent = async (req) => {
  const {
    body: { status, userId },
  } = req;
  const query = { userId };
  if (status) {
    query.status = status;
  }

  let [noOfOrders, moneySpent] = await Promise.all([
    Orders.countDocuments(query),
    Orders.aggregate([
      { $match: query },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]),
  ]);

  moneySpent = moneySpent[0]?.moneySpent || 0;
  return { noOfOrders, moneySpent };
};

module.exports = {
  totalRevenueOfEntity,
  getUsers,
  getOrdersAndMoneySpent,
};
