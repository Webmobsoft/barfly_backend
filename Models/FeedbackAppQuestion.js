const mongoose = require("mongoose");
const globalConstants = require("../Utils/globalConstants");

const ALL_ANSWER_TYPES = globalConstants.ALL_ANSWER_TYPES;

const { ObjectId } = mongoose.Types;

const feedbackAppQuestionSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User" },
    question: { type: String, required: true },
    answerType: {
      type: String,
      enum: ALL_ANSWER_TYPES,
      required: true,
    },
    payload: {
      type: String,
      default: "",
    },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model(
  "FeedbackAppQuestion",
  feedbackAppQuestionSchema,
  "FeedbackAppQuestion"
);
