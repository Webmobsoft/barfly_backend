const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");

const { ORDER_STATUS } = require("../Utils/globalConstants");
const Order = require("../Models/Order");
const Counter = require("../Models/Counter");
const EntityDetails = require("../Models/EntityDetails");
const {
  uploadBufferToS3,
  generatePresignedUrl,
} = require("../Controller/aws-service");
const SalesReport = require("../Models/SalesReport");
const ItemDetails = require("../Models/ItemDetails");
const {
  formatDateDDMMYYYY,
  formatCalendarDDMMYYYY,
  getZonedDateRange,
  registerFonts,
  createPdfHelpers,
} = require("./pdfUtils");

module.exports.ownerTrades = async (req) => {
  const {
    userId,
    entityId,
    query: { fromDate, toDate },
  } = req;

  // Client timezone (IANA) sent via header; used both to render report dates in
  // the owner's local time and to anchor the query window to the owner's
  // calendar days. Validated downstream (falls back to RECEIPT_TIMEZONE).
  const timeZone = req.headers?.["timezone"];

  // Build the UTC query window as midnight-to-midnight of the selected calendar
  // days IN the client's timezone (not the server's). Accepts ISO "yyyy-MM-dd"
  // or legacy "dd MMM, yyyy"; falls back to server-local boundaries if a date
  // can't be parsed, so it stays backward compatible during rollout.
  const { start, end } = getZonedDateRange(fromDate, toDate, timeZone);
  const safeIso = (d) => (d && !isNaN(d.getTime()) ? d.toISOString() : "Invalid Date");
  console.log("[ownerTrades] query window", {
    fromDate,
    toDate,
    timeZone,
    startUTC: safeIso(start),
    endUTC: safeIso(end),
  });

  const payload = { status: ORDER_STATUS.COMPLETED };
  const doc = new PDFDocument({
    size: [595, 842],
    margins: { top: 72, bottom: 0, left: 72, right: 72 },
  });
  const buffers = [];

  doc.on("data", (chunk) => buffers.push(chunk));

  let entityNameForFile = "";

  const finished = new Promise((resolve, reject) => {
    doc.on("end", async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers);
        const timestamp = Date.now();
        const safeName = (entityNameForFile || "entity")
          .replace(/[^a-zA-Z0-9]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");
        const filename = `Entity_${safeName}_${timestamp}.pdf`;
        const fileKey = `reports/${userId}/${filename}`;

        const s3Upload = await uploadBufferToS3(pdfBuffer, fileKey);
        const signedUrl = await generatePresignedUrl(fileKey);

        await SalesReport.create({
          userId,
          entityId,
          fromDate,
          toDate,
          filename,
          filePath: s3Upload.Location,
        });

        resolve(signedUrl);
      } catch (uploadError) {
        console.error("S3 or DB error:", uploadError);
        reject(uploadError);
      }
    });

    doc.on("error", reject);
  });

  registerFonts(doc);

  const logoPath = "Assets/countr_logo.png";
  const {
    pageWidth,
    leftMargin,
    rightMargin,
    checkPageBreak,
    drawHeader,
    drawFooter,
  } = createPdfHelpers(doc);

  let pageNum = 1;
  let isInPageAdded = false;

  doc.on("pageAdded", () => {
    if (isInPageAdded) return;
    isInPageAdded = true;
    pageNum++;
    drawHeader(logoPath);
    drawFooter(pageNum, "Order Documentation");
    isInPageAdded = false;
  });

  // Page 1
  drawHeader(logoPath);
  drawFooter(pageNum, "Order Documentation");

  const user = await EntityDetails.findOne({ userId }).populate({
    path: "userId",
    select: "fullName",
    model: "User",
  });
  entityNameForFile = user?.entityName || "";

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(user?.entityName || "[Restaurant Name]", leftMargin + 12, doc.y + 50)
    .font("Helveticaneue-Light")
    .text(
      `Wallee Account: ${user?.walleeSpaceId || "-"}`,
      pageWidth - rightMargin - 200,
      doc.y - 15
    )
    .text(user?.userId?.fullName || "[Account Owner Name]", leftMargin + 12)
    .text(`${user?.location || "[Street]"} ${user?.buildingName || ""}`.trim())
    .text(`${user?.zipcode || "ZIP"} ${user?.city || "City"}`);

  doc
    .fontSize(20)
    .font("Helveticaneue-Light")
    .text("Order Documentation", leftMargin + 12, doc.y + 30)
    .fontSize(12)
    .text(
      `${formatCalendarDDMMYYYY(fromDate)} - ${formatCalendarDDMMYYYY(toDate)}`,
      leftMargin + 15
    )
    .text("Report Exported:", leftMargin + 310, doc.y - 19.5)
    .text(
      formatDateDDMMYYYY(new Date(), timeZone),
      pageWidth - leftMargin - rightMargin - 125,
      doc.y - 11
    );

  doc
    .moveTo(leftMargin + 12, doc.y + 20)
    .lineTo(pageWidth - rightMargin - 40, doc.y + 20)
    .lineWidth(1)
    .strokeColor("#000000")
    .stroke();

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Counter", leftMargin + 12, doc.y + 40)
    .text("Orders", leftMargin + 150, doc.y - 15)
    .text("Avg orders\nper week", leftMargin + 250, doc.y - 15)
    .text(
      "Total Amount\n[CHF]",
      pageWidth - leftMargin - rightMargin - 130,
      doc.y - 28
    );

  const orders = await Order.find({
    status: payload.status,
    entityId,
    createdAt: {
      $gte: start,
      $lte: end,
    },
  });

  const counterMap = {};
  for (const order of orders) {
    const cid = order.counterId?.toString();
    if (cid) {
      if (!counterMap[cid]) counterMap[cid] = [];
      counterMap[cid].push(order);
    }
  }

  for (const [counterId, orderList] of Object.entries(counterMap)) {
    const counter = await Counter.findOne({ _id: counterId, entityId });
    const totalOrders = orderList.length;
    const totalAmount = orderList.reduce((sum, o) => {
      const amount = o.totalAmount;
      return typeof amount === "number" && !isNaN(amount) ? sum + amount : sum;
    }, 0);

    const weeks = Math.max(
      1,
      (new Date(toDate) - new Date(fromDate)) / (7 * 24 * 60 * 60 * 1000)
    );
    const avgPerWeek = (totalOrders / weeks).toFixed(1);

    checkPageBreak(40);
    doc
      .fontSize(12)
      .font("Helveticaneue-Light")
      .text(
        counter?.counterName || "[Counter name]",
        leftMargin + 12,
        doc.y + 20
      )
      .text(totalOrders.toString(), leftMargin + 160, doc.y - 15)
      .text(avgPerWeek.toString(), leftMargin + 250, doc.y - 12)
      .text(
        `${totalAmount.toFixed(2)}`,
        pageWidth - leftMargin - rightMargin - 130,
        doc.y - 14
      );
  }

  // ── Counter summary line ────────────────────────────────────────────
  const totalCounterOrders = orders.length;
  const totalCounterAmount = orders.reduce((sum, o) => {
    const amount = o.totalAmount;
    return typeof amount === "number" && !isNaN(amount) ? sum + amount : sum;
  }, 0);
  const amountPerOrder =
    totalCounterOrders > 0 ? totalCounterAmount / totalCounterOrders : 0;

  checkPageBreak(30);
  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(
      `${amountPerOrder.toFixed(2)}`,
      pageWidth - leftMargin - rightMargin - 130,
      doc.y + 20
    );

  // ── Item-wise analysis ───────────────────────────────────────────────
  const allItemIds = new Set();
  for (const order of orders) {
    for (const orderItem of order.items || []) {
      const id = orderItem.itemId?.toString();
      if (id) allItemIds.add(id);
    }
  }

  const itemDetailsMap = {};
  if (allItemIds.size > 0) {
    const objectIds = [...allItemIds].map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    const itemDocs = await ItemDetails.find(
      { _id: { $in: objectIds } },
      "itemName price"
    ).lean();
    for (const d of itemDocs) {
      itemDetailsMap[d._id.toString()] = d;
    }
  }

  const itemMap = {};
  for (const order of orders) {
    for (const orderItem of order.items || []) {
      const itemId = orderItem.itemId?.toString();
      if (!itemId) continue;
      const liveDoc = itemDetailsMap[itemId];
      const itemName = liveDoc?.itemName || orderItem.itemName;
      const itemPrice = liveDoc?.price ?? orderItem.itemPrice ?? 0;
      if (!itemMap[itemId]) {
        itemMap[itemId] = {
          quantity: 0,
          totalAmount: 0,
          itemName,
          itemPrice,
          lastOrderedAt: order.createdAt,
        };
      }
      itemMap[itemId].quantity += orderItem.quantity || 1;
      itemMap[itemId].totalAmount =
        itemMap[itemId].itemPrice * itemMap[itemId].quantity;
      if (order.createdAt > itemMap[itemId].lastOrderedAt) {
        itemMap[itemId].lastOrderedAt = order.createdAt;
      }
    }
  }

  if (Object.keys(itemMap).length > 0) {
    checkPageBreak(80);
    // Divider
    doc
      .moveTo(leftMargin + 12, doc.y + 30)
      .lineTo(pageWidth - rightMargin - 40, doc.y + 30)
      .lineWidth(1)
      .strokeColor("#000000")
      .stroke();

    // Table headers
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Item name", leftMargin + 12, doc.y + 50)
      .text("Item price", leftMargin + 200, doc.y - 15)
      .text("Orders", leftMargin + 320, doc.y - 15)
      .text(
        "Total Amount\n[CHF]",
        pageWidth - leftMargin - rightMargin - 130,
        doc.y - 28
      );

    // Table rows — sorted by most recently ordered first
    const sortedItems = Object.values(itemMap).sort(
      (a, b) => new Date(b.lastOrderedAt) - new Date(a.lastOrderedAt)
    );
    for (const entry of sortedItems) {
      checkPageBreak(35);
      doc
        .fontSize(12)
        .font("Helveticaneue-Light")
        .text(entry.itemName || "[Item]", leftMargin + 12, doc.y + 20)
        .text(
          `${(entry.itemPrice || 0).toFixed(2)}`,
          leftMargin + 200,
          doc.y - 15
        )
        .text(entry.quantity.toString(), leftMargin + 330, doc.y - 12)
        .text(
          entry.totalAmount.toFixed(2),
          pageWidth - leftMargin - rightMargin - 130,
          doc.y - 14
        );
    }
  }

  doc.fillColor("#000000");
  doc.end();

  return await finished;
};
