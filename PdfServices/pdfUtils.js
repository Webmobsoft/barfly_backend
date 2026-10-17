const {
  RECEIPT_TIMEZONE,
  RECEIPT_LOCALE,
} = require("../Utils/globalConstants");

const PDF_LAYOUT = {
  leftMargin: 25,
  rightMargin: 20,
  topMargin: 30,
};

// Validate a client-supplied IANA timezone. An invalid value would make
// toLocaleString/toLocaleDateString throw, so fall back to RECEIPT_TIMEZONE
// when it's missing or not a real timezone.
const resolveTimeZone = (tz) => {
  if (!tz) return RECEIPT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return RECEIPT_TIMEZONE;
  }
};

// Format a date as DD.MM.YYYY in the given timezone (defaults to Swiss time).
// Dates are rendered server-side (UTC in prod), so without an explicit timezone
// a date near midnight could be off by a day. Falls back to now for
// missing/invalid dates, and to RECEIPT_TIMEZONE for missing/invalid timezones.
const formatDateDDMMYYYY = (d, timeZone) => {
  const parsed = new Date(d || Date.now());
  const date = isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toLocaleDateString(RECEIPT_LOCALE, {
    timeZone: resolveTimeZone(timeZone),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

// Month-name lookup for the legacy "dd MMM, yyyy" format. Includes English and
// German abbreviations so a DE-localized client (e.g. "01 Mai, 2026") still
// parses — native `new Date()` rejects non-English month names.
const MONTH_INDEX = {
  jan: 1, feb: 2, mar: 3, "mär": 3, mrz: 3, apr: 4, may: 5, mai: 5,
  jun: 6, juni: 6, jul: 7, juli: 7, aug: 8, sep: 9, sept: 9, oct: 10,
  okt: 10, nov: 11, dec: 12, dez: 12,
};

// Extract calendar {year, month (1-12), day} from a date input, WITHOUT relying
// on the host timezone. Accepts ISO "yyyy-MM-dd", legacy "dd MMM, yyyy"
// (EN/DE), or a Date object. Returns null if it cannot be parsed.
const parseCalendarParts = (input) => {
  if (input instanceof Date && !isNaN(input.getTime())) {
    return { year: input.getFullYear(), month: input.getMonth() + 1, day: input.getDate() };
  }
  const s = String(input || "").trim();
  // ISO: yyyy-MM-dd (optionally with time) — split, no Date parsing needed
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  // Legacy: "dd MMM, yyyy" / "d MMM yyyy" (EN or DE month names)
  m = s.match(/^(\d{1,2})\s+([A-Za-zäöüÄÖÜ.]+),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_INDEX[m[2].toLowerCase().replace(/\.$/, "")];
    if (mo) return { year: +m[3], month: mo, day: +m[1] };
  }
  // Last resort: native parser (handles other locale-specific shapes)
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return { year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate() };
  }
  return null;
};

// Format a picked calendar date verbatim as DD.MM.YYYY — NO timezone conversion.
// Use for user-selected range dates (fromDate/toDate): they're calendar values,
// not instants, so converting them through a timezone could shift the shown day.
// Accepts ISO, legacy "dd MMM, yyyy" (EN/DE), or a Date. Empty string if unparseable.
const formatCalendarDDMMYYYY = (input) => {
  const p = parseCalendarParts(input);
  if (!p) return "";
  return `${String(p.day).padStart(2, "0")}.${String(p.month).padStart(2, "0")}.${p.year}`;
};

// Offset (ms) of `timeZone` from UTC at the given instant — DST-aware.
const tzOffsetMs = (date, timeZone) => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
};

// UTC instant for the start (or end) of calendar day {year,month,day} in a
// timezone. The tz offset is computed on a whole-second reference (formatToParts
// has no millisecond precision), then the milliseconds are applied separately,
// so the boundary is exact. Day boundaries are never inside a DST gap.
const zonedBoundary = (parts, timeZone, endOfDay) => {
  const [h, mi, s, ms] = endOfDay ? [23, 59, 59, 999] : [0, 0, 0, 0];
  const ref = Date.UTC(parts.year, parts.month - 1, parts.day, h, mi, s, 0);
  const offset = tzOffsetMs(new Date(ref), timeZone);
  return new Date(ref + ms - offset);
};

// Build a UTC {start, end} query window for a calendar date range expressed in
// the client's timezone. Accepts ISO or legacy "dd MMM, yyyy" inputs. If a value
// can't be parsed, falls back to the old server-local day boundary so the report
// never breaks (backward compatible during rollout).
const getZonedDateRange = (fromDate, toDate, timeZone) => {
  const tz = resolveTimeZone(timeZone);
  const fromParts = parseCalendarParts(fromDate);
  const toParts = parseCalendarParts(toDate);

  let start;
  if (fromParts) {
    start = zonedBoundary(fromParts, tz, false);
  } else {
    start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
  }

  let end;
  if (toParts) {
    end = zonedBoundary(toParts, tz, true);
  } else {
    end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end, timeZone: tz };
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
      .text(
        `${footerLabel} ${new Date().getFullYear()}`,
        leftMargin + 12,
        pageHeight - 30
      )
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
  formatCalendarDDMMYYYY,
  resolveTimeZone,
  parseCalendarParts,
  getZonedDateRange,
  registerFonts,
  createPdfHelpers,
};
