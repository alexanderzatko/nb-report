// app.js

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
import Logger from './utils/Logger.js';

class App {
  constructor() {
    this.initialized = false;
    this.initializeApp();
  }

  async initializeApp() {
    try {
      // Initialize core services first
      this.logger = Logger.getInstance();
      this.logger.info('Initializing application...');

      this.configManager = ConfigManager.getInstance();
      this.eventManager = EventManager.getInstance();
      
      // Initialize managers
      this.managers = {
        auth: AuthManager.getInstance(),
        ui: UIManager.getInstance(),
        form: FormManager.getInstance(),
        photo: PhotoManager.getInstance(),
        location: LocationManager.getInstance(),
        validation: ValidationManager.getInstance(),
        storage: StorageManager.getInstance(),
        network: NetworkManager.getInstance(),
        serviceWorker: ServiceWorkerManager.getInstance()
      };

      // Initialize i18n
      await this.initializeI18n();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Check authentication and initialize UI
      await this.initializeAppState();
      
      this.initialized = true;
      this.eventManager.emit(this.eventManager.EVENT_TYPES.APP_INIT_COMPLETE);
      
      this.logger.info('Application initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize application:', error);
      this.handleInitializationError(error);
    }
  }

  async initializeI18n() {
    try {
      await initI18next();
      const userLang = this.managers.storage.getLocalStorage('userLanguage') 
        || navigator.language 
        || this.configManager.get('defaultLocale');
      await i18next.changeLanguage(userLang);
      this.logger.info('i18n initialized with language:', userLang);
    } catch (error) {
      this.logger.error('Failed to initialize i18n:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Auth events
    this.eventManager.on(this.eventManager.EVENT_TYPES.AUTH_LOGIN_SUCCESS, async (userData) => {
      await this.managers.storage.setLocalStorage('sessionId', userData.sessionId);
      await this.managers.ui.updateUIBasedOnAuthState(true);
      await this.refreshUserData();
    });

    this.eventManager.on(this.eventManager.EVENT_TYPES.AUTH_LOGOUT, async () => {
      await this.managers.storage.removeLocalStorage('sessionId');
      await this.managers.ui.updateUIBasedOnAuthState(false);
    });

    // Form events
    this.eventManager.on(this.eventManager.EVENT_TYPES.FORM_SUBMIT_START, () => {
      this.managers.ui.showLoading();
    });

    this.eventManager.on(this.eventManager.EVENT_TYPES.FORM_SUBMIT_SUCCESS, () => {
      this.managers.ui.hideLoading();
      this.managers.form.resetForm();
    });

    // Network events
    this.eventManager.on(this.eventManager.EVENT_TYPES.NETWORK_OFFLINE, () => {
      this.managers.ui.showOfflineWarning();
    });

    // App update events
    this.eventManager.on(this.eventManager.EVENT_TYPES.APP_UPDATE_AVAILABLE, () => {
      this.managers.ui.showUpdatePrompt();
    });
  }

  async initializeAppState() {
    this.eventManager.emit(this.eventManager.EVENT_TYPES.APP_INIT_START);

    // Check for stored session
    const sessionId = this.managers.storage.getLocalStorage('sessionId');
    if (sessionId) {
      try {
        const isValid = await this.managers.auth.checkAuthStatus();
        if (isValid) {
          await this.refreshUserData();
        } else {
          await this.handleInvalidSession();
        }
      } catch (error) {
        this.logger.error('Error checking session:', error);
        await this.handleInvalidSession();
      }
    }

    // Initialize UI state
    await this.managers.ui.updateUIBasedOnAuthState(!!sessionId);
    
    // Load initial data
    await Promise.all([
      this.managers.location.initialize(),
      this.checkForURLParameters()
    ]);
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
      await this.managers.auth.handleOAuthCallback(
        urlParams.get('code'),
        urlParams.get('state')
      );
      // Clean URL parameters
      window.history.replaceState({}, document.title, '/');
    }
  }

  handleInitializationError(error) {
    this.logger.error('Initialization error:', error);
    this.managers.ui.showErrorMessage(
      this.i18next.t('errors.initializationFailed'),
      error
    );
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
