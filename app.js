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
      body: JSON.stringify({ state }),
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
    console.log('Token exchanged successfully');
  } catch (error) {
    console.error('Failed to exchange token:', error);
  }
}

function handleOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');

  // Only perform the check if there's a state parameter in the URL
  if (state) {
    const storedState = localStorage.getItem('oauthState');
    if (state !== storedState) {
      console.error('State mismatch. Possible CSRF attack.');
      return;
    }
    // Proceed with OAuth logic here
  } else {
    // No state parameter, likely initial page load
    console.log('No OAuth state detected, skipping validation.');
  }

  if (code) {
    exchangeToken(code);
  }

  function handleOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');

  // Only perform the check if there's a state parameter in the URL
  if (state) {
    const storedState = localStorage.getItem('oauthState');
    if (state !== storedState) {
      console.error('State mismatch. Possible CSRF attack.');
      return;
    }
    // Proceed with OAuth logic here (e.g., exchanging the code for a token)
    if (code) {
      exchangeToken(code);
    }
  } else {
    // No state parameter, likely initial page load
    console.log('No OAuth state detected, skipping validation.');
  }

  // Clear the stored state and remove URL parameters
  localStorage.removeItem('oauthState');
  window.history.replaceState({}, document.title, window.location.pathname);
}
  // Clear the stored state
  localStorage.removeItem('oauthState');

  // Clear the URL parameters
  window.history.replaceState({}, document.title, "/");
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

document.addEventListener('DOMContentLoaded', () => {
  handleOAuthCallback();
});
