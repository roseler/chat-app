// Local test fixture only. Never imported by the production Worker.
import worker from "../worker.mjs";
import { ChatRoom as BaseChatRoom } from "../chat-room.mjs";
export default worker;
export class ChatRoom extends BaseChatRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(
      "INSERT OR IGNORE INTO users (username,email,password_hash,created_at) VALUES (?,?,?,?)",
      "roseler",
      "admin@roseler.tech",
      "$2b$12$xDWO/ZN8ovx6zIf2lq4clOhMpZ1mM8XQ.dS4/FnfQZf6IU.SccnS.",
      new Date().toISOString(),
    );
    this.ownerId();
  }
}
