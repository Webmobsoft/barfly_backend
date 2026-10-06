const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

const feedbackAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: ObjectId,
      ref: "FeedbackQuestions",
      required: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      default: "",
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
    entityId: {
      type: ObjectId,
      ref: "entitydetails",
      required: true,
    },
    answers: [feedbackAnswerSchema],
  },
  { timestamps: true, minimize: false }
);

module.exports = new mongoose.model(
  "Userfeedback",
  feedbackSchema,
  "Userfeedback"
);
