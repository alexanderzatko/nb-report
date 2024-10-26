// location/LocationManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';

class LocationManager {
  static instance = null;

    constructor() {
        if (LocationManager.instance) {
            return LocationManager.instance;
        }
        
        // Log instance creation
        console.log('LocationManager: Creating new instance');
        
        this.i18next = i18next;
        this.countriesData = null;
        this.dataLoadingPromise = null;
        this.setupEventListeners();
        
        // Use both i18next and window event listeners to ensure we catch the event
        this.i18next.on('languageChanged', (lng) => {
            console.log('LocationManager: i18next language changed to:', lng);
            this.refreshDropdowns();
        });
        
        window.addEventListener('languageChanged', () => {
            console.log('LocationManager: Window language change event received');
            console.log('LocationManager: Current language:', this.i18next.language);
            this.refreshDropdowns();
        });

        console.log('LocationManager: Event listeners attached');
        
        LocationManager.instance = this;
        return this;  // Ensure we return the instance
    }

  static getInstance() {
    if (!LocationManager.instance) {
      LocationManager.instance = new LocationManager();
    }
    return LocationManager.instance;
  }

  setupEventListeners() {
    const countrySelect = document.getElementById('country');
    if (countrySelect) {
      countrySelect.addEventListener('change', () => this.updateRegions());
    }
  }

  async initialize() {
    console.log('LocationManager initializing...');
    try {
      if (!this.countriesData) {
        console.log('Loading countries data...');
        await this.loadCountriesData();
      }
      return true;
    } catch (error) {
      console.error('Error initializing LocationManager:', error);
      return false;
    }
  }

  // refresh dropdowns when language changes
  async refreshDropdowns() {
      console.log('LocationManager: refreshDropdowns called');
      console.log('LocationManager: Current language:', this.i18next.language);
      console.log('LocationManager: Test translation:', this.i18next.t('countries.slovakia'));
      
      try {
          await this.populateCountryDropdown();
          console.log('LocationManager: Dropdowns refreshed successfully');
      } catch (error) {
          console.error('LocationManager: Error refreshing dropdowns:', error);
      }
  }
  
async populateCountryDropdown() {
    console.log('LocationManager: populateCountryDropdown called');
    console.log('LocationManager: Current language:', this.i18next.language);
    
    if (!this.countriesData) {
        console.log('LocationManager: Data not loaded, initializing first...');
        await this.initialize();
    }

    const countrySelect = document.getElementById('country');
    if (!countrySelect) {
        console.warn('LocationManager: Country select element not found');
        return;
    }

    console.log('LocationManager: Starting country dropdown population');
    countrySelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = this.i18next.t('form.selectCountry');
    countrySelect.appendChild(defaultOption);
    
    this.countriesData.countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country.code;
        const countryName = this.i18next.t(country.nameKey);
        console.log(`LocationManager: Translating country ${country.code} to: ${countryName}`);
        option.textContent = countryName;
        countrySelect.appendChild(option);
    });

    // Log completion
    console.log('LocationManager: Country dropdown population complete');
    await this.updateRegions();
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

inferCountryFromLanguage(language = null) {
  const languageToCountry = {
    'sk': 'SK',
    'cs': 'CZ',
    'de': 'AT',
    'it': 'IT',
    'pl': 'PL',
    'hu': 'HU',
    'en': 'SK' // Default to Slovakia if language is English
  };
  
  const currentLanguage = language || this.i18next.language;
  const languageCode = currentLanguage.split('-')[0].toLowerCase();
  
  return languageToCountry[languageCode] || 'SK';
}

updateRegions() {
  console.log('LocationManager: updateRegions called');
  const countrySelect = document.getElementById('country');
  const regionSelect = document.getElementById('region');
  const selectedCountry = countrySelect.value;

  console.log('LocationManager: Updating regions for country:', selectedCountry);

  regionSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = this.i18next.t('form.selectRegion');
  regionSelect.appendChild(defaultOption);

  const country = this.countriesData.countries.find(c => c.code === selectedCountry);
  if (country && country.regions) {
      const sortedRegions = Object.entries(country.regions)
          .map(([regionId, regionKey]) => {
              const translatedName = this.i18next.t(regionKey);
              console.log(`LocationManager: Translating region ${regionKey}:`, translatedName);
              return {
                  id: regionId,
                  key: regionKey,
                  name: translatedName
              };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

      sortedRegions.forEach(region => {
          const option = document.createElement('option');
          option.value = region.id;
          option.textContent = region.name;
          regionSelect.appendChild(option);
      });
  }
}

getCurrentCountry() {
  const countrySelect = document.getElementById('country');
  return countrySelect ? countrySelect.value : null;
}

getCurrentRegion() {
  const regionSelect = document.getElementById('region');
  return regionSelect ? regionSelect.value : null;
}
}

export default LocationManager;
