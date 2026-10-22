// Owner endpoints for the 1.0.3 menu: extras lists, the order of categories
// and items, and the "recommended" star. Mounted at /api/owner/restaurant.
//
// Menu data is stored once per counter (a category document per name ×
// counter, an item document per category copy). Everything here is applied
// by name to every copy, the same way the existing item edits work.

const express = require("express");
const mongoose = require("mongoose");
const ExtrasList = require("../../Models/ExtrasList");
const ItemDetails = require("../../Models/ItemDetails");
const MenuCategory = require("../../Models/MenuCategory");
const { STATUS, STATUS_CODES } = require("../../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("../../Utils/translator");
const throwError = require("../../Utils/throwError");
const { sendFirebaseNotification } = require("../../Utils/commonFunction");
const { getIo } = require("../../Utils/socket");

const router = express.Router();
const { ObjectId } = mongoose.Types;

const MAX_LIST_NAME = 40;
const MAX_EXTRAS_PER_LIST = 30;
const MAX_EXTRA_PRICE = 1000;

const requireOwner = (req) => {
  if (!req.entityId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("AUTH_TOKEN_INVALID", getLanguageFromRequest(req)),
    });
  }
};

const handle = (fn, successKey, errorKey) => async (req, res) => {
  const lang = getLanguageFromRequest(req);
  try {
    requireOwner(req);
    const data = await fn(req, lang);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: t(successKey, lang), ...data });
  } catch (error) {
    console.error(`Error in ${req.method} ${req.path}`, error);
    return res.status(error.status || STATUS_CODES.SERVER_ERROR).json({
      message: error.message || t(errorKey, lang),
      ...(error.code ? { code: error.code } : {}),
    });
  }
};

// Owner boards and guest apps refetch the menu on these.
const announceMenuChange = (entityId) => {
  const io = getIo();
  if (io) {
    io.to(String(entityId)).emit("menuItemUpdated", { entityId: String(entityId) });
  }
  ["owner_entity_", "entity_"].forEach((prefix) =>
    sendFirebaseNotification({
      topic: `${prefix}${entityId}`,
      showNotification: false,
      title: "Menu updated",
      body: "The menu was updated.",
      data: {
        action: "item_update",
        screen: "menu_screen",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        topic: `${prefix}${entityId}`,
      },
    }),
  );
};

const validIds = (ids) =>
  (Array.isArray(ids) ? ids : []).filter((id) => ObjectId.isValid(id));

// Representative item ids from the owner's item list → item names.
const itemNamesFor = async (entityId, itemIds) => {
  const items = await ItemDetails.find(
    { entityId, _id: { $in: validIds(itemIds) } },
    { itemName: 1 },
  ).lean();
  return [...new Set(items.map((item) => item.itemName))];
};

const normalizeList = (body, lang) => {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_LIST_NAME) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("EXTRAS_LIST_NAME_INVALID", lang, { max: MAX_LIST_NAME }),
      code: "EXTRAS_LIST_NAME_INVALID",
    });
  }
  const rawExtras = Array.isArray(body?.extras) ? body.extras : [];
  if (rawExtras.length > MAX_EXTRAS_PER_LIST) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("EXTRAS_TOO_MANY", lang, { max: MAX_EXTRAS_PER_LIST }),
      code: "EXTRAS_TOO_MANY",
    });
  }
  const extras = rawExtras.map((extra) => {
    const extraName = typeof extra?.name === "string" ? extra.name.trim() : "";
    const price = Number(extra?.price ?? 0);
    if (
      !extraName ||
      extraName.length > MAX_LIST_NAME ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > MAX_EXTRA_PRICE
    ) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("EXTRA_INVALID", lang),
        code: "EXTRA_INVALID",
      });
    }
    return {
      // Keep the id of an existing extra so orders and carts still match it.
      ...(ObjectId.isValid(extra?._id) ? { _id: extra._id } : {}),
      name: extraName,
      price: Math.round(price * 100) / 100,
      available: extra?.available !== false,
    };
  });
  return { name, extras };
};

// Points exactly the given item names at the list, and no others.
const assignList = async (entityId, listId, itemIds) => {
  const names = await itemNamesFor(entityId, itemIds);
  await ItemDetails.updateMany(
    { entityId, itemName: { $in: names } },
    { $addToSet: { extrasListIds: listId } },
  );
  await ItemDetails.updateMany(
    { entityId, itemName: { $nin: names }, extrasListIds: listId },
    { $pull: { extrasListIds: listId } },
  );
};

const withAssignments = async (entityId, lists) => {
  const items = await ItemDetails.find(
    { entityId, extrasListIds: { $in: lists.map((list) => list._id) } },
    { itemName: 1, extrasListIds: 1, menuCategoryId: 1 },
  )
    .sort({ sortIndex: 1, _id: 1 })
    .populate({ path: "menuCategoryId", select: "categoryName" })
    .lean();
  return lists.map((list) => {
    const seen = new Set();
    const assignedItems = [];
    items.forEach((item) => {
      if (!(item.extrasListIds || []).some((id) => String(id) === String(list._id))) return;
      if (seen.has(item.itemName)) return;
      seen.add(item.itemName);
      assignedItems.push({
        itemId: item._id,
        itemName: item.itemName,
        categoryName: item.menuCategoryId?.categoryName || "",
      });
    });
    return { ...list, assignedItems };
  });
};

const findOwnList = async (req, lang) => {
  const list = ObjectId.isValid(req.params.listId)
    ? await ExtrasList.findOne({
        _id: req.params.listId,
        entityId: req.entityId,
        status: STATUS.ACTIVE,
      }).lean()
    : null;
  if (!list) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("EXTRAS_LIST_NOT_FOUND", lang),
    });
  }
  return list;
};

router.get(
  "/extras-lists",
  handle(
    async (req) => {
      const lists = await ExtrasList.find({
        entityId: req.entityId,
        status: STATUS.ACTIVE,
      })
        .sort({ createdAt: 1 })
        .lean();
      return { data: await withAssignments(req.entityId, lists) };
    },
    "EXTRAS_LISTS_FETCH_SUCCESS",
    "EXTRAS_LISTS_FETCH_ERROR",
  ),
);

// POST { name, extras: [{ name, price, available }], itemIds: [] }
router.post(
  "/extras-lists",
  handle(
    async (req, lang) => {
      const { name, extras } = normalizeList(req.body, lang);
      const list = await ExtrasList.create({
        entityId: req.entityId,
        name,
        extras,
      });
      await assignList(req.entityId, list._id, req.body.itemIds);
      announceMenuChange(req.entityId);
      const [data] = await withAssignments(req.entityId, [list.toObject()]);
      return { data };
    },
    "EXTRAS_LIST_SAVE_SUCCESS",
    "EXTRAS_LIST_SAVE_ERROR",
  ),
);

// PUT { name, extras, itemIds } — extras sent with their _id keep it.
router.put(
  "/extras-lists/:listId",
  handle(
    async (req, lang) => {
      const existing = await findOwnList(req, lang);
      const { name, extras } = normalizeList(req.body, lang);
      const list = await ExtrasList.findOneAndUpdate(
        { _id: existing._id },
        { $set: { name, extras } },
        { new: true, lean: true },
      );
      if (req.body.itemIds !== undefined) {
        await assignList(req.entityId, list._id, req.body.itemIds);
      }
      announceMenuChange(req.entityId);
      const [data] = await withAssignments(req.entityId, [list]);
      return { data };
    },
    "EXTRAS_LIST_SAVE_SUCCESS",
    "EXTRAS_LIST_SAVE_ERROR",
  ),
);

router.delete(
  "/extras-lists/:listId",
  handle(
    async (req, lang) => {
      const list = await findOwnList(req, lang);
      await ExtrasList.updateOne(
        { _id: list._id },
        { $set: { status: STATUS.DELETED } },
      );
      await ItemDetails.updateMany(
        { entityId: req.entityId, extrasListIds: list._id },
        { $pull: { extrasListIds: list._id } },
      );
      announceMenuChange(req.entityId);
      return {};
    },
    "EXTRAS_LIST_DELETE_SUCCESS",
    "EXTRAS_LIST_DELETE_ERROR",
  ),
);

// PUT { categoryIds: [] } — the full category order, first = top of the menu.
router.put(
  "/menu-categories/order",
  handle(
    async (req) => {
      const categories = await MenuCategory.find(
        { entityId: req.entityId, _id: { $in: validIds(req.body.categoryIds) } },
        { categoryName: 1 },
      ).lean();
      const nameById = new Map(
        categories.map((category) => [String(category._id), category.categoryName]),
      );
      const names = [
        ...new Set(
          validIds(req.body.categoryIds)
            .map((id) => nameById.get(String(id)))
            .filter(Boolean),
        ),
      ];
      await MenuCategory.bulkWrite(
        names.map((categoryName, index) => ({
          updateMany: {
            filter: { entityId: req.entityId, categoryName },
            update: { $set: { sortIndex: index + 1 } },
          },
        })),
      );
      announceMenuChange(req.entityId);
      return { data: names };
    },
    "MENU_ORDER_SAVE_SUCCESS",
    "MENU_ORDER_SAVE_ERROR",
  ),
);

// PUT { itemIds: [] } — items of one category in their new order.
router.put(
  "/menu-items/order",
  handle(
    async (req) => {
      const ids = validIds(req.body.itemIds);
      const items = await ItemDetails.find(
        { entityId: req.entityId, _id: { $in: ids } },
        { itemName: 1 },
      ).lean();
      const nameById = new Map(items.map((item) => [String(item._id), item.itemName]));
      const names = [
        ...new Set(ids.map((id) => nameById.get(String(id))).filter(Boolean)),
      ];
      if (names.length) {
        await ItemDetails.bulkWrite(
          names.map((itemName, index) => ({
            updateMany: {
              filter: { entityId: req.entityId, itemName },
              update: { $set: { sortIndex: index + 1 } },
            },
          })),
        );
      }
      announceMenuChange(req.entityId);
      return { data: names };
    },
    "MENU_ORDER_SAVE_SUCCESS",
    "MENU_ORDER_SAVE_ERROR",
  ),
);

// PUT { itemId, isRecommended }
router.put(
  "/menu-items/recommended",
  handle(
    async (req, lang) => {
      const [itemName] = await itemNamesFor(req.entityId, [req.body.itemId]);
      if (!itemName) {
        throwError({
          status: STATUS_CODES.NOT_FOUND,
          message: t("OWNER_MENU_ITEM_NOT_FOUND", lang),
        });
      }
      const isRecommended = req.body.isRecommended === true;
      await ItemDetails.updateMany(
        { entityId: req.entityId, itemName },
        { $set: { isRecommended } },
      );
      announceMenuChange(req.entityId);
      return { data: { itemName, isRecommended } };
    },
    "MENU_RECOMMENDED_SAVE_SUCCESS",
    "MENU_RECOMMENDED_SAVE_ERROR",
  ),
);

module.exports = router;
