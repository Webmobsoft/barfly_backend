const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const Event = require("../../Models/Event");
const { Country, State, City } = require("country-state-city");

const { ObjectId } = mongoose.Types;
const {
  STATUS_CODES,
  STATUS,
  EDIT_ACTION,
  COUNTRY_ARRAY,
  ANSWER_TYPES,
  APP_FEEDBACK_QUESTIONS,
  ROLES,
} = require("../../Utils/globalConstants");
const throwError = require("../../Utils/throwError");
const EntityDetails = require("../../Models/EntityDetails");
const Counter = require("../../Models/Counter");
const MenuCategory = require("../../Models/MenuCategory");
const MenuItem = require("../../Models/MenuItem");
const FavouriteEntity = require("../../Models/FavouriteEntity");
const ItemDetails = require("../../Models/ItemDetails");
const { generatePresignedUrl } = require("../aws-service");
const User = require("../../Models/User");
const FavouriteItem = require("../../Models/FavouriteItem");
const Cards = require("../../Models/Cards");
const Otp = require("../../Models/Otp");
const { createMail, sendSMS } = require("../../Utils/mailer");
const otpVerificationTemplate = require("../../Utils/emailTemplates/otpVerification");
const {
  haversineDistance,
  comparePassword,
  verifyTokenWithoutResponse,
} = require("../../Utils/commonFunction");
const Location = require("./../../Models/Location");
const Userfeedback = require("../../Models/UserFeedback");
const SearchLogs = require("../../Models/searchLogs");
const Discount = require("../../Models/Discount");
const FeedbackQuestions = require("../../Models/FeedbackQuestions");
const Tables = require("../../Models/Tables");
const notificationSettings = require("../../Models/notificationSettings");
const { io } = require("../../app");
const { t, getLanguageFromRequest } = require("../../Utils/translator");
const verifyToken = require("../../Utils/verifyToken");
const UserAppFeedback = require("../../Models/UserAppFeedback");

module.exports.getEntities = async (req) => {
  const {
    limit = 30,
    skip = 0,
    searchTerm,
    isNewlyAdded,
    isPopular,
  } = req.query;
  const now = new Date();
  // console.log(req.headers["token"], "token"); // Logs sensitive token
  const token = req.headers["token"];
  if (token != null && typeof token === "string" && token.trim().length > 0) {
    await verifyTokenWithoutResponse(req);
  }

  const userId = req.id || req.userId;
  const favouritesList = await FavouriteEntity.find(
    { userId, isFavourite: true },
    { _id: 1, entityId: 1 },
    { lean: true }
  );

  const favouritesIdsSet = new Set();
  favouritesList.forEach((id) => {
    if (id.entityId) {
      favouritesIdsSet.add(id.entityId.toString());
    }
  });
  const currentRunningEvents = await Event.find(
    {
      $and: [
        { from: { $lte: now } },
        { to: { $gte: now } },
        { entityId: { $exists: true } },
      ],
    },
    {
      entityId: 1,
      counterIds: 1,
      from: 1,
      to: 1,
      isRepetitive: 1,
      repetitiveDays: 1,
      serialType: 1,
      isAllDay: 1,
    }
  );
  const nowUTC = new Date();
  // Use UTC day for consistency with owner API
  let currentDay = nowUTC.getUTCDay();
  currentDay = currentDay === 0 ? 6 : currentDay - 1; // Convert to array format (0=Mon, 6=Sun)
  let entityIds = [];

  currentRunningEvents.forEach((event) => {
    if (event.isRepetitive) {
      // Check if repetitiveDays array is valid
      if (
        !Array.isArray(event.repetitiveDays) ||
        event.repetitiveDays.length !== 7
      ) {
        // If invalid repetitiveDays, treat as non-repetitive (same as get-ongoing-event-details)
        // console.log(`[getEntities] Treating repetitive event ${event._id} as non-repetitive (invalid repetitiveDays)`); // Debug log
        // Continue to non-repetitive logic below
      } else {
        // Simple 3-step check for repetitive events (same as get-ongoing-event-details):
        // 1. Overall date range
        // 2. Daily time window
        // 3. Day match

        const eventFrom = new Date(event.from);
        const eventTo = new Date(event.to);

        // Step 1: Check overall date range
        if (nowUTC < eventFrom || nowUTC > eventTo) {
          return;
        }

        // Step 2: Check daily time window (only if not all day)
        if (!event.isAllDay) {
          // Extract hours/minutes from event start/end
          const startHour = eventFrom.getUTCHours();
          const startMin = eventFrom.getUTCMinutes();
          const endHour = eventTo.getUTCHours();
          const endMin = eventTo.getUTCMinutes();

          // Create today's window
          const todayWindowStart = new Date(
            Date.UTC(
              nowUTC.getUTCFullYear(),
              nowUTC.getUTCMonth(),
              nowUTC.getUTCDate(),
              startHour,
              startMin
            )
          );
          let todayWindowEnd = new Date(
            Date.UTC(
              nowUTC.getUTCFullYear(),
              nowUTC.getUTCMonth(),
              nowUTC.getUTCDate(),
              endHour,
              endMin
            )
          );

          // Handle midnight-spanning events
          if (todayWindowEnd <= todayWindowStart) {
            todayWindowEnd.setUTCDate(todayWindowEnd.getUTCDate() + 1);
          }

          // Check today's window OR yesterday's window (if event started yesterday)
          const inTodayWindow =
            nowUTC >= todayWindowStart && nowUTC <= todayWindowEnd;
          const inYesterdayWindow =
            nowUTC >= eventFrom &&
            nowUTC < todayWindowStart &&
            nowUTC >= new Date(todayWindowStart.getTime() - 86400000) &&
            nowUTC <= new Date(todayWindowEnd.getTime() - 86400000);

          if (!inTodayWindow && !inYesterdayWindow) {
            return;
          }
        }

        // Step 3: Check if today matches repetitive days
        let currentDayForCheck = nowUTC.getUTCDay();
        currentDayForCheck =
          currentDayForCheck === 0 ? 6 : currentDayForCheck - 1; // Convert to array format (0=Mon, 6=Sun)

        if (event.repetitiveDays[currentDayForCheck] !== 1) {
          return;
        }

        // All checks passed for repetitive event
        entityIds.push(event.entityId);
        return;
      }
    }

    // For non-repetitive events (or repetitive events with invalid repetitiveDays):
    // All should check repetitiveDays and only appear on matching days between from and to
    if (
      Array.isArray(event.repetitiveDays) &&
      event.repetitiveDays.length === 7
    ) {
      // Check if today matches the repetitiveDays pattern
      let currentDayForCheck = nowUTC.getUTCDay();
      currentDayForCheck =
        currentDayForCheck === 0 ? 6 : currentDayForCheck - 1; // Convert to array format (0=Mon, 6=Sun)

      if (event.repetitiveDays[currentDayForCheck] !== 1) {
        // Day doesn't match, skip this event
        return;
      }
    }

    // For non-repetitive events, also check UTC time window
    if (!event.isAllDay) {
      const fromHours = new Date(event.from).getUTCHours();
      const fromMinutes = new Date(event.from).getUTCMinutes();
      const toHours = new Date(event.to).getUTCHours();
      const toMinutes = new Date(event.to).getUTCMinutes();
      const eventStartToday = new Date(
        Date.UTC(
          nowUTC.getUTCFullYear(),
          nowUTC.getUTCMonth(),
          nowUTC.getUTCDate(),
          fromHours,
          fromMinutes
        )
      );

      let eventEndToday = new Date(
        Date.UTC(
          nowUTC.getUTCFullYear(),
          nowUTC.getUTCMonth(),
          nowUTC.getUTCDate(),
          toHours,
          toMinutes
        )
      );

      // Handle events that span midnight
      if (eventEndToday <= eventStartToday) {
        eventEndToday.setUTCDate(eventEndToday.getUTCDate() + 1);
      }

      // Check if event spans multiple days - if so, use actual from/to dates
      const eventFromDate = new Date(event.from);
      const eventToDate = new Date(event.to);
      const daysDiff = Math.floor(
        (eventToDate.getTime() - eventFromDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      if (daysDiff > 0) {
        // Multi-day event: check if current time is within the actual from/to range
        if (!(nowUTC >= eventFromDate && nowUTC <= eventToDate)) {
          return;
        }
      } else {
        // Single day event: check UTC time window
        if (!(nowUTC >= eventStartToday && nowUTC <= eventEndToday)) {
          return;
        }
      }
    }
    // If isAllDay is true, skip time window check (event is active all day)

    entityIds.push(event.entityId);
  });

  const query = {
    _id: { $in: entityIds },
    isOpen: true,
    status: STATUS.ACTIVE,
  };
  const sort = {};
  if (isNewlyAdded) {
    const fortyEightHoursago = new Date();
    fortyEightHoursago.setHours(fortyEightHoursago.getHours() - 48);
    query.createdAt = { $gte: fortyEightHoursago };
  } else if (isPopular) {
    sort.views = -1;
  }

  if (searchTerm) {
    query.entityName = { $regex: searchTerm, $options: "i" };
  }

  const currentRunningEntitiesDetails1 = await EntityDetails.find(query, {
    city: 1,
    entityName: 1,
    entityType: 1,
    street: 1,
    image: 1,
    views: 1,
  })
    .sort({ _id: -1 })
    .lean();
  const query2 = {
    _id: { $nin: entityIds },
    isOpen: true,
    status: STATUS.ACTIVE,
  };

  if (isNewlyAdded) {
    const fortyEightHoursago = new Date();
    fortyEightHoursago.setHours(fortyEightHoursago.getHours() - 48);
    query2.createdAt = { $gte: fortyEightHoursago };
  }

  currentRunningEntitiesDetails1.map((items) => {
    if (!items.image) {
      return items;
    }

    items.image = generatePresignedUrl(items.image);
    return items;
  });

  const currentRunningEntitiesDetails = currentRunningEntitiesDetails1.map(
    (entity) => {
      if (favouritesIdsSet.has(entity._id.toString())) {
        entity.isFavouriteEntity = true;
      } else {
        entity.isFavouriteEntity = false;
      }
      return entity;
    }
  );

  if (req.query?.searchTerm && req.query.searchTerm != "") {
    query2.entityName = { $regex: req.query.searchTerm, $options: "i" };
  }

  const remainingEntities = await EntityDetails.find(
    query2,
    {
      city: 1,
      entityName: 1,
      entityType: 1,
      street: 1,
      image: 1,
      views: 1,
    },
    { limit: limit, skip: skip }
  )
    .sort({ _id: -1 })
    .lean();
  remainingEntities.map((items) => {
    if (!items.image) {
      return items;
    }

    items.image = generatePresignedUrl(items.image);
    return items;
  });

  const uniqueRemainingEntities = remainingEntities.map((entity) => {
    if (favouritesIdsSet.has(entity._id.toString())) {
      entity.isFavouriteEntity = true;
    } else {
      entity.isFavouriteEntity = false;
    }
    return entity;
  });

  let currentRunningEntitiesDetailsResponse = [];
  let uniqueRemainingEntitiesResponse = [];
  if (req.query.isFavouriteEntities == "true") {
    currentRunningEntitiesDetailsResponse =
      currentRunningEntitiesDetails.filter((entity) => {
        return entity.isFavouriteEntity;
      });
    uniqueRemainingEntitiesResponse = uniqueRemainingEntities.filter(
      (entity) => {
        return entity.isFavouriteEntity;
      }
    );
  }

  return {
    ongoingEventEntities:
      req.query.isFavouriteEntities == "true"
        ? currentRunningEntitiesDetailsResponse
        : currentRunningEntitiesDetails,
    remainingEntities:
      req.query.isFavouriteEntities == "true"
        ? uniqueRemainingEntitiesResponse
        : uniqueRemainingEntities,
  };
};

module.exports.addFavouriteEntity = async (req) => {
  const userId = req.id || req.userId;
  const { entityId, isFavourite } = req.body;

  if (!userId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("USER_NOT_AUTHENTICATED", getLanguageFromRequest(req)),
    });
  }

  if (!entityId) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ENTITY_ID_REQUIRED", getLanguageFromRequest(req)),
    });
  }

  await FavouriteEntity.updateOne(
    { userId, entityId },
    {
      isFavourite,
    },
    { upsert: true }
  );
  return;
};

module.exports.eventOpened = async (req) => {
  const { eventId } = req.body;
  await Event.updateOne({ _id: eventId }, { $inc: { activeUsers: 1 } });
};

module.exports.eventClosed = async (req) => {
  const { eventId } = req.body;
  await Event.updateOne({ _id: eventId }, { $inc: { activeUsers: -1 } });
};

module.exports.getFavouriteEvents = (req) => {
  const { userId } = req;
  return FavouriteEntity.findOne({ userId }).populate("entityId");
};

module.exports.removeFavouriteEvents = async (req) => {
  const {
    userId,
    body: { eventId },
  } = req;
  const lang = getLanguageFromRequest(req);

  const eventExists = await Event.findById(eventId);
  if (!eventExists) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("EVENT_NOT_FOUND", lang),
    });
  }

  await UserFavourites.updateOne(
    { userId },
    { $pull: { favouritesEvents: eventId } }
  );
};

module.exports.visitorCount = async (req) => {
  const { eventId } = req.body;
  const lang = getLanguageFromRequest(req);
  const eventExists = await Event.findById(eventId);
  if (!eventExists) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("EVENT_NOT_FOUND", lang),
    });
  }
  return Event.findOneAndUpdate({ _id: eventId }, { $inc: { visitor: 1 } });
};

// module.exports.counterList = async (req) => {
//   const { entityId, searchTerm } = req.query;
//   const query = { entityId, status: STATUS.ACTIVE };
//   if (searchTerm) {
//     query.counterName = { $regex: searchTerm, $options: "i" };
//   }
//   const counters = await Counter.find(
//     query,
//     { counterName: 1, totalTables: 1, isTableService: 1 },
//     { sort: { _id: -1 }, lean: true }
//   );
//   const counterIds = counters.map((counter) => ObjectId(counter._id));

//   const now = new Date();
//   const eventOfThisCounters = await Event.find(
//     {
//       counterIds: { $in: counterIds },
//       from: { $lte: now },
//       to: { $gte: now },
//     },
//     {
//       from: 1,
//       to: 1,
//       startingDate: 1,
//       endDate: 1,
//       isRepetitive: 1,
//       repetitiveDays: 1,
//       counterIds: 1,
//     }
//   ).lean();

//   // const counterIdsList = new Set();
//   // console.log({ eventOfThisCounters });
//   // eventOfThisCounters.forEach((event) => {
//   //   console.log({ event }, ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
//   //   event.counterIds.forEach((id) => counterIdsList.add(id.toString()));
//   // });

//   const counterLists = [];
//   const counterIdsSet = new Set();

//   eventOfThisCounters.forEach((event) => {
//     event.counterIds.forEach((counterId) => {
//       counterIdsSet.add(counterId.toString());
//       counterLists.push({
//         counterId: counterId.toString(),
//         eventId: event._id.toString(),
//       });
//     });
//   });

//   await EntityDetails.findByIdAndUpdate(
//     { _id: entityId },
//     { $inc: { views: 1 } }
//   );

//   const counterList = counters
//     .map((counter) => {
//       const matchedCounter = counterLists.find(
//         (c) => c.counterId == counter._id.toString()
//       );

//       return {
//         ...counter,
//         isLive: counterIdsSet.has(counter._id.toString()),
//         eventId: matchedCounter ? matchedCounter.eventId : null,
//       };
//     })
//     .sort((a, b) => b.isLive - a.isLive);

//   return counterList;
// };

// module.exports.counterList = async (req) => {
//   const { entityId, searchTerm } = req.query;
//   const query = { entityId, status: STATUS.ACTIVE };

//   if (searchTerm) {
//     query.counterName = { $regex: searchTerm, $options: "i" };
//   }

//   const counters = await Counter.find(
//     query,
//     { counterName: 1, totalTables: 1, isTableService: 1 },
//     { sort: { _id: -1 }, lean: true }
//   );

//   const counterIds = counters.map((counter) => ObjectId(counter._id));

//   const now = new Date();
//   const currentDay = (now.getDay() + 6) % 7;
//   const currentTime = now.getTime();

//   const events = await Event.find(
//     {
//       counterIds: { $in: counterIds },
//       from: { $lte: now },
//       to: { $gte: now },
//     },
//     {
//       from: 1,
//       to: 1,
//       isRepetitive: 1,
//       repetitiveDays: 1,
//       counterIds: 1,
//     }
//   ).lean();

//   const liveCounterIds = new Set();
//   const counterToEventMap = {};

//   events.forEach((event) => {
//     const fromTime = new Date(event.from).getTime();
//     const toTime = new Date(event.to).getTime();

//     if (event.isRepetitive) {
//       if (
//         Array.isArray(event.repetitiveDays) &&
//         event.repetitiveDays[currentDay]
//       ) {
//         const fromHours = new Date(event.from).getUTCHours();
//         const fromMinutes = new Date(event.from).getUTCMinutes();
//         const toHours = new Date(event.to).getUTCHours();
//         const toMinutes = new Date(event.to).getUTCMinutes();

//         const nowUTC = new Date();
//         const eventStartToday = new Date(
//           Date.UTC(
//             nowUTC.getUTCFullYear(),
//             nowUTC.getUTCMonth(),
//             nowUTC.getUTCDate(),
//             fromHours,
//             fromMinutes
//           )
//         );
//         const eventEndToday = new Date(
//           Date.UTC(
//             nowUTC.getUTCFullYear(),
//             nowUTC.getUTCMonth(),
//             nowUTC.getUTCDate(),
//             toHours,
//             toMinutes
//           )
//         );

//         if (nowUTC >= eventStartToday && nowUTC <= eventEndToday) {
//           event.counterIds.forEach((counterId) => {
//             liveCounterIds.add(counterId.toString());
//             counterToEventMap[counterId.toString()] = event._id.toString();
//           });
//         }
//       }
//     } else {
//       event.counterIds.forEach((counterId) => {
//         liveCounterIds.add(counterId.toString());
//         counterToEventMap[counterId.toString()] = event._id.toString();
//       });
//     }
//   });

//   await EntityDetails.findByIdAndUpdate(entityId, { $inc: { views: 1 } });

//   const counterList = counters
//     .map((counter) => {
//       const idStr = counter._id.toString();
//       return {
//         ...counter,
//         isLive: liveCounterIds.has(idStr),
//         eventId: counterToEventMap[idStr] || null,
//       };
//     })
//     .sort((a, b) => b.isLive - a.isLive);

//   return counterList;
// };

module.exports.counterList = async (req) => {
  const { entityId, searchTerm } = req.query;
  const entityObjectId = ObjectId(entityId);
  const query = { entityId: entityObjectId, status: STATUS.ACTIVE };

  // console.log(`[counterList] Starting with entityId: ${entityId}, converted to ObjectId: ${entityObjectId.toString()}`); // Debug log

  if (searchTerm) {
    query.counterName = { $regex: searchTerm, $options: "i" };
  }

  const counters = await Counter.find(
    query,
    { counterName: 1, totalTables: 1, isTableService: 1 },
    { sort: { _id: -1 }, lean: true }
  );

  const counterIds = counters.map((counter) => ObjectId(counter._id));

  const now = new Date();
  const nowUTC = new Date();
  // Use UTC day for consistency with owner API
  let currentDay = nowUTC.getUTCDay();
  currentDay = currentDay === 0 ? 6 : currentDay - 1; // Convert to array format (0=Mon, 6=Sun)

  // console.log(`[counterList] Querying events with entityId: ${entityObjectId.toString()}, counterIds: ${counterIds.map((id) => id.toString()).join(", ")}`); // Debug log

  const events = await Event.find(
    {
      counterIds: { $in: counterIds },
      entityId: entityObjectId,
      from: { $lte: now },
      to: { $gte: now },
    },
    {
      from: 1,
      to: 1,
      isRepetitive: 1,
      repetitiveDays: 1,
      counterIds: 1,
      isAllDay: 1,
      entityId: 1,
      eventName: 1,
    }
  ).lean();

  console.log(
    `[counterList] Found ${events.length} events for entityId: ${entityId}`
  );
  // console.log(`[counterList] CounterIds being checked:`, counterIds.map((id) => id.toString())); // Debug log
  // console.log(`[counterList] Current UTC time: ${nowUTC.toISOString()}, UTC day: ${currentDay} (0=Mon, 6=Sun)`); // Debug log

  const liveCounterIds = new Set();
  const counterToEventMap = {};

  events.forEach((event) => {
    // console.log(`[counterList] Processing event: ${event.eventName || event._id}, isRepetitive: ${event.isRepetitive}, isAllDay: ${event.isAllDay}`); // Debug log
    // console.log(`[counterList] Event counterIds:`, event.counterIds.map((id) => id.toString())); // Debug log
    // console.log(`[counterList] Event repetitiveDays:`, event.repetitiveDays); // Debug log
    const eventFrom = new Date(event.from);
    const eventTo = new Date(event.to);

    if (event.isRepetitive) {
      // console.log(`[counterList] Event is repetitive, checking...`); // Debug log

      // Check if repetitiveDays array is valid
      if (
        !Array.isArray(event.repetitiveDays) ||
        event.repetitiveDays.length !== 7
      ) {
        // If invalid repetitiveDays, treat as non-repetitive (same as get-ongoing-event-details)
        // console.log(`[counterList] Treating repetitive event as non-repetitive (invalid repetitiveDays)`); // Debug log
        // Continue to non-repetitive logic below
      } else {
        // Simple 3-step check for repetitive events (same as get-ongoing-event-details):
        // 1. Overall date range
        // 2. Daily time window
        // 3. Day match

        // Step 1: Check overall date range
        if (nowUTC < eventFrom || nowUTC > eventTo) {
          console.log(
            `[counterList] Repetitive event overall date range check FAILED`
          );
          return; // Skip this event
        }

        // Step 2: Check daily time window (only if not all day)
        if (!event.isAllDay) {
          // Extract hours/minutes from event start/end
          const startHour = eventFrom.getUTCHours();
          const startMin = eventFrom.getUTCMinutes();
          const endHour = eventTo.getUTCHours();
          const endMin = eventTo.getUTCMinutes();

          // Create today's window
          const todayWindowStart = new Date(
            Date.UTC(
              nowUTC.getUTCFullYear(),
              nowUTC.getUTCMonth(),
              nowUTC.getUTCDate(),
              startHour,
              startMin
            )
          );
          let todayWindowEnd = new Date(
            Date.UTC(
              nowUTC.getUTCFullYear(),
              nowUTC.getUTCMonth(),
              nowUTC.getUTCDate(),
              endHour,
              endMin
            )
          );

          // Handle midnight-spanning events
          if (todayWindowEnd <= todayWindowStart) {
            todayWindowEnd.setUTCDate(todayWindowEnd.getUTCDate() + 1);
          }

          // Check today's window OR yesterday's window (if event started yesterday)
          const inTodayWindow =
            nowUTC >= todayWindowStart && nowUTC <= todayWindowEnd;
          const inYesterdayWindow =
            nowUTC >= eventFrom &&
            nowUTC < todayWindowStart &&
            nowUTC >= new Date(todayWindowStart.getTime() - 86400000) &&
            nowUTC <= new Date(todayWindowEnd.getTime() - 86400000);

          if (!inTodayWindow && !inYesterdayWindow) {
            console.log(
              `[counterList] Repetitive event time window check FAILED`
            );
            return; // Skip this event
          }
        }

        // Step 3: Check if today matches repetitive days
        let currentDayForCheck = nowUTC.getUTCDay();
        currentDayForCheck =
          currentDayForCheck === 0 ? 6 : currentDayForCheck - 1; // Convert to array format (0=Mon, 6=Sun)

        if (event.repetitiveDays[currentDayForCheck] !== 1) {
          console.log(
            `[counterList] Repetitive event day match FAILED - currentDay: ${currentDayForCheck}, repetitiveDays[${currentDayForCheck}]: ${event.repetitiveDays[currentDayForCheck]}`
          );
          return; // Skip this event
        }

        // All checks passed for repetitive event
        console.log(
          `[counterList] Repetitive event ALL CHECKS PASSED, adding counters`
        );
        event.counterIds.forEach((counterId) => {
          const counterIdStr = counterId.toString();
          // Only add counters that are in the queried counterIds list
          if (counterIds.some((id) => id.toString() === counterIdStr)) {
            liveCounterIds.add(counterIdStr);
            counterToEventMap[counterIdStr] = event._id.toString();
            console.log(
              `[counterList] Added counter ${counterIdStr} to liveCounterIds`
            );
          } else {
            console.log(
              `[counterList] Skipped counter ${counterIdStr} - not in queried counterIds list`
            );
          }
        });
        return; // Skip non-repetitive logic
      }
    }

    // For non-repetitive events (or repetitive events with invalid repetitiveDays):
    {
      console.log(
        `[counterList] Event is non-repetitive, checking day and time...`
      );
      // For non-repetitive events, check repetitiveDays and time window
      // This handles "Weekends", "Workdays", "Custom", "One Day" types
      if (
        Array.isArray(event.repetitiveDays) &&
        event.repetitiveDays.length === 7
      ) {
        // Check if today matches the repetitiveDays pattern
        console.log(
          `[counterList] Non-repetitive event has repetitiveDays, checking day match - currentDay: ${currentDay}, repetitiveDays[${currentDay}]: ${event.repetitiveDays[currentDay]}`
        );
        if (event.repetitiveDays[currentDay] !== 1) {
          console.log(
            `[counterList] Non-repetitive event day match FAILED, skipping event`
          );
          return; // Day doesn't match, skip this event
        }
        console.log(`[counterList] Non-repetitive event day match PASSED`);
      } else {
        console.log(
          `[counterList] Non-repetitive event has no repetitiveDays or invalid array`
        );
      }

      // For non-repetitive events, also check UTC time window
      if (!event.isAllDay) {
        const fromHours = eventFrom.getUTCHours();
        const fromMinutes = eventFrom.getUTCMinutes();
        const toHours = eventTo.getUTCHours();
        const toMinutes = eventTo.getUTCMinutes();

        const eventStartToday = new Date(
          Date.UTC(
            nowUTC.getUTCFullYear(),
            nowUTC.getUTCMonth(),
            nowUTC.getUTCDate(),
            fromHours,
            fromMinutes
          )
        );

        let eventEndToday = new Date(
          Date.UTC(
            nowUTC.getUTCFullYear(),
            nowUTC.getUTCMonth(),
            nowUTC.getUTCDate(),
            toHours,
            toMinutes
          )
        );

        // Handle events that span midnight
        if (eventEndToday <= eventStartToday) {
          eventEndToday.setUTCDate(eventEndToday.getUTCDate() + 1);
        }

        // Check if event spans multiple days - if so, use actual from/to dates
        const eventFromDate = new Date(event.from);
        const eventToDate = new Date(event.to);
        const daysDiff = Math.floor(
          (eventToDate.getTime() - eventFromDate.getTime()) /
            (1000 * 60 * 60 * 24)
        );

        console.log(
          `[counterList] Non-repetitive event time check: nowUTC=${nowUTC.toISOString()}, eventStartToday=${eventStartToday.toISOString()}, eventEndToday=${eventEndToday.toISOString()}, daysDiff=${daysDiff}`
        );

        let timeWindowPassed = false;
        if (daysDiff > 0) {
          // Multi-day event: check if current time is within the actual from/to range
          if (nowUTC >= eventFromDate && nowUTC <= eventToDate) {
            timeWindowPassed = true;
          }
        } else {
          // Single day event: check UTC time window
          if (nowUTC >= eventStartToday && nowUTC <= eventEndToday) {
            timeWindowPassed = true;
          }
        }

        if (timeWindowPassed) {
          console.log(
            `[counterList] Non-repetitive event time window PASSED, adding counters`
          );
          event.counterIds.forEach((counterId) => {
            const counterIdStr = counterId.toString();
            // Only add counters that are in the queried counterIds list
            if (counterIds.some((id) => id.toString() === counterIdStr)) {
              liveCounterIds.add(counterIdStr);
              counterToEventMap[counterIdStr] = event._id.toString();
              console.log(
                `[counterList] Added counter ${counterIdStr} to liveCounterIds`
              );
            } else {
              console.log(
                `[counterList] Skipped counter ${counterIdStr} - not in queried counterIds list`
              );
            }
          });
        } else {
          console.log(`[counterList] Non-repetitive event time window FAILED`);
        }
      } else {
        console.log(
          `[counterList] Non-repetitive event is all-day, adding all counters`
        );
        // For all-day events, add all counterIds that are in the queried list
        event.counterIds.forEach((counterId) => {
          const counterIdStr = counterId.toString();
          // Only add counters that are in the queried counterIds list
          if (counterIds.some((id) => id.toString() === counterIdStr)) {
            liveCounterIds.add(counterIdStr);
            counterToEventMap[counterIdStr] = event._id.toString();
            console.log(
              `[counterList] Added counter ${counterIdStr} to liveCounterIds (all-day event)`
            );
          } else {
            console.log(
              `[counterList] Skipped counter ${counterIdStr} - not in queried counterIds list`
            );
          }
        });
      }
    }
  });

  await EntityDetails.findByIdAndUpdate(entityId, { $inc: { views: 1 } });

  console.log(
    `[counterList] Final liveCounterIds:`,
    Array.from(liveCounterIds)
  );
  console.log(
    `[counterList] Total counters: ${counters.length}, Live counters: ${liveCounterIds.size}`
  );

  const counterList = counters
    .map((counter) => {
      const idStr = counter._id.toString();
      const isLive = liveCounterIds.has(idStr);
      console.log(
        `[counterList] Counter ${counter.counterName} (${idStr}): isLive=${isLive}`
      );
      return {
        ...counter,
        isLive: isLive,
        eventId: counterToEventMap[idStr] || null,
      };
    })
    .sort((a, b) => b.isLive - a.isLive);

  return counterList;
};

module.exports.getCounterMenuCategory = async (req) => {
  const { counterId, searchTerm } = req.query;

  const query = {
    ...(counterId
      ? { counterId }
      : { counterId: { $exists: true, $ne: null } }),
  };
  if (searchTerm) {
    query.name = { $regex: searchTerm, $options: "i" };
  }

  return await MenuCategory.find(query).lean();
};

module.exports.getMenuItems = async (req) => {
  let { menuCategoryId, searchTerm, counterId, entityId } = req.query;

  let filter = { counterId: counterId, entityId };

  if (searchTerm && searchTerm.trim()) {
    filter.itemName = { $regex: searchTerm, $options: "i" };
  }
  const menuCategory = await MenuCategory.find({ _id: menuCategoryId });
  if (!menuCategory || menuCategory.length === 0) {
    return [];
  }
  const categoryName = menuCategory[0].categoryName;
  const menuItems1 = await ItemDetails.find(filter)
    .populate("menuCategoryId")
    .lean();

  // Now filter by categoryName manually (because it's in a populated field)
  const menuItems = categoryName
    ? menuItems1.filter(
        (item) => item.menuCategoryId?.categoryName === categoryName
      )
    : menuItems1;

  const menuItemsResp = menuItems.reduce((acc, menuItem) => {
    let itemDetails = menuItem.item;
    menuItem.image = generatePresignedUrl(menuItem.image);
    delete menuItem.item;
    delete menuItem.itemId;
    acc.push({
      ...menuItem,
      ...itemDetails,
    });
    return acc;
  }, []);
  return menuItemsResp;
};

module.exports.getRecommendedItems = async (req) => {
  const { entityId, counterId, searchTerm } = req.query;

  // Return empty array if counterId is not provided or invalid
  if (!counterId || counterId.trim() === "") {
    return [];
  }

  const query = { entityId, counterIds: counterId };

  if (searchTerm) {
    query.itemName = { $regex: searchTerm, $options: "i" };
  }

  const allItems = await ItemDetails.find(query)
    .populate("menuCategoryId")
    .lean();

  const counterItemMap = {};

  allItems.forEach((item) => {
    if (item.menuCategoryId && item.menuCategoryId.counterId == counterId) {
      item.image = generatePresignedUrl(item.image);
      const counterKey = `${item.counterId}_${item.itemName}`;

      if (!counterItemMap[counterKey]) {
        counterItemMap[counterKey] = item;
      }
    }
  });

  return Object.values(counterItemMap).slice(0, 2);
};

module.exports.addExistingItemToMenu = async (req) => {
  const { menuId, itemId } = req.body;
  const itemDetails = await MenuItem.findById(itemId).lean();
  const menuCategory = await MenuCategory.findById(menuId).lean();
  const updateSet = {
    entityId: req.entityId,
    counterId: menuId,
    itemId: itemId,
    price: itemDetails.price,
    availableQuantity: itemDetails.availableQuantity ?? 10000000000,
    currency: itemDetails.currency,
    menuCategoryId: menuCategory._id,
  };
  await ItemDetails.updateOne(
    { _id: itemId },
    { $set: updateSet },
    { upsert: true }
  ).lean();
};

module.exports.updateLanguage = async (req) => {
  const { selectedLanguage } = req.body;
  await User.updateOne(
    { id: req.id },
    { $set: { language: selectedLanguage } },
    { upsert: true }
  );
};

module.exports.updateFavouriteItem = async (req) => {
  const userId = req.userId;
  const { menuId, itemId, isFavourite } = req.body;
  const lang = getLanguageFromRequest(req);
  const menuCategory = await MenuCategory.findById(menuId, { counterId: 1 });
  if (!menuCategory) {
    throwError({
      status: STATUS_CODES.NOT_FOUND,
      message: t("MENU_NOT_FOUND", lang),
    });
  }
  await FavouriteItem.updateOne(
    { userId, favouriteItemId: itemId, counterId: menuCategory.counterId },
    {
      $set: {
        isFavourite,
      },
    },
    { upsert: true }
  );
  return;
};

module.exports.getFavouriteItems = async (req) => {
  const { counterId } = req.query;
  const favouriteItemList = await FavouriteItem.find(
    {
      userId: req.userId,
      counterId: counterId,
      isFavourite: true,
    },
    { favouriteItemId: 1 }
  );

  const searchTerm = req.query.searchTerm?.trim();

  const favouriteItemIds = favouriteItemList.map(
    (item) => item.favouriteItemId
  );

  const menuItems = await ItemDetails.aggregate([
    {
      $match: {
        counterId: ObjectId(counterId),
      },
    },
    {
      $lookup: {
        from: "menuitems",
        localField: "itemId",
        foreignField: "_id",
        as: "item",
      },
    },
    {
      $unwind: "$item",
    },
    {
      $match: {
        "item._id": { $in: favouriteItemIds },
      },
    },
    ...(searchTerm
      ? [
          {
            $match: {
              "item.itemName": { $regex: searchTerm, $options: "i" },
            },
          },
        ]
      : []),
    {
      $project: {
        "item._id": 1,
        "item.itemName": 1,
        "item.description": 1,
        "item.type": 1,
        "item.price": 1,
        "item.currency": 1,
        "item.image": 1,
        "item.quantity": 1,
        price: 1,
        availableQuantity: 1,
        counterId: 1,
        entityId: 1,
        createdAt: 1,
        updatedAt: 1,
        currency: 1,
      },
    },
    {
      $sort: { updatedAt: -1 },
    },
  ]);

  const menuItemsResp = menuItems.reduce((acc, menuItem) => {
    const itemDetails = menuItem.item;
    delete menuItem.item;
    itemDetails.image = generatePresignedUrl(itemDetails.image);
    delete menuItem.itemId;
    acc.push({
      ...menuItem,
      isFavourite: true,
      ...itemDetails,
    });
    return acc;
  }, []);
  return menuItemsResp;
};

module.exports.addCards = async (req) => {
  const {
    userId,
    body: { cardHolderName, cardNo, cardExpireAt, securityCode, type },
  } = req;
  const lang = getLanguageFromRequest(req);

  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("USER_DOES_NOT_EXIST", lang),
    });
  }

  const cardObj = {
    cardHolderName,
    cardNo,
    cardExpireAt,
    securityCode,
    type,
    status: STATUS.ACTIVE,
    userId: user._id,
  };
  await Cards.create(cardObj);
  return t("CARD_ADDED_SUCCESS", lang);
};

module.exports.getUserCards = async (req) => {
  const { userId } = req;
  const cardDetails = await Cards.find({
    userId,
    status: STATUS.ACTIVE,
  }).lean();
  return cardDetails;
};

module.exports.editOrDeleteCards = async (req) => {
  const {
    userId,
    body: {
      cardId,
      cardHolderName,
      cardNo,
      cardExpireAt,
      securityCode,
      action,
    },
  } = req;

  let message = "";
  const lang = getLanguageFromRequest(req);

  const cardDetails = await Cards.findOne({
    userId,
    _id: cardId,
    status: STATUS.ACTIVE,
  });

  if (!cardDetails) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("CARD_NOT_FOUND", lang),
    });
  }

  if (action === EDIT_ACTION.EDIT) {
    if (cardHolderName) cardDetails.cardHolderName = cardHolderName;
    if (cardNo) cardDetails.cardNo = cardNo;
    if (cardExpireAt) cardDetails.cardExpireAt = cardExpireAt;
    if (securityCode) cardDetails.securityCode = securityCode;
    message = t("CARD_UPDATE_SUCCESS", lang);
  }

  if (action === EDIT_ACTION.DELETE) {
    cardDetails.status = STATUS.DELETED;
    message = t("CARD_DELETE_SUCCESS", lang);
  }
  await cardDetails.save();

  return message;
};

module.exports.getUserDetails = async (req) => {
  const { userId } = req;
  const lang = getLanguageFromRequest(req);
  const userDetails = await User.findOne({
    _id: userId,
    status: STATUS.ACTIVE,
  });

  if (!userDetails) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("USER_DOES_NOT_EXIST", lang),
    });
  }

  return {
    ...userDetails.toObject(),
  };
};

module.exports.updateUserDetails = async (req) => {
  const {
    userId,
    body: { email, contactNumber, newPassword, enteredOtp },
  } = req;
  console.log({ body: req.body });

  let message = "";
  const lang = getLanguageFromRequest(req);

  if (newPassword) {
    const userPass = await User.findOne({ _id: userId });
    if (!userPass) {
      throwError({
        status: STATUS_CODES.NOT_FOUND,
        message: t("USER_NOT_FOUND", lang),
      });
    }

    const passwordCompare = await comparePassword(
      newPassword,
      userPass.password
    );
    if (passwordCompare) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("PASSWORD_REUSE_ERROR", lang),
      });
    }

    const passwordChange = bcrypt.hashSync(newPassword, 10);
    userPass.password = passwordChange;
    await userPass.save();

    message = t("PASSWORD_UPDATE_SUCCESS", lang);
    return message;
  }

  const query = {
    status: STATUS.ACTIVE,
    role: ROLES.CUSTOMER,
    _id: { $ne: userId },
  };
  if (email) {
    query.email = email;
  }
  if (contactNumber) {
    query.contactNumber = contactNumber;
  }

  const user = await User.findOne(query);
  if (user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: email
        ? t("EMAIL_ALREADY_EXISTS", lang, { email })
        : t("CONTACT_NUMBER_ALREADY_EXISTS", lang, { contactNumber }),
    });
  }

  if (email) {
    if (!enteredOtp) {
      const otp = crypto.randomInt(100000, 999999).toString();
      console.log(`[OTP] Customer/EmailUpdate email=${email} otp=${otp}`);
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

      await Otp.findOneAndUpdate(
        { email },
        { otp, userId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log({ otp });

      const mail_data = {
        to: email,
        subject: "COUNTR: OTP for Email Update",
        html: otpVerificationTemplate(otp, "Email Update"),
      };

      console.log({ mail_data });

      createMail(mail_data);
      await User.updateOne({ _id: userId }, { emailOtpVerified: false });

      message = t("OTP_SENT_NEW_EMAIL", lang);
      return message;
    } else {
      const otpRecord = await Otp.findOne({ email });
      if (
        !otpRecord ||
        otpRecord.otp !== enteredOtp ||
        new Date() > otpRecord.expiresAt
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("INVALID_OR_EXPIRED_OTP", lang),
        });
      }

      await Otp.deleteOne({ email });

      await User.updateOne({ _id: userId }, { email, emailOtpVerified: true });

      message = t("EMAIL_UPDATE_SUCCESS", lang);
      return { message };
    }
  }

  if (contactNumber) {
    if (!enteredOtp) {
      const otp = crypto.randomInt(100000, 999999).toString();
      console.log(`[OTP] Customer/MobileUpdate contactNumber=${contactNumber} otp=${otp}`);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await Otp.findOneAndUpdate(
        { contactNumber },
        { otp, userId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const smsMessage = t("OTP_SMS_MESSAGE", lang, { otp });

      await sendSMS({ toPhoneNumber: contactNumber, message: smsMessage });

      await User.updateOne({ _id: userId }, { phoneOtpVerified: false });

      return { message: t("OTP_SENT_NEW_MOBILE", lang) };
    } else {
      const otpRecord = await Otp.findOne({ contactNumber });
      if (
        !otpRecord ||
        otpRecord.otp !== enteredOtp ||
        new Date() > otpRecord.expiresAt
      ) {
        throwError({
          status: STATUS_CODES.BAD_REQUEST,
          message: t("INVALID_OR_EXPIRED_OTP", lang),
        });
      }

      await Otp.deleteOne({ contactNumber });

      await User.updateOne(
        { _id: userId },
        { contactNumber, phoneOtpVerified: true }
      );

      message = t("MOBILE_UPDATE_SUCCESS", lang);
      return { message };
    }
  }
};

module.exports.processLocationForUser = async (req) => {
  const { userId, latitude, longitude, locationEnabled } = req.body;
  const lang = getLanguageFromRequest(req);
  const insideArea =
    latitude >= 10 && latitude <= 20 && longitude >= 30 && longitude <= 40;

  const referencePoint = { lat: 30.642803, lon: 76.816902 };
  const distance = await haversineDistance(
    latitude,
    longitude,
    referencePoint.lat,
    referencePoint.lon
  );
  console.log({ distance });

  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("USER_NOT_FOUND", lang),
    });
  }
  if (locationEnabled) {
    await User.updateOne({ _id: userId }, { $set: { locationEnabled: true } });
  }
  let locationSaved = false;
  if (user.locationEnabled) {
    await Location.create({
      userId: user._id,
      latitude,
      longitude,
    });
    locationSaved = true;
  }

  return {
    insideArea,
    distanceInKm: distance,
    locationSaved,
  };
};

module.exports.userFeedback = async (req) => {
  const {
    userId,
    body: { entityId, answers },
  } = req;
  const lang = getLanguageFromRequest(req);

  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("USER_DOES_NOT_EXIST", lang),
    });
  }

  const entity = await EntityDetails.findById(entityId);
  if (!entity) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("ENTITY_NOT_FOUND", lang),
    });
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("FEEDBACK_ANSWERS_REQUIRED", lang),
    });
  }

  for (const answer of answers) {
    if (!answer.questionId || answer.value === undefined) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FEEDBACK_INVALID_ANSWER", lang),
      });
    }
  }

  const feedbackObj = {
    userId,
    entityId: entity._id,
    answers,
  };

  const feebackFromUser = await Userfeedback.create(feedbackObj);
  io.to(entityId.toString()).emit("feedback", feebackFromUser);
};
module.exports.userAppFeedback = async (req) => {
  const userId = req.userId || req.id;
  const { answers } = req.body;
  const lang = getLanguageFromRequest(req);

  if (!userId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("USER_NOT_AUTHENTICATED", lang),
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("USER_DOES_NOT_EXIST", lang),
    });
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("FEEDBACK_ANSWERS_REQUIRED", lang),
    });
  }

  for (const answer of answers) {
    if (!answer.questionId || answer.answer === undefined) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FEEDBACK_INVALID_ANSWER", lang),
      });
    }
    // Validate questionId exists in hardcoded questions
    const question = APP_FEEDBACK_QUESTIONS.find(
      (q) => q.id === answer.questionId
    );
    if (!question) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FEEDBACK_QUESTION_NOT_FOUND", lang),
      });
    }
    // Validate answer type (must be number or string)
    if (
      typeof answer.answer !== "number" &&
      typeof answer.answer !== "string"
    ) {
      throwError({
        status: STATUS_CODES.BAD_REQUEST,
        message: t("FEEDBACK_INVALID_ANSWER_TYPE", lang),
      });
    }
  }

  const feedbackObj = {
    userId,
    answers,
  };

  const feedbackFromUser = await UserAppFeedback.create(feedbackObj);
  return feedbackFromUser;
};

exports.getAllcountries = () => {
  const data = COUNTRY_ARRAY;
  return { data };
};

exports.getCountryByIsoCode = ({ req }) => {
  const { isoCode } = req.query;
  const countries = Country.getAllCountries();
  const country = countries.find((country) => country.isoCode === isoCode);
  if (!country) {
    throw new Error(`Country with ISO code ${isoCode} not found.`);
  }
  const states = State.getStatesOfCountry(isoCode);
  const data = {
    country: country.name,
    isoCode: country.isoCode,
    statesList: states.map((state) => ({
      state: state.name,
      isoCode: state.isoCode,
    })),
  };
  return { data };
};

exports.getCitiesOfStates = async (req) => {
  const { countryCode, stateCode } = req.query;
  const cities = City.getCitiesOfState(countryCode, stateCode);
  return cities;
};

exports.createSearchLogs = async (req) => {
  const {
    userId,
    body: { entityId },
  } = req;

  const existingLog = await SearchLogs.findOne({ userId, entityId });

  if (existingLog) {
    return SearchLogs.updateOne(
      { _id: existingLog._id },
      { $set: { createdAt: new Date(), isRemoved: false } }
    );
  }

  return SearchLogs.create({ userId, entityId });
};

exports.getSearchLogs = async (req) => {
  const { userId } = req;
  const logs = await SearchLogs.find({ userId, isRemoved: false })
    .sort({ createdAt: -1 })
    .populate({
      path: "entityId",
      select: "entityName city state country image",
      model: "EntityDetails",
    });
  logs.map((items) => {
    if (!items.entityId.image) {
      return items;
    }

    items.entityId.image = generatePresignedUrl(items.entityId.image);
    return items;
  });

  return logs;
};

exports.removeLogs = async (req) => {
  const {
    userId,
    body: { entityId, isRemoved },
  } = req;
  const lang = getLanguageFromRequest(req);

  const logs = await SearchLogs.findOne({ userId, entityId, isRemoved: false });
  if (!logs) {
    throwError({
      status: STATUS_CODES.BAD_REQUEST,
      message: t("LOGS_NOT_FOUND", lang),
    });
  }
  if (isRemoved) logs.isRemoved = isRemoved;

  return logs.save();
};

exports.newlyAddedEntities = async () => {
  const fortyEightHoursago = new Date();
  fortyEightHoursago.setHours(fortyEightHoursago.getHours() - 48);

  const entities = await EntityDetails.find({
    createdAt: { $gte: fortyEightHoursago },
    status: STATUS.ACTIVE,
  }).sort({ createdAt: -1 });

  entities.map((entity) => {
    entity.image = generatePresignedUrl(entity.image);
    return entity;
  });
  return entities;
};

exports.popularEntities = async () => {
  const popular = await EntityDetails.find(
    { status: STATUS.ACTIVE },
    { entityName: 1, city: 1, views: 1, country: 1, status: 1, image: 1 }
  )
    .sort({ views: -1 })
    .limit(10);

  popular.map((entity) => {
    if (entity.image != null) {
      entity.image = generatePresignedUrl(entity.image);
    }
    return entity;
  });
  return popular;
};

module.exports.entityOffers = async () => {
  const projection = {
    code: 1,
    type: 1,
    value: 1,
    description: 1,
    entityId: 1,
    colourTheme: 1,
  };
  const coupons = await Discount.find({}, projection).populate({
    path: "entityId",
    select: "entityName image city country status",
    model: "EntityDetails",
  });

  coupons.forEach((coupon) => {
    if (coupon.entityId?.status === STATUS.ACTIVE) {
      coupon.entityId.image = generatePresignedUrl(coupon.entityId.image);
    }
  });

  return coupons;
};

module.exports.getFeedbackQuestions = async (req) => {
  const entityId = req.query?.entityId || req.entityId;

  const feedbackQuestions = await FeedbackQuestions.find({ entityId }).lean();
  if (!feedbackQuestions || feedbackQuestions.length === 0) return [];

  const questionsWithAnswerTypeKey = feedbackQuestions.map((question) => {
    let answerTypeKey = null;

    for (const [key, values] of Object.entries(ANSWER_TYPES)) {
      if (
        Array.isArray(question.answerType) &&
        question.answerType.length === values.length &&
        question.answerType.every((val) => values.includes(val))
      ) {
        answerTypeKey = key;
        break;
      }
    }

    return {
      ...question,
      answerTypeKey,
    };
  });

  return questionsWithAnswerTypeKey;
};

module.exports.getFeedbackAppQuestions = async (req) => {
  const userId = req.userId || req.id;
  const lang = getLanguageFromRequest(req);

  if (!userId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("USER_NOT_AUTHENTICATED", lang),
    });
  }

  // Return translated questions based on user's language
  const translatedQuestions = APP_FEEDBACK_QUESTIONS.map((question) => {
    const translationKey = `app_feedback_q${question.id.replace(
      "appFeedback",
      ""
    )}`;

    const result = {
      id: question.id,
      question: t(translationKey, lang),
      answerType: question.answerType,
    };

    // Add translated options for FRIENDLY answer type
    if (question.answerType === "FRIENDLY" && ANSWER_TYPES.FRIENDLY) {
      result.options = ANSWER_TYPES.FRIENDLY.map((option) => {
        const translatedValue = t(option, lang);
        return {
          value: translatedValue, // Use translated value for submission
          label: translatedValue, // Use translated value for display
        };
      });
    }

    return result;
  });

  return translatedQuestions;
};

module.exports.getUserAppFeedbackAnswers = async (req) => {
  const userId = req.userId || req.id;
  const lang = getLanguageFromRequest(req);

  if (!userId) {
    throwError({
      status: STATUS_CODES.NOT_AUTHORIZED,
      message: t("USER_NOT_AUTHENTICATED", lang),
    });
  }

  // Find the most recent feedback submission from this user
  const userFeedback = await UserAppFeedback.findOne({ userId })
    .sort({ createdAt: -1 })
    .lean();

  if (!userFeedback) {
    return null;
  }

  // Translate answers to current user language
  const translatedAnswers = userFeedback.answers.map((answer) => {
    const question = APP_FEEDBACK_QUESTIONS.find(
      (q) => q.id === answer.questionId
    );

    // For FRIENDLY type answers, check if the answer is a translatable option
    if (question && question.answerType === "FRIENDLY") {
      // Check if answer exists in any language's FRIENDLY options
      const isTranslatableOption = ANSWER_TYPES.FRIENDLY.some(
        (option) =>
          t(option, "en") === answer.answer || t(option, "de") === answer.answer
      );

      if (isTranslatableOption) {
        // Find the original English key
        let originalKey = answer.answer;
        for (const option of ANSWER_TYPES.FRIENDLY) {
          if (
            t(option, "en") === answer.answer ||
            t(option, "de") === answer.answer
          ) {
            originalKey = option;
            break;
          }
        }
        // Translate to current language
        return {
          questionId: answer.questionId,
          answer: t(originalKey, lang),
        };
      }
    }

    // Return as-is for other types or non-translatable strings
    return answer;
  });

  return {
    feedbackId: userFeedback._id,
    submittedAt: userFeedback.createdAt,
    answers: translatedAnswers,
  };
};

module.exports.getTablesUserSide = async (req) => {
  const { entityId, counterId } = req.query;
  const query = {
    entityId,
    counterIds: counterId,
    status: { $ne: STATUS.DELETED },
  };

  const tables = await Tables.findOne(query, {
    tableCount: 1,
    counterIds: 1,
    entityId: 1,
    tableSectionName: 1,
    tableSetionNo: 1,
  })
    .populate({
      path: "counterIds",
      model: "Counter",
    })
    .lean();

  if (!tables) {
    return [];
  }
  // console.log("reache dehr ehr vef[ier");
  // if (tables.isTableService) {
  //   console.log("eache dher er");
  //   return tables;
  // }

  const tablesRes = [];
  const counterIdStr = String(counterId);
  tables.counterIds.forEach((counter) => {
    const cId = counter?._id?.toString?.() ?? counter?.toString?.();
    if (cId === counterIdStr && counter?.isTableService === true) {
      tablesRes.push({
        tableCount: tables.tableCount ?? [],
        tableSectionName: tables.tableSectionName,
        tableSetionNo: tables.tableSetionNo,
        entityId: tables.entityId,
      });
    }
  });

  return tablesRes;
};

module.exports.fetchNotificationSettings = async (req) => {
  return notificationSettings.findOne({ userId: req.userId });
};

module.exports.updateNotificationSettings = async (req) => {
  const { isEmailOn, isPushOn, isPromotionalOn, value } = req.body;
  let updatedValue = {};
  if (isEmailOn == true) {
    updatedValue = {
      isEmailOn: value,
    };
  } else if (isPushOn == true) {
    updatedValue = {
      isPushOn: value,
    };
  } else if (isPromotionalOn) {
    updatedValue = {
      isPromotionalOn: value,
    };
  }

  await notificationSettings.updateOne(
    { userId: req.userId },
    { $set: updatedValue },
    { upsert: true }
  );
  return;
};

module.exports.getPlatformFee = async (req) => {
  const { entityId, eventId } = req.query;
  const raw = global.PLATFORM_FEES ?? 0;
  // If stored as percentage (e.g. 5 for 5%), convert to decimal (0.05) for frontend
  const platformFee = raw > 1 ? raw / 100 : raw;
  return { platformFee };
};
