const admin = require("firebase-admin");
const { getMessaging } = require("firebase-admin/messaging");

// Import your service account keys for both projects
const serviceAccount = require("./Utils/firebaseKey.json");
const serviceAccountPlus = require("./Utils/firebaseCountrplusKey.json");

// Initialize Firebase Admin SDK for the Default App (Project 1)
const app = admin.initializeApp(
  {
    credential: admin.credential.cert(serviceAccount),
  },
  "default"
); // Give it a name 'default'

// Initialize Firebase Admin SDK for the Second App (Project 2)
const countrPlusApp = admin.initializeApp(
  {
    credential: admin.credential.cert(serviceAccountPlus),
  },
  "countrPlusApp"
); // Provide a unique name for the second app instance

// Get messaging instances for both projects
const messaging = getMessaging(admin.app("default"));
const messagingPlus = getMessaging(admin.app("countrPlusApp"));

// Export instances to be used elsewhere in your code
module.exports = { admin, messaging, messagingPlus };
