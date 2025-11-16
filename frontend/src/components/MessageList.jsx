import React from 'react';

const MessageList = ({ messages, loading, messagesEndRef }) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
              {formatTime(message.timestamp)}
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;

