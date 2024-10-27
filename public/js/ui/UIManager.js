// ui/UIManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import AuthManager from '../auth/AuthManager.js';
import FormManager from '../form/FormManager.js';
import SelectManager from '../managers/SelectManager.js';
import Logger from '../utils/Logger.js';

class UIManager {
  static instance = null;

  constructor() {
    if (UIManager.instance) {
      return UIManager.instance;
    }
    this.i18next = i18next;
    this.logger = Logger.getInstance();
    
    // Remove formManager and selectManager initialization from constructor
    this._selectManager = null;  // Will be lazily initialized
    
    this.setupEventListeners();
    UIManager.instance = this;
  }

  initializeFormManagers() {
    this.formManager = FormManager.getInstance();
    this.selectManager = SelectManager.getInstance();
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
    this.formManager.startTrackingFormTime();
  }

  showDashboard() {
    document.getElementById('dashboard-container').style.display = 'block';
    document.getElementById('snow-report-form').style.display = 'none';
  }

  get selectManager() {
    if (!this._selectManager) {
      this._selectManager = SelectManager.getInstance();
    }
    return this._selectManager;
  }

  async updateUIWithUserData(userData) {
    this.logger.debug('UIManager: Updating UI with user data:', userData);
    
    if (userData.language) {
      try {
        await this.i18next.changeLanguage(userData.language);
        this.logger.debug('Language changed successfully');
        
        // Only attempt to refresh select manager if it's initialized
        if (this._selectManager) {
          await this.selectManager.refreshAllDropdowns();
        }
      } catch (error) {
        this.logger.error('UIManager: Error during language update:', error);
      }
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
    alert(message);
  }

  showSuccess(message) {
    alert(message);
  }

  showErrorMessage(message, error = null) {
    this.logger.error(message, error);
    this.showError(message);
  }
}

export default UIManager;
