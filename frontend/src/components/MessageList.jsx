import React from 'react';

const MessageList = ({ messages, loading, messagesEndRef, isTyping, typingUser }) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Show relative time for recent messages
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    // Show date for older messages
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="messages-container">
        <div className="empty-chat">Loading messages...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="messages-container">
        <div className="empty-chat">No messages yet. Start the conversation!</div>
      </div>
    );
  }

  return (
    <div className="messages-container">
      {messages.map((message) => {
        return (
          <div key={message.id} className={`message ${message.isSent ? 'sent' : 'received'}`}>
            <div className="message-bubble">
              {message.content || '(empty message)'}
            </div>
            <div className="message-info">
              <span className="message-time">{formatTime(message.timestamp)}</span>
              {message.isSent && (
                <span className="message-status">
                  {message.read_status ? '✓✓' : '✓'}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {isTyping && (
        <div className="message received">
          <div className="message-bubble typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="message-info">
            {typingUser} is typing...
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;

