// utils/ErrorBoundary.js

class ErrorBoundary {
  constructor() {
    this.logger = Logger.getInstance();
    this.setupGlobalHandlers();
    this.lastError = null;
    this.errorCount = 0;
    this.maxErrorsBeforeAlert = 3;
    this.timeWindow = 60000; // 1 minute
    this.errors = [];
  }

  setupGlobalHandlers() {
    // Handle uncaught exceptions
    window.onerror = (message, source, lineno, colno, error) => {
      this.handleError('uncaught', error || message, {
        source,
        lineno,
        colno
      });
      return false; // Let the error propagate
    };

    // Handle unhandled promise rejections
    window.onunhandledrejection = (event) => {
      this.handleError('unhandledRejection', event.reason, {
        promise: event.promise
      });
    };

    // Handle network errors
    window.addEventListener('offline', () => {
      this.logger.warn('Network connection lost');
    });

    window.addEventListener('online', () => {
      this.logger.info('Network connection restored');
    });
  }

  handleError(type, error, context = {}) {
    const timestamp = Date.now();
    const errorInfo = this.formatError(error);

    // Add error to the queue
    this.errors.push({
      timestamp,
      type,
      ...errorInfo,
      context
    });

    // Clean up old errors outside the time window
    this.cleanupOldErrors(timestamp);

    // Log the error
    this.logger.error(`${type} error occurred`, {
      error: errorInfo,
      context
    });

    // Check if we should alert the user
    if (this.shouldShowAlert()) {
      this.showUserAlert();
    }

    // Report to backend
    this.reportError(type, errorInfo, context);
  }

  formatError(error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error.response && { response: this.formatResponse(error.response) })
      };
    }
    
    return {
      message: String(error)
    };
  }

  formatResponse(response) {
    try {
      return {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
      };
    } catch (e) {
      return response;
    }
  }

  cleanupOldErrors(currentTime) {
    const cutoffTime = currentTime - this.timeWindow;
    this.errors = this.errors.filter(error => error.timestamp > cutoffTime);
  }

  shouldShowAlert() {
    return this.errors.length >= this.maxErrorsBeforeAlert;
  }

  showUserAlert() {
    const message = this.i18next.t('errors.multipleErrors', {
      count: this.errors.length,
      defaultValue: 'Multiple errors occurred. Please refresh the page or try again later.'
    });
    
    // You could implement a more sophisticated UI alert system here
    alert(message);
    
    // Reset error count after showing alert
    this.errors = [];
  }

  async reportError(type, error, context) {
    try {
      const errorReport = {
        type,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        error,
        context,
        sessionId: localStorage.getItem('sessionId')
      };

      const response = await fetch('/api/report-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(errorReport)
      });

      if (!response.ok) {
        console.error('Failed to report error to server');
      }
    } catch (e) {
      console.error('Error while reporting error:', e);
    }
  }

  // Handle specific types of errors
  handleAPIError(error, endpoint) {
    const errorInfo = {
      type: 'api',
      endpoint,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    };

    this.handleError('api', error, errorInfo);

    // Return user-friendly message based on error type
    return this.getAPIErrorMessage(error);
  }

  getAPIErrorMessage(error) {
    const status = error.response?.status;
    
    switch (status) {
      case 401:
        return this.i18next.t('errors.unauthorized', 'Please log in again.');
      case 403:
        return this.i18next.t('errors.forbidden', 'You don\'t have permission to perform this action.');
      case 404:
        return this.i18next.t('errors.notFound', 'The requested resource was not found.');
      case 429:
        return this.i18next.t('errors.tooManyRequests', 'Too many requests. Please try again later.');
      default:
        return this.i18next.t('errors.general', 'An error occurred. Please try again.');
    }
  }

  // Handle form submission errors
  handleFormError(error, formId) {
    const context = {
      type: 'form',
      formId,
      formData: this.getFormData(formId)
    };

    this.handleError('form', error, context);
    return this.getFormErrorMessage(error);
  }

  getFormData(formId) {
    const form = document.getElementById(formId);
    if (!form) return null;

    const formData = new FormData(form);
    const data = {};
    
    for (let [key, value] of formData.entries()) {
      // Don't include file inputs or sensitive data
      if (!(value instanceof File) && !key.toLowerCase().includes('password')) {
        data[key] = value;
      }
    }
    
    return data;
  }

  getFormErrorMessage(error) {
    if (error.validationErrors) {
      return this.i18next.t('errors.validation', 'Please check your input and try again.');
    }
    return this.i18next.t('errors.formSubmission', 'Could not submit form. Please try again.');
  }

  // Reset error state
  reset() {
    this.lastError = null;
    this.errorCount = 0;
    this.errors = [];
  }

  // Check if the application is in a healthy state
  isHealthy() {
    return this.errors.length === 0;
  }

  // Get error statistics
  getErrorStats() {
    return {
      total: this.errors.length,
      byType: this.errors.reduce((acc, error) => {
        acc[error.type] = (acc[error.type] || 0) + 1;
        return acc;
      }, {}),
      lastError: this.errors[this.errors.length - 1]
    };
  }
}

export default ErrorBoundary;
