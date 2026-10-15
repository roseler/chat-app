import React from "react";
const dateValue = (text) =>
  new Date(text.includes("T") ? text : text.replace(" ", "T") + "Z");
export default function MessageList({
  messages,
  loading,
  messagesEndRef,
  isTyping,
  typingUser,
}) {
  return (
    <div
      className="messages-container"
      role="log"
      aria-label="Messages"
      aria-live="polite"
      aria-relevant="additions"
      aria-busy={loading}
    >
      {loading && (
        <p className="list-note" role="status">
          Loading your conversation…
        </p>
      )}
      {!loading && !messages.length && (
        <div className="empty-chat">
          <span className="eyebrow">THE START OF SOMETHING</span>
          <h2>Say the first hello.</h2>
          <p>No messages here yet. A good conversation starts with you.</p>
        </div>
      )}
      {messages.map((message, index) => {
        const date = dateValue(message.timestamp);
        const previous = index
          ? dateValue(messages[index - 1].timestamp)
          : null;
        const status = message.read_status
          ? "Read"
          : message.delivered
            ? "Delivered"
            : "Sent";
        return (
          <React.Fragment key={message.id}>
            {(!previous || date.toDateString() !== previous.toDateString()) && (
              <div className="day-divider">
                {date.toLocaleDateString([], { month: "long", day: "numeric" })}
              </div>
            )}
            <article
              className={`message ${message.isSent ? "sent" : "received"}`}
              aria-label={message.isSent ? "You" : "Received message"}
            >
              <div className="message-bubble">{message.content}</div>
              <div className="message-info">
                {message.legacy && (
                  <span title="This older message used a predictable encryption key and should not be considered private.">
                    Legacy encryption
                  </span>
                )}
                <time
                  dateTime={date.toISOString()}
                  title={date.toLocaleString()}
                >
                  {date.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {message.isSent && (
                  <span className={`message-status ${status.toLowerCase()}`}>
                    {status === "Read" ? "✓✓" : "✓"} {status}
                  </span>
                )}
              </div>
            </article>
          </React.Fragment>
        );
      })}
      {isTyping && (
        <p className="typing-indicator" role="status">
          {typingUser} is typing<span aria-hidden="true"> · · ·</span>
        </p>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
