const mongoose = require("mongoose");
const globalConstants = require("../Utils/globalConstants");

const ALL_ANSWER_TYPES = globalConstants.ALL_ANSWER_TYPES;

const { ObjectId } = mongoose.Types;

const feedbackQuestionSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User" },
    entityId: { type: ObjectId, ref: "EntityDetails" },
    question: { type: String, required: true },
    comment: { type: Boolean, default: true },
    answerType: {
      type: [String],
      enum: ALL_ANSWER_TYPES,
      required: true,
    },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model(
  "FeedbackQuestions",
  feedbackQuestionSchema,
  "FeedbackQuestions"
);
