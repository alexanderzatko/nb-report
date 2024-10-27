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
    this.setupEventListeners();
    
    UIManager.instance = this;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Wait for i18next to be ready
      if (!this.i18next.isInitialized) {
        this.logger.debug('Waiting for i18next to initialize...');
        await new Promise((resolve) => {
          this.i18next.on('initialized', resolve);
        });
      }

      this.setupEventListeners();
      this.updatePageContent();
      this.initialized = true;
    } catch (error) {
      this.logger.error('Error initializing UIManager:', error);
      throw error;
    }
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
      if (loginContainer) loginContainer.style.display = 'none';
      if (dashboardContainer) dashboardContainer.style.display = 'block';
      if (snowReportForm) snowReportForm.style.display = 'none';
      if (logoutButton) logoutButton.style.display = 'block';
    } else {
      if (loginContainer) {
        loginContainer.style.display = 'flex';
        this.updateLoginText();
      }
      if (dashboardContainer) dashboardContainer.style.display = 'none';
      if (snowReportForm) snowReportForm.style.display = 'none';
      if (logoutButton) logoutButton.style.display = 'none';
    }
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

  async updateUIWithUserData(userData) {
    this.logger.debug('Updating UI with user data:', userData);
    
    if (userData.language) {
      try {
        // Ensure i18next is initialized before changing language
        if (!this.i18next.isInitialized) {
          this.logger.debug('Waiting for i18next initialization before language change...');
          await new Promise((resolve) => {
            this.i18next.on('initialized', resolve);
          });
        }

        await this.i18next.changeLanguage(userData.language);
        this.logger.debug('Language changed successfully to:', userData.language);
      } catch (error) {
        this.logger.error('Error changing language:', error);
        // Continue with other updates even if language change fails
      }
    }
    
    // Update UI components that don't depend on translations
    this.updateRewardsSection(userData);
    
    // Update translated content if i18next is ready
    if (this.i18next.isInitialized) {
      this.updatePageContent();
    }
  }

    updatePageContent() {
    if (!this.i18next.isInitialized) {
      this.logger.warn('Attempted to update page content before i18next initialization');
      return;
    }

    this.logger.debug('Updating page content with translations');
    try {
      document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        try {
          const translation = this.i18next.t(key, { 
            returnObjects: true, 
            interpolation: { escapeValue: false } 
          });
          this.updateElementTranslation(element, translation);
        } catch (error) {
          this.logger.error(`Error translating key "${key}":`, error);
        }
      });
      
      this.updateLoginText();
    } catch (error) {
      this.logger.error('Error updating page content:', error);
    }
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
