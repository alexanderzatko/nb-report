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
      const response = await fetch('/api/auth-status', {
        credentials: 'include'
      });
      const data = await response.json();
      console.log('Auth status response:', data);
      
      if (data.isAuthenticated && !this.tokenRefreshInterval) {
        // Set up token refresh if authenticated
        this.setupTokenRefresh();
      }
      
      return data.isAuthenticated;
    } catch (error) {
      console.error('Error checking auth status:', error);
      return false;
    }
  }

  setupTokenRefresh() {
    // Clear any existing interval
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }
    
    // Set up new refresh interval (e.g., every 5 minutes)
    this.tokenRefreshInterval = setInterval(() => {
      this.checkAndRefreshToken();
    }, 5 * 60 * 1000); // 5 minutes
  }

  async handleOAuthCallback(code, state) {
    if (this.exchangingToken) {
      console.log('Token exchange already in progress');
      return false;
    }
  
    this.exchangingToken = true;  
    console.log('handleOAuthCallback called');
    console.log('Code:', code, 'State:', state);
  
    try {
      if (state) {
        const storedState = sessionStorage.getItem(AuthManager.STATE_KEY);
        console.log('Stored state:', storedState);
        
        // Validate state and check timestamp
        if (storedState && state === storedState) {
          const [timestamp] = storedState.split('.');
          const initiatedAt = parseInt(sessionStorage.getItem('oauth_initiated_at') || '0');
          
          // Check if the OAuth flow took too long (more than 5 minutes)
          if (Date.now() - initiatedAt > 5 * 60 * 1000) {
            console.error('OAuth flow took too long');
            return false;
          }
          
          console.log('State validation successful');
        } else {
          console.error('State mismatch or missing. Possible CSRF attack.');
          return false;
        }
      }
  
      if (code) {
        console.log('Exchanging token');
        try {
          const success = await this.exchangeToken(code);
          if (success) {
            console.log('Token exchanged successfully');
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

  clearAuthData() {
    // Clear all authentication-related data
    sessionStorage.removeItem(AuthManager.STATE_KEY);
    localStorage.removeItem(AuthManager.SESSION_KEY);
    localStorage.removeItem(AuthManager.AUTH_DATA_KEY);
    
    // Clear cookies by setting them to expire
    document.cookie = 'nb_report_cookie=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
  }
  
  async initiateOAuth() {
    console.log('InitiateOAuth called');
    try {
      // Clear any existing auth data before starting new auth flow
      this.clearAuthData();
      
      // Generate new state with timestamp to prevent replay attacks
      const timestamp = Date.now();
      const randomPart = Math.random().toString(36).substring(2, 15);
      const state = `${timestamp}.${randomPart}`;
      
      console.log('Generated state:', state);
      
      // Store state in sessionStorage
      sessionStorage.setItem(AuthManager.STATE_KEY, state);

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
      
      console.log('OAuth initiation response:', response);
      const data = await response.json();
      console.log('OAuth initiation data:', data);
      
      if (data.authUrl) {
        console.log('Redirecting to:', data.authUrl);
        // Store the timestamp when we initiated OAuth
        sessionStorage.setItem('oauth_initiated_at', timestamp.toString());
        window.location.href = data.authUrl;
        return true;
      } else {
        console.error('No auth URL received');
        return false;
      }
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
        throw new Error('Failed to exchange token');
      }
  
      const data = await response.json();
      console.log('Exchange token response:', data);
      
      if (data.success) {
        console.log('Token exchange successful');
        
        if (data.sessionId) {
          localStorage.setItem('sessionId', data.sessionId);
          console.log('Session ID stored in localStorage');
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
