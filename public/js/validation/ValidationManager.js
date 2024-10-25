// validation/ValidationManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import Logger from '../utils/Logger.js';
import ConfigManager from '../config/ConfigManager.js';

class ValidationManager {
  static instance = null;

  constructor() {
    if (ValidationManager.instance) {
      return ValidationManager.instance;
    }

    this.logger = Logger.getInstance();
    this.configManager = ConfigManager.getInstance();
    this.validationRules = this.configManager.getValidationRules();
    
    // Custom validation functions registry
    this.customValidators = new Map();
    this.initializeCustomValidators();

    ValidationManager.instance = this;
  }

  static getInstance() {
    if (!ValidationManager.instance) {
      ValidationManager.instance = new ValidationManager();
    }
    return ValidationManager.instance;
  }

  initializeCustomValidators() {
    // Register default custom validators
    this.registerValidator('snowDepth', (value) => {
      const num = Number(value);
      return !value || (num >= 0 && num <= 500);
    }, 'validation.snowDepth');

    this.registerValidator('coordinates', (value) => {
      if (!value) return true;
      const [lat, lon] = value.split(',').map(Number);
      return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    }, 'validation.coordinates');

    this.registerValidator('photo', (file) => {
      if (!file) return true;
      const { maxPhotoSize, allowedPhotoTypes } = this.validationRules;
      return (
        file.size <= maxPhotoSize &&
        allowedPhotoTypes.includes(file.type)
      );
    }, 'validation.photo');

    this.registerValidator('date', (value) => {
      if (!value) return true;
      const date = new Date(value);
      const now = new Date();
      return date <= now;
    }, 'validation.date');
  }

  registerValidator(name, validatorFn, messageKey) {
    this.customValidators.set(name, {
      validate: validatorFn,
      messageKey
    });
  }

  validateField(fieldName, value, rules = {}) {
    const errors = [];

    // Required validation
    if (rules.required && !this.validateRequired(value)) {
      errors.push(this.i18next.t('validation.required'));
    }

    // Length validation
    if (rules.minLength && !this.validateMinLength(value, rules.minLength)) {
      errors.push(this.i18next.t('validation.minLength', { length: rules.minLength }));
    }
    if (rules.maxLength && !this.validateMaxLength(value, rules.maxLength)) {
      errors.push(this.i18next.t('validation.maxLength', { length: rules.maxLength }));
    }

    // Number range validation
    if (rules.min !== undefined && !this.validateMin(value, rules.min)) {
      errors.push(this.i18next.t('validation.min', { min: rules.min }));
    }
    if (rules.max !== undefined && !this.validateMax(value, rules.max)) {
      errors.push(this.i18next.t('validation.max', { max: rules.max }));
    }

    // Pattern validation
    if (rules.pattern && !this.validatePattern(value, rules.pattern)) {
      errors.push(this.i18next.t('validation.pattern'));
    }

    // Custom validator
    if (rules.validator && !this.validateCustom(value, rules.validator)) {
      const validator = this.customValidators.get(rules.validator);
      if (validator) {
        errors.push(this.i18next.t(validator.messageKey));
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateRequired(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (value instanceof File) return true;
    return true;
  }

  validateMinLength(value, minLength) {
    if (!value) return true;
    return String(value).length >= minLength;
  }

  validateMaxLength(value, maxLength) {
    if (!value) return true;
    return String(value).length <= maxLength;
  }

  validateMin(value, min) {
    if (!value) return true;
    return Number(value) >= min;
  }

  validateMax(value, max) {
    if (!value) return true;
    return Number(value) <= max;
  }

  validatePattern(value, pattern) {
    if (!value) return true;
    const regex = new RegExp(pattern);
    return regex.test(value);
  }

  validateCustom(value, validatorName) {
    const validator = this.customValidators.get(validatorName);
    if (!validator) {
      this.logger.warn(`Custom validator "${validatorName}" not found`);
      return true;
    }
    return validator.validate(value);
  }

  validateForm(formData, schema) {
    const errors = new Map();
    let isValid = true;

    for (const [fieldName, rules] of Object.entries(schema)) {
      const value = formData.get(fieldName);
      const validation = this.validateField(fieldName, value, rules);
      
      if (!validation.isValid) {
        errors.set(fieldName, validation.errors);
        isValid = false;
      }
    }

    return {
      isValid,
      errors: Object.fromEntries(errors)
    };
  }

  validatePhotos(files) {
    const { maxPhotos, maxPhotoSize, allowedPhotoTypes } = this.validationRules;
    const errors = [];

    if (files.length > maxPhotos) {
      errors.push(this.i18next.t('validation.tooManyPhotos', { max: maxPhotos }));
    }

    for (const file of files) {
      if (file.size > maxPhotoSize) {
        errors.push(this.i18next.t('validation.photoTooLarge', { 
          filename: file.name,
          maxSize: Math.round(maxPhotoSize / (1024 * 1024)) 
        }));
      }

      if (!allowedPhotoTypes.includes(file.type)) {
        errors.push(this.i18next.t('validation.invalidPhotoType', { 
          filename: file.name,
          allowedTypes: allowedPhotoTypes.join(', ') 
        }));
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateTrailConditions(conditions) {
    const errors = new Map();
    let isValid = true;

    for (const [trailId, trailCondition] of Object.entries(conditions)) {
      // Validate required conditions
      if (!trailCondition.freeStyle || !trailCondition.classicStyle) {
        errors.set(trailId, [this.i18next.t('validation.trailConditionsRequired')]);
        isValid = false;
        continue;
      }

      // Validate condition values
      const validValues = ['0', '1', '2', '3', '4', '5'];
      if (!validValues.includes(trailCondition.freeStyle) || 
          !validValues.includes(trailCondition.classicStyle)) {
        errors.set(trailId, [this.i18next.t('validation.invalidTrailCondition')]);
        isValid = false;
      }
    }

    return {
      isValid,
      errors: Object.fromEntries(errors)
    };
  }

  validateRewardsRequest(laborTime, requestedReward) {
    const errors = [];

    if (laborTime) {
      if (isNaN(laborTime) || laborTime < 0 || laborTime > 1440) { // max 24 hours
        errors.push(this.i18next.t('validation.invalidLaborTime'));
      }
    }

    if (requestedReward) {
      if (isNaN(requestedReward) || requestedReward < 0) {
        errors.push(this.i18next.t('validation.invalidRewardAmount'));
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Helper method to show validation errors in the UI
  showValidationErrors(errors, formElement) {
    for (const [fieldName, fieldErrors] of Object.entries(errors)) {
      const field = formElement.querySelector(`[name="${fieldName}"]`);
      if (field) {
        field.classList.add('field-invalid');
        
        const errorContainer = field.parentElement.querySelector('.validation-message');
        if (errorContainer) {
          errorContainer.textContent = fieldErrors[0];
          errorContainer.style.display = 'block';
        }
      }
    }
  }

  // Clear validation errors from the UI
  clearValidationErrors(formElement) {
    const invalidFields = formElement.querySelectorAll('.field-invalid');
    invalidFields.forEach(field => {
      field.classList.remove('field-invalid');
      
      const errorContainer = field.parentElement.querySelector('.validation-message');
      if (errorContainer) {
        errorContainer.textContent = '';
        errorContainer.style.display = 'none';
      }
    });
  }
}

export default ValidationManager;
