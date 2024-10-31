import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import Logger from './utils/Logger.js';
import AuthManager from './auth/AuthManager.js';
import UIManager from './ui/UIManager.js';
import FormManager from './form/FormManager.js';
import PhotoManager from './media/PhotoManager.js';
import SelectManager from './managers/SelectManager.js';
import ValidationManager from './validation/ValidationManager.js';
import StorageManager from './storage/StorageManager.js';
import NetworkManager from './network/NetworkManager.js';
import ConfigManager from './config/ConfigManager.js';
import EventManager from './events/EventManager.js';
import ServiceWorkerManager from './services/ServiceWorkerManager.js';
import StateManager from './state/StateManager.js';
import { initI18next, resetI18next } from './i18n.js';
import GPSManager from './managers/GPSManager.js';

class App {
  constructor() {
    if (App.instance) {
      return App.instance;
    }
    
    this.logger = Logger.getInstance();
    this.initialized = false;
    this.managers = {};  // Initialize empty managers object
    this.i18next = i18next;
    App.instance = this;
  }

  static getInstance() {
    if (!App.instance) {
      App.instance = new App();
    }
    return App.instance;
  }

  async start() {
    if (this.initialized) {
      return;
    }
    
    try {
      await this.initializeApp();
    } catch (error) {
      this.logger.error('Initialization failed:', error);
      this.handleInitializationError(error);
    }
  }

  async initializeApp() {
    try {
      // Initialize i18next first
      await resetI18next();
      await initI18next();

      // Initialize core managers
      this.managers = {
        config: ConfigManager.getInstance(),
        event: EventManager.getInstance(),
        network: NetworkManager.getInstance(),
        storage: StorageManager.getInstance(),
        state: StateManager.getInstance(),
        auth: AuthManager.getInstance(),
        ui: UIManager.getInstance(),
        serviceWorker: ServiceWorkerManager.getInstance(),
        gps: GPSManager.getInstance()
      };

      // Initialize form-related managers early
      await this.initializeFormManagers();

      // Initialize UI manager after i18next
      await this.managers.ui.initialize();

      if ('serviceWorker' in navigator) {
        await this.managers.serviceWorker.initialize();
      }

      if (this.i18next.isInitialized) {
        await this.managers.ui.updateGPSCardVisibility();
      }
      
      this.managers.gps = GPSManager.getInstance();

      const hasActiveRecording = await this.managers.gps.checkForActiveRecording();
      if (hasActiveRecording) {
        this.logger.debug('Restored active GPS recording');
        await this.managers.ui.updateGPSCardVisibility();
      } else {
        // Try to load the latest completed track
        const latestTrack = await this.managers.gps.loadLatestTrack();
        if (latestTrack) {
          this.logger.debug('Loaded latest completed track');
          await this.managers.ui.showGPSTrackCard();
        }
      }

      await this.initializeAppState();
      
      this.initialized = true;
      this.managers.event.emit('APP_INIT_COMPLETE');
    } catch (error) {
      this.logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  async initializeFormManagers() {
    // Initialize all form-related managers
    this.managers.select = SelectManager.getInstance();
    this.managers.form = FormManager.getInstance();
    this.managers.photo = PhotoManager.getInstance();
    this.managers.validation = ValidationManager.getInstance();
  
    // Initialize them in parallel
    await Promise.all([
      this.managers.select.initialize(),
      this.managers.form.initialize()
    ]);
  }

  async initializeAppState() {
    this.managers.event.emit('APP_INIT_START');
  
    try {
        // First check if we have a stored session
        const storedSessionId = localStorage.getItem(this.managers.auth.constructor.SESSION_KEY);
        
        if (!storedSessionId) {
            // No stored session, user must log in
            await this.managers.ui.updateUIBasedOnAuthState(false);
            return;
        }

        // We have a stored session, let's use it
        const didAuth = await this.checkForURLParameters();
        if (!didAuth) {
            // No OAuth callback processing needed, trust the stored session
            await this.managers.ui.updateUIBasedOnAuthState(true);
            await this.refreshUserData();
        }
    } catch (error) {
        this.logger.error('Error in initializeAppState:', error);
        throw error;
    }
}

  async checkForURLParameters() {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('code') && !this.processingAuth) {
          this.processingAuth = true;
          try {
              console.log('Processing OAuth callback...');
              const success = await this.managers.auth.handleOAuthCallback(
                  urlParams.get('code'),
                  urlParams.get('state')
              );
              window.history.replaceState({}, document.title, '/');
              
              if (success) {
                  console.log('OAuth callback successful, updating UI...');
                  await this.managers.ui.updateUIBasedOnAuthState(true);
                  await this.refreshUserData();
                  return true;
              } else {
                  console.log('OAuth callback failed, showing login...');
                  await this.managers.ui.updateUIBasedOnAuthState(false);
              }
          } finally {
              this.processingAuth = false;
          }
      }
      return false;
  }

  async refreshUserData() {
    try {
      const userData = await this.managers.network.get('/api/user-data');
      if (userData) {
        await this.managers.ui.updateUIWithUserData(userData);
        this.managers.form.initializeForm(userData);
        return userData;
      }
    } catch (error) {
      this.logger.error('Error refreshing user data:', error);
      throw error;
    }
  }

  async handleInvalidSession() {
    this.logger.info('Handling invalid session');
    await this.managers.auth.logout();
    this.managers.ui.showLoginPrompt();
  }

  handleInitializationError(error) {
    this.logger.error('Initialization error:', error);
    alert(this.i18next.t('errors.application.initFailed'));
  }
}

// Create and export app instance
const app = App.getInstance();

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  app.start().catch(error => {
    console.error('Failed to start application:', error);
  });
});

export default app;
