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

  console.log('updateUIBasedOnAuthState called');
  console.log('userData:', userData);

  if (userData && userData.accessToken) {
    console.log('User is logged in, hiding login button');
    if (loginButton) {
      loginButton.style.display = 'none';
      console.log('Login button hidden');
    } else {
      console.log('Login button not found');
    }
    if (snowReportForm) {
      snowReportForm.style.display = 'block';
      console.log('Snow report form shown');
    } else {
      console.log('Snow report form not found');
    }
  } else {
    console.log('User is not logged in, showing login button');
    if (loginButton) {
      loginButton.style.display = 'block';
      console.log('Login button shown');
    } else {
      console.log('Login button not found');
    }
    if (snowReportForm) {
      snowReportForm.style.display = 'none';
      console.log('Snow report form hidden');
    } else {
      console.log('Snow report form not found');
    }
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
    exchangeToken(code).then(() => {
      updateUIBasedOnAuthState();
    });
  }
  // Clear the stored state
  localStorage.removeItem('oauthState');

  // Clear the URL parameters
  window.history.replaceState({}, document.title, "/");
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

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('userData', JSON.stringify(data));
      console.log('Access token stored successfully');
      console.log('User data:', data); // Add this debug line
      updateUIBasedOnAuthState(); // Make sure this line is here
    } else {
      console.error('Failed to exchange token');
    }
  } catch (error) {
    console.error('Error exchanging token:', error);
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

document.addEventListener('DOMContentLoaded', () => {
  updateUIBasedOnAuthState();
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('code')) {
    handleOAuthCallback();
  }
});
