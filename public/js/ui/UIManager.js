import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import AuthManager from '../auth/AuthManager.js';
import Logger from '../utils/Logger.js';

class UIManager {
  static instance = null;

  constructor() {
    if (UIManager.instance) {
      return UIManager.instance;
    }
    
    this.i18next = i18next;
    this.logger = Logger.getInstance();
    this.initialized = false;
    this.loginInProgress = false;
    this.loginClickTimeout = null;
    
    UIManager.instance = this;
  }

  static getInstance() {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  async initializeLoginUI() {
    if (this.initialized) {
      return;
    }

    try {
      // Wait for i18next to be ready (only core translations at this point)
      if (!this.i18next.isInitialized) {
        this.logger.debug('Waiting for i18next to initialize...');
        await new Promise((resolve) => {
          this.i18next.on('initialized', resolve);
        });
      }

      this.logger.debug(`Initializing login UI with language: ${this.i18next.language}`);

      // Set up core event listeners
      this.setupLoginEventListeners();

      const loginContainer = document.getElementById('login-container');
      if (loginContainer) {
        loginContainer.classList.add('visible');
      }

      this.logger.debug('Updating core page content...');
      this.updateCorePageContent();
      
      this.initialized = true;
      this.logger.debug('Login UI initialized');

    } catch (error) {
      this.logger.error('Error initializing login UI:', error);
      throw error;
    }
  }

  setupLoginEventListeners() {
    // Remove any existing listeners first
    this.removeExistingListeners();

    // Add login container click handler
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) {
      const newContainer = loginContainer.cloneNode(true);
      loginContainer.parentNode.replaceChild(newContainer, loginContainer);
      
      newContainer.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLoginClick(e);
      });
    }
  }

  async initializeAuthenticatedUI() {
    this.logger.debug('Initializing authenticated UI');

    try {
        // Hide login container, show dashboard
        const loginContainer = document.getElementById('login-container');
        const dashboardContainer = document.getElementById('dashboard-container');
        
        if (loginContainer) loginContainer.style.display = 'none';
        if (dashboardContainer) dashboardContainer.style.display = 'block';

        // Set up authenticated state event listeners
        this.setupAuthenticatedEventListeners();

        this.logger.debug(`Updating full page content with language: ${this.i18next.language}`);
        this.updateFullPageContent();
        
        this.logger.debug('Authenticated UI initialized');

    } catch (error) {
        this.logger.error('Error initializing authenticated UI:', error);
        throw error;
    }
  }

  setupAuthenticatedEventListeners() {
      // Define navigation handlers
      const handlers = {
          'snow-report-link': (e) => {
              e.preventDefault();
              window.dispatchEvent(new Event('showSnowReport'));
          },
          'settings-link': (e) => {
              e.preventDefault();
              window.dispatchEvent(new Event('showSettings'));
              this.logger.debug('Settings link clicked, dispatched showSettings event');
          },
          'dashboard-button': (e) => {
              e.preventDefault();
              window.dispatchEvent(new Event('showDashboard'));
          },
          'logout-button': (e) => {
              e.preventDefault();
              this.handleLogoutClick();
          }
      };
  
      // Attach event listeners
      Object.entries(handlers).forEach(([id, handler]) => {
          const element = document.getElementById(id);
          if (element) {
              // Remove existing listeners by cloning
              const newElement = element.cloneNode(true);
              element.parentNode.replaceChild(newElement, element);
              
              // Add new click listener
              newElement.addEventListener('click', handler);
              
              this.logger.debug(`Event listener attached to ${id}`);
          } else {
              this.logger.warn(`Element with id ${id} not found`);
          }
      });
  
      // Log all active event listeners
      this.logger.debug('Authenticated event listeners setup complete');
  }

  removeExistingListeners() {
    const elements = ['login-container', 'logout-button'];
    elements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
      }
    });
  }

  updateCorePageContent() {
    this.logger.debug('Updating core translations...');
    // Update only essential UI elements needed for login
    document.querySelectorAll('[data-i18n].core').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.i18next.t(key);
      this.logger.debug(`Translating ${key} to: ${translation}`);
      this.updateElementTranslation(element, translation);
    });
    
    this.updateLoginText();
  }

  updateFullPageContent() {
      this.logger.debug('Starting full page content update...');
      // Update all translatable elements now that we have full translations
      document.querySelectorAll('[data-i18n]').forEach(element => {
          const key = element.getAttribute('data-i18n');
          this.updateElementTranslation(element);  // Remove translation here, let updateElementTranslation handle it
      });
  }

  async updateUIBasedOnAuthState(isAuthenticated, userData = null) {
    this.logger.debug('Updating UI based on auth state:', isAuthenticated);
    
    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const settingsContainer = document.getElementById('settings-container');
    const snowReportForm = document.getElementById('snow-report-form');
  
    if (isAuthenticated) {
      if (loginContainer) loginContainer.style.display = 'none';
      if (dashboardContainer) dashboardContainer.style.display = 'block';
      if (settingsContainer) settingsContainer.style.display = 'none';
      if (snowReportForm) snowReportForm.style.display = 'none';
  
      // Update user-specific UI elements if userData is provided
      if (userData) {
        this.updateUserSpecificElements(userData);
      }
  
      // Ensure translations are updated after language change
      this.updateFullPageContent();
    } else {
      if (loginContainer) {
        loginContainer.style.display = 'flex';
        this.updateLoginText();
      }
      if (dashboardContainer) dashboardContainer.style.display = 'none';
      if (settingsContainer) settingsContainer.style.display = 'none';
      if (snowReportForm) snowReportForm.style.display = 'none';
    }
  }

  updateUserSpecificElements(userData) {
    // Add any user-specific UI updates here
    // For example, showing user name, role, etc.
    if (userData.name) {
      const welcomeElement = document.querySelector('[data-i18n="welcome"]');
      if (welcomeElement) {
        welcomeElement.textContent = this.i18next.t('welcome', {
          name: userData.name,
          role: userData.ski_center_admin === "1" ? "Admin" : "User"
        });
      }
    }
  }
  
  updateElementTranslation(element) {
      const key = element.getAttribute('data-i18n');
      const translation = this.i18next.t(key, { returnObjects: true });
      this.logger.debug(`Translating ${key} to:`, translation);
      
      if (typeof translation === 'object') {
          if (element.tagName.toLowerCase() === 'select') {
              // Store current value to restore after populating options
              const currentValue = element.value;
              element.innerHTML = '';
              
              // Add translated options
              Object.entries(translation).forEach(([value, text]) => {
                  const option = document.createElement('option');
                  option.value = value;
                  option.textContent = text;
                  element.appendChild(option);
              });
              
              // Restore previously selected value if it exists
              if (currentValue && element.querySelector(`option[value="${currentValue}"]`)) {
                  element.value = currentValue;
              }
          } else {
              // For non-select elements that received an object, log a warning
              this.logger.warn(`Received object translation for non-select element with key: ${key}`);
              element.textContent = key;
          }
      } else {
          // Handle non-object translations
          if (element.tagName.toLowerCase() === 'input' && element.type === 'submit') {
              element.value = translation;
          } else {
              element.textContent = translation;
          }
      }
  }
  
  updateLoginText() {
      const loginText = document.getElementById('login-text');
      if (loginText) {
          const translationKey = 'auth.loginText';
          const translation = this.i18next.t(translationKey);
          this.logger.debug(`Setting login text translation (${translationKey}): ${translation}`);
          loginText.textContent = translation;
      }
  }

  async handleLoginClick(event) {
    event.preventDefault();
      
    if (this.loginInProgress) {
      this.logger.debug('Login already in progress');
      return;
    }

    if (this.loginClickTimeout) {
      clearTimeout(this.loginClickTimeout);
    }

    this.loginInProgress = true;

    try {
      const authManager = AuthManager.getInstance();
      const initiated = await authManager.initiateOAuth();
      
      if (!initiated) {
        this.showError(this.i18next.t('auth.loginError'));
      }
    } catch (error) {
      if (!(error instanceof TypeError) || !error.message.includes('NetworkError')) {
        this.logger.error('Failed to initiate login:', error);
        this.showError(this.i18next.t('auth.loginError'));
      }
    } finally {
      this.loginClickTimeout = setTimeout(() => {
        this.loginInProgress = false;
      }, 2000);
    }
  }

  async handleLogoutClick() {
    try {
      const authManager = AuthManager.getInstance();
      const success = await authManager.logout();
      
      if (success) {
        localStorage.removeItem('sessionId');
        await this.resetToLoginState();
      } else {
        this.showError(this.i18next.t('auth.logoutError'));
      }
    } catch (error) {
      this.logger.error('Error during logout:', error);
      this.showError(this.i18next.t('auth.logoutError'));
    }
  }

  async resetToLoginState() {
    this.logger.debug('Resetting UI to login state');

    const containers = [
      'dashboard-container',
      'settings-container',
      'snow-report-form'
    ];

    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.style.display = 'none';
      }
    });

    const loginContainer = document.getElementById('login-container');
    if (loginContainer) {
      loginContainer.style.display = 'flex';
      this.updateLoginText();
    }

    this.loginInProgress = false;
    if (this.loginClickTimeout) {
      clearTimeout(this.loginClickTimeout);
    }

    this.clearActiveUIElements();
  }

  clearActiveUIElements() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });

    document.querySelectorAll('.update-notification').forEach(notification => {
      notification.remove();
    });
  }

  showError(message) {
    setTimeout(() => {
      alert(message);
    }, 100);
  }

  showSuccess(message) {
    alert(message);
  }
}

export default UIManager;
