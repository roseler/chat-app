import React, { useState, useEffect, useRef } from 'react';

const MessageInput = ({ onSend, socket, selectedUser }) => {
  const [message, setMessage] = useState('');
  const typingTimeoutRef = useRef(null);
  const lastTypingTimeRef = useRef(0);

  useEffect(() => {
    return () => {
      // Stop typing when component unmounts
      if (socket && selectedUser && typingTimeoutRef.current) {
        socket.emit('stop_typing', { receiverId: selectedUser.id });
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [socket, selectedUser]);

  const handleChange = (e) => {
    const value = e.target.value;
    setMessage(value);

    // Emit typing indicator
    if (socket && selectedUser && value.trim()) {
      const now = Date.now();
      // Throttle typing events (max once per 2 seconds)
      if (now - lastTypingTimeRef.current > 2000) {
        socket.emit('typing', { receiverId: selectedUser.id });
        lastTypingTimeRef.current = now;
      }

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        if (socket && selectedUser) {
          socket.emit('stop_typing', { receiverId: selectedUser.id });
        }
      }, 3000);
    } else if (socket && selectedUser && !value.trim()) {
      // Stop typing if message is empty
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      socket.emit('stop_typing', { receiverId: selectedUser.id });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      // Stop typing indicator
      if (socket && selectedUser) {
        socket.emit('stop_typing', { receiverId: selectedUser.id });
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      }
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
          onChange={handleChange}
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

