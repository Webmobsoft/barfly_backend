// const Bar = require("../../Models/Bar");
// const Insider = require("../../Models/Insider");
// const Event = require("../../Models/Event");
// const InsiderElement = require("../../Models/InsiderElement");
// const MenuItem = require("../../Models/MenuItem");
// const { STATUS_CODES, INSIDER_TYPE } = require("../../Utils/globalConstants");
// const throwError = require("../../Utils/throwError");
// const mongoose = require("mongoose");
// const Counter = require("../../Models/Counter");

// module.exports.createInsider = async (req) => {
//   const { insiderName } = req.body;
//   if (!insiderName) {
//     throw {
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "InsiderName is required",
//     };
//   }

//   const existingInsider = await Insider.findOne(
//     { insiderName, ownerId: req.id },
//     { _id: 1 }
//   );

//   if (existingInsider) {
//     throw {
//       status: STATUS_CODES.CONFLICT,
//       message: "This insider name already exists",
//     };
//   }

//   const newInsider = await Insider.findOneAndUpdate(
//     { insiderName, ownerId: req.id },
//     { insiderName, ownerId: req.id },
//     { new: true, upsert: true }
//   );

//   if (!newInsider) {
//     throw {
//       status: STATUS_CODES.INTERNAL_SERVER_ERROR,
//       message: "Failed to create or update insider",
//     };
//   }

//   const response = newInsider.toObject();
//   delete response.createdAt;
//   delete response.updatedAt;
//   delete response.ownerId;

//   return response;
// };

// module.exports.createInsiderElement = async (req) => {
//   const { insiderId, elementType, name, icon } = req.body;

//   if (!insiderId || !elementType || !name || !icon) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "InsiderId, elementType, name, and icon are required",
//     });
//   }
//   const newElement = await InsiderElement.create({
//     insiderId,
//     elementType,
//     name,
//     icon,
//   });

//   return newElement;
// };

// module.exports.getInsiderElements = async (insiderId) => {
//   try {
//     if (!insiderId) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "InsiderId is required",
//       });
//     }
//     const elements = await InsiderElement.find({ insiderId }).lean();
//     return elements;
//   } catch (error) {
//     throw {
//       status: error.status || STATUS_CODES.INTERNAL_SERVER_ERROR,
//       message: error.message || "Failed to fetch insider elements",
//     };
//   }
// };

// module.exports.createMenuItem = async (req) => {
//   const {
//     itemName,
//     price,
//     quantity,
//     description,
//     type,
//     image,
//     insiderElementId,
//   } = req.body;

//   if (
//     !itemName ||
//     !price ||
//     !quantity ||
//     !description ||
//     !type ||
//     !image ||
//     !insiderElementId
//   ) {
//     throw { status: 400, message: "All fields are required" };
//   }

//   const insiderElement = await InsiderElement.findById(insiderElementId);
//   if (!insiderElement) {
//     throw { status: 404, message: "Insider Element not found" };
//   }

//   const newItem = await MenuItem.create({
//     itemName,
//     price,
//     quantity,
//     description,
//     type,
//     image,
//     insiderElementId: insiderElementId,
//   });
//   return newItem;
// };

// module.exports.getCreatedItems = async (req) => {
//   try {
//     const { insiderElementId } = req.query;
//     if (!insiderElementId) {
//       throwError({
//         status: STATUS_CODES.BAD_REQUEST,
//         message: "InsiderElementId is required",
//       });
//     }

//     const createdItems = await MenuItem.find({ insiderElementId }).lean();
//     return createdItems;
//   } catch (error) {
//     throw {
//       status: error.status || STATUS_CODES.INTERNAL_SERVER_ERROR,
//       message: error.message || "Failed to fetch created items",
//     };
//   }
// };

// module.exports.createEvent = async (req) => {
//   const {
//     locationName,
//     eventName,
//     startingDate,
//     endDate,
//     isRepitative,
//     repetitiveDays,
//     from,
//     to,
//     counterIds,
//     ageLimit,
//   } = req.body;

//   const ownerId = req.id;

//   // const insidersList = insiders.map((insiderDetails) => {
//   //   insiderIds.push(insiderDetails.insiderId);
//   //   return {
//   //     insiderId: insiderDetails.insiderId,
//   //     isBar: insiderDetails.isBar,
//   //     isLounge: insiderDetails.isLounge,
//   //     isFeedback: insiderDetails.isFeedback,
//   //   };
//   // });

//   // const existingInsiders = await Counter.find({
//   //   _id: { $in: counters },
//   //   ownerId,
//   // });

//   // if (existingInsiders.length != insiderIds.length) {
//   //   throwError({
//   //     status: STATUS_CODES.NOT_FOUND,
//   //     message: "Insider does not exist",
//   //   });
//   // }

//   const dateTimeFrom = new Date(from);
//   const dateTimeTo = new Date(to);

//   if (isNaN(dateTimeFrom.getTime()) || isNaN(dateTimeTo.getTime())) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "The time format is invalid",
//     });
//   }

//   if (dateTimeFrom > dateTimeTo) {
//     throwError({
//       status: STATUS_CODES.BAD_REQUEST,
//       message: "Invalid time selection",
//     });
//   }

//   const existingEvent = await Event.findOne({
//     locationName,
//     eventName,
//     ownerId,
//     entityId: req.entityId,
//   });

//   if (existingEvent) {
//     throwError({
//       status: STATUS_CODES.NOT_AUTHORIZED,
//       message: "An event with the same details already exists",
//     });
//   }

//   if (!isRepitative) {
//     repetitiveDays = [];
//   }

//   const newEvent = new Event({
//     locationName,
//     eventName,
//     isRepitative,
//     repetitiveDays,
//     startingDate: new Date(startingDate),
//     endDate: new Date(endDate),
//     from: dateTimeFrom,
//     to: dateTimeTo,
//     ageLimit,
//     ownerId,
//     counterIds,
//   });

//   const savedEvent = await newEvent.save();
//   return savedEvent;
// };

// module.exports.getUpcomingEvents = async (req) => {
//   const currentDateTime = new Date();
//   const ownerId = req.id;

//   const upcomingEvents = await Event.find({
//     ownerId,
//     date: { $gte: currentDateTime },
//   }).sort({ date: 1 });
//   return upcomingEvents;
// };

// module.exports.getDistinctMonthsAndYears = async (req) => {
//   const ownerId = req.id;
//   const distinctMonthsAndYears = await Event.aggregate([
//     {
//       $match: {
//         ownerId: mongoose.Types.ObjectId(ownerId),
//         date: { $lt: new Date() },
//       },
//     },
//     {
//       $group: {
//         _id: {
//           year: { $year: "$date" },
//           month: { $month: "$date" },
//         },
//       },
//     },
//     {
//       $sort: {
//         "_id.year": -1,
//         "_id.month": -1,
//       },
//     },
//   ]);

//   return distinctMonthsAndYears.map((doc) => ({
//     year: doc._id.year,
//     month: doc._id.month,
//   }));
// };

// module.exports.getEventsByMonthAndYear = async (month, year) => {
//   const startDate = new Date(year, month - 1, 1);
//   const endDate = new Date(year, month, 1);

//   const events = await Event.find({
//     date: {
//       $gte: startDate,
//       $lt: endDate,
//     },
//   }).sort({ date: 1 });

//   return events;
// };
