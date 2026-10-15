import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
export default function MessageInput({
  onSend,
  socket,
  selectedUser,
  draftKey,
  disabled,
}) {
  const [message, setMessage] = useState(
    () => sessionStorage.getItem(draftKey) || "",
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef(null);
  const lastTyping = useRef(0);
  const textRef = useRef(message);
  textRef.current = message;
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (socket?.connected)
        socket.emit("stop_typing", { receiverId: selectedUser.id });
    },
    [socket, selectedUser.id],
  );
  function change(e) {
    const value = e.target.value;
    setMessage(value);
    sessionStorage.setItem(draftKey, value);
    if (socket?.connected) {
      if (value.trim() && Date.now() - lastTyping.current > 1500) {
        socket.emit("typing", { receiverId: selectedUser.id });
        lastTyping.current = Date.now();
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(
        () => socket.emit("stop_typing", { receiverId: selectedUser.id }),
        2500,
      );
      if (!value.trim())
        socket.emit("stop_typing", { receiverId: selectedUser.id });
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (!message.trim() || sending || disabled) return;
    const sentText = message;
    setSending(true);
    setError("");
    try {
      await onSend(sentText.trim());
      if (textRef.current === sentText) {
        setMessage("");
        sessionStorage.removeItem(draftKey);
      }
      socket?.emit("stop_typing", { receiverId: selectedUser.id });
    } catch (err) {
      setError(err.message || "Could not send. Your draft is saved.");
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="message-input-container">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <form className="message-input-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="message">
          Message {selectedUser.username}
        </label>
        <textarea
          id="message"
          className="message-input"
          value={message}
          onChange={change}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit(e);
            }
          }}
          placeholder={
            disabled ? "Write a message…" : `Message ${selectedUser.username}…`
          }
          rows={1}
          maxLength={4000}
          aria-describedby="composer-hint"
        />
        <button
          className="send-button"
          type="submit"
          disabled={disabled || sending || !message.trim()}
        >
          {sending ? (
            "Sending…"
          ) : (
            <>
              Send <Icon name="send" size={16} />
            </>
          )}
        </button>
      </form>
      <div className="composer-hint" id="composer-hint">
        <span>Enter to send · Shift + Enter for a new line</span>
        <span>
          {message ? "Draft saved" : ""}
          {message.length > 3200 ? ` · ${message.length}/4000` : ""}
        </span>
      </div>
    </div>
  );
}
