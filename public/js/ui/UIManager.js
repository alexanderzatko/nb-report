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

      // Set up core event listeners
      this.setupLoginEventListeners();

      const loginContainer = document.getElementById('login-container');
      if (loginContainer) {
        loginContainer.classList.add('visible');
      }

      // Update basic page content (header, login text)
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

      // Update all translations now that we have full i18n loaded
      this.updateFullPageContent();
      
      this.logger.debug('Authenticated UI initialized');

    } catch (error) {
      this.logger.error('Error initializing authenticated UI:', error);
      throw error;
    }
  }

  setupAuthenticatedEventListeners() {
    // All navigation buttons
    const buttons = {
      'snow-report-link': () => window.dispatchEvent(new Event('showSnowReport')),
      'settings-link': () => window.dispatchEvent(new Event('showSettings')),
      'dashboard-button': () => window.dispatchEvent(new Event('showDashboard')),
      'logout-button': this.handleLogoutClick.bind(this)
    };

    Object.entries(buttons).forEach(([id, handler]) => {
      const element = document.getElementById(id);
      if (element) {
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
        newElement.addEventListener('click', (e) => {
          e.preventDefault();
          handler();
        });
      }
    });
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
    // Update only essential UI elements needed for login
    document.querySelectorAll('[data-i18n].core').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.i18next.t(key);
      this.updateElementTranslation(element, translation);
    });
    
    this.updateLoginText();
  }

  updateFullPageContent() {
    // Update all translatable elements now that we have full translations
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.i18next.t(key);
      this.updateElementTranslation(element, translation);
    });
  }

  updateElementTranslation(element, translation) {
    if (element.tagName.toLowerCase() === 'input' && element.type === 'submit') {
      element.value = translation;
    } else {
      element.textContent = translation;
    }
  }

  updateLoginText() {
    const loginText = document.getElementById('login-text');
    if (loginText) {
      loginText.textContent = this.i18next.t('auth.loginText');
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
