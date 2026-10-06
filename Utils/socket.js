let ioInstance = null;

module.exports = {
  setIo: (io) => {
    ioInstance = io;
    console.log("Socket.IO instance set.");
  },
  getIo: () => {
    if (!ioInstance) {
      console.warn("Socket.IO instance not yet set.");
    }
    return ioInstance;
  },
};
