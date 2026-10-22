// Server-side pricing of order lines, extras included. The apps show a total,
// but the amount charged is always the one computed here.

const { OrderingError, ORDERING_ERRORS } = require("./errors");

const MAX_QUANTITY_PER_LINE = 99;
const MAX_NOTE_LENGTH = 200;

const toCents = (amount) => Math.round(Number(amount || 0) * 100);
const fromCents = (cents) => Number((cents / 100).toFixed(2));

/**
 * @param lines   [{ itemId, quantity, note, extras: [extraId] }] as sent by the app
 * @param itemsById      Map<itemId, ItemDetails (lean, menuCategoryId populated)>
 * @param extrasListsById Map<listId, ExtrasList (lean)>
 * @returns {{ lines: Array, subtotal: number }}
 */
const priceOrderLines = ({ lines, itemsById, extrasListsById = new Map() }) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new OrderingError(ORDERING_ERRORS.EMPTY);
  }

  let subtotalCents = 0;
  const priced = lines.map((line) => {
    const quantity = Number(line?.quantity);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY_PER_LINE
    ) {
      throw new OrderingError(ORDERING_ERRORS.INVALID_QUANTITY);
    }

    const item = itemsById.get(String(line?.itemId));
    if (!item) {
      throw new OrderingError(ORDERING_ERRORS.ITEM_NOT_FOUND);
    }
    if (!item.inStock) {
      throw new OrderingError(ORDERING_ERRORS.ITEM_OUT_OF_STOCK, {
        itemName: item.itemName,
      });
    }

    // Extras offered on this item = the extras of every list assigned to it.
    const offered = new Map();
    (item.extrasListIds || []).forEach((listId) => {
      const list = extrasListsById.get(String(listId));
      (list?.extras || []).forEach((extra) => {
        offered.set(String(extra._id), extra);
      });
    });

    const requestedExtraIds = [
      ...new Set((Array.isArray(line?.extras) ? line.extras : []).map(String)),
    ];
    const extras = requestedExtraIds.map((extraId) => {
      const extra = offered.get(extraId);
      if (!extra || extra.available === false) {
        throw new OrderingError(ORDERING_ERRORS.EXTRA_NOT_AVAILABLE, {
          itemName: item.itemName,
          extraName: extra?.name || "",
        });
      }
      return { extraId: extra._id, name: extra.name, price: fromCents(toCents(extra.price)) };
    });

    const unitCents =
      toCents(item.price) +
      extras.reduce((sum, extra) => sum + toCents(extra.price), 0);
    const lineCents = unitCents * quantity;
    subtotalCents += lineCents;

    const category = item.menuCategoryId || {};
    return {
      itemId: item._id,
      quantity,
      note:
        typeof line?.note === "string"
          ? line.note.trim().slice(0, MAX_NOTE_LENGTH)
          : "",
      itemName: item.itemName,
      itemPrice: fromCents(toCents(item.price)),
      extras,
      unitPrice: fromCents(unitCents),
      lineTotal: fromCents(lineCents),
      categoryId: category._id || null,
      categoryName: category.categoryName || "",
      categorySortIndex: Number.isFinite(category.sortIndex)
        ? category.sortIndex
        : null,
    };
  });

  return { lines: priced, subtotal: fromCents(subtotalCents) };
};

module.exports = {
  priceOrderLines,
  toCents,
  fromCents,
  MAX_QUANTITY_PER_LINE,
};
