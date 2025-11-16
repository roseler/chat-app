export const setAuthToken = (token) => {
  localStorage.setItem('token', token);
};

export const getAuthToken = () => {
  return localStorage.getItem('token');
};

export const setUser = (user) => {
  localStorage.setItem('user', JSON.stringify(user));
};

export const getUser = () => {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
};

export const clearAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // Clear all encryption keys
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('encryption_key_') || key.startsWith('shared_key_')) {
      localStorage.removeItem(key);
    }
  });
};

export const isAuthenticated = () => {
  return !!getAuthToken();
};

