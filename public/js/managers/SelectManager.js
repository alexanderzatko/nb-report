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
      // Load data first
      await Promise.all([
        this.loadLocationData(),
        this.loadXCData()
      ]);

      // Setup listeners after data is loaded
      this.setupLanguageListeners();
      this.setupEventListeners();
      await this.refreshAllDropdowns();
      
      return true;
    } catch (error) {
      this.logger.error('SelectManager: Initialization error:', error);
      return false;
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
      countrySelect.addEventListener('change', () => this.updateRegions());
    }
  }

  // Data Loading Methods
  async loadLocationData() {
    if (this.loadingPromises.locations) {
      return this.loadingPromises.locations;
    }

    this.loadingPromises.locations = (async () => {
      try {
        const response = await fetch('/data/countries-regions.json');
        this.data.locations = await response.json();
        this.logger.debug('SelectManager: Location data loaded successfully');
      } catch (error) {
        this.logger.error('SelectManager: Error loading location data:', error);
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
        const response = await fetch('/data/xc_dropdowns.json');
        this.data.xcConditions = await response.json();
        this.logger.debug('SelectManager: XC conditions data loaded successfully');
      } catch (error) {
        this.logger.error('SelectManager: Error loading XC conditions data:', error);
        throw error;
      }
    })();

    return this.loadingPromises.xcConditions;
  }

  // Dropdown Population Methods
  async refreshAllDropdowns() {
    try {
      // Ensure data is loaded
      if (!this.data.locations || !this.data.xcConditions) {
        await Promise.all([
          this.loadLocationData(),
          this.loadXCData()
        ]);
      }
      
      await this.populateLocationDropdowns();
      await this.populateXCDropdowns();
    } catch (error) {
      this.logger.error('SelectManager: Error refreshing dropdowns:', error);
      throw error;
    }
  }

  async populateLocationDropdowns() {
    const countrySelect = document.getElementById('country');
    if (!countrySelect) return;

    const currentValue = countrySelect.value;
    
    countrySelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = this.i18next.t('form.selectCountry');
    countrySelect.appendChild(defaultOption);

    this.data.locations.countries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = this.i18next.t(country.nameKey);
      countrySelect.appendChild(option);
    });

    // Restore previous selection or infer from language
    countrySelect.value = currentValue || this.inferCountryFromLanguage();
    await this.updateRegions();
  }

  updateRegions() {
    const countrySelect = document.getElementById('country');
    const regionSelect = document.getElementById('region');
    if (!countrySelect || !regionSelect) return;

    const selectedCountry = countrySelect.value;
    
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
    }
  }

  populateXCDropdowns() {
    if (!this.data.xcConditions) return;

    this.updateSnowTypeDropdown();
    this.updateTrackConditionsDropdowns();
    this.updateSnowAgeDropdown();
    this.updateWetnessDropdown();
  }

  updateSnowTypeDropdown() {
    const snowTypeSelect = document.getElementById('snow-type');
    if (!snowTypeSelect) return;

    snowTypeSelect.innerHTML = '';
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
    return {
      country: this.getCurrentCountry(),
      region: this.getCurrentRegion(),
      snowType: document.getElementById('snow-type')?.value,
      classicStyle: document.getElementById('classic-style')?.value,
      freeStyle: document.getElementById('free-style')?.value,
      snowAge: document.getElementById('snow-age')?.value,
      wetness: document.getElementById('wetness')?.value
    };
  }
}

export default SelectManager;
