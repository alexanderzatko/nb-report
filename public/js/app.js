// app.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import Logger from './utils/Logger.js';
import AuthManager from './auth/AuthManager.js';
import UIManager from './ui/UIManager.js';
import FormManager from './form/FormManager.js';
import PhotoManager from './media/PhotoManager.js';
import LocationManager from './location/LocationManager.js';
import ValidationManager from './validation/ValidationManager.js';
import StorageManager from './storage/StorageManager.js';
import NetworkManager from './network/NetworkManager.js';
import ConfigManager from './config/ConfigManager.js';
import EventManager from './events/EventManager.js';
import ServiceWorkerManager from './services/ServiceWorkerManager.js';
import { initI18next } from './i18n.js';

class App {
  constructor() {
    // Initialize logger first before any other operations
    this.logger = Logger.getInstance();
    this.initialized = false;
    this.initializeApp().catch(error => {
      this.logger.error('Initialization failed:', error);
    });
  }

  async initializeApp() {
    try {
      // Initialize core services
      this.logger.info('Initializing application...');

      // Initialize managers in order of dependency
      this.managers = {
        config: ConfigManager.getInstance(),
        event: EventManager.getInstance(),
        network: NetworkManager.getInstance(),
        storage: StorageManager.getInstance(),
        auth: AuthManager.getInstance(),
        ui: UIManager.getInstance(),
        form: FormManager.getInstance(),
        photo: PhotoManager.getInstance(),
        location: LocationManager.getInstance(),
        validation: ValidationManager.getInstance(),
        serviceWorker: ServiceWorkerManager.getInstance()
      };

      // Initialize i18n
      await this.initializeI18n();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Check authentication and initialize UI
      await this.initializeAppState();
      
      this.initialized = true;
      this.managers.event.emit('APP_INIT_COMPLETE');
      
      this.logger.info('Application initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize application:', error);
      this.handleInitializationError(error);
      throw error; // Re-throw to be caught by the constructor
    }
  }

  async initializeI18n() {
    try {
      await initI18next();
      const userLang = this.managers.storage.getLocalStorage('userLanguage') 
        || navigator.language 
        || this.managers.config.get('defaultLocale');
      await i18next.changeLanguage(userLang);
      this.logger.info('i18n initialized with language:', userLang);
    } catch (error) {
      this.logger.error('Failed to initialize i18n:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Auth events
    this.managers.event.on('AUTH_LOGIN_SUCCESS', async (userData) => {
      await this.managers.storage.setLocalStorage('sessionId', userData.sessionId);
      await this.managers.ui.updateUIBasedOnAuthState(true);
      await this.refreshUserData();
    });

    this.managers.event.on('AUTH_LOGOUT', async () => {
      await this.managers.storage.removeLocalStorage('sessionId');
      await this.managers.ui.updateUIBasedOnAuthState(false);
    });

    // Form events
    this.managers.event.on('FORM_SUBMIT_START', () => {
      this.managers.ui.showLoading();
    });

    this.managers.event.on('FORM_SUBMIT_SUCCESS', () => {
      this.managers.ui.hideLoading();
      this.managers.form.resetForm();
    });

    // Network events
    this.managers.event.on('NETWORK_OFFLINE', () => {
      this.managers.ui.showOfflineWarning();
    });

    // App update events
    this.managers.event.on('APP_UPDATE_AVAILABLE', () => {
      this.managers.ui.showUpdatePrompt();
    });
  }

  async initializeAppState() {
    this.managers.event.emit('APP_INIT_START');

    // Check for stored session
    const sessionId = this.managers.storage.getLocalStorage('sessionId');
    console.log('Stored sessionId:', sessionId);

    const didAuth = await this.checkForURLParameters();
    if (!didAuth && sessionId) {
      try {
        const isValid = await this.managers.auth.checkAuthStatus();
        console.log('Auth status check result:', isValid);
        if (isValid) {
          await this.refreshUserData();
          await this.managers.ui.updateUIBasedOnAuthState(true);
        } else {
          await this.handleInvalidSession();
        }
      } catch (error) {
        console.error('Error checking session:', error);
        await this.handleInvalidSession();
      }
    }
    
    await this.managers.location.initialize();
  }

  async refreshUserData() {
    try {
      const userData = await this.managers.network.get('/api/user-data');
      if (userData) {
        this.managers.ui.updateUIWithUserData(userData);
        this.managers.form.initializeForm(userData);
        await this.managers.location.populateCountryDropdown();
      }
    } catch (error) {
      this.logger.error('Error refreshing user data:', error);
      await this.handleInvalidSession();
    }
  }

  async handleInvalidSession() {
    this.logger.info('Handling invalid session');
    await this.managers.auth.logout();
    this.managers.ui.showLoginPrompt();
  }

  async checkForURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code')) {
      const success = await this.managers.auth.handleOAuthCallback(
        urlParams.get('code'),
        urlParams.get('state')
      );
      // Clean URL parameters
      window.history.replaceState({}, document.title, '/');
      
      // prevent double initialization
      if (success) {
        // Update UI directly here
        await this.managers.ui.updateUIBasedOnAuthState(true);
        await this.refreshUserData();
        return true;
      }
    }
    return false;
  }

  handleInitializationError(error) {
    this.logger.error('Initialization error:', error);
    if (this.managers?.ui) {
      this.managers.ui.showErrorMessage(
        'Application initialization failed. Please refresh the page.',
        error
      );
    }
  }

  // Public methods for external interactions
  async start() {
    if (!this.initialized) {
      await this.initializeApp();
    }
  }

  async restart() {
    this.initialized = false;
    await this.start();
  }

  getManager(managerName) {
    return this.managers[managerName];
  }
}

// Create and export app instance
const app = new App();
export default app;

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  app.start().catch(error => {
    console.error('Failed to start application:', error);
  });
});
