const test = require("node:test");
const assert = require("node:assert/strict");

const { priceOrderLines, ORDERING_ERRORS } = require("../../Utils/ordering");

const pizza = {
  _id: "item1",
  itemName: "Pizza Test",
  price: 3,
  inStock: true,
  extrasListIds: ["list1"],
  menuCategoryId: { _id: "cat1", categoryName: "Speisen", sortIndex: 2 },
};
const lists = new Map([
  [
    "list1",
    {
      _id: "list1",
      extras: [
        { _id: "cheese", name: "Extra cheese", price: 1.5, available: true },
        { _id: "hot", name: "Extra hot", price: 0, available: true },
        { _id: "olives", name: "Olives", price: 1, available: false },
      ],
    },
  ],
]);
const items = new Map([["item1", pizza]]);

const codeOf = (fn) => {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  return null;
};

test("extras are priced per piece and snapshotted on the line", () => {
  const { lines, subtotal } = priceOrderLines({
    lines: [
      { itemId: "item1", quantity: 1, extras: ["cheese", "hot"], note: " no basil " },
      { itemId: "item1", quantity: 2, extras: [] },
    ],
    itemsById: items,
    extrasListsById: lists,
  });
  assert.equal(lines[0].unitPrice, 4.5);
  assert.equal(lines[0].lineTotal, 4.5);
  assert.equal(lines[0].note, "no basil");
  assert.deepEqual(
    lines[0].extras.map((extra) => extra.name),
    ["Extra cheese", "Extra hot"],
  );
  assert.equal(lines[0].categoryName, "Speisen");
  assert.equal(lines[0].categorySortIndex, 2);
  assert.equal(lines[1].lineTotal, 6);
  assert.equal(subtotal, 10.5);
});

test("money is summed in cents", () => {
  const cheap = new Map([
    ["a", { ...pizza, _id: "a", price: 0.1, extrasListIds: [] }],
    ["b", { ...pizza, _id: "b", price: 0.2, extrasListIds: [] }],
  ]);
  const { subtotal } = priceOrderLines({
    lines: [
      { itemId: "a", quantity: 1 },
      { itemId: "b", quantity: 1 },
    ],
    itemsById: cheap,
  });
  assert.equal(subtotal, 0.3);
});

test("rejects unavailable or unknown extras, bad quantities, sold-out items", () => {
  assert.equal(
    codeOf(() =>
      priceOrderLines({
        lines: [{ itemId: "item1", quantity: 1, extras: ["olives"] }],
        itemsById: items,
        extrasListsById: lists,
      }),
    ),
    ORDERING_ERRORS.EXTRA_NOT_AVAILABLE,
  );
  assert.equal(
    codeOf(() =>
      priceOrderLines({
        lines: [{ itemId: "item1", quantity: 1, extras: ["caviar"] }],
        itemsById: items,
        extrasListsById: lists,
      }),
    ),
    ORDERING_ERRORS.EXTRA_NOT_AVAILABLE,
  );
  [0, -1, 1.5, 100, "two", null].forEach((quantity) => {
    assert.equal(
      codeOf(() =>
        priceOrderLines({ lines: [{ itemId: "item1", quantity }], itemsById: items }),
      ),
      ORDERING_ERRORS.INVALID_QUANTITY,
      `quantity ${quantity}`,
    );
  });
  assert.equal(
    codeOf(() =>
      priceOrderLines({
        lines: [{ itemId: "item1", quantity: 1 }],
        itemsById: new Map([["item1", { ...pizza, inStock: false }]]),
      }),
    ),
    ORDERING_ERRORS.ITEM_OUT_OF_STOCK,
  );
  assert.equal(
    codeOf(() => priceOrderLines({ lines: [], itemsById: items })),
    ORDERING_ERRORS.EMPTY,
  );
});
