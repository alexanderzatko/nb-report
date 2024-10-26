// location/LocationManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';

class LocationManager {
  static instance = null;

  constructor() {
      if (LocationManager.instance) {
          return LocationManager.instance;
      }
      
      console.log('LocationManager: Creating new instance');
      this.i18next = i18next;
      this.countriesData = null;
      this.dataLoadingPromise = null;
      this.setupEventListeners();
      
      LocationManager.instance = this;
  }

  setupLanguageListeners() {
      console.log('LocationManager: Setting up language listeners');
      
      // Use both approaches to ensure we catch the event
      this.i18next.on('languageChanged', (lng) => {
          console.log('LocationManager: Language changed directly via i18next:', lng);
          this.handleLanguageChange(lng);
      });

      window.addEventListener('languageChanged', (event) => {
          console.log('LocationManager: Language changed via window event');
          this.handleLanguageChange(this.i18next.language);
      });
  }

  handleLanguageChange(language) {
      console.log('LocationManager: Handling language change to:', language);
      try {
          this.refreshDropdowns();
      } catch (error) {
          console.error('LocationManager: Error handling language change:', error);
      }
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
      
      try {
          if (!this.countriesData) {
              await this.initialize();
          }
          
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

        this.countriesData.countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country.code;
            const translatedName = this.i18next.t(country.nameKey);
            console.log(`LocationManager: Translating ${country.code} to: ${translatedName}`);
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
