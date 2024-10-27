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
      // Initialize essential managers first
      this.managers = {
        config: ConfigManager.getInstance(),
        event: EventManager.getInstance(),
        network: NetworkManager.getInstance(),
        storage: StorageManager.getInstance(),
        state: StateManager.getInstance(),
        auth: AuthManager.getInstance(),
        ui: UIManager.getInstance(),
        serviceWorker: ServiceWorkerManager.getInstance()
      };
  
      // Initialize i18n first, before any form managers
      await initI18next();
      
      // Initialize form-related managers immediately
      this.managers.select = SelectManager.getInstance();
      this.managers.form = FormManager.getInstance();
      this.managers.photo = PhotoManager.getInstance();
      this.managers.validation = ValidationManager.getInstance();
  
      // Initialize service worker
      if ('serviceWorker' in navigator) {
        await this.managers.serviceWorker.initialize();
      }
  
      // Initialize managers that require setup
      await this.managers.select.initialize();
      await this.managers.form.initialize();
  
      // Check auth and initialize app state
      await this.initializeAppState();
      
      this.initialized = true;
      this.managers.event.emit('APP_INIT_COMPLETE');
    } catch (error) {
      this.logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  async initializeFormManagers() {
    // Initialize i18n
    await initI18next();
    
    // Initialize form-related managers
    this.managers.select = SelectManager.getInstance();
    this.managers.form = FormManager.getInstance();
    this.managers.photo = PhotoManager.getInstance();
    this.managers.validation = ValidationManager.getInstance();
    
    // Initialize form components
    await this.managers.select.initialize();
    await this.managers.form.initialize();
  }
    
  async initializeAppState() {
    this.managers.event.emit('APP_INIT_START');
  
    try {
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
        await this.managers.ui.updateUIBasedOnAuthState(false);
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
        const success = await this.managers.auth.handleOAuthCallback(
          urlParams.get('code'),
          urlParams.get('state')
        );
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

  async refreshUserData() {
    try {
      const userData = await this.managers.network.get('/api/user-data');
      if (userData) {
        this.managers.ui.updateUIWithUserData(userData);
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
    alert('Application initialization failed. Please refresh the page.');
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
