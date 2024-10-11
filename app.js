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
  
  regionSelect.innerHTML = '<option value="">Select a region</option>';

  if (selectedCountry in regionData) {
    regionData[selectedCountry].forEach(region => {
      const option = document.createElement('option');
      option.value = region;
      option.textContent = region;
      regionSelect.appendChild(option);
    });
  }
}

function getUserData() {
  const userData = JSON.parse(localStorage.getItem('user_data'));
  if (userData) {
    console.log('User email:', userData.email);
    console.log('Rovas API Key:', userData.rovas_api_key);
    console.log('Rovas Token:', userData.rovas_token);
    // Use the data as needed in your application
  }
}

function updateUIBasedOnAuthState() {
  const userData = JSON.parse(localStorage.getItem('userData'));
  const loginButton = document.getElementById('oauth-login-button');
  const snowReportForm = document.getElementById('snow-report-form');
  
  if (userData && userData.accessToken) {
    if (loginButton) loginButton.style.display = 'none';
    if (snowReportForm) snowReportForm.style.display = 'block';
  } else {
    if (loginButton) loginButton.style.display = 'block';
    if (snowReportForm) snowReportForm.style.display = 'none';
  }
}

async function initiateOAuth() {
  try {
    // Generate a random state
    const state = Math.random().toString(36).substring(2, 15);
    
    // Store the state in localStorage
    localStorage.setItem('oauthState', state);

    const response = await fetch('/api/initiate-oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state, scopes: 'email rovas_apikeys' }),
    });
    const data = await response.json();
    if (data.authUrl) {
      window.location.href = data.authUrl;
    } else {
      console.error('No auth URL received');
    }
  } catch (error) {
    console.error('Error initiating OAuth:', error);
  }
}

async function handleOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  const storedState = localStorage.getItem('oauth_state');

  if (state !== storedState) {
    console.error('Invalid state parameter. Possible CSRF attack.');
    return;
  }

  if (!code) {
    console.error('No code parameter found in URL');
    return;
  }

  try {
    localStorage.removeItem('oauth_state');
    await exchangeToken(code);
    
    // Remove the code and state from the URL
    const newUrl = window.location.href.split('?')[0];
    window.history.pushState({}, document.title, newUrl);

    // Update UI to reflect logged-in state
    exchangeToken(code).then(() => {
      updateUIBasedOnAuthState();
    });
    
  } catch (error) {
    console.error('Error during token exchange:', error);
  }
}

async function exchangeToken(code) {
  try {
    const response = await fetch('/api/exchange-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('user_data', JSON.stringify(data.userData));
    console.log('Token exchanged successfully');
  } catch (error) {
    console.error('Failed to exchange token:', error);
  }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js').then(function(registration) {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, function(err) {
      console.log('ServiceWorker registration failed: ', err);
    });
  });

  navigator.serviceWorker.register('/service-worker.js').then(reg => {
    reg.onupdatefound = () => {
      const installingWorker = reg.installing;
      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New content is available, prompt user to refresh
          if (confirm('New version available! Click OK to refresh.')) {
            window.location.reload();
          }
        }
      };
    };
  });
}
document.getElementById('country').addEventListener('change', updateRegions);

document.getElementById('snow-report-form').addEventListener('submit', function(event) {
  event.preventDefault();
  
  const country = document.getElementById('country').value;
  const region = document.getElementById('region').value;
  const snowDepth = document.getElementById('snow-depth').value;
  const snowType = document.getElementById('snow-type').value;

  console.log(`Country: ${country}, Region: ${region}, Snow Depth: ${snowDepth}, Snow Type: ${snowType}`);
  alert("Report submitted successfully!");
});

document.getElementById('oauth-login-button').addEventListener('click', initiateOAuth);

document.addEventListener('DOMContentLoaded', function() {
  updateUIBasedOnAuthState();
  handleOAuthCallback();
});
