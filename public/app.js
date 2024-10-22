import { i18next, initI18next } from './i18n.js';

console.log('app.js loaded');

let countriesData;
async function loadCountriesData() {
  const response = await fetch('/countries-regions.json');
  countriesData = await response.json();
}

let xc_Data;
async function loadXcData() {
  const response = await fetch('/xc_dropdowns.json');
  snowTypesData = await response.json();
}

function inferCountryFromLanguage(language = null) {
  const languageToCountry = {
    'sk': 'SK',
    'cs': 'CZ',
    'de': 'AT',
    'it': 'IT',
    'pl': 'PL',
    'hu': 'HU',
    'en': 'SK' // Default to Slovakia if language is English
  };
  
  // If language is null, use the current i18next language
  const currentLanguage = language || i18next.language;
  
  // Get the two-letter language code (in case the language string includes country code)
  const languageCode = currentLanguage.split('-')[0].toLowerCase();
  
  return languageToCountry[languageCode] || 'SK'; // Default to Slovakia if language not found
}

function populateCountryDropdown() {
  console.log('populateCountryDropdown called');
  if (!countriesData || !countriesData.countries) {
    console.warn('Countries data not loaded yet');
    return;
  }
  const countrySelect = document.getElementById('country');
  countrySelect.innerHTML = '<option value="">' + i18next.t('form.selectCountry') + '</option>';
  
  const inferredCountry = inferCountryFromLanguage();
  console.log('Inferred country:', inferredCountry);
  
  countriesData.countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.code;
    option.textContent = i18next.t(country.nameKey);
    console.log(country.code + '==' + inferredCountry);
    if (country.code === inferredCountry) {
      option.selected = true;
    }
    countrySelect.appendChild(option);
  });

  console.log('Country dropdown populated. Selected value:', countrySelect.value);

  // Trigger the change event to update regions
  countrySelect.dispatchEvent(new Event('change'));
}

function updateRegions() {
  const countrySelect = document.getElementById('country');
  const regionSelect = document.getElementById('region');
  const selectedCountry = countrySelect.value;
  
  regionSelect.innerHTML = '<option value="">' + i18next.t('form.selectRegion') + '</option>';

  const country = countriesData.countries.find(c => c.code === selectedCountry);
  if (country && country.regions) {
    const sortedRegions = Object.entries(country.regions)
      .map(([regionId, regionKey]) => ({
        id: regionId,
        key: regionKey,
        name: i18next.t(regionKey)
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

function updateXcDropdowns() {
  const snowTypeSelect = document.getElementById('snow-type');
  const classicStyleSelect = document.getElementById('classic-style');
  const freeStyleSelect = document.getElementById('free-style');
  const snowAgeSelect = document.getElementById('snow-age');
  const wetnessSelect = document.getElementById('wetness');
  
  snowTypeSelect.innerHTML = '';
  classicStyleSelect.innerHTML = '';
  freeStyleSelect.innerHTML = '';
  snowAgeSelect.innerHTML = '';
  wetnessSelect.innerHTML = '';

  if (xc_Data && xc_Data.snowTypes) {
    xc_Data.snowTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type.code;
      option.textContent = i18next.t(`form.snowTypes.${type.code}`, type.name);
      snowTypeSelect.appendChild(option);
    });
  }

  if (xc_Data && xc_Data.trackConditions) {
    xc_Data.trackConditions.forEach(condition => {
      const classicOption = document.createElement('option');
      const freeOption = document.createElement('option');
      
      classicOption.value = condition.code;
      freeOption.value = condition.code;
      
      classicOption.textContent = i18next.t(`form.trackConditions.${condition.code}`, condition.name);
      freeOption.textContent = i18next.t(`form.trackConditions.${condition.code}`, condition.name);
      
      classicStyleSelect.appendChild(classicOption);
      freeStyleSelect.appendChild(freeOption);
    });
  }

  if (xc_Data && xc_Data.snowAge) {
    xc_Data.snowAge.forEach(age => {
      const option = document.createElement('option');
      option.value = age.code;
      option.textContent = i18next.t(`form.snowAge.${age.code}`, age.name);
      snowAgeSelect.appendChild(option);
    });
  }

  if (xc_Data && xc_Data.wetness) {
    xc_Data.wetness.forEach(wet => {
      const option = document.createElement('option');
      option.value = wet.code;
      option.textContent = i18next.t(`form.wetness.${wet.code}`, wet.name);
      wetnessSelect.appendChild(option);
    });
  }
}

async function toggleAuth() {
  console.log('toggleAuth called');
  const isAuthenticated = await checkAuthStatus();
  if (isAuthenticated) {
    await logout();
  } else {
    initiateOAuth();
  }
}

async function logout() {
  try {
    console.log('Logout function called');
    const response = await fetch('/api/logout', { 
      method: 'POST',
      credentials: 'include',
    });

    console.log('Logout response status:', response.status);
    const data = await response.json();
    console.log('Logout response:', data);

    if (!response.ok) {
      throw new Error('Logout failed: ' + data.message);
    }

    console.log('Logout successful, updating UI');
    await handleLogout();

  } catch (error) {
    console.error('Logout error:', error);
    // Even if the server-side logout fails, we should still clear client-side data
    await handleLogout();
  }
}

async function handleLogout() {
  try {
    // Clear client-side storage
    localStorage.removeItem('sessionId');
    localStorage.removeItem('oauthState');
    
    // Update UI
    await updateUIBasedOnAuthState(false);
    
    // Redirect to home page if needed
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Error during logout:', error);
  }
}

function updateUIBasedOnAuthState(isAuthenticated) {
  console.log('Updating UI based on auth state:', isAuthenticated);
  const loginContainer = document.getElementById('login-container');
  const loginText = document.getElementById('login-text');
  const logoutButton = document.getElementById('logout-button');
  const snowReportForm = document.getElementById('snow-report-form');

  if (isAuthenticated) {
    loginContainer.style.display = 'none';
    logoutButton.style.display = 'inline-block';
    snowReportForm.style.display = 'block';
    console.log('User is authenticated, showing logout button and form');
  } else {
    loginContainer.style.display = 'flex';
    logoutButton.style.display = 'none';
    snowReportForm.style.display = 'none';
    console.log('User is not authenticated, showing login button and hiding form');
    
    // Set the login text with HTML content
    loginText.innerHTML = i18next.t('auth.loginText', { interpolation: { escapeValue: false } });
  }
}

// Update all translatable elements
async function updatePageContent() {
  console.log('Updating page content with translations');
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = i18next.t(key, { returnObjects: true, interpolation: { escapeValue: false } });
    console.log(`Translating key: ${key}, result:`, translation);
    
    if (typeof translation === 'object') {
      // Handle nested translations (like snow type options)
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
  });
  
  // Update login text separately
  const loginText = document.getElementById('login-text');
  if (loginText) {
    loginText.innerHTML = i18next.t('auth.loginText', { interpolation: { escapeValue: false } });
  }
}

async function initiateOAuth() {
  try {
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('oauthState', state);

    const response = await fetch('/api/initiate-oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        state, 
        scopes: 'email'
      }),
    });
    const data = await response.json();
    if (data.authUrl) {
      console.log('Redirecting to auth URL:', data.authUrl);
      window.location.href = data.authUrl;
    } else {
      console.error('No auth URL received');
    }
  } catch (error) {
    console.error('Error initiating OAuth:', error);
  }
}

async function handleOAuthCallback() {
  console.log('handleOAuthCallback called');
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');

  console.log('Code:', code, 'State:', state);

  if (state) {
    const storedState = localStorage.getItem('oauthState');
    console.log('Stored state:', storedState);
    if (state !== storedState) {
      console.error('State mismatch. Possible CSRF attack.');
      updateUIBasedOnAuthState(false);
      return;
    }
    console.log('State validation successful');
  } else {
    console.log('No OAuth state detected, skipping validation.');
  }

  if (code) {
    console.log('Exchanging token');
    try {
      const success = await exchangeToken(code);
      if (success) {
        console.log('Token exchanged successfully');
        await refreshUserData();
      } else {
        console.log('Token exchange failed');
        updateUIBasedOnAuthState(false);
      }
    } catch (error) {
      console.error('Error exchanging token:', error);
      updateUIBasedOnAuthState(false);
    }
  } else {
    console.log('No code present, skipping token exchange');
    updateUIBasedOnAuthState(false);
  }

  localStorage.removeItem('oauthState');
  console.log('Cleared stored OAuth state');

  window.history.replaceState({}, document.title, "/");
  console.log('Cleared URL parameters');
}

async function exchangeToken(code) {
  try {
    const response = await fetch('/api/exchange-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to exchange token');
    }

    const data = await response.json();
    
    if (data.success) {
      console.log('Token exchange successful');
      
      // Store the session ID in localStorage
      if (data.sessionId) {
        localStorage.setItem('sessionId', data.sessionId);
        console.log('Session ID stored in localStorage');
      }
      
      return true;
    } else {
      throw new Error('Token exchange failed');
    }
  } catch (error) {
    console.error('Error exchanging token:', error);
    return false;
  }
}

async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth-status', {
      credentials: 'include'
    });
    const data = await response.json();
    console.log('Auth status response:', data);
    return data.isAuthenticated;
  } catch (error) {
    console.error('Error checking auth status:', error);
    return false;
  }
}

async function getUserData() {
  try {
    const response = await fetch('/api/user-data', {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }
    const userData = await response.json();
    console.log('User data:', userData);
    return userData;
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
}

// Function to refresh user data
async function refreshUserData() {
  try {
    const userData = await getUserData();
    if (userData) {

      await loadCountriesData();
      populateCountryDropdown();
      updateRegions();
      updateXcDropdowns();
      console.log('Countries data loaded, Country, snow types dropdowns populated, regions updated');

      updateUIWithUserData(userData);
      updateUIBasedOnAuthState(true);
      updatePageContent(); // Update translations after changing language
    } else {
      throw new Error('Failed to fetch user data');
    }
  } catch (error) {
    console.error('Error refreshing user data:', error);
    await handleInvalidSession();
  }
}

function updateUIWithUserData(userData) {
  console.log(userData);
  // Update UI elements with user data
  // For example:
  // const userInfoElement = document.getElementById('user-info');
  // if (userInfoElement) {
  //   userInfoElement.textContent = i18next.t('welcome', { name: userData.name, role: userData.role });
  // }
  
  // Set the language based on user data
  if (userData.language) {
    i18next.changeLanguage(userData.language);
  }
}

// Function to handle invalid sessions
async function handleInvalidSession() {
  console.log('Session appears to be invalid, attempting to refresh token...');
  try {
    const response = await fetch('/api/refresh-token', {
      method: 'POST',
      credentials: 'include'
    });
    
    console.log('Refresh token response status:', response.status);
    const data = await response.json();
    console.log('Refresh token response:', data);

    if (response.ok) {
      console.log('Token refreshed successfully');
      await refreshUserData();
    } else {
      console.log('Failed to refresh token, updating UI for logged out state');
      console.log('Error details:', data.error || 'No error details provided');
      await handleLogout();
    }
  } catch (error) {
    console.error('Error refreshing token:', error);
    await handleLogout();
  }
}

async function checkAndRefreshToken() {
  // First, check if the user is logged in
  const isLoggedIn = await checkAuthStatus();
  
  if (!isLoggedIn) {
    console.log('User is not logged in, skipping token refresh');
    return;
  }

  try {
    const response = await fetch('/api/refresh-token', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        console.log('Token refreshed successfully');
      } else {
        throw new Error('Failed to refresh token');
      }
    } else if (response.status === 401) {
      // Token is invalid or expired and couldn't be refreshed
      console.log('Session expired. Please log in again.');
      // Clear any stored session data
      localStorage.removeItem('sessionId');
      updateUIBasedOnAuthState();
    }
  } catch (error) {
    console.error('Error refreshing token:', error);
  }
}

const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

setInterval(async () => {
  try {
    const isAuthenticated = await checkAuthStatus();
    if (isAuthenticated) {
      await checkAndRefreshToken();
      await refreshUserData();
    } else {
      await updateUIBasedOnAuthState(false);
    }
  } catch (error) {
    console.error('Error in refresh interval:', error);
    await handleLogout();
  }
}, REFRESH_INTERVAL);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js').then(function(registration) {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available, prompt user to refresh
            if (confirm('New version available! Click OK to refresh.')) {
              window.location.reload();
            }
          }
        };
      };
    }).catch(function(err) {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

document.getElementById('country').addEventListener('change', updateRegions);

document.getElementById('snow-report-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  
  // Check authentication status before submitting
  const isAuthenticated = await checkAuthStatus();
  
  if (isAuthenticated) {
    try {
      const country = document.getElementById('country').value;
      const region = document.getElementById('region').value;
      const snowDepth = document.getElementById('snow-depth').value;
      const snowType = document.getElementById('snow-type').value;
      const classicStyle = document.getElementById('classic-style').value;
      const freeStyle = document.getElementById('free-style').value;
      const snowAge = document.getElementById('snow-age').value;
      const wetness = document.getElementById('wetness').value;

      console.log(`Country: ${country}, Region: ${region}, Snow Depth: ${snowDepth}, Snow Type: ${snowType}, Classic Style: ${classicStyle}, Free Style: ${freeStyle}, Snow Age: ${snowAge}, Wetness: ${wetness}`);
      alert("Report submitted successfully!");
    } catch (error) {
      console.error('Error submitting snow report:', error);
      alert('An error occurred while submitting the report. Please try again.');
    }
  } else {
    alert("Please log in to submit the report.");
    // Optionally, you can redirect to the login page or trigger the login process here
  }
});

window.addEventListener('languageChanged', updatePageContent);

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded event fired');

  document.getElementById('login-button').addEventListener('click', initiateOAuth);
  document.getElementById('logout-button').addEventListener('click', logout);

  try {
    await initI18next();
    console.log('i18next initialized');
    await updatePageContent();
    
    const urlParams = new URLSearchParams(window.location.search);
    console.log('URL params:', urlParams.toString());
    if (urlParams.has('code')) {
      console.log('Code parameter found in URL');
      await handleOAuthCallback();
    } else {
      console.log('No code parameter in URL');
      const isAuthenticated = await checkAuthStatus();
      updateUIBasedOnAuthState(isAuthenticated);
      if (isAuthenticated) {
        await refreshUserData();
      }
    }
  } catch (error) {
    console.error('Error during initialization:', error);
  }
});
