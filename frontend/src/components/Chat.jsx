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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const navigate = useNavigate();

  // Initial load
  useEffect(() => {
    const initialize = async () => {
      await loadCurrentUser();
      await loadUsers();
    };
    
    initialize();
  }, []); // Only run once on mount

  // Load unread counts when currentUser is available
  useEffect(() => {
    if (!currentUser) return;
    
    loadUnreadCounts();
    
    // Refresh unread counts periodically
    const interval = setInterval(loadUnreadCounts, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [currentUser]);

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
      const usersData = response.data;
      
      // Load online users (with timeout to prevent hanging)
      try {
        const onlineResponse = await Promise.race([
          api.get('/auth/online'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);
        const onlineUserIds = new Set(onlineResponse.data.map(u => u.userId));
        setOnlineUsers(onlineUserIds);
        
        // Mark users as online
        usersData.forEach(user => {
          user.isOnline = onlineUserIds.has(user.id);
        });
      } catch (err) {
        // If online endpoint fails, continue without online status
        // This is not critical, so we just skip it
        if (process.env.NODE_ENV === 'development') {
          console.warn('Could not load online users (this is okay):', err.message);
        }
        // Mark all users as offline if we can't determine status
        usersData.forEach(user => {
          user.isOnline = false;
        });
      }
      
      setUsers(usersData);
      if (usersData.length > 0 && !selectedUser) {
        setSelectedUser(usersData[0]);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading users:', error);
      }
      if (error.response?.status === 401 || error.response?.status === 403) {
        navigate('/login');
      } else {
        // Show error but don't block the UI
        setUsers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCounts = async () => {
    if (!currentUser) return;
    
    try {
      const response = await api.get('/messages/unread');
      // For now, we'll show total unread. Later can be per-user
      // This would require a different endpoint
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading unread counts:', error);
      }
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    // Close sidebar on mobile after selecting user
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  if (!currentUser) {
    return <div>Loading...</div>;
  }

  return (
    <div className="chat-container">
      {/* Mobile menu overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>{currentUser.username}</h3>
          <div className="sidebar-header-actions">
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
            <button className="close-sidebar-btn" onClick={() => setSidebarOpen(false)}>
              ✕
            </button>
          </div>
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
                onClick={() => handleUserSelect(user)}
              >
                <div className="user-item-content">
                  <div className="user-item-name">
                    {user.username}
                    {user.isOnline && <span className="online-dot" title="Online">●</span>}
                  </div>
                  {unreadCounts[user.id] > 0 && (
                    <span className="unread-badge">{unreadCounts[user.id]}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <ChatWindow 
        selectedUser={selectedUser} 
        currentUser={currentUser}
        onMenuClick={() => setSidebarOpen(true)}
      />
    </div>
  );
};

export default Chat;

