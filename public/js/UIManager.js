// ui/UIManager.js

class UIManager {
  constructor(i18next) {
    this.i18next = i18next;
    this.setupEventListeners();
  }

  setupEventListeners() {
    const snowReportLink = document.getElementById('snow-report-link');
    if (snowReportLink) {
      snowReportLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showSnowReportForm();
      });
    }

    window.addEventListener('languageChanged', () => this.updatePageContent());
  }

  updateUIBasedOnAuthState(isAuthenticated) {
    console.log('Updating UI based on auth state:', isAuthenticated);
    const loginContainer = document.getElementById('login-container');
    const loginText = document.getElementById('login-text');
    const logoutButton = document.getElementById('logout-button');
    const dashboardContainer = document.getElementById('dashboard-container');
    const snowReportForm = document.getElementById('snow-report-form');

    if (isAuthenticated) {
      loginContainer.style.display = 'none';
      dashboardContainer.style.display = 'block';
      snowReportForm.style.display = 'none';
    } else {
      loginContainer.style.display = 'flex';
      dashboardContainer.style.display = 'none';
      snowReportForm.style.display = 'none';
      
      if (loginText) {
        loginText.innerHTML = this.i18next.t('auth.loginText', { 
          interpolation: { escapeValue: false } 
        });
      }
    }
  }

  updatePageContent() {
    console.log('Updating page content with translations');
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.i18next.t(key, { 
        returnObjects: true, 
        interpolation: { escapeValue: false } 
      });
      console.log(`Translating key: ${key}, result:`, translation);
      
      this.updateElementTranslation(element, translation);
    });
    
    this.updateLoginText();
  }

  updateElementTranslation(element, translation) {
    if (typeof translation === 'object') {
      if (element.tagName.toLowerCase() === 'select') {
        element.innerHTML = '';
        Object.entries(translation).forEach(([value, text]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          element.appendChild(option);
        });
      }
    } else {
      if (element.tagName.toLowerCase() === 'input' && element.type === 'submit') {
        element.value = translation;
      } else {
        element.innerHTML = translation;
      }
    }
  }

  updateLoginText() {
    const loginText = document.getElementById('login-text');
    if (loginText) {
      loginText.innerHTML = this.i18next.t('auth.loginText', { 
        interpolation: { escapeValue: false } 
      });
    }
  }

  showSnowReportForm() {
    document.getElementById('dashboard-container').style.display = 'none';
    document.getElementById('snow-report-form').style.display = 'block';
  }

  showDashboard() {
    document.getElementById('dashboard-container').style.display = 'block';
    document.getElementById('snow-report-form').style.display = 'none';
  }

  updateUIWithUserData(userData) {
    console.log(userData);
    
    // Set the language based on user data
    if (userData.language) {
      this.i18next.changeLanguage(userData.language);
    }
    
    this.updateRewardsSection(userData);
  }

  updateRewardsSection(userData) {
    const rewardsSection = document.getElementById('rewards-section');
    if (rewardsSection) {
      if (userData.rovas_uid && !isNaN(userData.rovas_uid)) {
        rewardsSection.style.display = 'block';
      } else {
        rewardsSection.style.display = 'none';
      }
    }
  }

  showError(message) {
    // You could implement a more sophisticated error display system here
    alert(message);
  }

  showSuccess(message) {
    // You could implement a more sophisticated success display system here
    alert(message);
  }
}

export default UIManager;
