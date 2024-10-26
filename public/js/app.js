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
    if (App.instance) {
      return App.instance;
    }
    
    this.logger = Logger.getInstance();
    this.initialized = false;
    App.instance = this;
  }

  async start() {
    if (this.initialized) {
      return;
    }
    
    try {
      await this.initializeApp();
    } catch (error) {
      this.logger.error('Initialization failed:', error);
      throw error;
    }
  }

  async initializeApp() {
    try {
      this.logger.info('Initializing application...');

      // Initialize managers one by one to ensure proper error handling
      try {
        this.managers = {};

        // Core managers first
        this.managers.config = ConfigManager.getInstance();
        this.managers.event = EventManager.getInstance();
        this.managers.network = NetworkManager.getInstance();
        this.managers.storage = StorageManager.getInstance();
        
        // Then auth and UI managers
        this.managers.auth = AuthManager.getInstance();
        this.managers.ui = UIManager.getInstance();
        
        // Form-related managers
        this.managers.form = FormManager.getInstance();
        this.managers.photo = PhotoManager.getInstance();
        this.managers.location = new LocationManager(); // Note: LocationManager uses its own singleton check
        this.managers.validation = ValidationManager.getInstance();
        
        // Service worker manager last
        this.managers.serviceWorker = ServiceWorkerManager.getInstance();

      } catch (error) {
        this.logger.error('Error initializing managers:', error);
        throw new Error(`Failed to initialize managers: ${error.message}`);
      }

      // Initialize i18n
      await this.initializeI18n();

      // Initialize service worker
      if ('serviceWorker' in navigator) {
        await this.managers.serviceWorker.initialize();
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data.type === 'UPDATE_AVAILABLE') {
            this.managers.serviceWorker.notifyUpdateReady();
          }
        });
      }

      // Initialize location manager
      await this.managers.location.initializationPromise;

      // Initialize form manager (needs i18n)
      await this.managers.form.initialize();
      
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
      throw error;
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
      } else if (!didAuth) {
          // Explicitly set initial unauthenticated state if no auth occurred
          await this.managers.ui.updateUIBasedOnAuthState(false);
      }
      
      await this.managers.location.initialize();
  }

  async refreshUserData() {
    try {
      const userData = await this.managers.network.get('/api/user-data');
      if (userData) {
        // Ensure LocationManager is initialized before proceeding
        await this.managers.location.initializationPromise;
        
        this.managers.ui.updateUIWithUserData(userData);
        this.managers.form.initializeForm(userData);
        await this.managers.location.refreshDropdowns();
        return userData;
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
    if (urlParams.has('code') && !this.processingAuth) {
      this.processingAuth = true;
      try {
        const success = await this.managers.auth.handleOAuthCallback(
          urlParams.get('code'),
          urlParams.get('state')
        );
        // Clean URL parameters
        window.history.replaceState({}, document.title, '/');
        
        if (success) {
          await this.managers.ui.updateUIBasedOnAuthState(true);
          await this.refreshUserData();
          return true;
        }
      } finally {
        this.processingAuth = false;
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
