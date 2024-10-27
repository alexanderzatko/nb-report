// location/LocationManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';

class LocationManager {
  constructor() {
    if (LocationManager.instance) {
      return LocationManager.instance;
    }
    
    console.log('LocationManager: Creating new instance');
    this.i18next = i18next;
    this.countriesData = null;
    this.dataLoadingPromise = null;
    this.initialized = false;
    this.initializationPromise = this.initialize();
    
    LocationManager.instance = this;
    return this;
  }

  async initialize() {
    console.log('LocationManager initializing...');
    try {
      if (!this.initialized) {
        console.log('Loading countries data...');
        await this.loadCountriesData();
        this.initialized = true;
        
        // Setup event listeners after initialization
        this.setupEventListeners();
        
        // Add i18next listener after initialization
        this.i18next.on('languageChanged', (lng) => {
          console.log('LocationManager: i18next language changed to:', lng);
          if (this.initialized) {
            this.refreshDropdowns();
          }
        });
        
        // Initial population of dropdowns
        await this.refreshDropdowns();
      }
      return true;
    } catch (error) {
      console.error('Error initializing LocationManager:', error);
      this.initialized = false;
      throw error;
    }
  }

  async loadCountriesData() {
    if (this.dataLoadingPromise) {
      return this.dataLoadingPromise;
    }

    this.dataLoadingPromise = (async () => {
      try {
        const response = await fetch('/data/countries-regions.json');
        this.countriesData = await response.json();
        console.log('Countries data loaded successfully');
        return this.countriesData;
      } catch (error) {
        console.error('Error loading countries data:', error);
        throw error;
      }
    })();

    return this.dataLoadingPromise;
  }
  async refreshDropdowns() {
    console.log('LocationManager: refreshDropdowns called');
    if (!this.initialized || !this.countriesData) {
      console.log('LocationManager: Waiting for initialization...');
      await this.initializationPromise;
    }
    
    try {
      const countrySelect = document.getElementById('country');
      const currentValue = countrySelect ? countrySelect.value : null;
      
      await this.populateCountryDropdown();
      
      // Restore selection if it existed
      if (currentValue && countrySelect) {
        countrySelect.value = currentValue;
        await this.updateRegions();
      }
      
      console.log('LocationManager: Refresh complete');
    } catch (error) {
      console.error('LocationManager: Error during refresh:', error);
    }
  }

  async populateCountryDropdown() {
    // Wait for initialization if necessary
    if (!this.initialized || !this.countriesData) {
      console.log('LocationManager: Waiting for initialization before populating dropdowns...');
      await this.initializationPromise;
    }

    console.log('LocationManager: Populating country dropdown');
    console.log('LocationManager: Current language:', this.i18next.language);

    const countrySelect = document.getElementById('country');
    if (!countrySelect) {
      console.warn('LocationManager: Country select element not found');
      return;
    }

    countrySelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = this.i18next.t('form.selectCountry');
    countrySelect.appendChild(defaultOption);

    if (!this.countriesData?.countries) {
      console.error('LocationManager: Countries data not properly loaded');
      return;
    }

    this.countriesData.countries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.code;
      const translatedName = this.i18next.t(country.nameKey);
      option.textContent = translatedName;
      countrySelect.appendChild(option);
    });

    const inferredCountry = this.inferCountryFromLanguage();
    console.log('LocationManager: Inferred country:', inferredCountry);
    
    if (!countrySelect.value) {
      countrySelect.value = inferredCountry;
    }

    await this.updateRegions();
  }
}

export default LocationManager;
