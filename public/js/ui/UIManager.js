// ui/UIManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import AuthManager from '../auth/AuthManager.js';  // Add this import

class UIManager {
  static instance = null;

  constructor() {
    if (UIManager.instance) {
      return UIManager.instance;
    }
    this.i18next = i18next;
    this.setupEventListeners();
    
    UIManager.instance = this;
  }

  static getInstance() {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  setupEventListeners() {
    const snowReportLink = document.getElementById('snow-report-link');
    if (snowReportLink) {
      snowReportLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showSnowReportForm();
      });
    }

    // Add login container click handler
    const loginContainer = document.getElementById('login-container');
    console.log('Login container found:', !!loginContainer);
    if (loginContainer) {
      loginContainer.addEventListener('click', async () => {
        console.log('Login container clicked');
        try {
          const authManager = AuthManager.getInstance();
          console.log('Initiating OAuth...');
          await authManager.initiateOAuth();
        } catch (error) {
          console.error('Failed to initiate login:', error);
        }
      });
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
      logoutButton.addEventListener('click', async () => {
        try {
          const authManager = AuthManager.getInstance();
          const success = await authManager.logout();
          if (success) {
            // Clear any stored session data
            localStorage.removeItem('sessionId');
            // Update UI to show login screen
            this.updateUIBasedOnAuthState(false);
          } else {
            console.error('Logout failed');
          }
        } catch (error) {
          console.error('Error during logout:', error);
        }
      });
    }

    window.addEventListener('languageChanged', () => this.updatePageContent());
  }

  updateUIBasedOnAuthState(isAuthenticated) {
    console.log('Updating UI based on auth state:', isAuthenticated);
    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const snowReportForm = document.getElementById('snow-report-form');
    const logoutButton = document.getElementById('logout-button');
  
    if (isAuthenticated) {
      console.log('Showing dashboard for authenticated user');
      if (loginContainer) loginContainer.style.display = 'none';
      if (dashboardContainer) {
        dashboardContainer.style.display = 'block';
        console.log('Dashboard container display set to block');
      } else {
        console.error('Dashboard container not found');
      }
      if (snowReportForm) snowReportForm.style.display = 'none';
      if (logoutButton) logoutButton.style.display = 'block';
    } else {
      console.log('Showing login for unauthenticated user');
      if (loginContainer) loginContainer.style.display = 'flex';
      if (dashboardContainer) dashboardContainer.style.display = 'none';
      if (snowReportForm) snowReportForm.style.display = 'none';
      if (logoutButton) logoutButton.style.display = 'none';
    }
  }

  updatePageContent() {
    console.log('Updating page content with translations');
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.i18next.t(key, { 
        returnObjects: true, 
        interpolation: { escapeValue: false } 
      });
      //console.log(`Translating key: ${key}, result:`, translation);
      
      this.updateElementTranslation(element, translation);
    });
    
    this.updateLoginText();
  }

  updateElementTranslation(element, translation) {
    if (typeof translation === 'object') {
      if (element.tagName.toLowerCase() === 'select') {
        element.innerHTML = '';
        Object.entries(translation).forEach(([value, text]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          element.appendChild(option);
        });
      }
    } else {
      if (element.tagName.toLowerCase() === 'input' && element.type === 'submit') {
        element.value = translation;
      } else {
        element.innerHTML = translation;
      }
    }
  }

  updateLoginText() {
    const loginText = document.getElementById('login-text');
    if (loginText) {
      loginText.innerHTML = this.i18next.t('auth.loginText', { 
        interpolation: { escapeValue: false } 
      });
    }
  }

  showLoginPrompt() {
    // Hide other containers
    const dashboardContainer = document.getElementById('dashboard-container');
    const snowReportForm = document.getElementById('snow-report-form');
    if (dashboardContainer) {
      dashboardContainer.style.display = 'none';
    }
    if (snowReportForm) {
      snowReportForm.style.display = 'none';
    }

    // Show login container
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) {
      loginContainer.classList.add('visible');
      loginContainer.style.display = 'flex';
    }

    // Optionally show a message to the user
    const loginText = document.getElementById('login-text');
    if (loginText) {
      loginText.innerHTML = this.i18next.t('auth.loginRequired', {
        defaultValue: 'Please log in to continue',
        interpolation: { escapeValue: false }
      });
    }
  }
  
  showSnowReportForm() {
    document.getElementById('dashboard-container').style.display = 'none';
    document.getElementById('snow-report-form').style.display = 'block';
  }

  showDashboard() {
    document.getElementById('dashboard-container').style.display = 'block';
    document.getElementById('snow-report-form').style.display = 'none';
  }

  updateUIWithUserData(userData) {
    console.log(userData);
    
    // Set the language based on user data
    if (userData.language) {
      this.i18next.changeLanguage(userData.language);
    }
    
    this.updateRewardsSection(userData);
  }

  updateRewardsSection(userData) {
    const rewardsSection = document.getElementById('rewards-section');
    if (rewardsSection) {
      if (userData.rovas_uid && !isNaN(userData.rovas_uid)) {
        rewardsSection.style.display = 'block';
      } else {
        rewardsSection.style.display = 'none';
      }
    }
  }

  showError(message) {
    // You could implement a more sophisticated error display system here
    alert(message);
  }

  showSuccess(message) {
    // You could implement a more sophisticated success display system here
    alert(message);
  }
}

export default UIManager;
