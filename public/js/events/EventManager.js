// events/EventManager.js

import Logger from '../utils/Logger.js';

class EventManager {
  static instance = null;

  constructor() {
    if (EventManager.instance) {
      return EventManager.instance;
    }

    this.listeners = new Map();
    this.onceListeners = new Map();
    this.logger = Logger.getInstance();
    this.recentEvents = [];
    this.maxRecentEvents = 100;
    this.debugMode = process.env.NODE_ENV === 'development';

    // Pre-defined event types for type safety
    this.EVENT_TYPES = {
      // Auth events
      AUTH_LOGIN_START: 'auth:login:start',
      AUTH_LOGIN_SUCCESS: 'auth:login:success',
      AUTH_LOGIN_FAILURE: 'auth:login:failure',
      AUTH_LOGOUT: 'auth:logout',
      AUTH_SESSION_EXPIRED: 'auth:session:expired',
      
      // Form events
      FORM_SUBMIT_START: 'form:submit:start',
      FORM_SUBMIT_SUCCESS: 'form:submit:success',
      FORM_SUBMIT_FAILURE: 'form:submit:failure',
      FORM_VALIDATION_ERROR: 'form:validation:error',
      FORM_DATA_CHANGE: 'form:data:change',
      
      // UI events
      UI_VIEW_CHANGE: 'ui:view:change',
      UI_LOADING_START: 'ui:loading:start',
      UI_LOADING_END: 'ui:loading:end',
      UI_ERROR_SHOW: 'ui:error:show',
      UI_ERROR_CLEAR: 'ui:error:clear',
      
      // Photo events
      PHOTO_UPLOAD_START: 'photo:upload:start',
      PHOTO_UPLOAD_PROGRESS: 'photo:upload:progress',
      PHOTO_UPLOAD_SUCCESS: 'photo:upload:success',
      PHOTO_UPLOAD_FAILURE: 'photo:upload:failure',
      
      // Location events
      LOCATION_COUNTRY_CHANGE: 'location:country:change',
      LOCATION_REGION_CHANGE: 'location:region:change',
      
      // Network events
      NETWORK_ONLINE: 'network:online',
      NETWORK_OFFLINE: 'network:offline',
      NETWORK_ERROR: 'network:error',
      
      // App lifecycle events
      APP_INIT_START: 'app:init:start',
      APP_INIT_COMPLETE: 'app:init:complete',
      APP_ERROR: 'app:error',
      APP_UPDATE_AVAILABLE: 'app:update:available'
    };

    EventManager.instance = this;
  }

  static getInstance() {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
  }

  on(eventType, callback, context = null) {
    this.validateEventType(eventType);
    
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Map());
    }
    
    const handlers = this.listeners.get(eventType);
    handlers.set(callback, context);
    
    // Return unsubscribe function
    return () => this.off(eventType, callback);
  }

  once(eventType, callback, context = null) {
    this.validateEventType(eventType);
    
    if (!this.onceListeners.has(eventType)) {
      this.onceListeners.set(eventType, new Map());
    }
    
    const handlers = this.onceListeners.get(eventType);
    handlers.set(callback, context);
    
    // Return unsubscribe function
    return () => this.off(eventType, callback, true);
  }

  off(eventType, callback, once = false) {
    this.validateEventType(eventType);
    
    const targetMap = once ? this.onceListeners : this.listeners;
    if (callback) {
      const handlers = targetMap.get(eventType);
      if (handlers) {
        handlers.delete(callback);
        if (handlers.size === 0) {
          targetMap.delete(eventType);
        }
      }
    } else {
      targetMap.delete(eventType);
    }
  }

  emit(eventType, data = null) {
    this.validateEventType(eventType);
    
    const timestamp = Date.now();
    this.logEvent(eventType, data, timestamp);

    // Regular listeners
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      handlers.forEach((context, callback) => {
        try {
          callback.call(context, data);
        } catch (error) {
          this.logger.error(`Error in event listener for ${eventType}:`, error);
        }
      });
    }

    // Once listeners
    const onceHandlers = this.onceListeners.get(eventType);
    if (onceHandlers) {
      onceHandlers.forEach((context, callback) => {
        try {
          callback.call(context, data);
        } catch (error) {
          this.logger.error(`Error in once event listener for ${eventType}:`, error);
        }
      });
      this.onceListeners.delete(eventType);
    }

    // Wildcard listeners
    const wildcardHandlers = this.listeners.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((context, callback) => {
        try {
          callback.call(context, { type: eventType, data });
        } catch (error) {
          this.logger.error(`Error in wildcard event listener for ${eventType}:`, error);
        }
      });
    }
  }

  emitAsync(eventType, data = null) {
    this.validateEventType(eventType);
    
    return new Promise((resolve, reject) => {
      try {
        this.emit(eventType, data);
        resolve();
      } catch (error) {
        this.logger.error(`Error in async event emission for ${eventType}:`, error);
        reject(error);
      }
    });
  }

  validateEventType(eventType) {
    if (eventType !== '*' && !Object.values(this.EVENT_TYPES).includes(eventType)) {
      if (this.debugMode) {
        console.warn(`Warning: Unregistered event type "${eventType}" being used`);
      }
    }
  }

  logEvent(eventType, data, timestamp) {
    const event = {
      type: eventType,
      data,
      timestamp
    };

    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.pop();
    }

    if (this.debugMode) {
      this.logger.debug(`Event emitted: ${eventType}`, data);
    }
  }

  // Helper methods for debugging and monitoring
  getEventHistory(eventType = null) {
    if (eventType) {
      return this.recentEvents.filter(event => event.type === eventType);
    }
    return this.recentEvents;
  }

  getListenerCount(eventType) {
    let count = 0;
    
    const regularListeners = this.listeners.get(eventType);
    if (regularListeners) {
      count += regularListeners.size;
    }
    
    const onceListeners = this.onceListeners.get(eventType);
    if (onceListeners) {
      count += onceListeners.size;
    }
    
    return count;
  }

  clearEventHistory() {
    this.recentEvents = [];
  }

  // Convenience methods for common event patterns
  emitWithLoading(eventType, asyncOperation) {
    return new Promise(async (resolve, reject) => {
      try {
        this.emit(this.EVENT_TYPES.UI_LOADING_START, { source: eventType });
        const result = await asyncOperation();
        this.emit(eventType, result);
        this.emit(this.EVENT_TYPES.UI_LOADING_END, { source: eventType });
        resolve(result);
      } catch (error) {
        this.emit(this.EVENT_TYPES.UI_LOADING_END, { source: eventType });
        this.emit(this.EVENT_TYPES.APP_ERROR, { source: eventType, error });
        reject(error);
      }
    });
  }

  emitSequence(events) {
    return events.reduce(async (promise, [eventType, data]) => {
      await promise;
      return this.emitAsync(eventType, data);
    }, Promise.resolve());
  }
}

export default EventManager;
