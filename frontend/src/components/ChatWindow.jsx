import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../utils/api';
import { getAuthToken, getUser } from '../utils/auth';
import { encryptMessage, decryptMessage, getSharedKey, storeSharedKey, generateKey } from '../utils/encryption';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

const ChatWindow = ({ selectedUser, currentUser, onMenuClick }) => {
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const messagesEndRef = useRef(null);
  const selectedUserRef = useRef(selectedUser);
  const typingTimeoutRef = useRef(null);
  
  // Keep ref updated
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Initialize socket connection once (not per selectedUser)
  useEffect(() => {
    if (!currentUser) return;

    // Initialize socket connection
    const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001', {
      auth: {
        token: getAuthToken()
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    // Connection event listeners
    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      if (process.env.NODE_ENV === 'development') {
        console.log('Socket connected');
      }
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
      if (process.env.NODE_ENV === 'development') {
        console.log('Socket disconnected');
      }
    });

    newSocket.on('connect_error', (error) => {
      setConnectionStatus('error');
      if (process.env.NODE_ENV === 'development') {
        console.error('Socket connection error');
      }
    });

    newSocket.on('reconnect', () => {
      setConnectionStatus('connected');
      if (process.env.NODE_ENV === 'development') {
        console.log('Socket reconnected');
      }
    });

    // Typing indicator listeners
    newSocket.on('user_typing', (data) => {
      const currentSelectedUser = selectedUserRef.current;
      if (currentSelectedUser && parseInt(data.userId) === parseInt(currentSelectedUser.id)) {
        setIsTyping(true);
        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        // Hide typing indicator after 3 seconds
        typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
        }, 3000);
      }
    });

    newSocket.on('user_stopped_typing', (data) => {
      const currentSelectedUser = selectedUserRef.current;
      if (currentSelectedUser && parseInt(data.userId) === parseInt(currentSelectedUser.id)) {
        setIsTyping(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      }
    });

    // Listen for new messages (for any user)
    newSocket.on('receive_message', (message) => {
      // Get current selectedUser from ref (to avoid dependency issues)
      const currentSelectedUser = selectedUserRef.current;
      
      // Convert IDs to numbers for comparison
      const senderId = parseInt(message.senderId);
      const receiverId = parseInt(message.receiverId);
      const currentUserId = parseInt(currentUser.id);
      const selectedUserId = currentSelectedUser ? parseInt(currentSelectedUser.id) : null;
      
      // Check if message is for current user
      if (receiverId !== currentUserId) {
        return;
      }
      
      // If a user is selected, only show messages from that user
      if (selectedUserId !== null && senderId !== selectedUserId) {
        return;
      }
      
      handleReceivedMessage(message);
    });

    newSocket.on('message_sent', () => {
      // Message sent confirmation - no logging needed
    });

    newSocket.on('error', () => {
      console.error('Socket error');
    });

    setSocket(newSocket);

    return () => {
      newSocket.off('receive_message');
      newSocket.off('message_sent');
      newSocket.off('error');
      newSocket.off('connect');
      newSocket.off('disconnect');
      newSocket.off('connect_error');
      newSocket.off('reconnect');
      newSocket.off('user_typing');
      newSocket.off('user_stopped_typing');
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      newSocket.close();
    };
  }, [currentUser]); // Only recreate when currentUser changes, not selectedUser

  // Load messages when selectedUser changes
  useEffect(() => {
    if (selectedUser) {
      loadMessages();
    }
  }, [selectedUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/messages/conversation/${selectedUser.id}`);
      const loadedMessages = await decryptMessages(response.data);
      setMessages(loadedMessages);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading messages:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const decryptMessages = async (encryptedMessages) => {
    const decrypted = [];
    for (const msg of encryptedMessages) {
      const sharedKey = getSharedKey(currentUser.id, msg.senderId === currentUser.id ? msg.receiverId : msg.senderId);
      if (sharedKey) {
        const decryptedText = decryptMessage(msg.encrypted_content, msg.iv, sharedKey);
        if (decryptedText) {
          decrypted.push({
            ...msg,
            content: decryptedText,
            isSent: msg.senderId === currentUser.id
          });
        }
      }
    }
    return decrypted;
  };

  const handleReceivedMessage = async (message) => {
    // Convert IDs to numbers for consistency
    const senderId = parseInt(message.senderId);
    const receiverId = parseInt(message.receiverId);
    const currentUserId = parseInt(currentUser.id);
    
    // Verify this message is for the current user
    if (receiverId !== currentUserId) {
      return;
    }
    
    // Get shared key
    const sharedKey = getSharedKey(currentUser.id, senderId);
    
    if (!sharedKey) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to get or generate shared key');
      }
      return;
    }
    
    // Decrypt message
    const decryptedText = decryptMessage(message.encryptedContent, message.iv, sharedKey);
    
    if (decryptedText) {
      setMessages(prev => {
        // Check if message already exists (avoid duplicates)
        const exists = prev.some(msg => {
          return msg.id === message.id || 
                 (msg.senderId === senderId && 
                  msg.receiverId === receiverId && 
                  msg.content === decryptedText &&
                  Math.abs(new Date(msg.timestamp) - new Date(message.timestamp)) < 1000);
        });
        
        if (exists) {
          return prev;
        }
        
        const newMessage = {
          id: message.id,
          senderId: senderId,
          receiverId: receiverId,
          content: decryptedText,
          encrypted_content: message.encryptedContent,
          iv: message.iv,
          timestamp: message.timestamp,
          isSent: false
        };
        
        return [...prev, newMessage];
      });
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to decrypt message');
      }
    }
  };

  const handleSendMessage = async (content) => {
    if (!content.trim() || !socket || !selectedUser) {
      return;
    }

    if (!socket.connected) {
      alert('Connection lost. Please refresh the page.');
      return;
    }

    // Get shared key (will be generated deterministically if it doesn't exist)
    const sharedKey = getSharedKey(currentUser.id, selectedUser.id);

    // Encrypt message
    const { encryptedContent, iv } = encryptMessage(content, sharedKey);

    // Ensure receiverId is a number
    const receiverId = parseInt(selectedUser.id);

    // Send via socket
    socket.emit('send_message', {
      receiverId: receiverId,
      encryptedContent,
      iv
    }, (response) => {
      // Callback to confirm message was received by server
      if (response && response.error) {
        console.error('Failed to send message');
        alert('Failed to send message. Please try again.');
      }
    });

    // Add to local state immediately (optimistic update)
    setMessages(prev => [...prev, {
      id: Date.now(), // Temporary ID
      senderId: currentUser.id,
      receiverId: selectedUser.id,
      content,
      encrypted_content: encryptedContent,
      iv,
      timestamp: new Date().toISOString(),
      isSent: true
    }]);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Debug state logging removed for security

  // Early return must be AFTER all hooks
  if (!selectedUser) {
    return (
      <div className="chat-window">
        <div className="empty-chat">Select a user to start chatting</div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        {onMenuClick && (
          <button className="menu-toggle-btn" onClick={onMenuClick} aria-label="Open menu">
            ☰
          </button>
        )}
        <div className="chat-header-info">
          <h3>{selectedUser.username}</h3>
          <div className="chat-header-status">
            {selectedUser.isOnline && (
              <span className="online-indicator" title="Online">●</span>
            )}
            <span className={`connection-status ${connectionStatus}`} title={connectionStatus}>
              {connectionStatus === 'connected' ? '●' : connectionStatus === 'connecting' ? '○' : '✕'}
            </span>
          </div>
        </div>
      </div>
      <MessageList messages={messages} loading={loading} messagesEndRef={messagesEndRef} isTyping={isTyping} typingUser={selectedUser.username} />
      <MessageInput onSend={handleSendMessage} socket={socket} selectedUser={selectedUser} />
    </div>
  );
};

export default ChatWindow;

