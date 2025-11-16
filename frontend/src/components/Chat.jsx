import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { getUser, clearAuth } from '../utils/auth';
import ChatWindow from './ChatWindow';

const Chat = () => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadCurrentUser();
    loadUsers();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = getUser();
      if (!user) {
        navigate('/login');
        return;
      }
      setCurrentUser(user);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading user:', error);
      }
      navigate('/login');
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/users');
      setUsers(response.data);
      if (response.data.length > 0 && !selectedUser) {
        setSelectedUser(response.data[0]);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading users:', error);
      }
      if (error.response?.status === 401 || error.response?.status === 403) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  if (!currentUser) {
    return <div>Loading...</div>;
  }

  return (
    <div className="chat-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>{currentUser.username}</h3>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
        <div className="user-list">
          {loading ? (
            <div style={{ padding: '20px', color: '#666' }}>Loading users...</div>
          ) : users.length === 0 ? (
            <div style={{ padding: '20px', color: '#666' }}>No other users found</div>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="user-item-name">{user.username}</div>
              </div>
            ))
          )}
        </div>
      </div>
      <ChatWindow selectedUser={selectedUser} currentUser={currentUser} />
    </div>
  );
};

export default Chat;

