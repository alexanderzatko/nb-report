// location/LocationManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';

class LocationManager {
  static instance = null;

  constructor() {
    if (LocationManager.instance) {
      return LocationManager.instance;
    }
    this.i18next = i18next;
    this.countriesData = null;
    this.dataLoadingPromise = null;
    this.setupEventListeners();
    
    LocationManager.instance = this;
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

  async populateCountryDropdown() {
  console.log('populateCountryDropdown called');
  
  if (!this.countriesData) {
    console.log('Data not loaded, initializing first...');
    await this.initialize();  // Wait for initialization
  }

  if (!this.countriesData || !this.countriesData.countries) {
    console.error('Countries data still not available after initialization');
    return;
  }


  if (!this.countriesData || !this.countriesData.countries) {
    console.warn('Countries data still not available');
    return;
  }

  const countrySelect = document.getElementById('country');
  if (!countrySelect) {
    console.warn('Country select element not found');
    return;
  }

  countrySelect.innerHTML = `<option value="">${this.i18next.t('form.selectCountry')}</option>`;
  
  const inferredCountry = this.inferCountryFromLanguage();
  console.log('Inferred country:', inferredCountry);
  
  this.countriesData.countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.code;
    option.textContent = this.i18next.t(country.nameKey);
    if (country.code === inferredCountry) {
      option.selected = true;
    }
    countrySelect.appendChild(option);
  });

  console.log('Country dropdown populated. Selected value:', countrySelect.value);
  await this.updateRegions();
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

populateCountryDropdown() {
  console.log('populateCountryDropdown called');
  if (!this.countriesData || !this.countriesData.countries) {
    console.warn('Countries data not loaded yet');
    return;
  }

  const countrySelect = document.getElementById('country');
  countrySelect.innerHTML = `<option value="">${this.i18next.t('form.selectCountry')}</option>`;
  
  const inferredCountry = this.inferCountryFromLanguage();
  console.log('Inferred country:', inferredCountry);
  
  this.countriesData.countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.code;
    option.textContent = this.i18next.t(country.nameKey);
    if (country.code === inferredCountry) {
      option.selected = true;
    }
    countrySelect.appendChild(option);
  });

  console.log('Country dropdown populated. Selected value:', countrySelect.value);
  this.updateRegions();
}

updateRegions() {
  const countrySelect = document.getElementById('country');
  const regionSelect = document.getElementById('region');
  const selectedCountry = countrySelect.value;
  
  regionSelect.innerHTML = `<option value="">${this.i18next.t('form.selectRegion')}</option>`;

  const country = this.countriesData.countries.find(c => c.code === selectedCountry);
  if (country && country.regions) {
    const sortedRegions = Object.entries(country.regions)
      .map(([regionId, regionKey]) => ({
        id: regionId,
        key: regionKey,
        name: this.i18next.t(regionKey)
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
