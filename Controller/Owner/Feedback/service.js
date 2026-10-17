// const Feedback = require("../../../Models/Feedback");

// module.exports.createSurveyQuestion = async (req) => {
//         const { question, answerType, answerOptions } = req.body;

//         const surveyQuestion = new Feedback({
//             question,
//             answerType,
//             answerOptions,
//             owner: "60d0fe4f5311236168a109ca",
//             entityId: "1234567890abcdef12345678",
//         });
//         return surveyQuestion.save();
// }

const createSurveyQuestion = async (req) => {
  const { id, entityId } = req;
  const { question, answerType, answerOptions } = req.body;
  const surveyQuestion = new Feedback({
    question,
    answerType,
    answerOptions,
    ownerId: id,
    entityId: entityId,
  });
  return await surveyQuestion.save();
};

const archiveSurveyQuestion = async (id) => {
  return await Feedback.findByIdAndUpdate(id, { archive: true }, { new: true });
};

const getSurveyQuestions = async (archiveStatus) => {
  return await Feedback.find({ archive: archiveStatus });
};

module.exports = {
  createSurveyQuestion,
  archiveSurveyQuestion,
  getSurveyQuestions,
};
