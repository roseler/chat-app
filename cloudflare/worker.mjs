export { ChatRoom } from "./chat-room.mjs";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (
      pathname === "/api" ||
      pathname.startsWith("/api/") ||
      pathname === "/ws"
    ) {
      if (!env.CHAT)
        return Response.json(
          { error: "Chat storage is not configured." },
          { status: 503 },
        );
      return env.CHAT.getByName("quiet-global-v1").fetch(request);
    }
    if (pathname.startsWith("/socket.io"))
      return Response.json(
        { error: "Please refresh the app to update your chat connection." },
        { status: 426 },
      );
    return env.ASSETS.fetch(request);
  },
};
