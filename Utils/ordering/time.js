// Venue-local time helpers. All opening-hours rules are written in the
// venue's wall-clock time (e.g. "11:30" in Europe/Zurich), while the server
// and the database work in UTC instants. These helpers convert between the
// two using Intl only, so DST changes are handled without extra libraries.

const DEFAULT_TIMEZONE = "Europe/Zurich";
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const formatterCache = {};

const getFormatter = (timezone) => {
  if (!formatterCache[timezone]) {
    formatterCache[timezone] = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return formatterCache[timezone];
};

const isValidTimezone = (timezone) => {
  if (!timezone || typeof timezone !== "string") return false;
  try {
    getFormatter(timezone);
    return true;
  } catch (error) {
    return false;
  }
};

const resolveTimezone = (timezone) =>
  isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;

// Wall-clock parts of an instant in a timezone. weekday: 0 = Monday … 6 = Sunday.
const getLocalParts = (date, timezone) => {
  const parts = {};
  getFormatter(resolveTimezone(timezone))
    .formatToParts(date)
    .forEach(({ type, value }) => {
      parts[type] = value;
    });
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const jsWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    year,
    month,
    day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: (jsWeekday + 6) % 7,
  };
};

// Offset (ms) of the timezone from UTC at the given instant.
const getOffsetMs = (date, timezone) => {
  const p = getLocalParts(date, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const instant = Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS;
  return asUtc - instant;
};

// UTC instant of a wall-clock time in a timezone. Minutes may exceed 24 h
// (e.g. 25:00 = 01:00 next day), which keeps "past midnight" blocks simple.
const zonedTimeToDate = ({ year, month, day }, minutesOfDay, timezone) => {
  const tz = resolveTimezone(timezone);
  const guess = Date.UTC(year, month - 1, day) + minutesOfDay * MINUTE_MS;
  const firstOffset = getOffsetMs(new Date(guess), tz);
  let result = guess - firstOffset;
  const secondOffset = getOffsetMs(new Date(result), tz);
  if (secondOffset !== firstOffset) {
    result = guess - secondOffset;
  }
  return new Date(result);
};

// Calendar date `days` away from a local date (pure date arithmetic).
const addDays = ({ year, month, day }, days) => {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: (d.getUTCDay() + 6) % 7,
  };
};

// "HH:mm" -> minutes since midnight, or null when malformed.
const parseHHmm = (value) => {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const formatHHmm = (minutes) => {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(
    m % 60,
  ).padStart(2, "0")}`;
};

module.exports = {
  DEFAULT_TIMEZONE,
  MINUTE_MS,
  DAY_MS,
  isValidTimezone,
  resolveTimezone,
  getLocalParts,
  zonedTimeToDate,
  addDays,
  parseHHmm,
  formatHHmm,
};
