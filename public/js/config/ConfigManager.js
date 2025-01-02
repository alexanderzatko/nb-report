// config/ConfigManager.js

import Logger from '../utils/Logger.js';

class ConfigManager {
  static instance = null;

  constructor() {
    if (ConfigManager.instance) {
      return ConfigManager.instance;
    }

    this.logger = Logger.getInstance();
    this.config = {
      cache: {
        version: 'v479', // update this for new app release and do the same in service-worker.js
        name: 'snow-report-cache',
        staticResources: [
          '/',
          '/index.html',
          '/styles.css',
          '/js/app.js',
          '/js/i18n.js',
          '/manifest.json',
          '/locales/en/translation.json',
          '/locales/sk/translation.json',
          // Keep your existing staticResources list
        ]
      },
      
      app: {
        name: 'Snow Report',
        version: '1.0.0',
        environment: this.detectEnvironment(),
        baseUrl: window.location.origin,
        debugMode: this.isDebugMode()
      },

      api: {
        baseUrl: window.location.origin,
        endpoints: {
          auth: {
            login: '/api/nblogin',
            logout: '/api/logout',
            checkStatus: '/api/auth-status',
            refreshToken: '/api/refresh-token',
            exchangeToken: '/api/exchange-token'
          },
          user: {
            data: '/api/user-data'
          },
          report: {
            submit: '/api/submit-snow-report'
          }
        },
        timeout: 30000,
        retryConfig: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 5000
        }
      },

      auth: {
        sessionCookie: 'nb_report_cookie',
        tokenRefreshInterval: 10 * 60 * 1000 // 10 minutes
      },

      ui: {
        themes: {
          light: {
            primary: '#0078d4',
            secondary: '#6c757d',
            success: '#02ba06',
            error: '#dc3545',
            background: '#ffffff'
          },
          dark: {
            primary: '#0078d4',
            secondary: '#6c757d',
            success: '#02ba06',
            error: '#dc3545',
            background: '#121212'
          }
        },
        animations: {
          duration: 300,
          easing: 'ease-in-out'
        },
        notifications: {
          position: 'top-right',
          duration: 5000
        }
      },

      form: {
        validation: {
          maxPhotos: 10,
          maxPhotoSize: 5 * 1024 * 1024, // 5MB
          allowedPhotoTypes: ['image/jpeg', 'image/png'],
          maxNoteLength: 1000
        },
        photos: {
          maxWidth: 1900,
          maxHeight: 1900,
          quality: 0.9,
          format: 'jpeg'
        }
      },

      storage: {
        keys: {
          authState: 'oauthState',
          sessionId: 'sessionId',
          language: 'i18nextLng',
          theme: 'theme'
        }
      },

      rewards: {
        timeTracking: {
          updateInterval: 1000,
          maxDuration: 24 * 60 * 60 * 1000 // 24 hours
        }
      },

      defaultLocale: 'sk',
      supportedLocales: ['sk', 'en', 'cs', 'de', 'pl', 'hu'],
      fallbackLocale: 'en'
    };

    ConfigManager.instance = this;
  }

 // helper methods for environment detection
  detectEnvironment() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    }
    if (hostname.includes('staging') || hostname.includes('test')) {
      return 'staging';
    }
    return 'production';
  }

  isDebugMode() {
    return this.detectEnvironment() === 'development';
  }

  static getInstance() {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  get(path) {
    return this.getConfigValue(this.config, path);
  }

  getConfigValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : null, obj);
  }

  set(path, value) {
    if (this.config.app.environment === 'production') {
      this.logger.warn(`Attempting to modify configuration in production: ${path}`);
      return false;
    }

    try {
      this.setConfigValue(this.config, path, value);
      this.logger.debug(`Configuration updated: ${path}`, value);
      return true;
    } catch (error) {
      this.logger.error(`Error updating configuration at ${path}:`, error);
      return false;
    }
  }

  setConfigValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (current[key] === undefined) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
  }

  getEndpoint(name) {
    const endpoint = this.getConfigValue(this.config.api.endpoints, name);
    if (!endpoint) {
      throw new Error(`Unknown endpoint: ${name}`);
    }
    return this.config.api.baseUrl + endpoint;
  }

  getEnvironment() {
    return this.config.app.environment;
  }

  isDevelopment() {
    return this.config.app.environment === 'development';
  }

  isProduction() {
    return this.config.app.environment === 'production';
  }

  getApiConfig() {
    return this.config.api;
  }

  getAuthConfig() {
    return this.config.auth;
  }

  getStorageKeys() {
    return this.config.storage.keys;
  }

  getCacheConfig() {
    return this.config.cache;
  }

  getTheme(themeName = 'light') {
    return this.config.ui.themes[themeName];
  }

  getValidationRules() {
    return this.config.form.validation;
  }

  getSupportedLocales() {
    return this.config.supportedLocales;
  }

  // Load environment-specific configuration
  loadEnvironmentConfig() {
    const env = this.getEnvironment();
    try {
      const envConfig = require(`./config.${env}.js`).default;
      this.mergeConfig(envConfig);
    } catch (error) {
      this.logger.warn(`No specific configuration found for environment: ${env}`);
    }
  }

  // Merge new configuration with existing
  mergeConfig(newConfig) {
    this.config = this.deepMerge(this.config, newConfig);
  }

  deepMerge(target, source) {
    for (const key in source) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        target[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
}

export default ConfigManager;
