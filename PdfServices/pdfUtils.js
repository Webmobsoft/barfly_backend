const PDF_LAYOUT = {
  leftMargin: 25,
  rightMargin: 20,
  topMargin: 30,
};

const formatDateDDMMYYYY = (d) => {
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const registerFonts = (doc) => {
  doc.registerFont(
    "Helveticaneue-Light",
    "Assets/fonts/HelveticaNeueLight.otf"
  );
  doc.registerFont(
    "Helveticaneue-Medium",
    "Assets/fonts/HelveticaNeueMedium.otf"
  );
  doc.registerFont(
    "Helveticaneue-Regular",
    "Assets/fonts/HelveticaNeue Regular.ttf"
  );
};

const createPdfHelpers = (doc) => {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const { leftMargin, rightMargin, topMargin } = PDF_LAYOUT;
  const footerY = pageHeight - 50;

  const drawFooterDivider = () => {
    doc
      .moveTo(leftMargin + 12, footerY)
      .lineTo(pageWidth - rightMargin - 40, footerY)
      .lineWidth(0.5)
      .strokeColor("#888888")
      .stroke();
  };

  const checkPageBreak = (spaceNeeded = 40) => {
    if (doc.y + spaceNeeded > footerY) {
      doc.addPage();
    }
  };

  const drawHeader = (logoPath) => {
    doc.image(logoPath, leftMargin, topMargin, { width: 250, height: 70 });
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(
        "countr app",
        pageWidth - leftMargin - rightMargin - 130,
        topMargin + 25
      )
      .fontSize(11)
      .font("Helveticaneue-Light")
      .text(
        "www.countr-app.ch",
        pageWidth - leftMargin - rightMargin - 130,
        topMargin + 42
      )
      .text(
        "info@countr-app.ch",
        pageWidth - leftMargin - rightMargin - 130,
        topMargin + 56
      );
  };

  const drawFooter = (pageNum, footerLabel) => {
    drawFooterDivider();
    doc
      .fontSize(10)
      .font("Helveticaneue-Light")
      .fillColor("#888888")
      .text(`${footerLabel} ${new Date().getFullYear()}`, leftMargin + 12, pageHeight - 30)
      .text(`Page ${pageNum}`, pageWidth - rightMargin - 200, pageHeight - 30)
      .fillColor("#000000");
    doc.y = topMargin + 90;
  };

  return {
    pageWidth,
    pageHeight,
    footerY,
    leftMargin,
    rightMargin,
    topMargin,
    drawFooterDivider,
    checkPageBreak,
    drawHeader,
    drawFooter,
  };
};

module.exports = {
  PDF_LAYOUT,
  formatDateDDMMYYYY,
  registerFonts,
  createPdfHelpers,
};
