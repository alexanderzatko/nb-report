// utils/Logger.js

class Logger {
  static instance = null;
  
  constructor() {
    if (Logger.instance) {
      return Logger.instance;
    }
    
    this.debugMode = this.detectDebugMode();
    this.logLevel = 'debug';
    this.logHistory = [];
    this.maxHistorySize = 1000;
    
    Logger.instance = this;
  }

  detectDebugMode() {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' ||
           window.location.search.includes('debug=true') ||
           true; // Keep your default debug mode enabled
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

  getStack() {
    try {
      const err = new Error();
      Error.captureStackTrace(err, this.getStack);
      
      // Get the stack trace
      const stackLines = err.stack.split('\n');
      
      // Find the first non-Logger.js line
      let callerLine = null;
      for (const line of stackLines) {
        if (!line.includes('Logger.js') && line.includes('at ')) {
          callerLine = line;
          break;
        }
      }
      
      if (!callerLine) return { file: 'unknown', line: '?' };

      // Try different regex patterns for different stack trace formats
      let matches = callerLine.match(/\((.+?):(\d+):(\d+)\)/);  // Format: at Function (file:line:col)
      if (!matches) {
        matches = callerLine.match(/at\s+(.+?):(\d+):(\d+)/);   // Format: at file:line:col
      }
      if (!matches) return { file: 'unknown', line: '?' };

      const fullPath = matches[1];
      const lineNumber = matches[2];
      
      // Extract filename, handling both URLs and filesystem paths
      let fileName = fullPath;
      if (fullPath.includes('/')) {
        fileName = fullPath.split('/').pop();
      } else if (fullPath.includes('\\')) {
        fileName = fullPath.split('\\').pop();
      }
      
      // Clean up the filename
      fileName = fileName.replace(/\?.*$/, ''); // Remove URL parameters
      
      // Handle webpack-style names
      if (fileName.includes('webpack')) {
        // Try to find the original file name in the line
        const originalFileMatch = callerLine.match(/\/([\w-]+\.js)/);
        if (originalFileMatch) {
          fileName = originalFileMatch[1];
        }
      }

      return {
        file: fileName,
        line: lineNumber,
        fullPath: fullPath  // Keep the full path for debugging
      };
    } catch (error) {
      console.warn('Error getting stack trace:', error);
      return { file: 'unknown', line: '?' };
    }
  }

  formatMessage(level, message, data, location = null) {
    const timestamp = new Date().toISOString();
    const locationInfo = location ? `[${location.file}:${location.line}]` : '';
    const formattedData = data ? JSON.stringify(data, this.jsonReplacer) : '';
    return {
      timestamp,
      level,
      location: locationInfo,
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
      
      const location = this.getStack();
      const logEntry = this.formatMessage('debug', message, data, location);
      this.addToHistory(logEntry);
      
      if (this.debugMode) {
        const caller = location.file !== 'unknown' ? 
          ` [${location.file}:${location.line}]` : '';
        
        console.debug(
          `%c${logEntry.timestamp} [DEBUG]${caller} ${message}`, 
          'color: #6c757d',
          data,
          location.fullPath ? `\nCalled from: ${location.fullPath}` : ''
        );
      }
    }

  info(message, data = null) {
    if (!this.shouldLog('info')) return;
    
    const location = this.getStack();
    const logEntry = this.formatMessage('info', message, data, location);
    this.addToHistory(logEntry);
    
    console.info(
      `%c${logEntry.timestamp} [INFO] ${logEntry.location} ${message}`,
      'color: #0077cc',
      data
    );
  }

  warn(message, data = null) {
    if (!this.shouldLog('warn')) return;
    
    const location = this.getStack();
    const logEntry = this.formatMessage('warn', message, data, location);
    this.addToHistory(logEntry);
    
    console.warn(
      `%c${logEntry.timestamp} [WARN] ${logEntry.location} ${message}`,
      'color: #ffc107',
      data
    );
  }

  error(message, error = null) {
    if (!this.shouldLog('error')) return;
    
    const location = this.getStack();
    const logEntry = this.formatMessage('error', message, error, location);
    this.addToHistory(logEntry);
    
    console.error(
      `%c${logEntry.timestamp} [ERROR] ${logEntry.location} ${message}`,
      'color: #dc3545',
      error
    );

    // Optional: Send to error tracking service
    this.reportError(logEntry);
  }

  async reportError(logEntry) {
    try {
      const response = await fetch('/api/log-error', {
        method: 'POST',
        credentials: 'include',
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
    
    const location = this.getStack();
    const logEntry = this.formatMessage('trace', message, data, location);
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
