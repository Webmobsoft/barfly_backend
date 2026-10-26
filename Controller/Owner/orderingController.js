// Owner endpoints for when and how guests can order at a counter: the weekly
// opening hours, preparation time, orders per slot, and pausing.
// Mounted at /api/owner/restaurant next to the main owner router.

const express = require("express");
const mongoose = require("mongoose");
const Counter = require("../../Models/Counter");
const { STATUS, STATUS_CODES } = require("../../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("../../Utils/translator");
const throwError = require("../../Utils/throwError");
const {
  PAUSE_KINDS,
  getCounterState,
  computePauseUntil,
  normalizeOpeningHours,
  normalizePrepTime,
  emptyWeek,
  getActivePause,
} = require("../../Utils/ordering");
const {
  COUNTER_STATE_FIELDS,
  getEntityTimezone,
  serializeState,
  emitCounterState,
} = require("../../CustomerServices/orderingService");

const router = express.Router();
const { ObjectId } = mongoose.Types;

const MAX_ORDERS_PER_SLOT = 999;

const requireOwner = (req) => {
  if (!req.entityId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("AUTH_TOKEN_INVALID", getLanguageFromRequest(req)),
    });
  }
};

const findOwnCounter = async (req, counterId) => {
  if (!ObjectId.isValid(counterId)) return null;
  return Counter.findOne(
    { _id: counterId, entityId: req.entityId, status: STATUS.ACTIVE },
    COUNTER_STATE_FIELDS,
  ).lean();
};

// The full week, always 7 entries, so the screens never have to fill gaps.
const fullWeek = (openingHours) => {
  const week = emptyWeek();
  (openingHours || []).forEach((entry) => {
    if (entry && Number.isInteger(entry.day) && week[entry.day]) {
      week[entry.day] = entry;
    }
  });
  return week;
};

const toSettings = (counter, timezone, now = new Date()) => ({
  counterId: counter._id,
  counterName: counter.counterName,
  openingHours: fullWeek(counter.openingHours),
  prepTimeMinutes: counter.prepTimeMinutes,
  ordersPerSlot: counter.ordersPerSlot ?? null,
  // Only a pause that is still running: a timed pause that ran out must not
  // keep the boards' pause banner up.
  pause: getActivePause(counter.pause, now) ? counter.pause : null,
  orderingState: serializeState(getCounterState({ counter, now, timezone })),
  timezone,
});

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
      ...(error.data ? { data: error.data } : {}),
    });
  }
};

// GET ?counterId= → one counter; without it → every active counter.
router.get(
  "/counter-ordering-settings",
  handle(
    async (req, lang) => {
      const timezone = await getEntityTimezone(req.entityId);
      if (req.query.counterId) {
        const counter = await findOwnCounter(req, req.query.counterId);
        if (!counter) {
          throwError({
            status: STATUS_CODES.NOT_FOUND,
            message: t("COUNTER_NOT_FOUND", lang),
          });
        }
        return { data: toSettings(counter, timezone) };
      }
      const counters = await Counter.find(
        { entityId: req.entityId, status: STATUS.ACTIVE },
        COUNTER_STATE_FIELDS,
      )
        .sort({ createdAt: 1 })
        .lean();
      return { data: counters.map((counter) => toSettings(counter, timezone)) };
    },
    "ORDERING_SETTINGS_FETCH_SUCCESS",
    "ORDERING_SETTINGS_FETCH_ERROR",
  ),
);

// PUT { counterId, openingHours: [7 days], prepTimeMinutes? }
router.put(
  "/counter-opening-hours",
  handle(
    async (req, lang) => {
      const { counterId, openingHours, prepTimeMinutes } = req.body;
      const counter = await findOwnCounter(req, counterId);
      if (!counter) {
        throwError({
          status: STATUS_CODES.NOT_FOUND,
          message: t("COUNTER_NOT_FOUND", lang),
        });
      }

      const hours = normalizeOpeningHours(openingHours);
      const prep =
        prepTimeMinutes === undefined
          ? { value: counter.prepTimeMinutes, errors: [] }
          : normalizePrepTime(prepTimeMinutes);
      const errors = [...hours.errors, ...prep.errors];
      if (errors.length) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t(errors[0].key, lang, errors[0].params),
          code: errors[0].key,
          data: { errors },
        });
      }

      const updated = await Counter.findOneAndUpdate(
        { _id: counter._id },
        {
          $set: {
            openingHours: hours.value,
            prepTimeMinutes: prep.value,
          },
        },
        { new: true, projection: COUNTER_STATE_FIELDS, lean: true },
      );
      await emitCounterState(updated);
      const timezone = await getEntityTimezone(req.entityId);
      return { data: toSettings(updated, timezone) };
    },
    "OPENING_HOURS_UPDATE_SUCCESS",
    "OPENING_HOURS_UPDATE_ERROR",
  ),
);

// PUT { counterId, ordersPerSlot } — null or 0 removes the limit.
router.put(
  "/counter-orders-per-slot",
  handle(
    async (req, lang) => {
      const { counterId } = req.body;
      const counter = await findOwnCounter(req, counterId);
      if (!counter) {
        throwError({
          status: STATUS_CODES.NOT_FOUND,
          message: t("COUNTER_NOT_FOUND", lang),
        });
      }
      const raw = req.body.ordersPerSlot;
      const ordersPerSlot =
        raw === null || raw === undefined || Number(raw) === 0
          ? null
          : Number(raw);
      if (
        ordersPerSlot !== null &&
        (!Number.isInteger(ordersPerSlot) ||
          ordersPerSlot < 1 ||
          ordersPerSlot > MAX_ORDERS_PER_SLOT)
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("ORDERS_PER_SLOT_INVALID", lang, {
            max: MAX_ORDERS_PER_SLOT,
          }),
          code: "ORDERS_PER_SLOT_INVALID",
        });
      }
      const updated = await Counter.findOneAndUpdate(
        { _id: counter._id },
        { $set: { ordersPerSlot } },
        { new: true, projection: COUNTER_STATE_FIELDS, lean: true },
      );
      await emitCounterState(updated);
      const timezone = await getEntityTimezone(req.entityId);
      return { data: toSettings(updated, timezone) };
    },
    "ORDERS_PER_SLOT_UPDATE_SUCCESS",
    "ORDERS_PER_SLOT_UPDATE_ERROR",
  ),
);

// The counters a pause applies to: one, or all ("All Counter" selected).
const targetCounters = async (req, lang) => {
  const { counterId } = req.body;
  if (counterId) {
    const counter = await findOwnCounter(req, counterId);
    if (!counter) {
      throwError({
        status: STATUS_CODES.NOT_FOUND,
        message: t("COUNTER_NOT_FOUND", lang),
      });
    }
    return [counter];
  }
  return Counter.find(
    { entityId: req.entityId, status: STATUS.ACTIVE },
    COUNTER_STATE_FIELDS,
  ).lean();
};

// POST { counterId?, kind: "15m" | "30m" | "manual" | "today" }
router.post(
  "/pause-orders",
  handle(
    async (req, lang) => {
      const { kind } = req.body;
      if (!Object.values(PAUSE_KINDS).includes(kind)) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("PAUSE_KIND_INVALID", lang),
          code: "PAUSE_KIND_INVALID",
        });
      }
      const counters = await targetCounters(req, lang);
      const timezone = await getEntityTimezone(req.entityId);
      const now = new Date();
      const pause = {
        kind,
        until: computePauseUntil(kind, now, timezone),
        startedAt: now,
      };
      await Counter.updateMany(
        { _id: { $in: counters.map((counter) => counter._id) } },
        { $set: { pause } },
      );
      const updated = counters.map((counter) => ({ ...counter, pause }));
      await Promise.all(updated.map(emitCounterState));
      return { data: updated.map((counter) => toSettings(counter, timezone)) };
    },
    "ORDERS_PAUSED_SUCCESS",
    "ORDERS_PAUSE_ERROR",
  ),
);

// POST { counterId? }
router.post(
  "/resume-orders",
  handle(
    async (req, lang) => {
      const counters = await targetCounters(req, lang);
      const timezone = await getEntityTimezone(req.entityId);
      await Counter.updateMany(
        { _id: { $in: counters.map((counter) => counter._id) } },
        { $unset: { pause: "" } },
      );
      const updated = counters.map((counter) => ({ ...counter, pause: null }));
      await Promise.all(updated.map(emitCounterState));
      return { data: updated.map((counter) => toSettings(counter, timezone)) };
    },
    "ORDERS_RESUMED_SUCCESS",
    "ORDERS_RESUME_ERROR",
  ),
);

module.exports = router;
