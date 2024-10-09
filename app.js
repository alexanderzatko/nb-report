const regionData = {
  "Austria": ["The Alps"],
  "Germany": ["The Alps"],
  "Italy": ["The Alps"],
  "Slovakia": ["Javorie"]
};

function updateRegions() {
  const countrySelect = document.getElementById('country');
  const regionSelect = document.getElementById('region');
  const selectedCountry = countrySelect.value;
  
  // Clear existing options
  regionSelect.innerHTML = '<option value="">Select a region</option>';
  // Populate regions based on selected country
  if (selectedCountry in regionData) {
    regionData[selectedCountry].forEach(region => {
      const option = document.createElement('option');
      option.value = region;
      option.textContent = region;
      regionSelect.appendChild(option);
    });
  }
}

// Register the service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js').then(function(registration) {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, function(err) {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

// Add event listener for country selection
document.getElementById('country').addEventListener('change', updateRegions);

// Modify the form submission handler
document.getElementById('snow-report-form').addEventListener('submit', function(event) {
  event.preventDefault();
  
  const country = document.getElementById('country').value;
  const region = document.getElementById('region').value;
  const snowDepth = document.getElementById('snow-depth').value;
  const snowType = document.getElementById('snow-type').value;
  console.log(`Country: ${country}, Region: ${region}, Snow Depth: ${snowDepth}, Snow Type: ${snowType}`);
  alert("Report submitted successfully!");
});



// OAuth2 configuration
const oauthConfig = {
  clientId: 'nbreport',
  authorizationEndpoint: 'https://nabezky.sk/auth',
  tokenEndpoint: 'https://nabezky.sk/token',
  redirectUri: 'https://report.nabezky.sk/nblogin/',
  scope: 'email'
};

// Check if user is authenticated
function isAuthenticated() {
  return !!localStorage.getItem('access_token');
}

// Show/hide content based on authentication status
function updateUIBasedOnAuth() {
  const loginSection = document.getElementById('login-section');
  const appContent = document.getElementById('app-content');
  
  if (isAuthenticated()) {
    loginSection.style.display = 'none';
    appContent.style.display = 'block';
  } else {
    loginSection.style.display = 'block';
    appContent.style.display = 'none';
  }
}

// Handle OAuth2 login
document.getElementById('oauth-login-button').addEventListener('click', function() {
  const authUrl = `${oauthConfig.authorizationEndpoint}?client_id=${oauthConfig.clientId}&redirect_uri=${encodeURIComponent(oauthConfig.redirectUri)}&response_type=code&scope=${encodeURIComponent(oauthConfig.scope)}`;
  window.location.href = authUrl;
});

// Handle OAuth2 callback
if (window.location.search.includes('code=')) {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  
  // Exchange code for token (you'll need to implement this part)
  exchangeCodeForToken(code).then(token => {
    localStorage.setItem('access_token', token);
    updateUIBasedOnAuth();
  });
}

// Call this function on page load
updateUIBasedOnAuth();
