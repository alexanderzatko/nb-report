console.log('app.js loaded');

const regionData = {
  "Austria": ["The Alps"],
  "Germany": ["The Alps"],
  "Italy": ["The Alps"],
  "Slovakia": ["Javorie"],
  "Slovakia": ["Malé Karpaty"],
  "Czech": ["Javorníky"]
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

function toggleAuth() {
  console.log('toggleAuth called');
  const sessionId = localStorage.getItem('sessionId');
  console.log('Current sessionId:', sessionId);  // Add this line
  if (sessionId) {
    logout();
  } else {
    initiateOAuth();
  }
}

function logout() {
  fetch('/api/logout', { method: 'POST' })
    .then(() => {
      localStorage.removeItem('sessionId');
      updateUIBasedOnAuthState();
      console.log('User logged out');
    })
    .catch(error => console.error('Logout error:', error));
}

function updateUIBasedOnAuthState() {
  const sessionId = localStorage.getItem('sessionId');
  const authButton = document.getElementById('auth-button');
  const snowReportForm = document.getElementById('snow-report-form');

  if (sessionId) {
    authButton.textContent = 'Logout';
    snowReportForm.style.display = 'block';
  } else {
    authButton.textContent = 'Login';
    snowReportForm.style.display = 'none';
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
      body: JSON.stringify({ state, scopes: 'email' }),
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
      return;
    }
    console.log('State validation successful');
  } else {
    console.log('No OAuth state detected, skipping validation.');
  }

  if (code) {
    console.log('Exchanging token');
    exchangeToken(code).then(() => {
      console.log('Token exchanged successfully');
      updateUIBasedOnAuthState();
    }).catch(error => {
      console.error('Error exchanging token:', error);
    });
  } else {
    console.log('No code present, skipping token exchange');
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
    });

    if (!response.ok) {
      throw new Error('Failed to exchange token');
    }

    const data = await response.json();
    
    // Store only the session ID
    localStorage.setItem('sessionId', data.sessionId);

    // Update UI
    updateUIBasedOnAuthState();
    console.log('Token exchange successful');
  } catch (error) {
    console.error('Error exchanging token:', error);
  }
}

async function getUserData() {
  const sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    return null;
  }

  try {
    const response = await fetch('/api/user-data', {
      headers: {
        'Cookie': `connect.sid=${sessionId}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
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
  const userData = getUserData();
  if (!userData || !userData.authenticated) {
    alert('Please log in to submit the report.');
    return;
  }
  const country = document.getElementById('country').value;
  const region = document.getElementById('region').value;
  const snowDepth = document.getElementById('snow-depth').value;
  const snowType = document.getElementById('snow-type').value;

  console.log(`Country: ${country}, Region: ${region}, Snow Depth: ${snowDepth}, Snow Type: ${snowType}`);
  alert("Report submitted successfully!");
});

document.getElementById('auth-button').addEventListener('click', toggleAuth);

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired');
  updateUIBasedOnAuthState();
  
  const urlParams = new URLSearchParams(window.location.search);
  console.log('URL params:', urlParams.toString());
  if (urlParams.has('code')) {
    console.log('Code parameter found in URL');
    handleOAuthCallback();
  } else {
    console.log('No code parameter in URL');
  }
});
