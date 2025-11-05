// auth/AuthManager.js

import StateManager from '../state/StateManager.js';
import StorageManager from '../storage/StorageManager.js';
import Logger from '../utils/Logger.js';

class AuthManager {
  static instance = null;
  static OAUTH_STATE_KEY = 'oauth_state';
  static SESSION_KEY = 'session_id';
  static AUTH_DATA_KEY = 'auth_data';

  constructor() {
    if (AuthManager.instance) {
      return AuthManager.instance;
    }

    this.logger = Logger.getInstance();
    this.initPromise = null;
    this.exchangingToken = false;
    this.stateCheckInProgress = false;
    this.tokenRefreshInterval = null;
    this.subscribers = [];
    AuthManager.instance = this;
  }

  static getInstance() {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  // Subscribe method for auth state changes
  subscribe(event, callback) {
    if (event === 'authStateChange' && typeof callback === 'function') {
      this.subscribers.push(callback);
    }
  }

  // Unsubscribe method for auth state changes
  unsubscribe(callback) {
    this.subscribers = this.subscribers.filter(sub => sub !== callback);
  }

  // Notify all subscribers of auth state changes
  notifyAuthStateChange(isAuthenticated) {
    this.subscribers.forEach(callback => callback(isAuthenticated));
  }

  async checkAuthStatus() {
    try {
      const storedAuthData = this.getStoredAuthData();

      if (!storedAuthData) {
        this.notifyAuthStateChange(false);
        return false;
      }

      // If offline, use stored auth data
      if (!navigator.onLine) {
        const isValid = this.validateStoredAuthData(storedAuthData);
        if (isValid) {
          await this.restoreUserState(storedAuthData);
          this.notifyAuthStateChange(true);
          this.setupTokenRefresh(); // Setup refresh for when online
          return true;
        }
      }

      if (navigator.onLine) {
        try {
            const response = await fetch('/api/auth-status', {
                credentials: 'include',
                headers: {
                    'X-Session-ID': storedAuthData.sessionId
                }
            });

            const data = await response.json();

            if (data.isAuthenticated) {
                // Update stored data with fresh timestamp
                await this.updateStoredAuthData({
                    ...storedAuthData,
                    timestamp: Date.now()
                });

                if (!this.tokenRefreshInterval) {
                    this.setupTokenRefresh();
                }
                return true;
            }
        } catch (error) {
            // If server check fails but we have valid stored data, stay logged in
            if (this.validateStoredAuthData(storedAuthData)) {
                return true;
            }
        }
      }

      this.clearAuthData();
      this.notifyAuthStateChange(false);
      return false;
    } catch (error) {
        this.logger.error('Error checking auth status:', error);
        // If error occurs but we have valid stored data, stay logged in
        if (storedAuthData && this.validateStoredAuthData(storedAuthData)) {
            return true;
        }
        this.notifyAuthStateChange(false);
        return false;
    }
  }

  validateStoredAuthData(authData) {
    if (!authData || !authData.timestamp || !authData.isAuthenticated) {
        return false;
    }

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const timeSinceAuth = Date.now() - authData.timestamp;

    // Be more lenient with validation when offline
    if (!navigator.onLine) {
        // Allow session to persist longer when offline
        return timeSinceAuth < (thirtyDays * 2);
    }

    return timeSinceAuth < thirtyDays;
  }

  async updateStoredAuthData(authData) {

    // Ensure all required fields are present
    const updatedAuthData = {
        ...authData,
        timestamp: authData.timestamp || Date.now(),
        isAuthenticated: true,
    };
    
    localStorage.setItem(AuthManager.AUTH_DATA_KEY, JSON.stringify(authData));
    await this.restoreUserState(authData);

    this.notifyAuthStateChange(true);
  }

  getStoredAuthData() {
    try {
      const data = localStorage.getItem(AuthManager.AUTH_DATA_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      this.logger.error('Error parsing stored auth data:', e);
      return null;
    }
  }

  async restoreUserState(authData) {
    const stateManager = StateManager.getInstance();
    
    // If we have cached user data, restore it
    const cachedUserData = localStorage.getItem('cached_user_data');
    if (cachedUserData) {
      try {
        const userData = JSON.parse(cachedUserData);
        stateManager.setState('auth.user', userData);
        stateManager.setState('storage.userData', userData);

        if (userData.language) {
            const i18next = (await import('/node_modules/i18next/dist/esm/i18next.js')).default;
            if (i18next.language !== userData.language) {
                await i18next.changeLanguage(userData.language);
            }
        }

      } catch (e) {
        this.logger.error('Error parsing cached user data:', e);
      }
    }
  }
  
  setupTokenRefresh() {
    fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            level: 'info',
            message: 'Setting up token refresh interval',
            data: {
                timestamp: new Date().toISOString()
            }
        })
    });
    
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }
    
    this.tokenRefreshInterval = setInterval(async () => {

      await fetch('/api/log-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              level: 'info',
              message: 'Token refresh interval triggered',
              data: {
                  timestamp: new Date().toISOString()
              }
          })
      });
      
      if (!navigator.onLine) return;

      try {
        const success = await this.checkAndRefreshToken();
        if (!success) {

          await fetch('/api/log-error', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  level: 'warn',
                  message: 'Token refresh failed, preparing for reload',
                  data: {
                      timestamp: new Date().toISOString()
                  }
              })
          });
          
          this.clearAuthData();
          window.location.reload();
        }
      } catch (error) {
        await fetch('/api/log-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: 'error',
                message: 'Error in refresh interval',
                data: {
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            })
        });
      }
    }, 15 * 60 * 1000); // Refresh every 15 minutes
  }

  async handleOAuthCallback(code, state) {
    this.logger.debug('handleOAuthCallback called');
    this.logger.debug('Code:', code, 'State:', state);
  
    if (this.exchangingToken) {
      this.logger.debug('Token exchange already in progress');
      return false;
    }
  
    this.exchangingToken = true;
  
    try {
      if (state) {
        const storedState = sessionStorage.getItem(AuthManager.OAUTH_STATE_KEY);
        this.logger.debug('Stored state:', storedState);
        
        if (!storedState || !state) {
          this.logger.error('Missing state');
          return false;
        }
  
        // Parse timestamps from states
        const [returnedTimestamp] = state.split('.');
        const [storedTimestamp] = storedState.split('.');
        
        this.logger.debug('Timestamps - Returned:', returnedTimestamp, 'Stored:', storedTimestamp);
        
        // Allow for small timing differences (within 5 seconds)
        const timeDiff = Math.abs(parseInt(returnedTimestamp) - parseInt(storedTimestamp));
        if (timeDiff > 5000) {
          this.logger.error('Timestamp difference too large:', timeDiff);
          return false;
        }
  
        // Verify the complete state if timestamps are close
        if (state !== storedState) {
          this.logger.error('States do not match');
          return false;
        }
      }
  
      if (code) {
        this.logger.debug('Exchanging token');
        try {
          const success = await this.exchangeToken(code);
          if (success) {
            // Store the session ID we got from the response
            const sessionId = localStorage.getItem(AuthManager.SESSION_KEY);
            if (sessionId) {
              this.logger.debug('Storing session ID:', sessionId);
              localStorage.setItem(AuthManager.SESSION_KEY, sessionId);
            }
            this.logger.debug('Token exchanged successfully');
            await this.checkAuthStatus(); // Ensure we get the latest auth status
            return true;
          }
        } catch (error) {
          this.logger.error('Error exchanging token:', error);
        }
      }
  
      return false;
    } finally {
      this.exchangingToken = false;
      // Clear OAuth-specific data but keep session if successful
      sessionStorage.removeItem(AuthManager.OAUTH_STATE_KEY);
      sessionStorage.removeItem('oauth_initiated_at');
    }
  }

  clearAuthData() {
    this.logger.debug('Clearing auth data...');
    const beforeClear = {
      sessionStorage: {
        state: sessionStorage.getItem(AuthManager.OAUTH_STATE_KEY),
        initiatedAt: sessionStorage.getItem('oauth_initiated_at')
      },
      localStorage: {
        sessionId: localStorage.getItem(AuthManager.SESSION_KEY),
        authData: localStorage.getItem(AuthManager.AUTH_DATA_KEY)
      }
    };
    this.logger.debug('Before clearing:', beforeClear);

    sessionStorage.removeItem(AuthManager.OAUTH_STATE_KEY);
    sessionStorage.removeItem('oauth_initiated_at');
    localStorage.removeItem(AuthManager.SESSION_KEY);
    localStorage.removeItem(AuthManager.AUTH_DATA_KEY);
    
    document.cookie = 'nb_report_cookie=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }

    const afterClear = {
      sessionStorage: {
        state: sessionStorage.getItem(AuthManager.OAUTH_STATE_KEY),
        initiatedAt: sessionStorage.getItem('oauth_initiated_at')
      },
      localStorage: {
        sessionId: localStorage.getItem(AuthManager.SESSION_KEY),
        authData: localStorage.getItem(AuthManager.AUTH_DATA_KEY)
      }
    };
    this.logger.debug('After clearing:', afterClear);
  }
  
async initiateOAuth() {
    this.logger.debug('InitiateOAuth called');
    try {
      // Clear any existing auth data before starting new auth flow
      this.clearAuthData();
      
      // Generate new state with timestamp to prevent replay attacks
      const timestamp = Math.floor(Date.now() / 1000) * 1000; // Round to nearest second
      const randomPart = Math.random().toString(36).substring(2, 15);
      const state = `${timestamp}.${randomPart}`;
      
      this.logger.debug('Generated state:', state);
      
      // Store state in sessionStorage before making the request
      sessionStorage.setItem(AuthManager.OAUTH_STATE_KEY, state);
      sessionStorage.setItem('oauth_initiated_at', timestamp.toString());

      // Verify state was stored
      const storedState = sessionStorage.getItem(AuthManager.OAUTH_STATE_KEY);
      if (storedState !== state) {
        this.logger.error('Failed to store OAuth state');
        return false;
      }

      const response = await fetch('/api/initiate-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          state, 
          scopes: 'email'
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.logger.debug('OAuth initiation data:', data);
      
      if (!data.authUrl) {
        throw new Error('No auth URL received');
      }

      // Final state verification before redirect
      const finalStoredState = sessionStorage.getItem(AuthManager.OAUTH_STATE_KEY);
      if (finalStoredState !== state) {
        throw new Error('State verification failed before redirect');
      }

      this.logger.debug('All checks passed, redirecting to:', data.authUrl);
      window.location.href = data.authUrl;
      return true;

    } catch (error) {
      this.logger.error('Error initiating OAuth:', error);
      return false;
    }
  }

  createAuthData(sessionId, userData = null) {
      return {
          timestamp: Date.now(),
          sessionId: sessionId,
          isAuthenticated: true,
          userData: userData
      };
  }
  
  async exchangeToken(code) {
    this.logger.debug('Attempting to exchange token with code:', code);
    try {
      const response = await fetch('/api/exchange-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          code,
          redirect_uri: window.location.origin + '/api/nblogin/',
          grant_type: 'authorization_code'
        }),
        credentials: 'include'
      });
  
      this.logger.debug('Exchange token response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error('Server error response:', errorData);
        throw new Error('Failed to exchange token');
      }
  
      const data = await response.json();
      this.logger.debug('Exchange token response:', data);
      
      if (data.success) {
        this.logger.debug('Token exchange successful');
        
        if (data.sessionId) {
          // Create and store complete auth data
          const authData = this.createAuthData(data.sessionId);
          await this.updateStoredAuthData(authData);

          this.logger.debug('Storing session ID:', data.sessionId);
          localStorage.setItem(AuthManager.SESSION_KEY, data.sessionId);
        }

        this.setupTokenRefresh();

        return true;
      } else {
        throw new Error('Token exchange failed');
      }
    } catch (error) {
      this.logger.error('Error exchanging token:', error);
      return false;
    }
  }

  async checkAndRefreshToken() {

      if (!navigator.onLine) {
          this.logger.debug('Offline - skipping token refresh');
          return true; // Return true to prevent logout/reload
      }
  
      try {

          await fetch('/api/log-error', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  level: 'info',
                  message: 'Token refresh starting',
                  data: {
                      hasSessionId: !!localStorage.getItem(AuthManager.SESSION_KEY),
                      timestamp: new Date().toISOString()
                  }
              })
          });
        
          const response = await fetch('/api/refresh-token', {
              method: 'POST',
              credentials: 'include',
              headers: {
                  'Content-Type': 'application/json'
              }
          });

          await fetch('/api/log-error', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  level: 'info',
                  message: 'Token refresh response received',
                  data: {
                      status: response.status,
                      ok: response.ok,
                      timestamp: new Date().toISOString()
                  }
              })
          });
          
          if (response.ok) {
              const data = await response.json();
              if (data.success) {
                  this.logger.debug('Token refreshed successfully');
                  return true;
              }
          } else if (response.status === 401) {

              await fetch('/api/log-error', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      level: 'warn',
                      message: 'Token refresh 401 received',
                      data: {
                          responseText: await response.text(),
                          timestamp: new Date().toISOString()
                      }
                  })
              });
            
              const isLoggedIn = await this.checkAuthStatus();
              if (!isLoggedIn) {
                  if (this.tokenRefreshInterval) {
                      clearInterval(this.tokenRefreshInterval);
                      this.tokenRefreshInterval = null;
                  }

                  await fetch('/api/log-error', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          level: 'warn',
                          message: 'Auth check failed after 401',
                          data: {
                              timestamp: new Date().toISOString()
                          }
                      })
                  });

                  return false;
              }
          }
      } catch (error) {
          await fetch('/api/log-error', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  level: 'error',
                  message: 'Token refresh error',
                  data: {
                      error: error.message,
                      stack: error.stack,
                      timestamp: new Date().toISOString()
                  }
              })
          });
          return false;
      }
  }

  async logout() {
    try {
      this.logger.debug('Logout function called');
      
      const response = await fetch('/api/logout', { 
        method: 'POST',
        credentials: 'include',
      });

      this.logger.debug('Logout response status:', response.status);
      const data = await response.json();
      StorageManager.getInstance().clearSelectedSkiCenter();
      this.logger.debug('Logout response:', data);
      this.clearAuthData();

      const stateManager = StateManager.getInstance();
      stateManager.setState('auth.user', null);
      stateManager.setState('storage.userData', null);

      this.logger.debug('Logout successful');
      return true;

    } catch (error) {
      this.logger.error('Logout error:', error);
      this.clearAuthData();
      return false;
    }
  }
}

export default AuthManager;
