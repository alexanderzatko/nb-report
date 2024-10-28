// form/FormManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import SelectManager from '../managers/SelectManager.js';
import PhotoManager from '../media/PhotoManager.js';
import Logger from '../utils/Logger.js';

class FormManager {
  static instance = null;

  constructor() {
    if (FormManager.instance) {
      return FormManager.instance;
    }
    this.i18next = i18next;
    this.trailConditions = {};
    this.formStartTime = null;
    this.elapsedTimeInterval = null;
    this.selectManager = SelectManager.getInstance();
    this.photoManager = PhotoManager.getInstance();
    this.logger = Logger.getInstance();

    FormManager.instance = this;
  }

  static getInstance() {
      if (!FormManager.instance) {
          FormManager.instance = new FormManager();
      }
      return FormManager.instance;
  }

  async initialize() {
    console.log('Initializing FormManager');
    
    if (!this.i18next.isInitialized) {
      console.log('Waiting for i18next to initialize...');
      await new Promise(resolve => {
        this.i18next.on('initialized', resolve);
      });
    }
    
    this.initializeFormValidation();
    this.initializeDatePicker();
    this.setupEventListeners();
    
    // Initialize photo upload functionality
    this.photoManager.initializePhotoUpload();
  }

  setupEventListeners() {
    const form = document.getElementById('snow-report-form');
    if (form) {
      form.addEventListener('submit', (event) => this.handleFormSubmit(event));
    }

    const cancelButton = document.getElementById('cancel-button');
    if (cancelButton) {
      cancelButton.addEventListener('click', () => this.handleCancel());
    }
  }
  
  initializeForm(userData) {
    console.log('Initializing form with user data:', userData);
    const isAdmin = userData?.ski_center_admin === "1";
    const hasTrails = userData?.trails && Array.isArray(userData.trails) && userData.trails.length > 0;
    
    const regularUserSection = document.getElementById('regular-user-section');
    const adminSection = document.getElementById('admin-section');
    const trailsSection = document.getElementById('trails-section');

    if (regularUserSection) {
      regularUserSection.style.display = isAdmin ? 'none' : 'block';
    }
    if (adminSection) {
      adminSection.style.display = isAdmin ? 'block' : 'none';
    }
    
    if (trailsSection) {
      trailsSection.style.display = 'none';
      if (isAdmin && hasTrails) {
        trailsSection.style.display = 'block';
        this.initializeTrailsSection(userData.trails);
      }
    }
    
    console.log('Form initialization complete:', {
      isAdmin,
      hasTrails,
      trails: userData?.trails
    });
  }

  initializeTrailsSection(trails) {
    const container = document.getElementById('trails-container');
    if (!container) return;

    container.innerHTML = '';
    
    trails.forEach(([trailId, trailName]) => {
      const trailElement = this.createTrailElement(trailId, trailName);
      container.appendChild(trailElement);
    });
  }

  createTrailElement(trailId, trailName) {
    const div = document.createElement('div');
    div.className = 'trail-item';
    div.dataset.trailId = trailId;
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'trail-name';
    nameDiv.textContent = trailName;
    div.appendChild(nameDiv);
    
    return div;
  }
  
  initializeFormValidation() {
    console.log('Initializing form validation');
    const inputs = document.querySelectorAll('[data-i18n-validate]');
    
    inputs.forEach(input => {    
      // Set custom validation message
      input.addEventListener('invalid', (e) => {
        e.preventDefault();
        const formGroup = input.closest('.form-group');
        
        if (!input.value) {
          const requiredMsg = this.i18next.t(input.dataset.i18nValidate);
          input.setCustomValidity(requiredMsg);
          
          const validationMessage = formGroup.querySelector('.validation-message');
          if (validationMessage) {
            validationMessage.textContent = requiredMsg;
          }
          
          formGroup.classList.add('show-validation');
          input.classList.add('field-invalid');
        }
      });
      
      // Clear custom validation on input/change
      const clearValidation = () => {
        input.setCustomValidity('');
        const formGroup = input.closest('.form-group');
        if (formGroup) {
          formGroup.classList.remove('show-validation');
          input.classList.remove('field-invalid');
        }
      };

      input.addEventListener('input', clearValidation);
      input.addEventListener('change', clearValidation);

      // Handle blur event
      input.addEventListener('blur', () => {
        if (!input.value && input.required) {
          const formGroup = input.closest('.form-group');
          const requiredMsg = this.i18next.t(input.dataset.i18nValidate);
          
          input.setCustomValidity(requiredMsg);
          input.classList.add('field-invalid');
          
          if (formGroup) {
            formGroup.classList.add('show-validation');
            const validationMessage = formGroup.querySelector('.validation-message');
            if (validationMessage) {
              validationMessage.textContent = requiredMsg;
            }
          }
        } else if (input.checkValidity()) {
          input.classList.remove('field-invalid');
          const formGroup = input.closest('.form-group');
          if (formGroup) {
            formGroup.classList.remove('show-validation');
          }
        }
      });
    });

    // Add specific validation for country/region dependency
    const countrySelect = document.getElementById('country');
    const regionSelect = document.getElementById('region');

    if (countrySelect && regionSelect) {
      countrySelect.addEventListener('change', () => {
        // When country changes, validate region if it's empty
        if (!regionSelect.value && regionSelect.required) {
          const formGroup = regionSelect.closest('.form-group');
          const requiredMsg = this.i18next.t(regionSelect.dataset.i18nValidate);
          
          regionSelect.setCustomValidity(requiredMsg);
          regionSelect.classList.add('field-invalid');
          
          if (formGroup) {
            formGroup.classList.add('show-validation');
            const validationMessage = formGroup.querySelector('.validation-message');
            if (validationMessage) {
              validationMessage.textContent = requiredMsg;
            }
          }
        }
      });
    }
  }


  initializeDatePicker() {
    const dateInput = document.getElementById('report-date');
    if (dateInput) {
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0];
      dateInput.value = formattedDate;
      dateInput.max = formattedDate;
    }
  }

  startTrackingFormTime() {
    if (!this.formStartTime) {
      this.formStartTime = new Date();
      this.elapsedTimeInterval = setInterval(() => this.updateElapsedTime(), 1000);
    }
  }

  stopTrackingFormTime() {
    if (this.elapsedTimeInterval) {
      clearInterval(this.elapsedTimeInterval);
      this.elapsedTimeInterval = null;
    }
    this.formStartTime = null;
  }

  updateElapsedTime() {
    if (!this.formStartTime) return;
    
    const now = new Date();
    const diff = Math.floor((now - this.formStartTime) / 1000);
    
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    
    document.getElementById('elapsed-hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('elapsed-minutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('elapsed-seconds').textContent = String(seconds).padStart(2, '0');
  }

  async handleFormSubmit(event) {
    event.preventDefault();
    console.log('Form submission started');

    // Manual validation
    const formElements = event.target.querySelectorAll('[data-i18n-validate]');
    console.log('Found form elements to validate:', formElements.length);
    
    let isValid = true;
    let firstInvalidElement = null;
    
    formElements.forEach(element => {
      if (!element.checkValidity()) {
        isValid = false;
        element.classList.add('field-invalid');
        
        const formGroup = element.closest('.form-group');
        if (formGroup) {
          formGroup.classList.add('show-validation');
          const validationMessage = formGroup.querySelector('.validation-message');
          if (validationMessage) {
            validationMessage.textContent = this.i18next.t(element.dataset.i18nValidate);
          }
        }
        
        if (!firstInvalidElement) {
          firstInvalidElement = element;
        }
      } else {
        element.classList.remove('field-invalid');
        const formGroup = element.closest('.form-group');
        if (formGroup) {
          formGroup.classList.remove('show-validation');
        }
      }
    });

    console.log('Form validation result:', isValid);
    if (!isValid && firstInvalidElement) {
      firstInvalidElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Continue with form submission if validation passes
    try {
      const formData = this.collectFormData();
      await this.submitFormData(formData);
      this.stopTrackingFormTime();
      alert(this.i18next.t('form.validation.submitSuccess'));
      this.resetForm();
    } catch (error) {
      console.error('Error submitting snow report:', error);
      alert(this.i18next.t('form.validation.submitError'));
    }
  }

  collectFormData() {
    const formData = new FormData();
    const selectValues = this.selectManager.getSelectedValues();
    
    // Add select values to form data
    Object.entries(selectValues).forEach(([key, value]) => {
      if (value) formData.append(key, value);
    });
    
    // Add other form data
    const noteElement = document.getElementById('report-note');
    if (noteElement) formData.append('note', noteElement.value);
    
    const isAdmin = document.getElementById('admin-section')?.style.display !== 'none';
    
    if (isAdmin) {
      this.collectAdminFormData(formData);
    } else {
      this.collectRegularUserFormData(formData);
    }

    this.collectRewardsData(formData);
    
    return formData;
  }

  collectAdminFormData(formData) {
    const snowDepthTotal = document.getElementById('snow-depth-total')?.value;
    const snowDepthNew = document.getElementById('snow-depth-new')?.value;
    
    if (snowDepthTotal) formData.append('snowDepthTotal', snowDepthTotal);
    if (snowDepthNew) formData.append('snowDepthNew', snowDepthNew);
    formData.append('trailConditions', JSON.stringify(this.trailConditions));
  }

  collectRegularUserFormData(formData) {
    const fields = ['report-date', 'snow-depth250', 'snow-depth500', 'snow-depth750', 'snow-depth1000'];
    fields.forEach(field => {
      const element = document.getElementById(field);
      if (element?.value) {
        formData.append(field.replace('-', ''), element.value);
      }
    });
  }

  collectRewardsData(formData) {
    const laborTime = document.getElementById('labor-time')?.value;
    const rewardRequested = document.getElementById('reward-requested')?.value;
    
    if (laborTime) formData.append('laborTime', laborTime);
    if (rewardRequested) formData.append('rewardRequested', rewardRequested);
  }
  
  async submitFormData(formData) {
    const response = await fetch('/api/submit-snow-report', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Failed to submit report');
    }

    return response.json();
  }

  handleCancel() {
    this.stopTrackingFormTime();
    this.resetForm();
    document.getElementById('dashboard-container').style.display = 'block';
    document.getElementById('snow-report-form').style.display = 'none';
  }

  resetForm() {
    const form = document.getElementById('snow-report-form');
    if (form) {
      form.reset();
      this.trailConditions = {};
      
      // Reset photo previews using PhotoManager
      this.photoManager.clearPhotos();
      
      // Reset elapsed time and stop tracking
      this.stopTrackingFormTime();
      this.formStartTime = null;
      
      // Reset time display
      const hoursElement = document.getElementById('elapsed-hours');
      const minutesElement = document.getElementById('elapsed-minutes');
      const secondsElement = document.getElementById('elapsed-seconds');
      if (hoursElement) hoursElement.textContent = '00';
      if (minutesElement) minutesElement.textContent = '00';
      if (secondsElement) secondsElement.textContent = '00';
      
      // Reset trail conditions UI
      const selectedButtons = document.querySelectorAll('.condition-btn.selected');
      selectedButtons.forEach(button => button.classList.remove('selected'));
    }
  }

  handleConditionSelection(trailId, type, value, buttonGroup) {
    // Remove selection from all buttons in the group
    buttonGroup.querySelectorAll('.condition-btn').forEach(btn => {
      btn.classList.remove('selected');
    });

    // Select the clicked button
    const selectedButton = buttonGroup.querySelector(`[data-value="${value}"]`);
    if (selectedButton) {
      selectedButton.classList.add('selected');
    }

    // Store the selection
    if (!this.trailConditions[trailId]) {
      this.trailConditions[trailId] = {};
    }
    this.trailConditions[trailId][type] = value;
  }

  validateField(input) {
    const validity = input.validity;
    
    if (validity.valueMissing) {
      return this.i18next.t(input.dataset.i18nValidate);
    }
    
    if (input.type === 'number') {
      const value = Number(input.value);
      const min = Number(input.min);
      const max = Number(input.max);
      
      if (value < min) {
        return this.i18next.t(input.dataset.i18nValidateMin, { min: min });
      }
      if (value > max) {
        return this.i18next.t(input.dataset.i18nValidateMax, { max: max });
      }
    }
    
    return '';
  }

  getFormData() {
    return this.trailConditions;
  }
}

export default FormManager;
