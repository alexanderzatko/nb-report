// form/FormManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';

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
    this.dropdownManager = new DropdownManager(i18next);
    this.photoManager = PhotoManager.getInstance();

    this.initialize();
    this.setupEventListeners();
    
    FormManager.instance = this;
  }

  static getInstance() {
    if (!FormManager.instance) {
      FormManager.instance = new FormManager();
    }
    return FormManager.instance;
  }

  async initialize() {
    this.initializeFormValidation();
    this.initializeDatePicker();
    await this.dropdownManager.initialize(); // Initialize dropdowns
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
        }
      });
      
      // Clear custom validation on input
      input.addEventListener('input', () => {
        input.setCustomValidity('');
        const formGroup = input.closest('.form-group');
        if (formGroup) {
          formGroup.classList.remove('show-validation');
          input.classList.remove('field-invalid');
        }
      });

      // Handle blur event
      input.addEventListener('blur', () => {
        if (input.checkValidity()) {
          input.classList.remove('field-invalid');
          const formGroup = input.closest('.form-group');
          if (formGroup) {
            formGroup.classList.remove('show-validation');
          }
        }
      });
    });
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

  setupEventListeners() {
    const form = document.getElementById('snow-report-form');
    if (form) {
      form.addEventListener('submit', (event) => this.handleFormSubmit(event));
    }
  
    const cancelButton = document.getElementById('cancel-button');
    if (cancelButton) {
      cancelButton.addEventListener('click', () => this.handleCancel());
    }
  
    // Initialize photo upload listeners
    const selectPhotosBtn = document.getElementById('select-photos');
    const takePhotoBtn = document.getElementById('take-photo');
    const fileInput = document.getElementById('photo-file-input');
    const cameraInput = document.getElementById('camera-input');
  
    if (selectPhotosBtn && fileInput) {
      selectPhotosBtn.addEventListener('click', () => fileInput.click());
    }
    if (takePhotoBtn && cameraInput) {
      takePhotoBtn.addEventListener('click', () => cameraInput.click());
    }
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.photoManager.handleFiles(e.target.files));
    }
    if (cameraInput) {
      cameraInput.addEventListener('change', (e) => this.photoManager.handleFiles(e.target.files));
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
        if (!firstInvalidElement) {
          firstInvalidElement = element;
        }
      } else {
        element.classList.remove('field-invalid');
      }
    });

    console.log('Form validation result:', isValid);
    if (!isValid && firstInvalidElement) {
      firstInvalidElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

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
    
    // Common fields
    formData.append('snowType', document.getElementById('snow-type').value);
    formData.append('note', document.getElementById('report-note').value);
    
    const isAdmin = document.getElementById('admin-section').style.display !== 'none';
    
    if (isAdmin) {
      // Admin-specific fields
      formData.append('snowDepthTotal', document.getElementById('snow-depth-total').value);
      formData.append('snowDepthNew', document.getElementById('snow-depth-new').value);
      formData.append('trailConditions', JSON.stringify(this.trailConditions));
    } else {
      // Regular user fields
      formData.append('classicStyle', document.getElementById('classic-style').value);
      formData.append('freeStyle', document.getElementById('free-style').value);
      formData.append('country', document.getElementById('country').value);
      formData.append('region', document.getElementById('region').value);
      formData.append('reportDate', document.getElementById('report-date').value);
      formData.append('snowDepth250', document.getElementById('snow-depth250').value);
      formData.append('snowDepth500', document.getElementById('snow-depth500').value);
      formData.append('snowDepth750', document.getElementById('snow-depth750').value);
      formData.append('snowDepth1000', document.getElementById('snow-depth1000').value);
    }

    // Add photos to form data
    const photos = this.photoManager.getPhotos();
    photos.forEach((photo, index) => {
        formData.append(`photo${index}`, photo);
    });

    // Rewards section fields
    const laborTime = document.getElementById('labor-time');
    const rewardRequested = document.getElementById('reward-requested');
    
    if (laborTime) {
      formData.append('laborTime', laborTime.value);
    }
    if (rewardRequested) {
      formData.append('rewardRequested', rewardRequested.value);
    }

    return formData;
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
          
          // Reset photos using PhotoManager
          this.photoManager.clearPhotos();
          
          // Reset elapsed time
          this.stopTrackingFormTime();
          
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
