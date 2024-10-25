// state/StateManager.js

class StateManager {
  static instance = null;

  constructor() {
    if (StateManager.instance) {
      return StateManager.instance;
    }
    
    this.state = {
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
}

export default StateManager;
