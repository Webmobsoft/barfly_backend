const STATUS_CODES = {
  BAD_REQUEST: 400,
  CONFLICT: 409,
  CREATED: 201,
  NOT_ACCEPTABLE: 406,
  NOT_AUTHENTICATED: 401,
  NOT_AUTHORIZED: 403,
  NOT_FOUND: 404,
  OK: 200,
  RESOURCE_CREATED: 201,
  SERVER_ERROR: 500,
  TOO_MANY_REQUESTS: 429,
};

const ROLES = {
  CUSTOMER: "Customer",
  STORE_OWNER: "Owner",
  ADMIN: "Admin",
};

const PRODUCT_TYPE = {
  BAR: "Bar",
  RESTAURANT: "Restaurant",
  FOODTRUCK: "Foodtruck",
  CLUB: "Club",
};

const INSIDER_TYPE = {
  MENU: "Menu",
  LOUNGE: "Lounge",
  FEEDBACK: "Feedback",
};
const FOOD_TYPE = {
  FOOD: "Food",
  DRINK: "Drink",
  ALCOHOL: "Alcohol",
  VEGAN: "Vegan",
};

const NUTRITION_TYPE = {
  LIQUID: "Liquid",
  FOOD: "Food",
  SOLID: "Solid",
  DEFAULT: "",
};

const UNIT_TYPE = {
  ML: "ML",
  Litre: "L",
  GRAM: "G",
  KILOGRAM: "KG",
  EMPTY: "",
};

const DRINKS_SIZE = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
};

const REDIS_KEYS = {
  LIVE_ENTITY: "LIVE_ENTITY",
};

const ORDER_STATUS = {
  PAYMENT_PROCESSING: "Payment Processing",
  PAYMENT_FAILED: "Payment Failed",
  IN_PROGRESS: "In Process",
  READY: "Ready",
  COMPLETED: "Completed",
  WAITING: "Waiting",
  CANCELLED: "Cancelled",
};

const KEY_TYPE_PREFIXES = {
  USER_TOKEN: "USR:",
  TEMPORARY_TOKEN: "TMP:TKN:",
  OTP: "OTP_",
  LOGIN: "LOGIN",
  SIGNUP: "SIGNUP",
  EMAIL_OTP: "EMAIL_OTP_",
};

const CARD_TYPE = {
  CREDIT_CARD: "creditCard",
  DEBIT_CARD: "debitCard",
};

const STATUS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  DELETED: "Deleted",
  BLOCKED: "Blocked",
};

const EDIT_ACTION = {
  EDIT: "edit",
  DELETE: "delete",
};

const EXPERIENCE_TYPE = {
  GOOD: "GOOD",
  DECENT: "DECENT",
  BAD: "BAD",
};

const COLOUR_THEME = {
  RED: "Red",
  GREEN: "Green",
  BLUE: "Blue",
};

const COUNTRY_ARRAY = [
  { code: "AF", country: "Afghanistan", telePhoneCode: "+93" },
  { code: "AL", country: "Albania", telePhoneCode: "+355" },
  { code: "DZ", country: "Algeria", telePhoneCode: "+213" },
  { code: "AS", country: "American Samoa", telePhoneCode: "+1-684" },
  { code: "AD", country: "Andorra", telePhoneCode: "+376" },
  { code: "AO", country: "Angola", telePhoneCode: "+244" },
  { code: "AI", country: "Anguilla", telePhoneCode: "+1-264" },
  { code: "AG", country: "Antigua and Barbuda", telePhoneCode: "+1-268" },
  { code: "AR", country: "Argentina", telePhoneCode: "+54" },
  { code: "AM", country: "Armenia", telePhoneCode: "+374" },
  { code: "AW", country: "Aruba", telePhoneCode: "+297" },
  { code: "AU", country: "Australia", telePhoneCode: "+61" },
  { code: "AT", country: "Austria", telePhoneCode: "+43" },
  { code: "AZ", country: "Azerbaijan", telePhoneCode: "+994" },
  { code: "BS", country: "Bahamas", telePhoneCode: "+1-242" },
  { code: "BH", country: "Bahrain", telePhoneCode: "+973" },
  { code: "BD", country: "Bangladesh", telePhoneCode: "+880" },
  { code: "BB", country: "Barbados", telePhoneCode: "+1-246" },
  { code: "BY", country: "Belarus", telePhoneCode: "+375" },
  { code: "BE", country: "Belgium", telePhoneCode: "+32" },
  { code: "BZ", country: "Belize", telePhoneCode: "+501" },
  { code: "BJ", country: "Benin", telePhoneCode: "+229" },
  { code: "BM", country: "Bermuda", telePhoneCode: "+1-441" },
  { code: "BT", country: "Bhutan", telePhoneCode: "+975" },
  { code: "BO", country: "Bolivia", telePhoneCode: "+591" },
  { code: "BA", country: "Bosnia and Herzegovina", telePhoneCode: "+387" },
  { code: "BW", country: "Botswana", telePhoneCode: "+267" },
  { code: "BR", country: "Brazil", telePhoneCode: "+55" },
  { code: "BN", country: "Brunei", telePhoneCode: "+673" },
  { code: "BG", country: "Bulgaria", telePhoneCode: "+359" },
  { code: "BF", country: "Burkina Faso", telePhoneCode: "+226" },
  { code: "BI", country: "Burundi", telePhoneCode: "+257" },
  { code: "KH", country: "Cambodia", telePhoneCode: "+855" },
  { code: "CM", country: "Cameroon", telePhoneCode: "+237" },
  { code: "CA", country: "Canada", telePhoneCode: "+1" },
  { code: "CV", country: "Cape Verde", telePhoneCode: "+238" },
  { code: "CF", country: "Central African Republic", telePhoneCode: "+236" },
  { code: "TD", country: "Chad", telePhoneCode: "+235" },
  { code: "CL", country: "Chile", telePhoneCode: "+56" },
  { code: "CN", country: "China", telePhoneCode: "+86" },
  { code: "CO", country: "Colombia", telePhoneCode: "+57" },
  { code: "KM", country: "Comoros", telePhoneCode: "+269" },
  { code: "CG", country: "Congo", telePhoneCode: "+242" },
  { code: "CD", country: "Congo (DRC)", telePhoneCode: "+243" },
  { code: "CR", country: "Costa Rica", telePhoneCode: "+506" },
  { code: "CI", country: "Côte d’Ivoire", telePhoneCode: "+225" },
  { code: "HR", country: "Croatia", telePhoneCode: "+385" },
  { code: "CU", country: "Cuba", telePhoneCode: "+53" },
  { code: "CY", country: "Cyprus", telePhoneCode: "+357" },
  { code: "CZ", country: "Czech Republic", telePhoneCode: "+420" },
  { code: "DK", country: "Denmark", telePhoneCode: "+45" },
  { code: "DJ", country: "Djibouti", telePhoneCode: "+253" },
  { code: "DM", country: "Dominica", telePhoneCode: "+1-767" },
  { code: "DO", country: "Dominican Republic", telePhoneCode: "+1-809" },
  { code: "EC", country: "Ecuador", telePhoneCode: "+593" },
  { code: "EG", country: "Egypt", telePhoneCode: "+20" },
  { code: "SV", country: "El Salvador", telePhoneCode: "+503" },
  { code: "GQ", country: "Equatorial Guinea", telePhoneCode: "+240" },
  { code: "ER", country: "Eritrea", telePhoneCode: "+291" },
  { code: "EE", country: "Estonia", telePhoneCode: "+372" },
  { code: "ET", country: "Ethiopia", telePhoneCode: "+251" },
  { code: "FI", country: "Finland", telePhoneCode: "+358" },
  { code: "FR", country: "France", telePhoneCode: "+33" },
  { code: "IN", country: "India", telePhoneCode: "+91" },
  { code: "US", country: "United States", telePhoneCode: "+1" },
  { code: "UK", country: "United Kingdom", telePhoneCode: "+44" },
  { code: "GE", country: "Georgia", telePhoneCode: "+995" },
  { code: "DE", country: "Germany", telePhoneCode: "+49" },
  { code: "GH", country: "Ghana", telePhoneCode: "+233" },
  { code: "GR", country: "Greece", telePhoneCode: "+30" },
  { code: "GD", country: "Grenada", telePhoneCode: "+1-473" },
  { code: "GT", country: "Guatemala", telePhoneCode: "+502" },
  { code: "GN", country: "Guinea", telePhoneCode: "+224" },
  { code: "GW", country: "Guinea-Bissau", telePhoneCode: "+245" },
  { code: "GY", country: "Guyana", telePhoneCode: "+592" },
  { code: "HT", country: "Haiti", telePhoneCode: "+509" },
  { code: "HN", country: "Honduras", telePhoneCode: "+504" },
  { code: "HU", country: "Hungary", telePhoneCode: "+36" },
  { code: "IS", country: "Iceland", telePhoneCode: "+354" },
  { code: "ID", country: "Indonesia", telePhoneCode: "+62" },
  { code: "IR", country: "Iran", telePhoneCode: "+98" },
  { code: "IQ", country: "Iraq", telePhoneCode: "+964" },
  { code: "IE", country: "Ireland", telePhoneCode: "+353" },
  { code: "IL", country: "Israel", telePhoneCode: "+972" },
  { code: "IT", country: "Italy", telePhoneCode: "+39" },
  { code: "JM", country: "Jamaica", telePhoneCode: "+1-876" },
  { code: "JP", country: "Japan", telePhoneCode: "+81" },
  { code: "JO", country: "Jordan", telePhoneCode: "+962" },
  { code: "KZ", country: "Kazakhstan", telePhoneCode: "+7" },
  { code: "KE", country: "Kenya", telePhoneCode: "+254" },
  { code: "KI", country: "Kiribati", telePhoneCode: "+686" },
  { code: "KW", country: "Kuwait", telePhoneCode: "+965" },
  { code: "KG", country: "Kyrgyzstan", telePhoneCode: "+996" },
  { code: "LA", country: "Laos", telePhoneCode: "+856" },
  { code: "LV", country: "Latvia", telePhoneCode: "+371" },
  { code: "LB", country: "Lebanon", telePhoneCode: "+961" },
  { code: "LS", country: "Lesotho", telePhoneCode: "+266" },
  { code: "LR", country: "Liberia", telePhoneCode: "+231" },
  { code: "LY", country: "Libya", telePhoneCode: "+218" },
  { code: "LI", country: "Liechtenstein", telePhoneCode: "+423" },
  { code: "LT", country: "Lithuania", telePhoneCode: "+370" },
  { code: "LU", country: "Luxembourg", telePhoneCode: "+352" },
  { code: "MO", country: "Macau", telePhoneCode: "+853" },
  { code: "MK", country: "North Macedonia", telePhoneCode: "+389" },
  { code: "MG", country: "Madagascar", telePhoneCode: "+261" },
  { code: "MW", country: "Malawi", telePhoneCode: "+265" },
  { code: "MY", country: "Malaysia", telePhoneCode: "+60" },
  { code: "MV", country: "Maldives", telePhoneCode: "+960" },
  { code: "ML", country: "Mali", telePhoneCode: "+223" },
  { code: "MT", country: "Malta", telePhoneCode: "+356" },
  { code: "MH", country: "Marshall Islands", telePhoneCode: "+692" },
  { code: "MQ", country: "Martinique", telePhoneCode: "+596" },
  { code: "MR", country: "Mauritania", telePhoneCode: "+222" },
  { code: "MU", country: "Mauritius", telePhoneCode: "+230" },
  { code: "YT", country: "Mayotte", telePhoneCode: "+262" },
  { code: "MX", country: "Mexico", telePhoneCode: "+52" },
  { code: "FM", country: "Micronesia", telePhoneCode: "+691" },
  { code: "MD", country: "Moldova", telePhoneCode: "+373" },
  { code: "MC", country: "Monaco", telePhoneCode: "+377" },
  { code: "MN", country: "Mongolia", telePhoneCode: "+976" },
  { code: "ME", country: "Montenegro", telePhoneCode: "+382" },
  { code: "MS", country: "Montserrat", telePhoneCode: "+1-664" },
  { code: "MA", country: "Morocco", telePhoneCode: "+212" },
  { code: "MZ", country: "Mozambique", telePhoneCode: "+258" },
  { code: "MM", country: "Myanmar", telePhoneCode: "+95" },
  { code: "NA", country: "Namibia", telePhoneCode: "+264" },
  { code: "NR", country: "Nauru", telePhoneCode: "+674" },
  { code: "NP", country: "Nepal", telePhoneCode: "+977" },
  { code: "NL", country: "Netherlands", telePhoneCode: "+31" },
  { code: "NC", country: "New Caledonia", telePhoneCode: "+687" },
  { code: "NZ", country: "New Zealand", telePhoneCode: "+64" },
  { code: "NI", country: "Nicaragua", telePhoneCode: "+505" },
  { code: "NE", country: "Niger", telePhoneCode: "+227" },
  { code: "NG", country: "Nigeria", telePhoneCode: "+234" },
  { code: "KP", country: "North Korea", telePhoneCode: "+850" },
  { code: "NO", country: "Norway", telePhoneCode: "+47" },
  { code: "OM", country: "Oman", telePhoneCode: "+968" },
  { code: "PK", country: "Pakistan", telePhoneCode: "+92" },
  { code: "PW", country: "Palau", telePhoneCode: "+680" },
  { code: "PA", country: "Panama", telePhoneCode: "+507" },
  { code: "PG", country: "Papua New Guinea", telePhoneCode: "+675" },
  { code: "PY", country: "Paraguay", telePhoneCode: "+595" },
  { code: "PE", country: "Peru", telePhoneCode: "+51" },
  { code: "PH", country: "Philippines", telePhoneCode: "+63" },
  { code: "PL", country: "Poland", telePhoneCode: "+48" },
  { code: "PT", country: "Portugal", telePhoneCode: "+351" },
  { code: "PR", country: "Puerto Rico", telePhoneCode: "+1-787" },
  { code: "QA", country: "Qatar", telePhoneCode: "+974" },
  { code: "RO", country: "Romania", telePhoneCode: "+40" },
  { code: "RU", country: "Russia", telePhoneCode: "+7" },
  { code: "RW", country: "Rwanda", telePhoneCode: "+250" },
  { code: "RE", country: "Réunion", telePhoneCode: "+262" },
  { code: "BL", country: "Saint Barthélemy", telePhoneCode: "+590" },
  { code: "SH", country: "Saint Helena", telePhoneCode: "+290" },
  { code: "KN", country: "Saint Kitts and Nevis", telePhoneCode: "+1-869" },
  { code: "LC", country: "Saint Lucia", telePhoneCode: "+1-758" },
  { code: "MF", country: "Saint Martin", telePhoneCode: "+590" },
  { code: "PM", country: "Saint Pierre and Miquelon", telePhoneCode: "+508" },
  {
    code: "VC",
    country: "Saint Vincent and the Grenadines",
    telePhoneCode: "+1-784",
  },
  { code: "WS", country: "Samoa", telePhoneCode: "+685" },
  { code: "SM", country: "San Marino", telePhoneCode: "+378" },
  { code: "SA", country: "Saudi Arabia", telePhoneCode: "+966" },
  { code: "SN", country: "Senegal", telePhoneCode: "+221" },
  { code: "RS", country: "Serbia", telePhoneCode: "+381" },
  { code: "SC", country: "Seychelles", telePhoneCode: "+248" },
  { code: "SL", country: "Sierra Leone", telePhoneCode: "+232" },
  { code: "SG", country: "Singapore", telePhoneCode: "+65" },
  { code: "SX", country: "Sint Maarten", telePhoneCode: "+1-721" },
  { code: "SK", country: "Slovakia", telePhoneCode: "+421" },
  { code: "SI", country: "Slovenia", telePhoneCode: "+386" },
  { code: "SB", country: "Solomon Islands", telePhoneCode: "+677" },
  { code: "SO", country: "Somalia", telePhoneCode: "+252" },
  { code: "ZA", country: "South Africa", telePhoneCode: "+27" },
  { code: "KR", country: "South Korea", telePhoneCode: "+82" },
  { code: "SS", country: "South Sudan", telePhoneCode: "+211" },
];

const STRIPE_PAYMENT_STATUS = {
  CREATED: "Created",
  SUCCESSFUL: "Successful",
  PENDING: "Pending",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  INCOMPLETE: "Incomplete",
  DISPUTED: "Disputed",
};

const ANSWER_TYPES = {
  RATING: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  RATING_FIVE: ["1", "2", "3", "4", "5"],
  FEEDBACK: ["Good", "Decent", "Bad"],
  BOOLEAN: ["True", "False", "Neutral"],
  FRIENDLY: [
    "Very user friendly",
    "User-friendly",
    "Neutral",
    "Less user friendly",
    "Difficult to understand",
  ],
};

const ALL_ANSWER_TYPES = [
  ...ANSWER_TYPES.RATING,
  ...ANSWER_TYPES.FEEDBACK,
  ...ANSWER_TYPES.BOOLEAN,
];

const APP_FEEDBACK_QUESTIONS = [
  {
    id: "appFeedback1",
    question: "How would you rate your overall experience with countr?",
    answerType: "RATING_FIVE",
  },
  {
    id: "appFeedback2",
    question: "How user-friendly do you find countr?",
    answerType: "FRIENDLY",
  },
  {
    id: "appFeedback3",
    question: "How likely is it that you would recommend countr to others?",
    answerType: "RATING",
  },
  {
    id: "appFeedback4",
    question: "Is there anything else you would like to share?",
    answerType: "TEXT",
  },
];

const OWNER_APP_FEEDBACK_QUESTIONS = [
  {
    id: "appFeedback1",
    question: "How would you rate your overall experience with countr plus?",
    answerType: "RATING_FIVE",
  },
  {
    id: "appFeedback2",
    question: "How user-friendly do you find countr plus?",
    answerType: "FRIENDLY",
  },
  {
    id: "appFeedback3",
    question:
      "How likely is it that you would recommend countr plus to others?",
    answerType: "RATING_FIVE",
  },
  {
    id: "appFeedback4",
    question: "Is there anything else you would like to share?",
    answerType: "TEXT",
  },
];

const SERIAL_TYPE = {
  WORKDAYS: "Workdays",
  ONE_DAY: "One Day",
  CUSTOM: "Custom",
  WEEKENDS: "Weekends",
};

// Timezone & locale used for rendering dates/times on receipts and PDFs.
// The app currently operates in Switzerland only, so Europe/Zurich is correct
// for every venue (auto-handles CET/CEST). Dates are generated server-side, so
// without this the receipt would use the server's timezone (UTC) instead.
// FUTURE: for multi-country support, store a timezone per entity and use
// `entity.timezone || RECEIPT_TIMEZONE` in place of this constant.
const RECEIPT_TIMEZONE = "Europe/Zurich";
const RECEIPT_LOCALE = "de-CH";

module.exports = {
  STATUS_CODES,
  ROLES,
  PRODUCT_TYPE,
  INSIDER_TYPE,
  DRINKS_SIZE,
  FOOD_TYPE,
  REDIS_KEYS,
  ORDER_STATUS,
  KEY_TYPE_PREFIXES,
  CARD_TYPE,
  STATUS,
  EDIT_ACTION,
  EXPERIENCE_TYPE,
  COUNTRY_ARRAY,
  COLOUR_THEME,
  STRIPE_PAYMENT_STATUS,
  NUTRITION_TYPE,
  UNIT_TYPE,
  ANSWER_TYPES,
  ALL_ANSWER_TYPES,
  APP_FEEDBACK_QUESTIONS,
  OWNER_APP_FEEDBACK_QUESTIONS,
  SERIAL_TYPE,
  RECEIPT_TIMEZONE,
  RECEIPT_LOCALE,
};
