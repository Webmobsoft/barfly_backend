const fs = require("fs");
const path = require("path");

const DEFAULT_LANGUAGE = "en";
const translationsCache = {};
const translationsDir = path.join(__dirname, "..", "Assets", "translation");

const loadTranslations = (language) => {
  if (translationsCache[language]) {
    return translationsCache[language];
  }

  const filePath = path.join(translationsDir, `${language}.json`);

  try {
    const fileContents = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(fileContents || "{}");
    translationsCache[language] = parsed;
    return parsed;
  } catch (error) {
    if (language !== DEFAULT_LANGUAGE) {
      return loadTranslations(DEFAULT_LANGUAGE);
    }
    translationsCache[language] = {};
    return translationsCache[language];
  }
};

const interpolate = (text, variables = {}) => {
  return Object.keys(variables).reduce((result, key) => {
    const value = variables[key];
    return result.replace(
      new RegExp(`{{\\s*${key}\\s*}}`, "g"),
      value !== undefined && value !== null ? String(value) : ""
    );
  }, text);
};

const t = (key, language = DEFAULT_LANGUAGE, variables = {}) => {
  const translations = loadTranslations(language);
  const fallbackTranslations =
    language === DEFAULT_LANGUAGE
      ? translations
      : loadTranslations(DEFAULT_LANGUAGE);

  const template = translations[key] ?? fallbackTranslations[key] ?? key;

  if (typeof template !== "string") {
    return key;
  }

  return interpolate(template, variables);
};

const getLanguageFromRequest = (req) => {
  if (!req) {
    return DEFAULT_LANGUAGE;
  }

  const headerLang = req.headers?.["accept-language"];
  if (req.language) {
    return req.language;
  }
  if (req.lang) {
    return req.lang;
  }
  if (headerLang) {
    const [primary] = headerLang.split(",");
    if (primary) {
      return primary.split("-")[0];
    }
  }
  return DEFAULT_LANGUAGE;
};

module.exports = {
  t,
  getLanguageFromRequest,
};
