const jwt = require("jsonwebtoken");
const { SECRET_KEY } = require("../Utils/commonFunction");
const {
  STATUS_CODES,
  ROLES,
  KEY_TYPE_PREFIXES,
  STATUS,
} = require("../Utils/globalConstants");
const { t, getLanguageFromRequest } = require("./translator");
const redisClient = require("../redis");
const User = require("../Models/User");

const verifyToken = async (req, res, next) => {
  const token = req.headers["token"];
  const lang = getLanguageFromRequest(req);

  if (!token) {
    return res
      .status(STATUS_CODES.NOT_AUTHORIZED)
      .json({ message: t("AUTH_TOKEN_MISSING", lang) });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.id = decoded.id;
    req.userId = decoded.userId;
    req.role = decoded.role;
    req.email = decoded.email;
    req.entityName = decoded.entityName;
    req.entityId = decoded.entityId;
    req.entityType = decoded.entityType;
    req.isAdmin = decoded.role === ROLES.ADMIN || decoded.isAdmin === true;
    req.countrTag = decoded.countrTag;

    // Skip Redis check for admins (they use Admin model)
    if (!req.isAdmin) {
      const redisKey = `${KEY_TYPE_PREFIXES.USER_TOKEN}:${decoded.userId}`;
      const sessionExists = await redisClient.get(redisKey);
      if (!sessionExists) {
        const user = await User.findById(decoded.userId, { status: 1 }).lean();
        if (user?.status === STATUS.BLOCKED) {
          return res.status(STATUS_CODES.NOT_AUTHORIZED).json({
            message: t("USER_ACCOUNT_BLOCKED", lang),
          });
        }
        await redisClient.set(redisKey, "1");
      }
    }

    next();
  } catch (err) {
    return res
      .status(STATUS_CODES.NOT_AUTHORIZED)
      .json({ message: t("AUTH_TOKEN_INVALID", lang) });
  }
};

module.exports = verifyToken;
