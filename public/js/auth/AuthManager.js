// auth/AuthManager.js

class AuthManager {
  static instance = null;

  constructor() {
    if (AuthManager.instance) {
      return AuthManager.instance;
    }

    this.initPromise = null;
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
    console.log('handleOAuthCallback called');
    console.log('Code:', code, 'State:', state);

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
          return true;
        }
      } catch (error) {
        console.error('Error exchanging token:', error);
      }
    }

    localStorage.removeItem('oauthState');
    console.log('Cleared stored OAuth state');
    return false;
  }

  async initiateOAuth() {
    try {
      const state = Math.random().toString(36).substring(2, 15);
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
      const data = await response.json();
      if (data.authUrl) {
        console.log('Redirecting to auth URL:', data.authUrl);
        window.location.href = data.authUrl;
      } else {
        console.error('No auth URL received');
      }
    } catch (error) {
      console.error('Error initiating OAuth:', error);
    }
  }

  async exchangeToken(code) {
    try {
      const response = await fetch('/api/exchange-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to exchange token');
      }

      const data = await response.json();
      
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
