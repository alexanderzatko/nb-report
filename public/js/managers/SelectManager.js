// managers/SelectManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import Logger from '../utils/Logger.js';

class SelectManager {
  static instance = null;

  constructor() {
    if (SelectManager.instance) {
      return SelectManager.instance;
    }

    this.i18next = i18next;
    this.logger = Logger.getInstance();
    this.data = {
      locations: null,
      xcConditions: null
    };
    this.loadingPromises = {};
    this.selectedValues = {};
    
    SelectManager.instance = this;
  }

  static getInstance() {
    if (!SelectManager.instance) {
      SelectManager.instance = new SelectManager();
    }
    return SelectManager.instance;
  }

  async initialize() {
    this.logger.debug('SelectManager: Initializing...');
    try {
      // Wait for i18next to be ready if it's not already
      if (!this.i18next.isInitialized) {
        this.logger.debug('Waiting for i18next to initialize...');
        await new Promise(resolve => {
          this.i18next.on('initialized', resolve);
        });
      }

      // Load data
      await Promise.all([
        this.loadLocationData(),
        this.loadXCData()
      ]);

      this.setupLanguageListeners();
      this.setupEventListeners();
      await this.refreshAllDropdowns();
      
      this.logger.debug('SelectManager: Initialization complete');
      return true;
    } catch (error) {
      this.logger.error('SelectManager: Initialization error:', error);
      throw error;
    }
  }

  setupLanguageListeners() {
    this.i18next.on('languageChanged', (lng) => {
      this.logger.debug('SelectManager: Language changed to:', lng);
      this.refreshAllDropdowns().catch(error => {
        this.logger.error('SelectManager: Error refreshing dropdowns:', error);
      });
    });
  }

  setupEventListeners() {
    const countrySelect = document.getElementById('country');
    if (countrySelect) {
      countrySelect.addEventListener('change', () => {
        this.selectedValues.country = countrySelect.value;
        this.selectedValues.region = ''; // Reset region when country changes
        this.updateRegions();
      });
    }

    const regionSelect = document.getElementById('region');
    if (regionSelect) {
      regionSelect.addEventListener('change', () => {
        this.selectedValues.region = regionSelect.value;
      });
    }
  }

  // Data Loading Methods
  async loadLocationData() {
    if (this.loadingPromises.locations) {
      return this.loadingPromises.locations;
    }

    this.loadingPromises.locations = (async () => {
      try {
        this.logger.debug('Loading location data...');
        const response = await fetch('/data/countries-regions.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        this.data.locations = await response.json();
        this.logger.debug('Location data loaded successfully');
      } catch (error) {
        this.logger.error('Error loading location data:', error);
        throw error;
      }
    })();

    return this.loadingPromises.locations;
  }

  async loadXCData() {
    if (this.loadingPromises.xcConditions) {
      return this.loadingPromises.xcConditions;
    }

    this.loadingPromises.xcConditions = (async () => {
      try {
        this.logger.debug('Loading XC conditions data...');
        const response = await fetch('/data/xc_dropdowns.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        this.data.xcConditions = await response.json();
        this.logger.debug('XC conditions data loaded successfully');
      } catch (error) {
        this.logger.error('Error loading XC conditions data:', error);
        throw error;
      }
    })();

    return this.loadingPromises.xcConditions;
  }

  async refreshAllDropdowns() {
    try {
      this.logger.debug('Refreshing all dropdowns...');
      
      // Ensure data is loaded
      if (!this.data.locations || !this.data.xcConditions) {
        await Promise.all([
          this.loadLocationData(),
          this.loadXCData()
        ]);
      }
      
      await Promise.all([
        this.populateLocationDropdowns(),
        this.populateXCDropdowns()
      ]);
      
      this.logger.debug('All dropdowns refreshed successfully');
    } catch (error) {
      this.logger.error('Error refreshing dropdowns:', error);
      throw error;
    }
  }

  async populateLocationDropdowns() {
    const countrySelect = document.getElementById('country');
    if (!countrySelect) {
      this.logger.warn('Country select element not found');
      return;
    }

    const currentValue = countrySelect.value || this.selectedValues.country;
    
    countrySelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = this.i18next.t('form.selectCountry');
    countrySelect.appendChild(defaultOption);

    if (!this.data.locations?.countries) {
      this.logger.error('No countries data available');
      return;
    }

    this.data.locations.countries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = this.i18next.t(country.nameKey);
      countrySelect.appendChild(option);
    });

    // Use stored value, or infer from language if no value is stored
    const valueToSet = currentValue || this.selectedValues.country || this.inferCountryFromLanguage();
    countrySelect.value = valueToSet;
    
    // Store the selected value
    this.selectedValues.country = valueToSet;
    
    await this.updateRegions();
  }

  async updateRegions() {
    const countrySelect = document.getElementById('country');
    const regionSelect = document.getElementById('region');
    if (!countrySelect || !regionSelect) return;

    const selectedCountry = countrySelect.value;
    const currentRegion = this.selectedValues.region;
    
    regionSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = this.i18next.t('form.selectRegion');
    regionSelect.appendChild(defaultOption);

    const country = this.data.locations.countries.find(c => c.code === selectedCountry);
    if (country?.regions) {
      const sortedRegions = Object.entries(country.regions)
        .map(([id, key]) => ({
          id,
          key,
          name: this.i18next.t(key)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      sortedRegions.forEach(region => {
        const option = document.createElement('option');
        option.value = region.id;
        option.textContent = region.name;
        regionSelect.appendChild(option);
      });

      // Restore previous region selection if it exists for this country
      if (currentRegion) {
        regionSelect.value = currentRegion;
      }
    }

    // Store current selections
    this.selectedValues.country = selectedCountry;
    this.selectedValues.region = regionSelect.value;
  }

  populateXCDropdowns() {
    if (!this.data.xcConditions) {
      this.logger.error('No XC conditions data available');
      return;
    }

    this.updateSnowTypeDropdown();
    this.updateTrackConditionsDropdowns();
    this.updateSnowAgeDropdown();
    this.updateWetnessDropdown();
  }

  updateSnowTypeDropdown() {
    const snowTypeSelect = document.getElementById('snow-type');
    if (!snowTypeSelect) {
      this.logger.warn('Snow type select element not found');
      return;
    }

    snowTypeSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = this.i18next.t('form.selectSnowType', 'Select snow type');
    snowTypeSelect.appendChild(defaultOption);

    this.data.xcConditions.snowTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type.code;
      option.textContent = this.i18next.t(`form.snowTypes.${type.code}`, { defaultValue: type.name });
      snowTypeSelect.appendChild(option);
    });
  }

  updateTrackConditionsDropdowns() {
    const classicStyleSelect = document.getElementById('classic-style');
    const freeStyleSelect = document.getElementById('free-style');
    if (!classicStyleSelect || !freeStyleSelect) return;

    const updateSelect = (select) => {
      select.innerHTML = '';
      this.data.xcConditions.trackConditions.forEach(condition => {
        const option = document.createElement('option');
        option.value = condition.code;
        option.textContent = this.i18next.t(`form.trackConditions.${condition.code}`, condition.name);
        select.appendChild(option);
      });
    };

    updateSelect(classicStyleSelect);
    updateSelect(freeStyleSelect);
  }

  updateSnowAgeDropdown() {
    const snowAgeSelect = document.getElementById('snow-age');
    if (!snowAgeSelect) return;

    snowAgeSelect.innerHTML = '';
    this.data.xcConditions.snowAge.forEach(age => {
      const option = document.createElement('option');
      option.value = age.code;
      option.textContent = this.i18next.t(`form.snowAge.${age.code}`, age.name);
      snowAgeSelect.appendChild(option);
    });
  }

  updateWetnessDropdown() {
    const wetnessSelect = document.getElementById('wetness');
    if (!wetnessSelect) return;

    wetnessSelect.innerHTML = '';
    this.data.xcConditions.wetness.forEach(wet => {
      const option = document.createElement('option');
      option.value = wet.code;
      option.textContent = this.i18next.t(`form.wetness.${wet.code}`, wet.name);
      wetnessSelect.appendChild(option);
    });
  }

  // Helper Methods
  inferCountryFromLanguage() {
    const languageToCountry = {
      'sk': 'SK',
      'cs': 'CZ',
      'de': 'AT',
      'it': 'IT',
      'pl': 'PL',
      'hu': 'HU',
      'en': 'SK'
    };
    
    const languageCode = this.i18next.language.split('-')[0].toLowerCase();
    return languageToCountry[languageCode] || 'SK';
  }

  clearState() {
    this.selectedValues = {};
  }

  restoreState() {
    if (this.selectedValues.country) {
      const countrySelect = document.getElementById('country');
      if (countrySelect) {
        countrySelect.value = this.selectedValues.country;
        this.updateRegions(); // This will handle region restoration as well
      }
    }
  }

  // Getter Methods
  getCurrentCountry() {
    const countrySelect = document.getElementById('country');
    return countrySelect?.value || null;
  }

  getCurrentRegion() {
    const regionSelect = document.getElementById('region');
    return regionSelect?.value || null;
  }

  getSelectedValues() {
    const countrySelect = document.getElementById('country');
    const regionSelect = document.getElementById('region');
    const snowTypeSelect = document.getElementById('snow-type');
    const classicStyleSelect = document.getElementById('classic-style');
    const freeStyleSelect = document.getElementById('free-style');
    const snowAgeSelect = document.getElementById('snow-age');
    const wetnessSelect = document.getElementById('wetness');

    return {
      country: (countrySelect?.value || this.selectedValues.country || ''),
      region: (regionSelect?.value || this.selectedValues.region || ''),
      snowType: snowTypeSelect?.value || '',
      classicStyle: classicStyleSelect?.value || '',
      freeStyle: freeStyleSelect?.value || '',
      snowAge: snowAgeSelect?.value || '',
      wetness: wetnessSelect?.value || ''
    };
  }
}

export default SelectManager;
