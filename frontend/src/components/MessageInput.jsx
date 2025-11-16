import React, { useState } from 'react';

const MessageInput = ({ onSend }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="message-input-container">
      <form className="message-input-form" onSubmit={handleSubmit}>
        <textarea
          className="message-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          rows={1}
          style={{
            minHeight: '44px',
            maxHeight: '120px',
            height: 'auto',
            overflowY: 'auto'
          }}
        />
        <button type="submit" className="send-button" disabled={!message.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

export default MessageInput;

