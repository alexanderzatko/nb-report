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
    this.isSubmitting = false;

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
    // Clean up existing event listeners by cloning nodes
    const form = document.getElementById('snow-report-form');
    if (form) {
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);
      newForm.addEventListener('submit', (event) => this.handleFormSubmit(event));
    }
  
    const cancelButton = document.getElementById('cancel-button');
    if (cancelButton) {
      const newCancelButton = cancelButton.cloneNode(true);
      cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);
      newCancelButton.addEventListener('click', () => this.handleCancel());
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
      
      if (isAdmin) {
        // Configure admin form fields
        const snowDepthTotal = document.getElementById('snow-depth-total');
        const snowDepthNew = document.getElementById('snow-depth-new');
        const reportNote = document.getElementById('report-note');
        
        if (snowDepthTotal) {
          snowDepthTotal.required = true;
          console.log('Set snow-depth-total as required');
        }
        
        if (snowDepthNew) {
          snowDepthNew.required = false;
          console.log('Set snow-depth-new as NOT required');
        }
        
        if (reportNote) {
          reportNote.required = true;
          console.log('Set report-note as required');
        }
      }
    }
    
    if (trailsSection) {
      trailsSection.style.display = 'none';
      if (isAdmin && hasTrails) {
        trailsSection.style.display = 'block';
        this.initializeTrailsSection(userData.trails);
      }
    }

    // Set up form validation
    this.setupFormValidation();
  }

  setupFormValidation() {
    const form = document.querySelector('form');
    if (!form) return;

    // Prevent default form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      return false;
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
    
    // Trail name header
    const nameDiv = document.createElement('div');
    nameDiv.className = 'trail-name';
    nameDiv.textContent = trailName;
    div.appendChild(nameDiv);
  
    // Free Style condition
    const freeStyleGroup = document.createElement('div');
    freeStyleGroup.className = 'condition-group';
    
    const freeStyleHeader = document.createElement('div');
    freeStyleHeader.className = 'condition-header';
    
    const freeStyleLabel = document.createElement('span');
    freeStyleLabel.className = 'condition-label';
    freeStyleLabel.textContent = this.i18next.t('form.freeStyle');
    
    const freeStyleValue = document.createElement('span');
    freeStyleValue.className = 'selected-value';
    freeStyleValue.dataset.forType = 'free';
    
    freeStyleHeader.appendChild(freeStyleLabel);
    freeStyleHeader.appendChild(freeStyleValue);
    
    const freeStyleButtons = document.createElement('div');
    freeStyleButtons.className = 'condition-buttons';
    
    this.createConditionButtons(freeStyleButtons, freeStyleValue, trailId, 'free');
    
    freeStyleGroup.appendChild(freeStyleHeader);
    freeStyleGroup.appendChild(freeStyleButtons);
    div.appendChild(freeStyleGroup);
  
    // Classic Style condition
    const classicGroup = document.createElement('div');
    classicGroup.className = 'condition-group';
    
    const classicHeader = document.createElement('div');
    classicHeader.className = 'condition-header';
    
    const classicLabel = document.createElement('span');
    classicLabel.className = 'condition-label';
    classicLabel.textContent = this.i18next.t('form.classicStyle');
    
    const classicValue = document.createElement('span');
    classicValue.className = 'selected-value';
    classicValue.dataset.forType = 'classic';
    
    classicHeader.appendChild(classicLabel);
    classicHeader.appendChild(classicValue);
    
    const classicButtons = document.createElement('div');
    classicButtons.className = 'condition-buttons';
    
    this.createConditionButtons(classicButtons, classicValue, trailId, 'classic');
    
    classicGroup.appendChild(classicHeader);
    classicGroup.appendChild(classicButtons);
    div.appendChild(classicGroup);
  
    // Next Maintenance Section
    const maintenanceGroup = document.createElement('div');
    maintenanceGroup.className = 'condition-group';
    
    const maintenanceHeader = document.createElement('div');
    maintenanceHeader.className = 'condition-header';
    
    const maintenanceLabel = document.createElement('span');
    maintenanceLabel.className = 'condition-label';
    maintenanceLabel.textContent = this.i18next.t('form.nextMaintenance');
    
    const maintenanceValue = document.createElement('span');
    maintenanceValue.className = 'selected-value';
    maintenanceValue.dataset.forType = 'maintenance';
    
    maintenanceHeader.appendChild(maintenanceLabel);
    maintenanceHeader.appendChild(maintenanceValue);
    
    const maintenanceButtons = document.createElement('div');
    maintenanceButtons.className = 'condition-buttons';
    
    this.createMaintenanceButtons(maintenanceButtons, maintenanceValue, trailId);
    
    maintenanceGroup.appendChild(maintenanceHeader);
    maintenanceGroup.appendChild(maintenanceButtons);
    div.appendChild(maintenanceGroup);
  
    return div;
  }

  createConditionButtons(container, valueDisplay, trailId, type) {
  	const conditions = [
  	  { value: '0', label: '?', title: this.i18next.t('form.trackConditions.0') },
  	  { value: '1', label: '★★★', title: this.i18next.t('form.trackConditions.1') },
  	  { value: '2', label: '★★', title: this.i18next.t('form.trackConditions.2') },
  	  { value: '3', label: '★', title: this.i18next.t('form.trackConditions.3') },
  	  { value: '4', label: '∥', title: this.i18next.t('form.trackConditions.4') },
  	  { value: '5', label: 'x', title: this.i18next.t('form.trackConditions.5') }
  	];
  
    conditions.forEach(condition => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'condition-btn';
      button.dataset.value = condition.value;
      button.title = condition.title;
      
      // Create text container
      const textSpan = document.createElement('span');
      textSpan.className = 'condition-btn-text';
      textSpan.textContent = condition.label;
      button.appendChild(textSpan);
      
      button.addEventListener('click', () => {
        container.querySelectorAll('.condition-btn').forEach(btn => {
          btn.classList.remove('selected');
        });
        button.classList.add('selected');
        valueDisplay.textContent = ': ' + condition.title;
        
        if (!this.trailConditions[trailId]) {
          this.trailConditions[trailId] = {};
        }
        this.trailConditions[trailId][type] = condition.value;
      });
  
      // Add resize observer to handle text scaling
      const resizeObserver = new ResizeObserver(() => {
        this.scaleTextToFit(textSpan);
      });
      resizeObserver.observe(button);
      
      container.appendChild(button);
    });
  }
  
  createMaintenanceButtons(container, valueDisplay, trailId) {
      const options = [
        { value: '0', label: '?', title: this.i18next.t('form.maintenance.unknown') },
        { value: '1', label: '1', title: this.i18next.t('form.maintenance.today') },
        { value: '2', label: '2', title: this.i18next.t('form.maintenance.tomorrow') },
        { value: '3+', label: '3+', title: this.i18next.t('form.maintenance.laterDays') },
        { value: 'Ps', label: 'Ps', title: this.i18next.t('form.maintenance.fridaySaturday') },
        { value: 'snow', label: '❄', title: this.i18next.t('form.maintenance.afterSnow') }
      ];
  
    options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'condition-btn';
      button.dataset.value = option.value;
      button.title = option.title;
      
      // Create text container
      const textSpan = document.createElement('span');
      textSpan.className = 'condition-btn-text';
      textSpan.textContent = option.label;
      button.appendChild(textSpan);
      
      button.addEventListener('click', () => {
        container.querySelectorAll('.condition-btn').forEach(btn => {
          btn.classList.remove('selected');
        });
        button.classList.add('selected');
        valueDisplay.textContent = ': ' + option.title;
        
        if (!this.trailConditions[trailId]) {
          this.trailConditions[trailId] = {};
        }
        this.trailConditions[trailId].maintenance = option.value;
      });
  
      // Add resize observer to handle text scaling
      const resizeObserver = new ResizeObserver(() => {
        this.scaleTextToFit(textSpan);
      });
      resizeObserver.observe(button);
      
      container.appendChild(button);
    });
  }

  //used to make the button labels to fit the button for the trails section
  scaleTextToFit(textElement) {
    const button = textElement.parentElement;
    const buttonWidth = button.clientWidth - 4; // Account for padding
    const buttonHeight = button.clientHeight - 4;
    
    // Reset scale to measure original size
    textElement.style.transform = 'scale(1)';
    const textWidth = textElement.scrollWidth;
    const textHeight = textElement.scrollHeight;
    
    // Calculate scale factors for both dimensions
    const scaleX = buttonWidth / textWidth;
    const scaleY = buttonHeight / textHeight;
    
    // Use the smaller scale factor to ensure text fits in both dimensions
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up past original size
    
    // Apply the scaling
    textElement.style.transform = `scale(${scale})`;
  }
    
  initializeFormValidation() {
    console.log('Initializing form validation');
    // Select all required inputs and textareas
    const inputs = document.querySelectorAll('input[required], textarea[required], select[required], [data-i18n-validate]');
    
    inputs.forEach(input => {    
      // Set custom validation message
      input.addEventListener('invalid', (e) => {
        e.preventDefault();
        const formGroup = input.closest('.form-group');
        
        if (!input.value) {
          const requiredMsg = this.i18next.t(input.dataset.i18nValidate || 'form.validation.required');
          input.setCustomValidity(requiredMsg);
          
          if (formGroup) {
            const validationMessage = formGroup.querySelector('.validation-message');
            if (validationMessage) {
              validationMessage.textContent = requiredMsg;
            }
            
            formGroup.classList.add('show-validation');
            input.classList.add('field-invalid');
          }
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
          const requiredMsg = this.i18next.t(input.dataset.i18nValidate || 'form.validation.required');
          
          input.setCustomValidity(requiredMsg);
          input.classList.add('field-invalid');
          
          if (formGroup) {
            formGroup.classList.add('show-validation');
            const validationMessage = formGroup.querySelector('.validation-message');
            if (validationMessage) {
              validationMessage.textContent = requiredMsg;
            }
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
    event.stopPropagation();
  
    if (this.isSubmitting) {
      this.logger.debug('Form submission already in progress');
      return;
    }
  
    this.isSubmitting = true;
    this.logger.debug('Form submission started');
  
    try {
      // Identify admin vs regular user form
      const isAdmin = document.getElementById('admin-section')?.style.display !== 'none';
      this.logger.debug('Is admin form:', isAdmin);
  
      let requiredFields = [];
      if (isAdmin) {
        requiredFields = [
          {
            element: document.getElementById('snow-depth-total'),
            required: true
          },
          {
            element: document.getElementById('report-note'),
            required: true
          }
        ];
      } else {
        // Using the same explicit approach for regular user fields
        requiredFields = [
          {
            element: document.getElementById('report-title'),
            required: true
          },
          {
            element: document.getElementById('report-date'),
            required: true
          },
          {
            element: document.getElementById('country'),
            required: true
          },
          {
            element: document.getElementById('region'),
            required: true
          },
          {
            element: document.getElementById('classic-style'),
            required: true
          },
          {
            element: document.getElementById('free-style'),
            required: true
          },
          {
            element: document.getElementById('snow-depth250'),
            required: true
          },
          {
            element: document.getElementById('snow-depth500'),
            required: true
          },
          {
            element: document.getElementById('snow-depth750'),
            required: true
          },
          {
            element: document.getElementById('snow-depth1000'),
            required: true
          },
          {
            element: document.getElementById('report-note'),
            required: true
          }
        ];
      }
  
      this.logger.debug('Found fields to validate:', requiredFields.length);
      
      let isValid = true;
      let firstInvalidElement = null;
  
      requiredFields.forEach(({element, required}) => {
        if (!element) {
          this.logger.warn('Required element not found in DOM');
          return;
        }
  
        this.logger.debug('Validating element:', {
          id: element.id,
          type: element.type || element.tagName.toLowerCase(),
          required,
          value: element.value,
          validity: element.validity
        });
  
        if (required && !element.value.trim()) {
          isValid = false;
          element.classList.add('field-invalid');
          
          const formGroup = element.closest('.form-group');
          if (formGroup) {
            formGroup.classList.add('show-validation');
            const validationMessage = formGroup.querySelector('.validation-message');
            if (validationMessage) {
              validationMessage.textContent = this.i18next.t('form.validation.required');
            }
          }
          
          if (!firstInvalidElement) {
            firstInvalidElement = element;
            this.logger.debug('First invalid element:', {
              id: element.id,
              type: element.type || element.tagName.toLowerCase(),
              offsetTop: element.offsetTop
            });
          }
        }
      });
  
      this.logger.debug('Form validation result:', isValid);
      if (!isValid && firstInvalidElement) {
        this.logger.debug('Scrolling to first invalid element:', firstInvalidElement.id);
        firstInvalidElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center'
        });
        setTimeout(() => firstInvalidElement.focus(), 500);
        this.isSubmitting = false;
        return;
      }
  
      // Continue with form submission if validation passes
      const formData = this.collectFormData();
      await this.submitFormData(formData);
      this.stopTrackingFormTime();
      this.showSuccess(this.i18next.t('form.validation.submitSuccess'));
      this.resetForm();
  
    } catch (error) {
      this.logger.error('Error submitting snow report:', error);
      this.showError(this.i18next.t('form.validation.submitError'));
    } finally {
      this.isSubmitting = false;
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
      const snowDepthTotal = document.getElementById('snow-depth-total')?.value;
      const snowDepthNew = document.getElementById('snow-depth-new')?.value;
      
      if (snowDepthTotal) formData.append('snowDepthTotal', snowDepthTotal);
      if (snowDepthNew) formData.append('snowDepthNew', snowDepthNew); // Optional field
      formData.append('trailConditions', JSON.stringify(this.trailConditions));
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
      this.photoManager.clearPhotos();
      this.stopTrackingFormTime();
      this.formStartTime = null;
      
      const hoursElement = document.getElementById('elapsed-hours');
      const minutesElement = document.getElementById('elapsed-minutes');
      const secondsElement = document.getElementById('elapsed-seconds');
      if (hoursElement) hoursElement.textContent = '00';
      if (minutesElement) minutesElement.textContent = '00';
      if (secondsElement) secondsElement.textContent = '00';
      
      const selectedButtons = document.querySelectorAll('.condition-btn.selected');
      selectedButtons.forEach(button => button.classList.remove('selected'));

      form.style.display = 'none';
      const dashboardContainer = document.getElementById('dashboard-container');
      if (dashboardContainer) {
        dashboardContainer.style.display = 'block';
      }
    }
  }

  showSuccess(message) {
    alert(message);
  }

  showError(message) {
    alert(message);
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
