import { i18next, initI18next } from './i18n.js';

console.log('app.js loaded');

let photos = [];
let formStartTime = null;
let elapsedTimeInterval = null;
let countriesData;
let trailConditions = {};

async function loadCountriesData() {
  const response = await fetch('/countries-regions.json');
  countriesData = await response.json();
}

let xc_Data;
async function loadXcData() {
  const response = await fetch('/xc_dropdowns.json');
  snowTypesData = await response.json();
}

//for the form alert messages
function initializeFormValidation() {
  console.log('Initializing form validation');
  const inputs = document.querySelectorAll('[data-i18n-validate]');
  
  inputs.forEach(input => {    
    // Set custom validation message
    input.addEventListener('invalid', function(e) {
      e.preventDefault();
      
      const formGroup = this.closest('.form-group');
      
      if (!this.value) {
        // Required field validation
        const requiredMsg = i18next.t(this.dataset.i18nValidate);
        this.setCustomValidity(requiredMsg);
        
        // Update the validation message text
        const validationMessage = formGroup.querySelector('.validation-message');
        if (validationMessage) {
          validationMessage.textContent = requiredMsg;
        }
        
        // Add class to show validation
        formGroup.classList.add('show-validation');
      }
    });
    
    // Clear custom validation on input
    input.addEventListener('input', function() {
      this.setCustomValidity('');
      const formGroup = this.closest('.form-group');
      if (formGroup) {
        formGroup.classList.remove('show-validation');
        this.classList.remove('field-invalid');
      }
    });
    // handle blur event to remove invalid state when field becomes valid
    input.addEventListener('blur', function() {
      if (this.checkValidity()) {
        this.classList.remove('field-invalid');
        const formGroup = this.closest('.form-group');
        if (formGroup) {
          formGroup.classList.remove('show-validation');
        }
      }
    });
  });
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

function initializeDatePicker() {
  const dateInput = document.getElementById('report-date');
  if (dateInput) {
    // Set default value to today's date
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    dateInput.value = formattedDate;
    
    // Set max date to today (prevent future dates)
    dateInput.max = formattedDate;
    
    /* Set min date to 7 days ago (or adjust as needed)
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    dateInput.min = lastWeek.toISOString().split('T')[0];
    */
  }
}

function initializePhotoUpload() {
  const selectPhotosBtn = document.getElementById('select-photos');
  const takePhotoBtn = document.getElementById('take-photo');
  const fileInput = document.getElementById('photo-file-input');
  const cameraInput = document.getElementById('camera-input');
  const previewContainer = document.getElementById('photo-preview-container');

  async function resizeImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Get EXIF data
        EXIF.getData(img, function() {
				const canvas = document.createElement('canvas');
				let width = img.width;
				let height = img.height;
          
          // Calculate new dimensions
          if (width > 1900 || height > 1900) {
            if (width > height) {
							height = Math.round((height * 1900) / width);
							width = 1900;
						} else {
							width = Math.round((width * 1900) / height);
							height = 1900;
						}
					}
					
					// Set proper canvas dimensions based on EXIF orientation
					const orientation = EXIF.getTag(this, 'Orientation') || 1;
					if (orientation > 4) {
						canvas.width = height;
						canvas.height = width;
					} else {
						canvas.width = width;
						canvas.height = height;
					}
					
					const ctx = canvas.getContext('2d');
					
					// Transform context based on EXIF orientation
					switch (orientation) {
						case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
						case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
						case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
						case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
						case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
						case 7: ctx.transform(0, -1, -1, 0, height, width); break;
						case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
					}
					
					ctx.drawImage(img, 0, 0, width, height);
					
					canvas.toBlob((blob) => {
						resolve(new File([blob], file.name, {
							type: 'image/jpeg',
							lastModified: Date.now()
						}));
					}, 'image/jpeg', 0.9);
				});
			};
			img.src = URL.createObjectURL(file);
		});
	}

	function addPhotoPreview(file) {
		const reader = new FileReader();
		reader.onload = function(e) {
			const wrapper = document.createElement('div');
			wrapper.className = 'photo-preview';
			
			const img = document.createElement('img');
			img.src = e.target.result;
			img.dataset.rotation = '0';
			
			// Store the index when the preview is created
			const photoIndex = photos.indexOf(file);
			
			const controlsDiv = document.createElement('div');
			controlsDiv.className = 'photo-controls';
			
			const rotateBtn = document.createElement('button');
			rotateBtn.className = 'rotate-photo';
			rotateBtn.innerHTML = '↻';
			rotateBtn.title = 'Rotate 90° clockwise';
			rotateBtn.onclick = function(event) {
				event.preventDefault();
				event.stopPropagation();
				const currentRotation = parseInt(img.dataset.rotation) || 0;
				const newRotation = (currentRotation + 90) % 360;
				img.style.transform = `rotate(${newRotation}deg)`;
				img.dataset.rotation = newRotation;
				
				rotateImage(file, newRotation).then(rotatedFile => {
					// Update the file in the photos array using the stored index
					photos[photoIndex] = rotatedFile;
				});
			};
			
			const removeBtn = document.createElement('button');
			removeBtn.className = 'remove-photo';
			removeBtn.innerHTML = '×';
			removeBtn.onclick = function(event) {
				event.preventDefault();
				event.stopPropagation();
				// Use the stored index to remove the photo
				photos.splice(photoIndex, 1);
				wrapper.remove();
				
				// Clear both file inputs
				document.getElementById('photo-file-input').value = '';
				document.getElementById('camera-input').value = '';
			};
			
			controlsDiv.appendChild(rotateBtn);
			controlsDiv.appendChild(removeBtn);
			wrapper.appendChild(img);
			wrapper.appendChild(controlsDiv);
			previewContainer.appendChild(wrapper);
		};
		reader.readAsDataURL(file);
	}

	async function handleFiles(fileList) {
		for (const file of fileList) {
			if (file.type.startsWith('image/')) {
				const resizedFile = await resizeImage(file);
				photos.push(resizedFile);
				addPhotoPreview(resizedFile);
			}
		}
		// Clear both file inputs after handling files
		document.getElementById('photo-file-input').value = '';
		document.getElementById('camera-input').value = '';
	}
	
    selectPhotosBtn.addEventListener('click', () => fileInput.click());
    takePhotoBtn.addEventListener('click', () => cameraInput.click());
    
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    cameraInput.addEventListener('change', (e) => handleFiles(e.target.files));
}

async function rotateImage(file, degrees) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            
            // Swap width and height if rotating 90 or 270 degrees
            const rotation = ((degrees % 360) + 360) % 360;
            const swap = rotation === 90 || rotation === 270;
            canvas.width = swap ? img.height : img.width;
            canvas.height = swap ? img.width : img.height;
            
            const ctx = canvas.getContext('2d');
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((degrees * Math.PI) / 180);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            
            canvas.toBlob((blob) => {
                resolve(new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                }));
            }, 'image/jpeg', 0.9);
        };
        img.src = URL.createObjectURL(file);
    });
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

  if (elapsedTimeInterval) {
    clearInterval(elapsedTimeInterval);
    elapsedTimeInterval = null;
  }
  formStartTime = null;

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

      initializeForm(userData);

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
	
  const rewardsSection = document.getElementById('rewards-section');
  if (rewardsSection) {
    if (userData.rovas_uid && !isNaN(userData.rovas_uid)) {
      rewardsSection.style.display = 'block';
      if (!formStartTime) {
        formStartTime = new Date();
        elapsedTimeInterval = setInterval(updateElapsedTime, 1000);
      }
    } else {
      rewardsSection.style.display = 'none';
    }
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

// Add or update the initializeForm function
function initializeForm(userData) {
  const isAdmin = userData?.ski_center_admin === "1";
  const regularUserSection = document.getElementById('regular-user-section');
  const adminSection = document.getElementById('admin-section');
  const trailsSection = document.getElementById('trails-section');

  // Show/hide sections based on user role
  regularUserSection.style.display = isAdmin ? 'none' : 'block';
  adminSection.style.display = isAdmin ? 'block' : 'none';
  trailsSection.style.display = isAdmin ? 'block' : 'none';

  if (isAdmin && userData.trails) {
    initializeTrailsSection(userData.trails);
  }
}

// Add these new functions for trails handling
function initializeTrailsSection(trails) {
  const container = document.getElementById('trails-container');
  container.innerHTML = ''; // Clear existing content
  
  trails.forEach(([trailId, trailName]) => {
    const trailElement = createTrailElement(trailId, trailName);
    container.appendChild(trailElement);
  });
}

function createTrailElement(trailId, trailName) {
  const trailDiv = document.createElement('div');
  trailDiv.className = 'trail-item';
  trailDiv.dataset.trailId = trailId;

  const nameHeading = document.createElement('h4');
  nameHeading.className = 'trail-name';
  nameHeading.textContent = trailName;
  trailDiv.appendChild(nameHeading);

  // Add Free Style condition group
  const freeStyleGroup = createConditionGroup(
    'freeStyle',
    i18next.t('form.freeStyle'),
    [
      { value: '0', symbol: '?', title: 'neznáme' },
      { value: '1', symbol: '❄❄❄', title: 'výborné' },
      { value: '2', symbol: '❄❄', title: 'dobré' },
      { value: '3', symbol: '❄', title: 'obmedzené' },
      { value: '4', symbol: '✕', title: 'nevhodné' }
    ]
  );
  trailDiv.appendChild(freeStyleGroup);

  // Add Classic Style condition group
  const classicStyleGroup = createConditionGroup(
    'classicStyle',
    i18next.t('form.classicStyle'),
    [
      { value: '0', symbol: '?', title: 'neznáme' },
      { value: '1', symbol: '❄❄❄', title: 'výborné' },
      { value: '2', symbol: '❄❄', title: 'dobré' },
      { value: '3', symbol: '❄', title: 'obmedzené' },
      { value: '4', symbol: '⋮', title: 'zjazdné len niektoré úseky' },
      { value: '5', symbol: '✕', title: 'nevhodné' }
    ]
  );
  trailDiv.appendChild(classicStyleGroup);

  // Add Next Maintenance condition group
  const maintenanceGroup = createConditionGroup(
    'maintenance',
    i18next.t('form.nextMaintenance'),
    [
      { value: '0', symbol: '?', title: 'neurčené' },
      { value: '1', symbol: '1', title: 'dnes' },
      { value: '2', symbol: '2', title: 'zajtra' },
      { value: '3', symbol: '3+', title: 'o 3+ dni' },
      { value: '4', symbol: 'Ps', title: 'v piatok alebo v sobotu ráno' },
      { value: '5', symbol: '❄+', title: 'po najbližšom snežení' }
    ]
  );
  trailDiv.appendChild(maintenanceGroup);

  return trailDiv;
}

function createConditionGroup(type, label, conditions) {
  const group = document.createElement('div');
  group.className = 'condition-group';

  const labelElem = document.createElement('p');
  labelElem.className = 'condition-label';
  labelElem.textContent = label;
  group.appendChild(labelElem);

  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'condition-buttons';

  conditions.forEach(condition => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'condition-btn';
    button.dataset.value = condition.value;
    button.title = condition.title;
    button.textContent = condition.symbol;
    
    button.addEventListener('click', function() {
      const trailId = this.closest('.trail-item').dataset.trailId;
      handleConditionSelection(trailId, type, condition.value, buttonsDiv);
    });

    buttonsDiv.appendChild(button);
  });

  group.appendChild(buttonsDiv);
  return group;
}

function handleConditionSelection(trailId, type, value, buttonGroup) {
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
  if (!trailConditions[trailId]) {
    trailConditions[trailId] = {};
  }
  trailConditions[trailId][type] = value;
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
  console.log('Form submission started');

  // Check authentication status before submitting
  const isAuthenticated = await checkAuthStatus();
  console.log('Authentication status:', isAuthenticated);

  if (!isAuthenticated) {
    alert(i18next.t('form.validation.loginRequired'));
    return;
  }

  // Manual validation
  const formElements = this.querySelectorAll('[data-i18n-validate]');
  console.log('Found form elements to validate:', formElements.length);
  let isValid = true;
  let firstInvalidElement = null;
  
  formElements.forEach(element => {
    if (!element.checkValidity()) {
      isValid = false;
      element.classList.add('field-invalid');
      if (!firstInvalidElement) {
        firstInvalidElement = element;
      }
    } else {
      element.classList.remove('field-invalid');
    }
  });

  console.log('Form validation result:', isValid);
  if (!isValid && firstInvalidElement) {
    // Scroll to the first invalid element
    firstInvalidElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

    try {
	const formData = new FormData();  // Create FormData instance
	formData.append('snowType', document.getElementById('snow-type').value);
	formData.append('note', document.getElementById('report-note').value);
      
	const userData = await getUserData();
	const isAdmin = userData?.ski_center_admin === "1";

	if (isAdmin) {
	  // Add admin-specific fields
	  formData.append('snowDepthTotal', document.getElementById('snow-depth-total').value);
	  formData.append('snowDepthNew', document.getElementById('snow-depth-new').value);
	  formData.append('trailConditions', JSON.stringify(trailConditions));
	} else {
	// Add regular user fields
	formData.append('classicStyle', document.getElementById('classic-style').value);
	formData.append('freeStyle', document.getElementById('free-style').value);
	formData.append('snowAge', document.getElementById('snow-age').value);
	formData.append('wetness', document.getElementById('wetness').value);
	formData.append('country', document.getElementById('country').value);
	formData.append('region', document.getElementById('region').value);
	formData.append('reportDate', document.getElementById('report-date').value);
	formData.append('snowDepth250', document.getElementById('snow-depth250').value);
	formData.append('snowDepth500', document.getElementById('snow-depth500').value);
	formData.append('snowDepth750', document.getElementById('snow-depth750').value);
	formData.append('snowDepth1000', document.getElementById('snow-depth1000').value);
	}

	photos.forEach((photo, index) => {
		formData.append(`photo_${index}`, photo);
	});

	const laborTime = document.getElementById('labor-time');
	const rewardRequested = document.getElementById('reward-requested');
      
      if (laborTime) {
        formData.append('laborTime', laborTime.value);
      }
      if (rewardRequested) {
        formData.append('rewardRequested', rewardRequested.value);
      }

      logFormData(formData);

    // actual form submission code here
    // const response = await fetch('/api/submit-snow-report', {
    //   method: 'POST',
    //   body: formData
    // });

      alert(i18next.t('form.validation.submitSuccess'));
    } catch (error) {
      console.error('Error submitting snow report:', error);
      alert(i18next.t('form.validation.submitError'));
    }
});

window.addEventListener('languageChanged', updatePageContent);

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded event fired');

  document.getElementById('login-button').addEventListener('click', initiateOAuth);
  document.getElementById('logout-button').addEventListener('click', logout);

  document.getElementById('cancel-button').addEventListener('click', function() {
    // Reset form
    document.getElementById('snow-report-form').reset();
    
    // Reset any file inputs and photo previews
    const photoPreviewContainer = document.getElementById('photo-preview-container');
    if (photoPreviewContainer) {
        photoPreviewContainer.innerHTML = '';
    }
    photos = []; // Clear the photos array
    
    // Reset elapsed time if it's being tracked
    if (formStartTime) {
        formStartTime = null;
        if (elapsedTimeInterval) {
            clearInterval(elapsedTimeInterval);
            elapsedTimeInterval = null;
        }
    }
    
    // Show dashboard, hide form
    document.getElementById('dashboard-container').style.display = 'block';
    document.getElementById('snow-report-form').style.display = 'none';
  });

  try {
    console.log('Initializing form validation');
    initializeFormValidation();

    // For debugging: Check if handlers were attached
    const validatableElements = document.querySelectorAll('[data-i18n-validate]');
    console.log('Found validatable elements:', validatableElements.length);
    validatableElements.forEach(el => {
      console.log('Element:', el.id, 'Required:', el.required);
    });

    await initI18next();
    console.log('i18next initialized');
    await updatePageContent();
    
    initializeDatePicker();
    initializePhotoUpload();

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
    const snowReportLink = document.getElementById('snow-report-link');
    snowReportLink.addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('dashboard-container').style.display = 'none';
        document.getElementById('snow-report-form').style.display = 'block';
    });
});

//helper function for enhanced logging
function logFormData(formData) {
    console.log('Form data contents:');
    for (let pair of formData.entries()) {
        if (pair[1] instanceof File) {
            console.log(pair[0] + ':', {
                name: pair[1].name,
                type: pair[1].type,
                size: pair[1].size + ' bytes'
            });
        } else {
            console.log(pair[0] + ':', pair[1]);
        }
    }
}

//the timer function for the Rewards section
function updateElapsedTime() {
    if (!formStartTime) return;
    
    const now = new Date();
    const diff = Math.floor((now - formStartTime) / 1000); // difference in seconds
    
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    
    // Update each span separately
    document.getElementById('elapsed-hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('elapsed-minutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('elapsed-seconds').textContent = String(seconds).padStart(2, '0');
}

// A helper function for custom validation
function validateField(input) {
  const validity = input.validity;
  
  if (validity.valueMissing) {
    return i18next.t(input.dataset.i18nValidate);
  }
  
  if (input.type === 'number') {
    const value = Number(input.value);
    const min = Number(input.min);
    const max = Number(input.max);
    
    if (value < min) {
      return i18next.t(input.dataset.i18nValidateMin, { min: min });
    }
    if (value > max) {
      return i18next.t(input.dataset.i18nValidateMax, { max: max });
    }
  }
  
  return '';
}
