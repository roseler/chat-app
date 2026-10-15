import React, { useCallback, useEffect, useRef, useState } from "react";
import api, { errorText } from "../utils/api";
import {
  decryptMessage,
  encryptMessage,
  getSharedKey,
} from "../utils/encryption";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
export default function ChatWindow({
  selectedUser,
  currentUser,
  socket,
  connected,
  keyReady,
  online,
  onMenuClick,
  menuButtonRef,
  onRead,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);
  const typingTimer = useRef(null);
  const active = useRef(true);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      clearTimeout(typingTimer.current);
    };
  }, []);
  const normalize = useCallback(
    async (message) => {
      const encrypted = message.encryptedContent || message.encrypted_content;
      const legacy = !encrypted?.startsWith("v2:");
      const key = legacy
        ? null
        : await getSharedKey(currentUser.id, selectedUser);
      const senderId = Number(message.senderId ?? message.sender_id);
      return {
        ...message,
        senderId,
        receiverId: Number(message.receiverId ?? message.receiver_id),
        isSent: senderId === currentUser.id,
        legacy,
        content: await decryptMessage(
          message.encryptedContent || message.encrypted_content,
          message.iv,
          key,
          [currentUser.id, selectedUser.id],
        ),
      };
    },
    [currentUser?.id, selectedUser],
  );
  const markRead = useCallback(
    async (list) => {
      if (document.visibilityState !== "visible") return;
      const unread = list.filter(
        (message) => !message.isSent && !message.read_status,
      );
      if (!unread.length) return;
      try {
        await Promise.all(
          unread.map((message) => api.put(`/messages/${message.id}/read`)),
        );
        if (active.current) {
          setMessages((prev) =>
            prev.map((message) =>
              !message.isSent ? { ...message, read_status: 1 } : message,
            ),
          );
          onRead();
        }
      } catch {
        /* Retry on visibility change or reconnect. */
      }
    },
    [onRead],
  );
  const load = useCallback(async () => {
    if (!selectedUser || !keyReady) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(
        `/messages/conversation/${selectedUser.id}`,
      );
      const list = await Promise.all(data.map(normalize));
      if (active.current) {
        setMessages((prev) => [
          ...list,
          ...prev.filter(
            (message) =>
              new Date(message.timestamp).getTime() >= Date.now() - 86400000 &&
              !list.some((item) => item.id === message.id),
          ),
        ]);
        await markRead(list);
      }
    } catch (err) {
      if (active.current) setError(errorText(err, err.message));
    } finally {
      if (active.current) setLoading(false);
    }
  }, [selectedUser, keyReady, normalize, markRead]);
  useEffect(() => {
    if (connected) load();
  }, [connected, load]);
  useEffect(() => {
    if (!socket || !selectedUser) return;
    const receive = async (message) => {
      const otherId =
        message.senderId === currentUser.id
          ? message.receiverId
          : message.senderId;
      if (otherId !== selectedUser.id) return;
      try {
        const item = await normalize(message);
        if (!active.current) return;
        setMessages((prev) =>
          prev.some((m) => m.id === item.id) ? prev : [...prev, item],
        );
        await markRead([item]);
      } catch (err) {
        if (active.current) setError(errorText(err, err.message));
      }
    };
    const read = ({ id }) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, read_status: 1 } : m)),
      );
    const delivered = ({ id }) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, delivered: true } : m)),
      );
    const startTyping = ({ userId }) => {
      if (userId !== selectedUser.id) return;
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 3500);
    };
    const stopTyping = ({ userId }) => {
      if (userId === selectedUser.id) {
        setTyping(false);
        clearTimeout(typingTimer.current);
      }
    };
    socket.on("receive_message", receive);
    socket.on("message_read", read);
    socket.on("message_delivered", delivered);
    socket.on("user_typing", startTyping);
    socket.on("user_stopped_typing", stopTyping);
    const visible = () => markRead(messagesRef.current);
    document.addEventListener("visibilitychange", visible);
    return () => {
      socket.off("receive_message", receive);
      socket.off("message_read", read);
      socket.off("message_delivered", delivered);
      socket.off("user_typing", startTyping);
      socket.off("user_stopped_typing", stopTyping);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [socket, selectedUser, currentUser?.id, normalize, markRead]);
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [messages, typing]);
  async function send(content) {
    if (!socket?.connected || !selectedUser)
      throw new Error("You’re disconnected. Reconnect to send your draft.");
    setError("");
    const key = await getSharedKey(currentUser.id, selectedUser);
    const encrypted = await encryptMessage(content, key);
    return new Promise((resolve, reject) => {
      socket
        .timeout(12000)
        .emit(
          "send_message",
          { receiverId: selectedUser.id, ...encrypted },
          (err, response) => {
            if (err || response?.error || !response?.message)
              return reject(
                new Error(
                  response?.error ||
                    "Confirmation timed out. Check the conversation before sending again; your draft is saved.",
                ),
              );
            const message = { ...response.message, content, isSent: true };
            if (active.current)
              setMessages((prev) =>
                prev.some((m) => m.id === message.id)
                  ? prev
                  : [...prev, message],
              );
            resolve();
          },
        );
    });
  }
  return (
    <section
      className="chat-window"
      aria-label={
        selectedUser ? `Conversation with ${selectedUser.username}` : "Chat"
      }
    >
      <header className="chat-header">
        <button
          ref={menuButtonRef}
          className="menu-toggle-btn text-button"
          onClick={onMenuClick}
          aria-label="Open conversations"
        >
          ☰
        </button>
        {selectedUser ? (
          <>
            <span className="avatar">
              {selectedUser.username.slice(0, 1).toUpperCase()}
            </span>
            <div className="chat-header-info">
              <h1>{selectedUser.username}</h1>
              <span className="muted">
                {typing ? "Typing…" : online ? "Online now" : "Offline"}
              </span>
            </div>
            <span className="chat-label">24h history</span>
          </>
        ) : (
          <h1>Your conversations</h1>
        )}
      </header>
      {!selectedUser ? (
        <div className="welcome-chat">
          <span className="welcome-symbol" aria-hidden="true">
            ↗
          </span>
          <span className="eyebrow">A CONVERSATION AWAY</span>
          <h2>A little hello goes a long way.</h2>
          <p>
            Choose someone to start a conversation.
            <br />
            Make their day a little less quiet.
          </p>
          <button className="primary-button mobile-only" onClick={onMenuClick}>
            Find your people
          </button>
        </div>
      ) : (
        <>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button className="text-button" onClick={load}>
                Try again
              </button>
            </div>
          )}
          {!selectedUser.public_key && (
            <div className="notice" role="status">
              {selectedUser.username} needs to sign in to enable encrypted
              messaging.
            </div>
          )}
          <MessageList
            messages={messages}
            loading={loading}
            messagesEndRef={endRef}
            isTyping={typing}
            typingUser={selectedUser.username}
          />
          <MessageInput
            key={`${currentUser.id}:${selectedUser.id}`}
            draftKey={`draft:${currentUser.id}:${selectedUser.id}`}
            onSend={send}
            socket={socket}
            selectedUser={selectedUser}
            disabled={!connected || !keyReady || !selectedUser.public_key}
          />
          <p className="conversation-footnote">
            Conversation history is available for 24 hours.
          </p>
        </>
      )}
    </section>
  );
}
