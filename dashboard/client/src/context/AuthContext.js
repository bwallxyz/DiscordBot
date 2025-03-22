import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState(null);

  // Check if user is already logged in
  useEffect(() => {
    const checkLoggedIn = async () => {
      try {
        setLoading(true);
        const res = await axios.get('/api/auth/status', { withCredentials: true });
        
        if (res.data.isAuthenticated) {
          setUser(res.data.user);
          setIsAuthenticated(true);
          setIsAdmin(res.data.user.isAdmin);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    checkLoggedIn();
  }, []);

  // Login with Discord
  const login = () => {
    window.location.href = '/api/auth/discord';
  };

  // Logout
  const logout = async () => {
    try {
      await axios.get('/api/auth/logout', { withCredentials: true });
      setUser(null);
      setIsAuthenticated(false);
      setIsAdmin(false);
    } catch (err) {
      console.error('Logout failed:', err);
      setError(err.message);
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    isAdmin,
    error,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};