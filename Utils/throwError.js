// `code` is optional: a stable reason the apps can switch on
// (e.g. "ORDER_SLOT_FULL"); `data` carries details such as the next opening.
const throwError = ({ status, message, code, data }) => {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  if (data) error.data = data;
  throw error;
};

module.exports = throwError;
