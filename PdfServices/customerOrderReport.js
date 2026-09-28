const PDFDocument = require("pdfkit");
const User = require("../Models/User");
const EntityDetails = require("../Models/EntityDetails");
const CustomerOrderReport = require("../Models/CustomerOrderReport");
const ItemDetails = require("../Models/ItemDetails");
const {
  uploadBufferToS3,
  generatePresignedUrl,
} = require("../Controller/aws-service");
const { createMail } = require("../Utils/mailer");
const { registerFonts, createPdfHelpers } = require("./pdfUtils");
const {
  RECEIPT_TIMEZONE,
  RECEIPT_LOCALE,
} = require("../Utils/globalConstants");

const genrateCustomerOrderReport = async (req) => {
  const { userId, entityId, orders, mode = "Online" } = req;

  const doc = new PDFDocument({
    size: [595, 842],
    margins: { top: 72, bottom: 0, left: 72, right: 72 },
  });
  const buffers = [];
  const currentUser = await User.findById(userId).select("email fullName");

  doc.on("data", (chunk) => buffers.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on("end", async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers);
        const timestamp = Date.now();
        const fileKey = `orders/${userId}/order_report_${timestamp}.pdf`;
        const filename = `order_report_${timestamp}.pdf`;

        const s3Upload = await uploadBufferToS3(pdfBuffer, fileKey);
        const signedUrl = generatePresignedUrl(fileKey);

        await CustomerOrderReport.create({
          userId,
          entityId,
          date: new Date(),
          filename: filename,
          filePath: s3Upload.Location,
        });

        if (currentUser && currentUser.email) {
          const mailData = {
            to: currentUser.email,
            subject: "Your Order Report",
            text: `Dear ${
              currentUser.fullName || "Customer"
            },\n\nPlease find your order report attached.\n\nThank you for using our service!\n\nBest regards,\ncountr App Team`,
            attachments: [
              {
                filename: filename,
                content: pdfBuffer,
                contentType: "application/pdf",
              },
            ],
          };

          try {
            await createMail(mailData);
          } catch (emailError) {
            console.error(
              "Error sending order report email:",
              emailError.message
            );
          }
        }

        resolve(signedUrl);
      } catch (uploadError) {
        console.error("S3 or DB error:", uploadError);
        reject(uploadError);
      }
    });

    doc.on("error", reject);
  });

  registerFonts(doc);

  const logoPath = "Assets/countr_receipt_logo.png";
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
    drawFooter(pageNum, "Customer Order");
    isInPageAdded = false;
  });

  // Page 1
  drawHeader(logoPath);
  drawFooter(pageNum, "Customer Order");

  const user = await EntityDetails.findOne({ _id: entityId }).populate({
    path: "userId",
    select: "fullName",
    model: "User",
  });

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(user?.entityName || "[Restaurant Name]", leftMargin + 12, doc.y + 50)
    .font("Helveticaneue-Light")
    .text(
      `${user?.zipcode || "ZIP"} ${user?.city || "City"}`,
      leftMargin + 12,
      doc.y + 4
    );

  // Render the order time in the client's timezone (sent via header at order
  // time and stored on the order). Server runs in UTC otherwise.
  // Falsy createdAt (null/undefined/"") falls back to now; a truthy-but-
  // unparseable value is caught by the isNaN guard so we never print 1970/"Invalid Date".
  const parsedOrderDate = new Date(orders?.createdAt || Date.now());
  const orderDate = isNaN(parsedOrderDate.getTime())
    ? new Date()
    : parsedOrderDate;

  // Validate the client-supplied timezone — an invalid IANA value would make
  // toLocaleString throw, so fall back to RECEIPT_TIMEZONE when missing/invalid.
  const resolveTimeZone = (tz) => {
    if (!tz) return RECEIPT_TIMEZONE;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      return RECEIPT_TIMEZONE;
    }
  };
  const receiptTimeZone = resolveTimeZone(orders?.timezone);

  doc
    .fontSize(12)
    .font("Helveticaneue-Light")
    .text(
      orderDate.toLocaleString(RECEIPT_LOCALE, {
        timeZone: receiptTimeZone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      leftMargin + 12,
      doc.y + 30
    )
    .fontSize(12)
    .text(
      `Payment Method: ${mode}${
        orders.paymentMethod ? ` (${orders.paymentMethod})` : ""
      }`,
      leftMargin + 12,
      doc.y + 3
    )
    .text(`${currentUser?.email || ""}`, leftMargin + 350, doc.y - 19.5);

  doc
    .moveTo(leftMargin + 12, doc.y + 20)
    .lineTo(pageWidth - rightMargin - 40, doc.y + 20)
    .lineWidth(1)
    .strokeColor("#000000")
    .stroke();

  doc
    .fontSize(12)
    .font("Helvetica-Bold")
    .text("Quantity", leftMargin + 12, doc.y + 40)
    .text("Item name", leftMargin + 150, doc.y - 15)
    .text("Item price", leftMargin + 250, doc.y - 15)
    .text(
      "Total Price[CHF]",
      pageWidth - leftMargin - rightMargin - 130,
      doc.y - 15
    );

  const orderItems = orders.items || [];

  for (const orderItem of orderItems) {
    const itemId = orderItem.itemId;
    const quantity = orderItem.quantity || 1;

    let itemName = "[Item name]";
    let itemPrice = 0;

    if (itemId && typeof itemId === "object" && itemId.itemName) {
      itemName = itemId.itemName;
      itemPrice = itemId.price || 0;
    } else if (itemId) {
      try {
        const item = await ItemDetails.findById(itemId).select(
          "itemName price"
        );
        if (item) {
          itemName = item.itemName;
          itemPrice = item.price || 0;
        }
      } catch (error) {
        console.error("Error fetching item details:", error);
      }
    }

    const itemTotal = (itemPrice * quantity).toFixed(2);

    checkPageBreak(35);
    doc
      .fontSize(12)
      .font("Helveticaneue-Light")
      .text(quantity.toString(), leftMargin + 12, doc.y + 20)
      .text(itemName, leftMargin + 150, doc.y - 15)
      .text(`${itemPrice.toFixed(2)}`, leftMargin + 250, doc.y - 12)
      .text(itemTotal, pageWidth - leftMargin - rightMargin - 130, doc.y - 14);
  }

  const platformFees = orders.platformFees || 0;

  checkPageBreak(40);
  if (platformFees > 0) {
    doc
      .fontSize(12)
      .font("Helveticaneue-Light")
      .text("Platform Fee:", leftMargin + 190, doc.y + 20)
      .text(
        `${platformFees.toFixed(2)} CHF`,
        pageWidth - leftMargin - rightMargin - 130,
        doc.y - 14
      );
  }

  checkPageBreak(35);
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Total Amount (including tax):", leftMargin + 190, doc.y + 15)
    .text(
      `${(orders.finalAmount || 0).toFixed(2)} CHF`,
      pageWidth - leftMargin - rightMargin - 130,
      doc.y - 16.5
    );

  doc.fillColor("#000000");
  doc.end();

  return await finished;
};

module.exports = { genrateCustomerOrderReport };
