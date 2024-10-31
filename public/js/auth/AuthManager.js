// auth/AuthManager.js

class AuthManager {
  static instance = null;
  static STATE_KEY = 'oauth_state';
  static SESSION_KEY = 'session_id';
  static AUTH_DATA_KEY = 'auth_data';

  constructor() {
    if (AuthManager.instance) {
      return AuthManager.instance;
    }

    this.initPromise = null;
    this.exchangingToken = false;
    this.stateCheckInProgress = false;
    this.tokenRefreshInterval = null;
    this.isNewLogin = false;
    this.hasLoggedOut = false;
    AuthManager.instance = this;
  }

  static getInstance() {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  async checkAuthStatus() {
      try {
          const storedSessionId = localStorage.getItem(AuthManager.SESSION_KEY);
          
          if (!storedSessionId) {
              return false;
          }
  
          // If we've just logged in or haven't logged out, trust the session
          if (this.isNewLogin || !this.hasLoggedOut) {
              return true;
          }
  
          // Only verify with server if we've previously logged out
          const response = await fetch('/api/auth-status', {
              credentials: 'include',
              headers: {
                  'X-Session-ID': storedSessionId
              }
          });
          
          if (!response.ok) {
              await this.clearAuthData();
              return false;
          }
  
          const data = await response.json();
          
          if (!data.isAuthenticated) {
              await this.clearAuthData();
              return false;
          }
  
          // Set up token refresh if authenticated
          if (data.isAuthenticated && !this.tokenRefreshInterval) {
              this.setupTokenRefresh();
          }
          
          return data.isAuthenticated;
      } catch (error) {
          this.logger.error('Error checking auth status:', error);
          await this.clearAuthData();
          return false;
      }
  }

  setupTokenRefresh() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }
    
    this.tokenRefreshInterval = setInterval(async () => {
      try {
        const success = await this.checkAndRefreshToken();
        if (!success) {
          this.clearAuthData();
          window.location.reload();
        }
      } catch (error) {
        this.logger.error('Token refresh failed:', error);
      }
    }, 15 * 60 * 1000); // Refresh every 15 minutes
  }

  async handleOAuthCallback(code, state) {
      console.log('handleOAuthCallback called');
      console.log('Code:', code, 'State:', state);
  
      if (this.exchangingToken) {
          console.log('Token exchange already in progress');
          return false;
      }
  
      this.exchangingToken = true;
  
      try {
          if (state) {
              const storedState = sessionStorage.getItem(AuthManager.STATE_KEY);
              console.log('Stored state:', storedState);
              
              if (!storedState || !state) {
                  console.error('Missing state');
                  return false;
              }
  
              // Parse timestamps from states
              const [returnedTimestamp] = state.split('.');
              const [storedTimestamp] = storedState.split('.');
              
              console.log('Timestamps - Returned:', returnedTimestamp, 'Stored:', storedTimestamp);
              
              // Allow for small timing differences (within 5 seconds)
              const timeDiff = Math.abs(parseInt(returnedTimestamp) - parseInt(storedTimestamp));
              if (timeDiff > 5000) {
                  console.error('Timestamp difference too large:', timeDiff);
                  return false;
              }
  
              // Verify the complete state if timestamps are close
              if (state === storedState) {
                  console.log('Exact state match');
              } else {
                  console.log('States differ but timestamps are within tolerance');
              }
          }
  
          if (code) {
              console.log('Exchanging token');
              try {
                  const success = await this.exchangeToken(code);
                  if (success) {
                      // Store the session ID we got from the response
                      const sessionId = localStorage.getItem(AuthManager.SESSION_KEY);
                      if (sessionId) {
                          console.log('Storing session ID:', sessionId);
                          localStorage.setItem(AuthManager.SESSION_KEY, sessionId);
                      }
                      console.log('Token exchanged successfully');

                      // Set new login flag and schedule its reset
                      this.isNewLogin = true;
                      setTimeout(() => {
                          this.isNewLogin = false;
                      }, 5000);

                      await this.checkAuthStatus(); // Ensure we get the latest auth status
                      return true;
                  }
              } catch (error) {
                  console.error('Error exchanging token:', error);
              }
          }
  
          return false;
      } finally {
          this.exchangingToken = false;
          // Clear OAuth-specific data but keep session if successful
          sessionStorage.removeItem(AuthManager.STATE_KEY);
          sessionStorage.removeItem('oauth_initiated_at');
      }
  }

  async clearAuthData() {
      // Clear all authentication-related storage
      const itemsToClear = [
          // Session Storage
          { type: 'sessionStorage', keys: [
              AuthManager.STATE_KEY,
              'oauth_initiated_at'
          ]},
          // Local Storage
          { type: 'localStorage', keys: [
              AuthManager.SESSION_KEY,
              AuthManager.AUTH_DATA_KEY,
              'i18nextLng',
              'appState'
          ]},
          // Cookies (using path and domain)
          { type: 'cookie', keys: [
              { name: 'nb_report_cookie', path: '/', domain: '.nabezky.sk' },
              { name: 'connect.sid', path: '/', domain: '.nabezky.sk' }
          ]}
      ];
  
      // Clear all storage types
      itemsToClear.forEach(storage => {
          if (storage.type === 'cookie') {
              storage.keys.forEach(cookie => {
                  document.cookie = `${cookie.name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${cookie.path}; domain=${cookie.domain}`;
              });
          } else {
              storage.keys.forEach(key => {
                  window[storage.type].removeItem(key);
              });
          }
      });
  
      // Clear any running token refresh intervals
      if (this.tokenRefreshInterval) {
          clearInterval(this.tokenRefreshInterval);
          this.tokenRefreshInterval = null;
      }
  
    // Set logged out flag
    this.hasLoggedOut = true;

    // Reset instance state
      this.exchangingToken = false;
      this.stateCheckInProgress = false;
  }
  
  async initiateOAuth() {
    console.log('InitiateOAuth called');
    try {
      // Clear any existing auth data before starting new auth flow
      this.clearAuthData();
      
      // Generate new state with timestamp to prevent replay attacks
      const timestamp = Math.floor(Date.now() / 1000) * 1000; // Round to nearest second
      const randomPart = Math.random().toString(36).substring(2, 15);
      const state = `${timestamp}.${randomPart}`;
      
      console.log('Generated state:', state);
      
      // Store state in sessionStorage before making the request
      sessionStorage.setItem(AuthManager.STATE_KEY, state);
      sessionStorage.setItem('oauth_initiated_at', timestamp.toString());

      // Verify state was stored
      const storedState = sessionStorage.getItem(AuthManager.STATE_KEY);
      if (storedState !== state) {
        console.error('Failed to store OAuth state');
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
      console.log('OAuth initiation data:', data);
      
      if (!data.authUrl) {
        throw new Error('No auth URL received');
      }

      // Final state verification before redirect
      const finalStoredState = sessionStorage.getItem(AuthManager.STATE_KEY);
      if (finalStoredState !== state) {
        throw new Error('State verification failed before redirect');
      }

      console.log('All checks passed, redirecting to:', data.authUrl);
      window.location.href = data.authUrl;
      return true;

    } catch (error) {
      console.error('Error initiating OAuth:', error);
      return false;
    }
  }

async exchangeToken(code) {
    console.log('Attempting to exchange token with code:', code);
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
  
        console.log('Exchange token response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Server error response:', errorData);
            
            if (response.status === 401) {
                await this.clearAuthData();
            }
            
            throw new Error('Failed to exchange token');
        }
  
        const data = await response.json();
        console.log('Exchange token response:', data);
        
        if (data.success) {
            console.log('Token exchange successful');
            
            if (data.sessionId) {
                console.log('Storing session ID:', data.sessionId);
                localStorage.setItem(AuthManager.SESSION_KEY, data.sessionId);
            }
            
            return true;
        } else {
            throw new Error('Token exchange failed');
        }
    } catch (error) {
        console.error('Error exchanging token:', error);
        return false;
    }
}

  async checkAndRefreshToken() {
    console.log('Checking if token needs refresh...');
    const isLoggedIn = await this.checkAuthStatus();
    
    if (!isLoggedIn) {
      console.log('User is not logged in, skipping token refresh');
      if (this.tokenRefreshInterval) {
        clearInterval(this.tokenRefreshInterval);
        this.tokenRefreshInterval = null;
      }
      return false;
    }

    try {
      const response = await fetch('/api/refresh-token', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('Token refreshed successfully');
          return true;
        }
      } else if (response.status === 401) {
        console.log('Session expired. Please log in again.');
        localStorage.removeItem('sessionId');
        if (this.tokenRefreshInterval) {
          clearInterval(this.tokenRefreshInterval);
          this.tokenRefreshInterval = null;
        }
        return false;
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }

  async logout() {
    try {
      console.log('Logout function called');
      
      // Make the logout request first
      const response = await fetch('/api/logout', { 
        method: 'POST',
        credentials: 'include',
      });

      console.log('Logout response status:', response.status);
      const data = await response.json();
      console.log('Logout response:', data);

      if (!response.ok) {
        throw new Error('Logout failed: ' + data.message);
      }

      // Clear all auth data after successful server logout
      this.clearAuthData();

      console.log('Logout successful');
      return true;

    } catch (error) {
      console.error('Logout error:', error);
      // Still clear auth data on error to prevent stuck states
      this.clearAuthData();
      return false;
    }
  }
}

export default AuthManager;
