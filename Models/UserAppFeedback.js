const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

const feedbackAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      required: true,
    },
    answer: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: {
        validator: function (value) {
          // Allow both number (for rating) and string (for text)
          return typeof value === "number" || typeof value === "string";
        },
        message: "Answer must be either a number (rating) or a string (text)",
      },
    },
  },
  { _id: false }
);

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: ObjectId,
      ref: "User",
      required: true,
    },
    answers: [feedbackAnswerSchema],
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model(
  "UserAppFeedback",
  feedbackSchema,
  "UserAppFeedback"
);
