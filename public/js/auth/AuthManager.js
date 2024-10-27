// auth/AuthManager.js

class AuthManager {
  static instance = null;

  constructor() {
    if (AuthManager.instance) {
      return AuthManager.instance;
    }

    this.initPromise = null;
    this.exchangingToken = false;
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
        if (state !== storedState) {
          console.error('State mismatch. Possible CSRF attack.');
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
      localStorage.removeItem('oauthState');
      console.log('Cleared stored OAuth state');
    }
  }

  async initiateOAuth() {
    console.log('InitiateOAuth called');
    try {
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
      } else {
        console.error('No auth URL received');
      }
    } catch (error) {
      console.error('Error initiating OAuth:', error);
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
          // Add any other required parameters
          redirect_uri: window.location.origin + '/api/nblogin/',  // Add this if required
          grant_type: 'authorization_code'  // Add this if required
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

  async checkAndRefreshToken() {
    const isLoggedIn = await this.checkAuthStatus();
    
    if (!isLoggedIn) {
      console.log('User is not logged in, skipping token refresh');
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
        return false;
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }
}

export default AuthManager;
