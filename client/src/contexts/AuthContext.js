import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

// Set base URL for all axios requests
axios.defaults.baseURL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const idleTimerRef = useRef(null);
  const logoutInProgressRef = useRef(false);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get('/api/auth/me');
      console.log('User data fetched:', response.data);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    setLoading(true);
    try {
      console.log('Attempting login for:', username);
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });

      console.log('Login response:', response.data);
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(user);
      console.log('Login successful, user set:', user);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = useCallback(async (isSessionExpired = false) => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;

    try {
      await axios.post('/api/auth/logout');
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);

    if (isSessionExpired) {
      setSessionExpired(true);
    }

    logoutInProgressRef.current = false;
  }, []);

  const dismissSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      logout(true);
    }, 5 * 60 * 1000);
  }, [clearIdleTimer, logout]);

  useEffect(() => {
    if (!user) {
      clearIdleTimer();
      return;
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => resetIdleTimer();

    events.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));
    resetIdleTimer();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handler));
      clearIdleTimer();
    };
  }, [user, resetIdleTimer, clearIdleTimer]);

  useEffect(() => {
    const id = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const status = error.response?.status;
        const message = error.response?.data?.message;
        if (status === 401 && message === 'Session expired') {
          await logout(true);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(id);
    };
  }, [logout]);

  const value = {
    user,
    login,
    logout,
    loading,
    sessionExpired,
    dismissSessionExpired
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
