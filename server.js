const jwt = require("jsonwebtoken");

const User = require("./Models/User");
const { SECRET_KEY } = require("./Utils/commonFunction");

const verifyToken = async (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
      if (err) return reject(new Error("Invalid token"));
      resolve(decoded);
    });
  });
};

const orderSocket = async (io) => {
  io.on("connection", async (socket) => {
    const token =
      socket.handshake.headers.token || socket.handshake.query.token;

    if (!token) {
      console.log("No token provided, disconnecting...");
      return socket.disconnect();
    }

    try {
      const decoded = await verifyToken(token);
      const userId = decoded.userId;
      const entityId = decoded.entityId;

      if (!userId) {
        console.log("Invalid token, disconnecting...");
        return socket.disconnect();
      }

      console.log(`User authenticated: ${userId}`);

      await User.updateOne({ _id: userId }, { $set: { socketId: socket.id } });

      // Admin joins admin_room for dashboard real-time updates
      if (decoded.isAdmin === true) {
        socket.join("admin_room");
        console.info(`Admin ${userId} joined room: admin_room`);
      }

      if (entityId) {
        socket.join(entityId.toString());
        console.info(`User ${userId} joined room: ${entityId}`);
      }

      socket.on("disconnect", async () => {
        console.log("User disconnected:", socket.id);
        await User.updateOne({ _id: userId }, { $unset: { socketId: "" } });
      });
    } catch (error) {
      console.error("Error:", error);
      console.log("Token verification failed:", error.message);
      return socket.disconnect();
    }
  });
};

module.exports = { orderSocket };
