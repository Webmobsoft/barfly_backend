// Validation and normalisation of the weekly grid an owner saves for a
// counter: 7 days (0 = Monday … 6 = Sunday), each switched on or off, with up
// to two time blocks.

const { parseHHmm } = require("./time");
const {
  ORDER_MODES,
  MAX_BLOCKS_PER_DAY,
  DEFAULT_PREP_TIME_MINUTES,
} = require("./counterState");

const MAX_PREP_TIME_MINUTES = 120;
const MAX_BLOCK_NAME_LENGTH = 30;

const emptyWeek = () =>
  Array.from({ length: 7 }, (_, day) => ({ day, enabled: false, blocks: [] }));

// Returns { value, errors }. `errors` holds translation keys with params.
const normalizeOpeningHours = (input) => {
  const errors = [];
  const week = emptyWeek();

  if (!Array.isArray(input)) {
    return { value: week, errors: [{ key: "HOURS_INVALID_FORMAT" }] };
  }

  input.forEach((rawDay, index) => {
    const day = Number.isInteger(rawDay?.day) ? rawDay.day : index;
    if (day < 0 || day > 6) {
      errors.push({ key: "HOURS_INVALID_DAY", params: { day } });
      return;
    }
    const rawBlocks = Array.isArray(rawDay?.blocks) ? rawDay.blocks : [];
    if (rawBlocks.length > MAX_BLOCKS_PER_DAY) {
      errors.push({
        key: "HOURS_TOO_MANY_BLOCKS",
        params: { day, max: MAX_BLOCKS_PER_DAY },
      });
    }

    const blocks = rawBlocks.slice(0, MAX_BLOCKS_PER_DAY).map((rawBlock) => {
      const pickupFrom = rawBlock?.pickupFrom;
      const pickupTo = rawBlock?.pickupTo;
      const fromMin = parseHHmm(pickupFrom);
      const toMin = parseHHmm(pickupTo);
      const mode = rawBlock?.mode;

      if (fromMin === null || toMin === null || fromMin === toMin) {
        errors.push({ key: "HOURS_INVALID_TIME", params: { day } });
      }
      if (!Object.values(ORDER_MODES).includes(mode)) {
        errors.push({ key: "HOURS_INVALID_MODE", params: { day } });
      }

      let orderCutoff = null;
      if (mode === ORDER_MODES.PREORDER || mode === ORDER_MODES.BOTH) {
        const cutoffMin = parseHHmm(rawBlock?.orderCutoff);
        if (cutoffMin === null) {
          errors.push({ key: "HOURS_CUTOFF_REQUIRED", params: { day } });
        } else if (fromMin !== null && cutoffMin > fromMin) {
          errors.push({ key: "HOURS_CUTOFF_AFTER_PICKUP", params: { day } });
        } else {
          orderCutoff = rawBlock.orderCutoff;
        }
      }

      const name =
        typeof rawBlock?.name === "string"
          ? rawBlock.name.trim().slice(0, MAX_BLOCK_NAME_LENGTH)
          : "";

      return {
        ...(rawBlock?._id ? { _id: rawBlock._id } : {}),
        name,
        pickupFrom,
        pickupTo,
        mode,
        orderCutoff,
      };
    });

    // Blocks of one day must not overlap.
    const ranges = blocks
      .map((block) => {
        const from = parseHHmm(block.pickupFrom);
        let to = parseHHmm(block.pickupTo);
        if (from === null || to === null) return null;
        if (to <= from) to += 24 * 60;
        return { from, to };
      })
      .filter(Boolean)
      .sort((a, b) => a.from - b.from);
    for (let i = 1; i < ranges.length; i += 1) {
      if (ranges[i].from < ranges[i - 1].to) {
        errors.push({ key: "HOURS_BLOCKS_OVERLAP", params: { day } });
      }
    }

    week[day] = {
      day,
      enabled: Boolean(rawDay?.enabled) && blocks.length > 0,
      blocks,
    };
  });

  return { value: week, errors };
};

const normalizePrepTime = (input) => {
  if (input === undefined || input === null || input === "") {
    return { value: DEFAULT_PREP_TIME_MINUTES, errors: [] };
  }
  const prep = Number(input);
  if (!Number.isInteger(prep) || prep < 0 || prep > MAX_PREP_TIME_MINUTES) {
    return {
      value: DEFAULT_PREP_TIME_MINUTES,
      errors: [
        { key: "HOURS_INVALID_PREP_TIME", params: { max: MAX_PREP_TIME_MINUTES } },
      ],
    };
  }
  return { value: prep, errors: [] };
};

module.exports = {
  normalizeOpeningHours,
  normalizePrepTime,
  emptyWeek,
  MAX_PREP_TIME_MINUTES,
};
