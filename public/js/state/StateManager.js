// state/StateManager.js

import Logger from '../utils/Logger.js';
import StorageManager from '../storage/StorageManager.js';
import AuthManager from '../auth/AuthManager.js';

class StateManager {
  static instance = null;

  constructor() {
    if (StateManager.instance) {
      return StateManager.instance;
    }
    
    this.state = {
      auth: {
        isAuthenticated: false,
        user: {
          user_name: null,
          language: null,
          ski_center_admin: null,
          rovas_uid: null,
          nabezky_uid: null
        },
        sessionId: null
      },
      ui: {
        currentView: 'dashboard',
        isLoading: false,
        errors: {}
      },
      form: {
        isDirty: false,
        currentStep: 1,
        validation: {},
        data: {}
      },
      trailConditions: {},
      photos: [],
      rewards: {
        startTime: null,
        elapsedTime: 0,
        laborTime: 0,
        requestedReward: 0
      },
      location: {
        selectedCountry: null,
        selectedRegion: null
      },
      storage: {
        userData: null  // for admins contains full list of ski centers
      }
    };

    this.subscribers = new Map();
    this.logger = Logger.getInstance();
    StateManager.instance = this;
  }

  static getInstance() {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  // State getters
  getState(path = null) {
    if (!path) return this.state;
    return this.getNestedValue(this.state, path);
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : null, obj);
  }

  // State setters
  setState(path, value, silent = false) {
    this.logger.debug(`Setting state at ${path}:`, value);
    
    const oldValue = this.getNestedValue(this.state, path);
    if (this.setNestedValue(this.state, path, value)) {
      if (!silent) {
        this.notifySubscribers(path, value, oldValue);
      }
      return true;
    }
    return false;
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (current[key] === undefined) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    if (target && typeof target === 'object') {
      target[lastKey] = value;
      return true;
    }
    return false;
  }

  // Batch update multiple state properties
  batchUpdate(updates, silent = false) {
    const oldValues = {};
    const changes = [];

    // Collect old values and validate paths
    for (const [path, value] of Object.entries(updates)) {
      oldValues[path] = this.getNestedValue(this.state, path);
      if (!this.setNestedValue(this.state, path, value)) {
        this.logger.error(`Failed to update state at path: ${path}`);
        return false;
      }
      changes.push({ path, newValue: value, oldValue: oldValues[path] });
    }

    if (!silent) {
      // Notify subscribers about all changes at once
      this.notifyBatchUpdate(changes);
    }
    return true;
  }

  // Subscribe to state changes
  subscribe(path, callback) {
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set());
    }
    this.subscribers.get(path).add(callback);
    
    // Return unsubscribe function
    return () => this.unsubscribe(path, callback);
  }

  unsubscribe(path, callback) {
    const pathSubscribers = this.subscribers.get(path);
    if (pathSubscribers) {
      pathSubscribers.delete(callback);
      if (pathSubscribers.size === 0) {
        this.subscribers.delete(path);
      }
    }
  }

  // Notify subscribers of state changes
  notifySubscribers(path, newValue, oldValue) {
    // Notify specific path subscribers
    const pathSubscribers = this.subscribers.get(path);
    if (pathSubscribers) {
      pathSubscribers.forEach(callback => {
        try {
          callback(newValue, oldValue, path);
        } catch (error) {
          this.logger.error('Error in state change subscriber:', error);
        }
      });
    }

    // Notify wildcard subscribers
    const wildcardSubscribers = this.subscribers.get('*');
    if (wildcardSubscribers) {
      wildcardSubscribers.forEach(callback => {
        try {
          callback(newValue, oldValue, path);
        } catch (error) {
          this.logger.error('Error in wildcard state change subscriber:', error);
        }
      });
    }
  }

  notifyBatchUpdate(changes) {
    // Collect all affected subscribers
    const affectedSubscribers = new Map();

    changes.forEach(({ path, newValue, oldValue }) => {
      const pathSubscribers = this.subscribers.get(path);
      if (pathSubscribers) {
        pathSubscribers.forEach(callback => {
          affectedSubscribers.set(callback, { path, newValue, oldValue });
        });
      }
    });

    // Notify wildcard subscribers
    const wildcardSubscribers = this.subscribers.get('*');
    if (wildcardSubscribers) {
      wildcardSubscribers.forEach(callback => {
        affectedSubscribers.set(callback, changes);
      });
    }

    // Execute callbacks
    affectedSubscribers.forEach((changeData, callback) => {
      try {
        callback(changeData);
      } catch (error) {
        this.logger.error('Error in batch update subscriber:', error);
      }
    });
  }

  // Reset specific parts of state
  resetState(path) {
    const initialState = {
      auth: {
        isAuthenticated: false,
        user: null,
        sessionId: null
      },
      ui: {
        currentView: 'dashboard',
        isLoading: false,
        errors: {}
      },
      form: {
        isDirty: false,
        currentStep: 1,
        validation: {},
        data: {}
      },
      trailConditions: {},
      photos: [],
      rewards: {
        startTime: null,
        elapsedTime: 0,
        laborTime: 0,
        requestedReward: 0
      },
      location: {
        selectedCountry: null,
        selectedRegion: null
      }
    };

    if (path) {
      const resetValue = this.getNestedValue(initialState, path);
      this.setState(path, resetValue);
    } else {
      this.state = initialState;
      this.notifySubscribers('*', this.state, null);
    }
  }

  // State persistence
  persistState() {
    try {
      const persistedState = {
        auth: {
          sessionId: this.state.auth.sessionId
        },
        location: this.state.location
      };
      localStorage.setItem('appState', JSON.stringify(persistedState));
    } catch (error) {
      this.logger.error('Error persisting state:', error);
    }
  }

  loadPersistedState() {
    try {
      const persistedState = localStorage.getItem('appState');
      if (persistedState) {
        const parsedState = JSON.parse(persistedState);
        this.batchUpdate(parsedState);
      }
    } catch (error) {
      this.logger.error('Error loading persisted state:', error);
    }
  }

  // Debug helpers
  getStateSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  getSubscriberCount(path) {
    return this.subscribers.get(path)?.size || 0;
  }

  getAllSubscribers() {
    const result = {};
    for (const [path, subscribers] of this.subscribers) {
      result[path] = subscribers.size;
    }
    return result;
  }
  
  async restorePersistedState() {
      try {
          // Try to restore auth data
          const authData = localStorage.getItem(AuthManager.AUTH_DATA_KEY);
          if (authData) {
              const parsedAuthData = JSON.parse(authData);
              if (parsedAuthData.isAuthenticated) {
                  this.setState('auth.isAuthenticated', true);
              }
          }
  
          // Try to restore cached user data
          const cachedUserData = localStorage.getItem('cached_user_data');
          if (cachedUserData) {
              try {
                  const userData = JSON.parse(cachedUserData);
                  this.setState('auth.user', userData);
                  this.setState('storage.userData', userData);
              } catch (e) {
                  this.logger.error('Error parsing cached user data:', e);
              }
          }
  
          // Restore selected ski center if exists
          const storageManager = StorageManager.getInstance();
          const selectedSkiCenter = storageManager.getSelectedSkiCenter();
          if (selectedSkiCenter) {
              this.setState('skiCenter.selected', selectedSkiCenter);
          }
  
          // Load any persisted state from localStorage
          const persistedState = localStorage.getItem('appState');
          if (persistedState) {
              try {
                  const parsedState = JSON.parse(persistedState);
                  this.batchUpdate(parsedState);
              } catch (error) {
                  this.logger.error('Error parsing persisted state:', error);
              }
          }
  
          this.logger.debug('State restoration complete', {
              hasAuthData: !!authData,
              hasUserData: !!cachedUserData,
              hasSelectedSkiCenter: !!selectedSkiCenter,
              hasPersistedState: !!persistedState
          });
  
      } catch (error) {
          this.logger.error('Error restoring persisted state:', error);
          throw error;
      }
  }
  async selectSkiCenter(skiCenterId) {
    const storage = this.getState('storage.userData');
    
    this.logger.debug('Selecting ski center:', skiCenterId);
    this.logger.debug('Available centers:', storage?.ski_centers_data);

    if (!storage?.ski_centers_data) {
      this.logger.error('No ski centers data available');
      return false;
    }

    const newCenter = storage.ski_centers_data.find(center => 
      center[0][0] === String(skiCenterId)
    );

    if (!newCenter) {
      this.logger.error('Ski center not found:', skiCenterId);
      return false;
    }
    
    const storageManager = StorageManager.getInstance();
    await storageManager.setSelectedSkiCenter(skiCenterId);

    const currentUser = this.getState('auth.user');
    if (currentUser) {
        currentUser.ski_center_id = skiCenterId;
        currentUser.ski_center_name = newCenter[1][0];
        currentUser.trails = newCenter[2];
        this.setState('auth.user', currentUser);
    }
    
    // Notify about selection change
    this.notifySubscribers('skiCenter.selected', skiCenterId);
    return true;
  }

  getCurrentSkiCenter() {
    const storage = this.getState('storage.userData');
    const storageManager = StorageManager.getInstance();
    const selectedId = storageManager.getSelectedSkiCenter();
    
    if (!storage?.ski_centers_data) {
      this.logger.debug('No ski centers data available');
      return null;
    }

    if (selectedId) {
      const selected = storage.ski_centers_data.find(center => 
        center[0][0] === String(selectedId)
      );
      if (selected) return selected;
    }

    // Default to first center if none selected
    return storage.ski_centers_data[0] || null;
  }

  getSkiCenterData() {
    const currentCenter = this.getCurrentSkiCenter();
    if (!currentCenter) return null;

    return {
      id: currentCenter[0][0],
      name: currentCenter[1][0],
      trails: currentCenter[2]
    };
  }
  
  getAllSkiCenters() {
      const storage = this.getState('storage.userData');
      return storage?.ski_centers_data || [];
  }
}

export default StateManager;
