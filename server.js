require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const winston = require('winston');

const options = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};
const sessionStore = new MySQLStore(options);
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors({
  origin: 'https://report.nabezky.sk', // Your frontend URL
  credentials: true
}));

app.use(express.json());

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_REDIRECT_URI = 'https://report.nabezky.sk/api/nblogin/';
const OAUTH_PROVIDER_URL = 'https://nabezky.sk';
const TOKEN_URL = process.env.TOKEN_URL || 'https://nabezky.sk/oauth2/token';

const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token && (!req.session || !req.session.accessToken)) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }
  next();
};

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'server-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'server-combined.log' })
  ]
});

app.post('/api/logout', (req, res) => {
  logger.info('Logout request received', { 
    sessionID: req.sessionID,
    headers: req.headers,
    cookies: req.cookies
  });
  // ... rest of the route handler
});

app.post('/api/logout', (req, res) => {
    logger.info('Logout request received', { 
        sessionID: req.sessionID,
        headers: req.headers,
        cookies: req.cookies
    });
    logger.debug('Session before logout:', req.session);
  
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        logger.error('Session destruction error:', err);
        return res.status(500).json({ error: 'Failed to destroy session' });
      }
      res.clearCookie('session_cookie_name'); // Ensure this matches your session cookie name
      logger.info('Session destroyed and cookie cleared');
      res.status(200).json({ message: 'Logged out successfully' });
    });
  } else {
    logger.info('No active session found');
    res.status(200).json({ message: 'No active session to logout' });
  }
});

// Session middleware
app.use(session({
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: process.env.COOKIE_SECURE === 'true', // Explicitly set in .env
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));

app.get('/api/auth-status', (req, res) => {
  console.log('Auth status checked. Session:', req.session);
  const isAuthenticated = !!req.session.accessToken;
  console.log('Is authenticated:', isAuthenticated);
  res.json({ isAuthenticated: isAuthenticated });
});

app.post('/api/submit-snow-report', (req, res) => {
  if (req.session.accessToken) {
    // Process the snow report submission
    console.log('Snow report received:', req.body);
    res.json({ message: 'Snow report submitted successfully' });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/api/initiate-oauth', (req, res) => {
  const { state } = req.body;
  const scopes = req.body.scopes || ''; // Default to empty string if not provided
  const authUrl = `${OAUTH_PROVIDER_URL}/oauth2/authorize?client_id=${OAUTH_CLIENT_ID}&redirect_uri=${OAUTH_REDIRECT_URI}&response_type=code&state=${state}&scope=${encodeURIComponent(scopes)}`;
  res.json({ authUrl });
});

app.get('/api/nblogin', (req, res) => {
  const { code, state } = req.query;
  
  // code for validating the state here
  
  // Redirect to the frontend with the code
  res.redirect(`/?code=${code}&state=${state}`);
});

app.post('/api/exchange-token', async (req, res) => {
  const { code } = req.body;
  
  try {
    const response = await axios.post(TOKEN_URL, {
      grant_type: 'authorization_code',
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code: code,
      redirect_uri: OAUTH_REDIRECT_URI
    });
    
    if (response.data && response.data.access_token) {
      req.session.accessToken = response.data.access_token;
      req.session.refreshToken = response.data.refresh_token;
      // Set a flag to indicate that this is a new login
      req.session.isNewLogin = true;
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Failed to obtain access token' });
    }
  } catch (error) {
    console.error('Error exchanging token:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/refresh-token', async (req, res) => {
  if (!req.session.refreshToken) {
    return res.status(401).json({ error: 'No refresh token available' });
  }

  // If this is a new login, skip the refresh
  if (req.session.isNewLogin) {
    req.session.isNewLogin = false;
    return res.json({ success: true, message: 'New login, refresh not needed' });
  }

  try {
    const response = await axios.post(TOKEN_URL, {
      grant_type: 'refresh_token',
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      refresh_token: req.session.refreshToken
    });

    if (response.data && response.data.access_token) {
      req.session.accessToken = response.data.access_token;
      if (response.data.refresh_token) {
        req.session.refreshToken = response.data.refresh_token;
      }
      res.json({ success: true });
    } else {
      throw new Error('Failed to refresh token');
    }
  } catch (error) {
    console.error('Error refreshing token:', error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 400) {
      // The refresh token might be invalid or expired
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
        res.status(401).json({ error: 'Session expired. Please log in again.' });
      });
    } else {
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  }
});

app.get('/api/user-data', async (req, res) => {
  if (req.session.accessToken) {
    try {
      // Fetch user data from Drupal server using the access token
      const response = await axios.post(
        `${OAUTH_PROVIDER_URL}/nabezky/rules/rules_retrieve_data_for_the_nb_report_app`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${req.session.accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      // Send the user data back to the client
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      res.status(500).json({ error: 'Failed to fetch user data' });
    }
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
