// auth/AuthManager.js

class AuthManager {
  static instance = null;

  constructor() {
    if (AuthManager.instance) {
      return AuthManager.instance;
    }

    this.initPromise = null;
    this.exchangingToken = false;
    this.stateCheckInProgress = false;
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
      return data.isAuthenticated;
    } catch (error) {
      console.error('Error checking auth status:', error);
      return false;
    }
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
        const storedState = localStorage.getItem('oauthState');
        console.log('Stored state:', storedState);
        
        // Clear the stored state immediately to prevent reuse
        localStorage.removeItem('oauthState');
        console.log('Cleared stored OAuth state');
        
        if (!storedState || state !== storedState) {
          console.error('State mismatch or missing. Possible CSRF attack.');
          return false;
        }
        console.log('State validation successful');
      }
  
      if (code) {
        console.log('Exchanging token');
        try {
          const success = await this.exchangeToken(code);
          if (success) {
            console.log('Token exchanged successfully');
            await this.checkAuthStatus();
            return true;
          }
        } catch (error) {
          console.error('Error exchanging token:', error);
        }
      }
  
      return false;
    } finally {
      this.exchangingToken = false;
    }
  }

  async initiateOAuth() {
    console.log('InitiateOAuth called');
    try {
      // Clear any existing OAuth state first
      localStorage.removeItem('oauthState');
      
      const state = Math.random().toString(36).substring(2, 15);
      console.log('Generated state:', state);
      localStorage.setItem('oauthState', state);

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
        window.location.replace(data.authUrl);
        return true;
      } else {
        console.error('No auth URL received');
        return false;
      }
    } catch (error) {
      if (!(error instanceof TypeError) || !error.message.includes('NetworkError')) {
        console.error('Error initiating OAuth:', error);
      }
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

  async logout() {
    try {
      console.log('Logout function called');
      
      // Clear OAuth state and session data first
      localStorage.removeItem('oauthState');
      localStorage.removeItem('sessionId');
      
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

      console.log('Logout successful');
      return true;

    } catch (error) {
      console.error('Logout error:', error);
      return false;
    }
  }
}

export default AuthManager;
