// dropdowns/DropdownManager.js

class DropdownManager {
  constructor(i18next) {
    this.i18next = i18next;
    this.xcData = null;
  }

  async initialize() {
    await this.loadXcData();
    this.updateXcDropdowns();
  }

  async loadXcData() {
    console.log('Loading XC data...');
    try {
      const response = await fetch('/data/xc_dropdowns.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.xcData = await response.json();
      console.log('XC data loaded:', this.xcData);
    } catch (error) {
      console.error('Error loading XC data:', error);
      this.xcData = null;
      throw error;
    }
  }

  updateXcDropdowns() {
    if (!this.xcData) {
      console.error('XC data not loaded');
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
      console.log('Snow type select not found');
      return;
    }

    console.log('Updating snow type dropdown');
    snowTypeSelect.innerHTML = '';
    
    if (this.xcData.snowTypes) {
      this.xcData.snowTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type.code;
        const translationKey = `form.snowTypes.${type.code}`;
        const translation = this.i18next.t(translationKey);
        option.textContent = translation || type.name;
        snowTypeSelect.appendChild(option);
        console.log(`Added snow type option: ${type.code} - ${option.textContent}`);
      });
    }
  }

  updateTrackConditionsDropdowns() {
    const classicStyleSelect = document.getElementById('classic-style');
    const freeStyleSelect = document.getElementById('free-style');
    
    if (!classicStyleSelect || !freeStyleSelect) return;

    classicStyleSelect.innerHTML = '';
    freeStyleSelect.innerHTML = '';

    if (this.xcData.trackConditions) {
      this.xcData.trackConditions.forEach(condition => {
        const classicOption = document.createElement('option');
        const freeOption = document.createElement('option');
        
        classicOption.value = condition.code;
        freeOption.value = condition.code;
        
        const translationKey = `form.trackConditions.${condition.code}`;
        const translation = this.i18next.t(translationKey);
        
        classicOption.textContent = translation || condition.name;
        freeOption.textContent = translation || condition.name;
        
        classicStyleSelect.appendChild(classicOption);
        freeStyleSelect.appendChild(freeOption);
      });
    }
  }

  updateSnowAgeDropdown() {
    const snowAgeSelect = document.getElementById('snow-age');
    if (!snowAgeSelect) return;

    snowAgeSelect.innerHTML = '';
    if (this.xcData.snowAge) {
      this.xcData.snowAge.forEach(age => {
        const option = document.createElement('option');
        option.value = age.code;
        const translationKey = `form.snowAgeOptions.${age.code}`;
        const translation = this.i18next.t(translationKey);
        option.textContent = translation || age.name;
        snowAgeSelect.appendChild(option);
      });
    }
  }

  updateWetnessDropdown() {
    const wetnessSelect = document.getElementById('wetness');
    if (!wetnessSelect) return;

    wetnessSelect.innerHTML = '';
    if (this.xcData.wetness) {
      this.xcData.wetness.forEach(wet => {
        const option = document.createElement('option');
        option.value = wet.code;
        const translationKey = `form.wetnessOptions.${wet.code}`;
        const translation = this.i18next.t(translationKey);
        option.textContent = translation || wet.name;
        wetnessSelect.appendChild(option);
      });
    }
  }

  getSelectedValues() {
    return {
      snowType: document.getElementById('snow-type')?.value,
      classicStyle: document.getElementById('classic-style')?.value,
      freeStyle: document.getElementById('free-style')?.value,
      snowAge: document.getElementById('snow-age')?.value,
      wetness: document.getElementById('wetness')?.value
    };
  }
}

export default DropdownManager;
