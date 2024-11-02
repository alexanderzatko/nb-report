// form/FormManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import SelectManager from '../managers/SelectManager.js';
import PhotoManager from '../media/PhotoManager.js';
import Logger from '../utils/Logger.js';
import GPSManager from '../managers/GPSManager.js';

class FormManager {
  static instance = null;

  constructor() {
    if (FormManager.instance) {
      return FormManager.instance;
    }

    this.formConfig = {
      admin: {
        requiredFields: [
          {
            id: 'snow-depth-total',
            type: 'number',
            validationKey: 'form.validation.required'
          },
          {
            id: 'report-note',
            type: 'textarea',
            validationKey: 'form.validation.required'
          }
        ]
      },
      regular: {
        requiredFields: [
          {
            id: 'report-title',
            type: 'text',
            validationKey: 'form.validation.required'
          },
          {
            id: 'report-date',
            type: 'date',
            validationKey: 'form.validation.required'
          },
          {
            id: 'country',
            type: 'select',
            validationKey: 'form.validation.required'
          },
          {
            id: 'region',
            type: 'select',
            validationKey: 'form.validation.required'
          },
          {
            id: 'report-note',
            type: 'textarea',
            validationKey: 'form.validation.required'
          }
        ]
      }
    };

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

    if (document.getElementById('gps-track-section')) {
      await this.initializeGPSTrackSection();
    }

    await this.initializeGPXSection();

  }

  setupEventListeners() {
    console.log('Setting up form event listeners');
    // Clean up existing event listeners by cloning nodes
    const form = document.getElementById('snow-report-form');
    if (form) {
      console.log('Form found, cloning...');
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);
      newForm.addEventListener('submit', (event) => this.handleFormSubmit(event));

      console.log('About to initialize photo upload with force');
      this.photoManager.initializePhotoUpload(true);

      // Initialize photo manager with the new form
//      setTimeout(() => this.photoManager.initializePhotoUpload(), 0);
    }
  
    const cancelButton = document.getElementById('cancel-button');
    if (cancelButton) {
      const newCancelButton = cancelButton.cloneNode(true);
      cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);
      newCancelButton.addEventListener('click', () => this.handleCancel());
    }
  }
  
  initializeForm(userData) {
    this.logger.debug('Initializing form with user data:', userData);
    
    // Ensure we have the required elements
    const regularUserSection = document.getElementById('regular-user-section');
    const adminSection = document.getElementById('admin-section');
    const trailsSection = document.getElementById('trails-section');
    const rewardsSection = document.getElementById('rewards-section');

    if (!regularUserSection || !adminSection) {
      this.logger.error('Required form sections not found');
      return;
    }

    const isAdmin = userData?.ski_center_admin === "1";
    const hasTrails = userData?.trails && Array.isArray(userData.trails) && userData.trails.length > 0;
    
    this.logger.debug('User type:', { isAdmin, hasTrails });

    // Set visibility for regular user section
    regularUserSection.style.display = isAdmin ? 'none' : 'block';
    
    // Set visibility for admin section
    adminSection.style.display = isAdmin ? 'block' : 'none';
    
    // Set visibility for trails section
    if (trailsSection) {
      trailsSection.style.display = 'none';
      if (isAdmin && hasTrails) {
        trailsSection.style.display = 'block';
        this.initializeTrailsSection(userData.trails);
      }
    }

    // Set visibility for rewards section based on rovas_uid
    if (rewardsSection) {
      rewardsSection.style.display = 
        (userData?.rovas_uid && !isNaN(userData.rovas_uid)) ? 'block' : 'none';
    }

    // Initialize form fields based on user type
    const config = isAdmin ? this.formConfig.admin : this.formConfig.regular;
    this.initializeFormFields(config);

    this.logger.debug('Form sections visibility:', {
      regularUser: regularUserSection.style.display,
      admin: adminSection.style.display,
      trails: trailsSection?.style.display,
      rewards: rewardsSection?.style.display
    });
  }

  initializeFormFields(config) {
    config.requiredFields.forEach(field => {
      const element = document.getElementById(field.id);
      if (element) {
        element.required = true;
        element.setAttribute('data-i18n-validate', field.validationKey);
        this.addValidationClearingListener(element);
      }
    });
  }

  addValidationClearingListener(element) {
    element.addEventListener('input', () => {
      if (element.value.trim()) {
        element.classList.remove('field-invalid');
        const formGroup = element.closest('.form-group');
        if (formGroup) {
          formGroup.classList.remove('show-validation');
          const validationMessage = formGroup.querySelector('.validation-message');
          if (validationMessage) {
            validationMessage.textContent = '';
          }
        }
      }
    });
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

  async initializeGPSTrackSection() {
    const gpsManager = GPSManager.getInstance();
    const track = await gpsManager.loadLatestTrack();
    
    const gpsTrackSection = document.getElementById('gps-track-section');
    const trackLabel = document.getElementById('gps-track-label');
    const trackDetails = document.getElementById('gps-track-details');
    
    if (track && gpsTrackSection && trackLabel && trackDetails) {
        this.logger.debug('Track data:', track);  // Add debug logging
        
        const startDate = new Date(track.startTime);
        const endDate = new Date(track.endTime);
        
        // Format date properly
        const formattedDate = startDate.toLocaleDateString(this.i18next.language, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        // Calculate duration in milliseconds
        const durationMs = endDate.getTime() - startDate.getTime();
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const formattedDuration = `${hours}:${String(minutes).padStart(2, '0')}`;

        this.logger.debug('Formatted values:', {
            date: formattedDate,
            duration: formattedDuration,
            distance: Math.round(track.totalDistance)
        });
        
        trackLabel.textContent = this.i18next.t('form.gpsTrack.attachLabel', {
            date: formattedDate
        });
        
        trackDetails.textContent = this.i18next.t('form.gpsTrack.details', {
            distance: Math.round(track.totalDistance),
            duration: formattedDuration
        });
        
        gpsTrackSection.style.display = 'block';
    } else {
        gpsTrackSection.style.display = 'none';
    }
  }

  async initializeGPXSection() {
      const gpxSelect = document.getElementById('gpx-option');
      const existingOption = document.getElementById('existing-gpx-option');
      const uploadContainer = document.getElementById('gpx-upload-container');
      const gpsManager = GPSManager.getInstance();
  
      // Initialize visibility
      if (existingOption) {
          existingOption.hidden = !gpsManager.hasExistingTrack();
      }
  
      if (gpxSelect) {
          gpxSelect.addEventListener('change', (e) => {
              if (uploadContainer) {
                  uploadContainer.style.display = e.target.value === 'upload' ? 'block' : 'none';
              }
          });
      }
  
      // Also update visibility when track status changes
      window.addEventListener('gpx-imported', () => {
          if (existingOption) {
              existingOption.hidden = false;
          }
      });
  
      this.setupGPXUpload();
  }
  
  setupGPXUpload() {
      const gpxUploadBtn = document.getElementById('gpx-upload-btn');
      const gpxFileInput = document.getElementById('gpx-file-input');
      const confirmDialog = document.getElementById('gpx-confirm-dialog');
      const confirmReplace = document.getElementById('gpx-confirm-replace');
      const confirmCancel = document.getElementById('gpx-confirm-cancel');
      const existingOption = document.getElementById('existing-gpx-option');
      let pendingGPXFile = null;
  
      if (gpxUploadBtn) {
          gpxUploadBtn.addEventListener('click', () => {
              gpxFileInput.click();
          });
      }
  
      if (gpxFileInput) {
          gpxFileInput.accept = '.gpx,application/gpx+xml,application/xml';
          gpxFileInput.addEventListener('change', async (e) => {
              const file = e.target.files[0];
              if (!file) return;
  
              if (!file.name.endsWith('.gpx')) {
                  document.getElementById('gpx-error').textContent = 
                      this.i18next.t('form.gpx.errors.invalidFile');
                  return;
              }
  
              const gpsManager = GPSManager.getInstance();
              if (gpsManager.hasExistingTrack()) {
                  pendingGPXFile = file;
                  const trackStats = gpsManager.getTrackStats();
                  document.getElementById('existing-track-info').innerHTML = `
                      <p><strong>${this.i18next.t('form.gpx.currentTrack')}</strong><br>
                      ${trackStats.startTime.toLocaleDateString()} at ${trackStats.startTime.toLocaleTimeString()}<br>
                      Distance: ${trackStats.distance} km</p>
                  `;
                  confirmDialog.style.display = 'block';
              } else {
                  await this.processGPXFile(file);
                  if (existingOption) {
                      existingOption.hidden = false;
                  }
              }
          });
      }
  
      if (confirmReplace) {
          confirmReplace.addEventListener('click', async () => {
              if (pendingGPXFile) {
                  await this.processGPXFile(pendingGPXFile);
                  pendingGPXFile = null;
                  if (existingOption) {
                      existingOption.hidden = false;
                  }
              }
              confirmDialog.style.display = 'none';
          });
      }
  
      if (confirmCancel) {
          confirmCancel.addEventListener('click', () => {
              pendingGPXFile = null;
              confirmDialog.style.display = 'none';
              gpxFileInput.value = '';
          });
      }
  }
  
  async processGPXFile(file) {
      try {
          const content = await file.text();
          const gpsManager = GPSManager.getInstance();
          await gpsManager.importGPXFile(content);
          document.getElementById('gpx-filename').textContent = file.name;
          document.getElementById('gpx-error').textContent = '';
          document.getElementById('existing-gpx-option').style.display = 'block';
      } catch (error) {
          document.getElementById('gpx-error').textContent = 
              this.i18next.t('form.gpx.errors.processingError');
          document.getElementById('gpx-file-input').value = '';
      }
  }
  formatDuration(ms) {
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}:${String(minutes).padStart(2, '0')}`;
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
    // Set default text for unknown condition
    freeStyleValue.textContent = ': ' + this.i18next.t('form.trackConditions.0');
    
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
    // Set default text for unknown condition
    classicValue.textContent = ': ' + this.i18next.t('form.trackConditions.0');
    
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
    // Set default text for unknown condition
    maintenanceValue.textContent = ': ' + this.i18next.t('form.maintenance.unknown');
    
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
      // Add selected class for the default unknown condition
      if (condition.value === '0') {
        button.classList.add('selected');
        
        // Initialize trail conditions for this type
        if (!this.trailConditions[trailId]) {
          this.trailConditions[trailId] = {};
        }
        this.trailConditions[trailId][type] = '0';
      }
      button.dataset.value = condition.value;
      button.title = condition.title;
      
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
      // Add selected class for the default unknown condition
      if (option.value === '0') {
        button.classList.add('selected');
        
        // Initialize trail conditions for maintenance
        if (!this.trailConditions[trailId]) {
          this.trailConditions[trailId] = {};
        }
        this.trailConditions[trailId].maintenance = '0';
      }
      button.dataset.value = option.value;
      button.title = option.title;
      
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
      const isAdmin = document.getElementById('admin-section')?.style.display !== 'none';
      this.logger.debug('Is admin form:', isAdmin);

      const config = isAdmin ? this.formConfig.admin : this.formConfig.regular;
      const requiredFields = config.requiredFields.map(field => ({
        element: document.getElementById(field.id),
        required: true
      }));

      this.logger.debug('Found fields to validate:', requiredFields.length);

      let isValid = true;
      let firstInvalidElement = null;
      
      requiredFields.forEach(({element, required}) => {
        if (!element) {
          this.logger.warn('Required element not found in DOM');
          return;
        }

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
    
    // Determine which form type is visible
    const isAdmin = document.getElementById('admin-section')?.style.display !== 'none';
    
    // Get common fields that are visible
    const visibleData = this.collectVisibleData(isAdmin);
    
    // Add each visible field to FormData
    Object.entries(visibleData).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            formData.append(key, value);
        }
    });

    // Add trail conditions for admin
    if (isAdmin && Object.keys(this.trailConditions).length > 0) {
        formData.append('trailConditions', JSON.stringify(this.trailConditions));
    }

    // Add rewards data if rewards section is visible
    if (document.getElementById('rewards-section')?.style.display !== 'none') {
        this.collectRewardsData(formData);
    }

    const gpxOption = document.getElementById('gpx-option');
    if (gpxOption && gpxOption.value !== 'none') {
        const gpsManager = GPSManager.getInstance();
        if (gpsManager.hasExistingTrack()) {
            formData.append('gpx', gpsManager.exportGPX());
        }
    }

    return formData;
  }

  collectVisibleData(isAdmin) {
      const data = {};
      
      if (isAdmin) {
          // Admin form fields
          const snowDepthTotal = document.getElementById('snow-depth-total')?.value;
          const snowDepthNew = document.getElementById('snow-depth-new')?.value;
          const note = document.getElementById('report-note')?.value;
          
          if (snowDepthTotal) data.snowDepthTotal = snowDepthTotal;
          if (snowDepthNew) data.snowDepthNew = snowDepthNew;
          if (note) data.note = note;
          
          // Common dropdowns that are visible in admin form
          const snowType = document.getElementById('snow-type')?.value;
          if (snowType) data.snowType = snowType;
          
      } else {
          // Regular user form fields
          const fields = {
              'report-title': 'reportTitle',
              'report-date': 'reportDate',
              'country': 'country',
              'region': 'region',
              'snow-depth250': 'snowDepth250',
              'snow-depth500': 'snowDepth500',
              'snow-depth750': 'snowDepth750',
              'snow-depth1000': 'snowDepth1000',
              'report-note': 'note'
          };
          
          Object.entries(fields).forEach(([elementId, dataKey]) => {
              const element = document.getElementById(elementId);
              if (element && element.style.display !== 'none' && element.value) {
                  data[dataKey] = element.value;
              }
          });
          
          // Add snow conditions for regular user form
          const conditions = ['classic-style', 'free-style', 'snow-age', 'wetness'];
          conditions.forEach(id => {
              const element = document.getElementById(id);
              if (element && element.style.display !== 'none' && element.value) {
                  data[id.replace('-', '')] = element.value;
              }
          });
      }
      
      return data;
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
      const rewardsSection = document.getElementById('rewards-section');
      if (rewardsSection?.style.display !== 'none') {
          const laborTime = document.getElementById('labor-time')?.value;
          const rewardRequested = document.getElementById('reward-requested')?.value;
          
          if (laborTime) formData.append('laborTime', laborTime);
          if (rewardRequested) formData.append('rewardRequested', rewardRequested);
      }
  }
  
  async submitFormData(formData) {
      // Convert FormData to a regular object for logging
      const formDataObject = {};
      formData.forEach((value, key) => {
          // Handle File objects specially
          if (value instanceof File) {
              formDataObject[key] = {
                  type: 'File',
                  name: value.name,
                  size: value.size,
                  lastModified: value.lastModified
              };
          } else {
              // Handle regular form data
              formDataObject[key] = value;
          }
      });
  
      // Get photos if photo section is visible
      const photoSection = document.querySelector('.photos-section');
      const photoInfo = [];
      if (photoSection?.style.display !== 'none') {
          const photos = this.photoManager.getPhotos();
          photos.forEach(photo => {
              photoInfo.push({
                  name: photo.file.name,
                  size: photo.file.size,
                  caption: photo.caption
              });
          });
      }
  
      // Log the complete form submission data
      console.group('Form Submission Data');
      console.log('Form Fields:', formDataObject);
      if (formDataObject.trailConditions) {
          console.log('Trail Conditions:', JSON.parse(formDataObject.trailConditions));
      }
      if (photoInfo.length > 0) {
          console.log('Photos:', photoInfo);
      }
      
      // If GPS track is included, log it
      const includeGPX = document.getElementById('include-gpx');
      if (includeGPX?.checked && includeGPX.style.display !== 'none') {
          const gpsManager = GPSManager.getInstance();
          if (gpsManager.hasExistingTrack()) {
              console.log('GPS Track included:', true);
              console.log('GPX Data:', gpsManager.exportGPX());
          }
      }
      console.groupEnd();
  
      // For now, return a successful response
      return {
          success: true,
          message: 'Form data logged to console'
      };
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
      
      // Clear select manager state
      this.selectManager.clearState();
      
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
