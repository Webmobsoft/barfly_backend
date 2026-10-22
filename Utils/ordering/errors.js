// Error raised by the ordering rules. `code` is a stable machine-readable
// reason the apps can switch on; it doubles as the translation key.
class OrderingError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.name = "OrderingError";
    this.code = code;
    this.params = params;
  }
}

const ORDERING_ERRORS = {
  CLOSED: "ORDER_CLOSED",
  PAUSED: "ORDER_PAUSED",
  ASAP_NOT_AVAILABLE: "ORDER_ASAP_NOT_AVAILABLE",
  SLOT_NOT_AVAILABLE: "ORDER_SLOT_NOT_AVAILABLE",
  SLOT_FULL: "ORDER_SLOT_FULL",
  ITEM_NOT_FOUND: "ORDER_ITEM_NOT_FOUND",
  ITEM_OUT_OF_STOCK: "ORDER_ITEM_OUT_OF_STOCK",
  ITEM_WRONG_COUNTER: "ORDER_ITEM_WRONG_COUNTER",
  EXTRA_NOT_AVAILABLE: "ORDER_EXTRA_NOT_AVAILABLE",
  INVALID_QUANTITY: "ORDER_INVALID_QUANTITY",
  INVALID_PICKUP: "ORDER_INVALID_PICKUP",
  COUNTER_NOT_FOUND: "ORDER_COUNTER_NOT_FOUND",
  EMPTY: "ORDER_EMPTY",
};

module.exports = { OrderingError, ORDERING_ERRORS };
