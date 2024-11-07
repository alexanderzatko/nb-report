// network/NetworkManager.js

import Logger from '../utils/Logger.js';
import EventManager from '../events/EventManager.js';

class NetworkManager {
  static instance = null;

  constructor() {
    if (NetworkManager.instance) {
      return NetworkManager.instance;
    }

    this.baseURL = window.location.origin;
    this.logger = Logger.getInstance();
    this.eventManager = EventManager.getInstance();
    this.pendingRequests = new Map();
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000
    };
    this.defaultTimeout = 30000; // 30 seconds
    this.setupNetworkListeners();

    NetworkManager.instance = this;
  }

  static getInstance() {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.eventManager.emit(this.eventManager.EVENT_TYPES.NETWORK_ONLINE);
      this.retryPendingRequests();
    });
  
    window.addEventListener('offline', () => {
      this.eventManager.emit(this.eventManager.EVENT_TYPES.NETWORK_OFFLINE);
      // Show offline UI notification
      document.body.classList.add('offline');
    });
  
    // Check initial status
    if (!navigator.onLine) {
      document.body.classList.add('offline');
    }
  }

  async request(config) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    try {
      const response = await this.executeRequest(config, requestId);
      this.logResponse(config, response, startTime);
      return response;
    } catch (error) {
      this.handleRequestError(error, config, requestId);
      throw error;
    }
  }

  async executeRequest(config, requestId) {
    const { method = 'GET', url, data, headers = {}, timeout = this.defaultTimeout } = config;

    const fullUrl = this.resolveUrl(url);
    const requestConfig = {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      requestConfig.body = data instanceof FormData ? data : JSON.stringify(data);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    requestConfig.signal = controller.signal;

    this.pendingRequests.set(requestId, { controller, config });

    try {
      const response = await fetch(fullUrl, requestConfig);
      clearTimeout(timeoutId);
      this.pendingRequests.delete(requestId);

      if (!response.ok) {
        throw await this.createErrorFromResponse(response);
      }

      return await this.parseResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      this.pendingRequests.delete(requestId);
      throw error;
    }
  }

  async parseResponse(response) {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  }

  async createErrorFromResponse(response) {
    const error = new Error(`HTTP error! status: ${response.status}`);
    try {
      error.response = {
        status: response.status,
        statusText: response.statusText,
        data: await this.parseResponse(response),
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (e) {
      error.response = {
        status: response.status,
        statusText: response.statusText
      };
    }
    return error;
  }

  resolveUrl(url) {
    if (url.startsWith('http')) {
      return url;
    }
    return `${this.baseURL}${url.startsWith('/') ? url : `/${url}`}`;
  }

  logResponse(config, response, startTime) {
    const duration = Date.now() - startTime;
    this.logger.debug(`${config.method} ${config.url} completed in ${duration}ms`, {
      request: config,
      response: response,
      duration
    });
  }

  handleRequestError(error, config, requestId) {
    if (error.name === 'AbortError') {
      this.logger.warn(`Request ${config.method} ${config.url} aborted due to timeout`);
      return;
    }

    this.logger.error(`Request ${config.method} ${config.url} failed:`, error);
    this.eventManager.emit(this.eventManager.EVENT_TYPES.NETWORK_ERROR, {
      error,
      config,
      requestId
    });

    if (!navigator.onLine) {
      this.queueForRetry(config, requestId);
    }
  }

  queueForRetry(config, requestId) {
    this.pendingRequests.set(requestId, {
      config,
      retryCount: 0,
      lastAttempt: Date.now()
    });
  }

  async retryPendingRequests() {
    for (const [requestId, request] of this.pendingRequests) {
      if (request.retryCount < this.retryConfig.maxRetries) {
        const delay = this.calculateRetryDelay(request.retryCount);
        await this.delay(delay);
        request.retryCount++;
        try {
          await this.executeRequest(request.config, requestId);
        } catch (error) {
          this.logger.error(`Retry attempt ${request.retryCount} failed for request ${requestId}:`, error);
        }
      }
    }
  }

  calculateRetryDelay(retryCount) {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, retryCount),
      this.retryConfig.maxDelay
    );
    return delay + Math.random() * 1000; // Add jitter
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Convenience methods for common HTTP methods
  async get(url, config = {}) {
    return this.request({ ...config, method: 'GET', url });
  }

  async post(url, data, config = {}) {
    return this.request({ ...config, method: 'POST', url, data });
  }

  async put(url, data, config = {}) {
    return this.request({ ...config, method: 'PUT', url, data });
  }

  async delete(url, config = {}) {
    return this.request({ ...config, method: 'DELETE', url });
  }

  // Cancel all pending requests
  cancelAllRequests() {
    this.pendingRequests.forEach(request => {
      if (request.controller) {
        request.controller.abort();
      }
    });
    this.pendingRequests.clear();
  }

  // Update configuration
  updateConfig(config) {
    Object.assign(this.retryConfig, config.retry || {});
    if (config.timeout) {
      this.defaultTimeout = config.timeout;
    }
    if (config.baseURL) {
      this.baseURL = config.baseURL;
    }
  }
}

export default NetworkManager;
