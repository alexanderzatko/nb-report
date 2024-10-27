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
    this.formManager = null;
    this.selectManager = null;
    
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
      
      // Only set up basic event listeners initially
      this.setupBasicEventListeners();
      this.updatePageContent();
      
      this.initialized = true;
    } catch (error) {
      this.logger.error('Error initializing UIManager:', error);
      throw error;
    }
  }

  setupBasicEventListeners() {
    try {
      // Remove any existing listeners first
      this.removeExistingListeners();

      // Only set up auth-related listeners initially
      const loginContainer = document.getElementById('login-container');
      this.logger.debug('Found login container:', !!loginContainer);
      
      if (loginContainer) {
        loginContainer.addEventListener('click', (e) => {
          e.preventDefault();
          this.handleLoginClick(e);
        });
      }

      const logoutButton = document.getElementById('logout-button');
      if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
          e.preventDefault();
          this.handleLogoutClick(e);
        });
      }

      window.addEventListener('languageChanged', () => {
        this.updatePageContent();
      });
      
    } catch (error) {
      this.logger.error('Error setting up event listeners:', error);
    }
  }
  
  async initializeFormManagers() {
    // Only initialize form managers when needed
    if (!this.formManager) {
      this.logger.debug('Initializing form managers...');
      try {
        this.formManager = FormManager.getInstance();
        this.selectManager = SelectManager.getInstance();
        
        await Promise.all([
          this.formManager.initialize(),
          this.selectManager.initialize()
        ]);
        
        // Set up form-related event listeners
        const snowReportLink = document.getElementById('snow-report-link');
        if (snowReportLink) {
          snowReportLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.showSnowReportForm();
          });
        }
        
        this.logger.debug('Form managers initialized successfully');
      } catch (error) {
        this.logger.error('Error initializing form managers:', error);
        throw error;
      }
    }
  }
    
  static getInstance() {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

    // Add login container click handler with debouncing
    const loginContainer = document.getElementById('login-container');
    console.log('Login container found:', !!loginContainer);
    if (loginContainer) {
      loginContainer.addEventListener('click', this.handleLoginClick.bind(this));
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
      logoutButton.addEventListener('click', this.handleLogoutClick.bind(this));
    }

    window.addEventListener('languageChanged', () => this.updatePageContent());
  }

  removeExistingListeners() {
    try {
      const loginContainer = document.getElementById('login-container');
      if (loginContainer) {
        const newContainer = loginContainer.cloneNode(true);
        loginContainer.parentNode.replaceChild(newContainer, loginContainer);
      }

      const logoutButton = document.getElementById('logout-button');
      if (logoutButton) {
        const newButton = logoutButton.cloneNode(true);
        logoutButton.parentNode.replaceChild(newButton, logoutButton);
      }
    } catch (error) {
      this.logger.error('Error removing existing listeners:', error);
    }
  }

  handleLoginClick(event) {
    event.preventDefault();
    
    // Prevent multiple rapid clicks
    if (this.loginInProgress) {
      this.logger.debug('Login already in progress');
      return;
    }

    // Clear any existing timeout
    if (this.loginClickTimeout) {
      clearTimeout(this.loginClickTimeout);
    }

    this.loginInProgress = true;

    try {
      this.logger.debug('Login container clicked');
      const authManager = AuthManager.getInstance();
      this.logger.debug('Initiating OAuth...');
      
      authManager.initiateOAuth()
        .then(initiated => {
          if (!initiated) {
            this.logger.error('Failed to initiate OAuth');
            this.showError(this.i18next.t('auth.loginError', {
              defaultValue: 'Unable to connect to login service. Please try again later.'
            }));
          }
        })
        .catch(error => {
          // Handle only unexpected errors
          if (!(error instanceof TypeError) || !error.message.includes('NetworkError')) {
            this.logger.error('Failed to initiate login:', error);
            this.showError(this.i18next.t('auth.loginError', {
              defaultValue: 'Unable to connect to login service. Please try again later.'
            }));
          }
        })
        .finally(() => {
          // Reset login state after a delay
          this.loginClickTimeout = setTimeout(() => {
            this.loginInProgress = false;
          }, 2000); // 2 second cooldown
        });
    } catch (error) {
      this.logger.error('Error in handleLoginClick:', error);
      this.loginInProgress = false;
    }
  }

  async handleLogoutClick() {
    try {
      const authManager = AuthManager.getInstance();
      const success = await authManager.logout();
      if (success) {
        // Clear any stored session data
        localStorage.removeItem('sessionId');
        // Update UI to show login screen
        this.updateUIBasedOnAuthState(false);
        // Reset login progress state
        this.loginInProgress = false;
        if (this.loginClickTimeout) {
          clearTimeout(this.loginClickTimeout);
        }
      } else {
        console.error('Logout failed');
        this.showError(this.i18next.t('auth.logoutError', {
          defaultValue: 'Unable to log out. Please try again.'
        }));
      }
    } catch (error) {
      console.error('Error during logout:', error);
      this.showError(this.i18next.t('auth.logoutError', {
        defaultValue: 'Unable to log out. Please try again.'
      }));
    }
  }
  
  async updateUIBasedOnAuthState(isAuthenticated) {
    console.log('Updating UI based on auth state:', isAuthenticated);
    
    if (isAuthenticated) {
      // Initialize form managers only after successful authentication
      await this.initializeFormManagers();
      
      // Update UI elements
      const loginContainer = document.getElementById('login-container');
      const dashboardContainer = document.getElementById('dashboard-container');
      const snowReportForm = document.getElementById('snow-report-form');
      const logoutButton = document.getElementById('logout-button');
    
      if (loginContainer) loginContainer.style.display = 'none';
      if (dashboardContainer) dashboardContainer.style.display = 'block';
      if (snowReportForm) snowReportForm.style.display = 'none';
      if (logoutButton) logoutButton.style.display = 'block';
    } else {
      // Reset UI to login state
      const loginContainer = document.getElementById('login-container');
      const dashboardContainer = document.getElementById('dashboard-container');
      const snowReportForm = document.getElementById('snow-report-form');
      const logoutButton = document.getElementById('logout-button');
    
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
    if (!this.formManager) {
      this.logger.error('FormManager not initialized');
      return;
    }

    const dashboardContainer = document.getElementById('dashboard-container');
    const snowReportForm = document.getElementById('snow-report-form');
    
    if (dashboardContainer && snowReportForm) {
      dashboardContainer.style.display = 'none';
      snowReportForm.style.display = 'block';
      this.formManager.startTrackingFormTime();
    } else {
      this.logger.error('Required DOM elements not found');
    }
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
    // Add a small delay to ensure error is shown after any redirects
    setTimeout(() => {
      alert(message);
    }, 100);
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
