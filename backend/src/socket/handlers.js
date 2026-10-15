const Message = require("../models/Message");
const User = require("../models/User");
const { sessionUser } = require("../middleware/auth");
const onlineUsers = new Map();
const getOnlineUsers = () =>
  Array.from(onlineUsers, ([userId, sockets]) => ({
    userId,
    username: sockets.values().next().value,
  }));
const setupSocketHandlers = (io) => {
  io.use(async (socket, next) => {
    try {
      const user = await sessionUser(socket.handshake.headers);
      if (!user) return next(new Error("Please sign in again."));
      socket.userId = user.userId;
      socket.username = user.username;
      socket.sessionId = user.sessionId;
      socket.expiresAt = user.expiresAt;
      next();
    } catch {
      next(new Error("Unable to authenticate."));
    }
  });
  io.on("connection", (socket) => {
    const expiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, new Date(socket.expiresAt).getTime() - Date.now()),
    );
    const room = `user_${socket.userId}`;
    socket.join(room);
    if (!onlineUsers.has(socket.userId))
      onlineUsers.set(socket.userId, new Map());
    onlineUsers.get(socket.userId).set(socket.id, socket.username);
    io.emit("online_users", getOnlineUsers());
    // Revalidate sessions for long-lived connections and logout/password changes.
    socket.use(async (_packet, next) => {
      try {
        if (!(await sessionUser(socket.handshake.headers))) {
          socket.disconnect(true);
          return;
        }
        next();
      } catch {
        next(new Error("Session check failed"));
      }
    });
    let recent = [];
    socket.on("send_message", async (data = {}, callback) => {
      const reply = typeof callback === "function" ? callback : () => {};
      try {
        recent = recent.filter((t) => t > Date.now() - 10000);
        if (recent.length >= 20)
          return reply({ error: "Please slow down and try again." });
        recent.push(Date.now());
        const { receiverId, encryptedContent, iv } = data;
        if (
          !Number.isSafeInteger(receiverId) ||
          receiverId === socket.userId ||
          typeof encryptedContent !== "string" ||
          !/^v2:[A-Za-z0-9+/=]+$/.test(encryptedContent) ||
          encryptedContent.length > 30000 ||
          typeof iv !== "string" ||
          !/^[A-Za-z0-9+/]{16}$/.test(iv)
        )
          return reply({ error: "Invalid message data." });
        const [sender, receiver] = await Promise.all([
          User.findById(socket.userId),
          User.findById(receiverId),
        ]);
        if (!sender?.public_key || !receiver?.public_key)
          return reply({ error: "Both people must enable messaging first." });
        const id = await Message.create(
          socket.userId,
          receiverId,
          encryptedContent,
          iv,
        );
        const message = {
          id,
          senderId: socket.userId,
          receiverId,
          encryptedContent,
          iv,
          timestamp: new Date().toISOString(),
          delivered: onlineUsers.has(receiverId),
        };
        io.to(`user_${receiverId}`).emit("receive_message", message);
        socket.to(room).emit("receive_message", message);
        reply({ success: true, message });
      } catch {
        reply({ error: "Could not send. Your draft has been kept." });
      }
    });
    for (const [event, outgoing] of [
      ["typing", "user_typing"],
      ["stop_typing", "user_stopped_typing"],
    ]) {
      socket.on(event, (data = {}) => {
        if (data && Number.isSafeInteger(data.receiverId))
          socket
            .to(`user_${data.receiverId}`)
            .emit(outgoing, { userId: socket.userId });
      });
    }
    socket.on("message_delivered", (data = {}) => {
      if (!data || !Number.isSafeInteger(data.id)) return;
      require("../utils/database")
        .get(
          "SELECT sender_id FROM messages WHERE id = ? AND receiver_id = ?",
          [data.id, socket.userId],
        )
        .then((message) => {
          if (message)
            io.to(`user_${message.sender_id}`).emit("message_delivered", {
              id: data.id,
            });
        })
        .catch(() => {});
    });
    socket.on("disconnect", () => {
      clearTimeout(expiryTimer);
      const sockets = onlineUsers.get(socket.userId);
      sockets?.delete(socket.id);
      if (!sockets?.size) onlineUsers.delete(socket.userId);
      io.emit("online_users", getOnlineUsers());
    });
  });
};
module.exports = { setupSocketHandlers, getOnlineUsers };
