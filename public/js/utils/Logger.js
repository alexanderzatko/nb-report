// utils/Logger.js

class Logger {
  static instance = null;
  
  constructor() {
    if (Logger.instance) {
      return Logger.instance;
    }
    
    this.debugMode = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.includes('development');
    this.logLevel = this.getLogLevel();
    this.logHistory = [];
    this.maxHistorySize = 1000;
    
    Logger.instance = this;
  }

  static getInstance() {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  getLogLevel() {
    const savedLevel = localStorage.getItem('logLevel');
    return savedLevel || (this.debugMode ? 'debug' : 'info');
  }

  setLogLevel(level) {
    this.logLevel = level;
    localStorage.setItem('logLevel', level);
  }

  formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const formattedData = data ? JSON.stringify(data, this.jsonReplacer) : '';
    return {
      timestamp,
      level,
      message,
      data: formattedData
    };
  }

  jsonReplacer(key, value) {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        ...(value.response && { response: value.response })
      };
    }
    if (value instanceof FormData) {
      const formDataObj = {};
      value.forEach((val, key) => {
        if (val instanceof File) {
          formDataObj[key] = {
            type: 'File',
            name: val.name,
            size: val.size,
            type: val.type
          };
        } else {
          formDataObj[key] = val;
        }
      });
      return formDataObj;
    }
    return value;
  }

  shouldLog(level) {
    const levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    return levels[level] <= levels[this.logLevel];
  }

  addToHistory(logEntry) {
    this.logHistory.unshift(logEntry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.pop();
    }
  }

  debug(message, data = null) {
    if (!this.shouldLog('debug')) return;
    
    const logEntry = this.formatMessage('debug', message, data);
    this.addToHistory(logEntry);
    
    if (this.debugMode) {
      console.debug(
        `%c${logEntry.timestamp} [DEBUG] ${message}`, 
        'color: #6c757d',
        data
      );
    }
  }

  info(message, data = null) {
    if (!this.shouldLog('info')) return;
    
    const logEntry = this.formatMessage('info', message, data);
    this.addToHistory(logEntry);
    
    console.info(
      `%c${logEntry.timestamp} [INFO] ${message}`,
      'color: #0077cc',
      data
    );
  }

  warn(message, data = null) {
    if (!this.shouldLog('warn')) return;
    
    const logEntry = this.formatMessage('warn', message, data);
    this.addToHistory(logEntry);
    
    console.warn(
      `%c${logEntry.timestamp} [WARN] ${message}`,
      'color: #ffc107',
      data
    );
  }

  error(message, error = null) {
    if (!this.shouldLog('error')) return;
    
    const logEntry = this.formatMessage('error', message, error);
    this.addToHistory(logEntry);
    
    console.error(
      `%c${logEntry.timestamp} [ERROR] ${message}`,
      'color: #dc3545',
      error
    );

    // Optional: Send to error tracking service
    this.reportError(logEntry);
  }

  async reportError(logEntry) {
    // Implementation for sending errors to your backend or error tracking service
    try {
      const response = await fetch('/api/log-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logEntry)
      });
      
      if (!response.ok) {
        console.error('Failed to report error to server');
      }
    } catch (err) {
      console.error('Error reporting to server:', err);
    }
  }

  getHistory(level = null, limit = null) {
    let filteredHistory = this.logHistory;
    
    if (level) {
      filteredHistory = filteredHistory.filter(entry => entry.level === level);
    }
    
    if (limit) {
      filteredHistory = filteredHistory.slice(0, limit);
    }
    
    return filteredHistory;
  }

  clearHistory() {
    this.logHistory = [];
  }

  // Group related logs
  group(label) {
    console.group(label);
  }

  groupEnd() {
    console.groupEnd();
  }

  // Measure time
  time(label) {
    console.time(label);
  }

  timeEnd(label) {
    console.timeEnd(label);
  }

  // Log with stack trace
  trace(message, data = null) {
    if (!this.shouldLog('debug')) return;
    
    const logEntry = this.formatMessage('trace', message, data);
    this.addToHistory(logEntry);
    
    console.trace(message, data);
  }

  // Format network requests/responses
  logRequest(method, url, data = null) {
    this.debug(`→ ${method} ${url}`, data);
  }

  logResponse(method, url, response, timeMs) {
    const status = response.status;
    const statusText = response.statusText;
    
    if (status >= 400) {
      this.error(`← ${method} ${url} [${status} ${statusText}] (${timeMs}ms)`, response);
    } else {
      this.debug(`← ${method} ${url} [${status} ${statusText}] (${timeMs}ms)`, response);
    }
  }

  // Format API errors
  logAPIError(endpoint, error) {
    this.error(`API Error on ${endpoint}`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      stack: error.stack
    });
  }
}

export default Logger;
