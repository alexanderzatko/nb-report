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
  checkAuthStatus().then(isAuthenticated => {
    if (isAuthenticated) {
      logout();
    } else {
      initiateOAuth();
    }
  });
}

async function logout() {
  try {
    console.log('Logout function called');
    const response = await fetch('/api/logout', { 
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Logout failed');
    }

    const data = await response.json();
    console.log('Logout response:', data);

    // Clear any client-side stored data
    localStorage.removeItem('sessionId');

    console.log('Logout successful, updating UI');
    await updateUIBasedOnAuthState();
    console.log('UI updated after logout');

    // Delay reload to allow console messages to be seen
    setTimeout(() => {
      console.log('Reloading page...');
      window.location.reload();
    }, 2000);
  } catch (error) {
    console.error('Logout error:', error);
  }
}

async function updateUIBasedOnAuthState() {
  const isAuthenticated = await checkAuthStatus();
  console.log('Authentication status:', isAuthenticated);
  const authButton = document.getElementById('auth-button');
  const snowReportForm = document.getElementById('snow-report-form');

  if (isAuthenticated) {
    authButton.textContent = 'Logout';
    snowReportForm.style.display = 'block';
    console.log('User is authenticated, showing form');
  } else {
    authButton.textContent = 'Login';
    snowReportForm.style.display = 'none';
    console.log('User is not authenticated, hiding form');
  }
}

function updateUIWithUserData(userData) {

  console.log(userData);
  // Update UI elements with user data
  // For example:
//  const userInfoElement = document.getElementById('user-info');
//  if (userInfoElement) {
//    userInfoElement.textContent = `Welcome, ${userData.name} (${userData.role})`;
//  }
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
      return;
    }
    console.log('State validation successful');
  } else {
    console.log('No OAuth state detected, skipping validation.');
  }

  if (code) {
    console.log('Exchanging token');
    try {
      await exchangeToken(code);
      console.log('Token exchanged successfully');
      await updateUIBasedOnAuthState();
    } catch (error) {
      console.error('Error exchanging token:', error);
    }
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
    
    if (data.success) {
      console.log('Token exchange successful');
      // Fetch user data after successful token exchange
      const userData = await getUserData();
      if (userData) {
        updateUIWithUserData(userData);
      }
      
      // Update UI
      await updateUIBasedOnAuthState();
      console.log('UI updated after successful login');
    } else {
      throw new Error('Token exchange failed');
    }
  } catch (error) {
    console.error('Error exchanging token:', error);
  }
}

async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth-status');
    const data = await response.json();
    console.log('Auth status response:', data);
    return data.isAuthenticated;
  } catch (error) {
    console.error('Error checking auth status:', error);
    return false;
  }
}

async function getUserData() {
  const sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    return null;
  }

  try {
    const response = await fetch('/api/user-data');
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

// refresh the token periodically
setInterval(checkAndRefreshToken, 15 * 60 * 1000); // Check every 15 minutes

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

      console.log(`Country: ${country}, Region: ${region}, Snow Depth: ${snowDepth}, Snow Type: ${snowType}`);
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

document.getElementById('auth-button').addEventListener('click', toggleAuth);

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded event fired');
  await updateUIBasedOnAuthState();
  
  const urlParams = new URLSearchParams(window.location.search);
  console.log('URL params:', urlParams.toString());
  if (urlParams.has('code')) {
    console.log('Code parameter found in URL');
    await handleOAuthCallback();
  } else {
    console.log('No code parameter in URL');
  }
});
