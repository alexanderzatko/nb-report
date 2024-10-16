require('dotenv').config();

const express = require('express');
const session = require('express-session');

const winston = require('winston');
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

const MySQLStore = require('express-mysql-session')(session);
const options = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};
const sessionStore = new MySQLStore(options);

const axios = require('axios');
const app = express();
const port = 3000;

// Middleware to serve JavaScript files with the correct MIME type
app.use((req, res, next) => {
  if (req.url.endsWith('.js') || req.url.endsWith('.cjs')) {
    res.type('application/javascript');
  }
  next();
});

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, ''), {
  setHeaders: (res, path, stat) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    }
  }
}));

//This tells Express that it's behind a proxy and to trust the X-Forwarded-* headers
app.set('trust proxy', 1);

// Session middleware
app.use(session({
  key: 'nb_report_cookie',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
//secure: process.env.COOKIE_SECURE === 'true', // Explicitly set in .env
    secure: true,
    httpOnly: true,
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    domain: 'nabezky.sk'  // Add this line
}
}));

/*
const cors = require('cors');
app.use(cors({
  origin: 'https://report.nabezky.sk',
  credentials: true
}));
*/

//log all cookies
app.use((req, res, next) => {
  logger.info('Incoming request cookies:', req.cookies);
  next();
});

//logging all incoming requests
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    sessionID: req.sessionID
  });
  next();
});

//logging outgoing response headers
app.use((req, res, next) => {
  const oldWriteHead = res.writeHead;
  res.writeHead = function(statusCode, headers) {
    logger.info('Response headers', {
      url: req.url,
      method: req.method,
      statusCode,
      headers: this.getHeaders()
    });
    oldWriteHead.apply(this, arguments);
  };
  next();
});

//logging errors
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    sessionID: req.sessionID
  });
  res.status(500).json({ error: 'Internal server error' });
});

//for checking the session by making a call to this endpoint
app.get('/api/check-session', (req, res) => {
  logger.info('Checking session', {
    sessionID: req.sessionID,
    hasSession: !!req.session,
    sessionContent: req.session
  });
  res.json({
    sessionID: req.sessionID,
    hasSession: !!req.session,
    hasAccessToken: !!req.session.accessToken
  });
});
    
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
      res.clearCookie('nb_report_cookie'); 
      logger.info('Session destroyed and cookie cleared');
      res.status(200).json({ message: 'Logged out successfully' });
    });
  } else {
    logger.info('No active session found');
    res.status(200).json({ message: 'No active session to logout' });
  }
});

app.get('/api/auth-status', (req, res) => {
  logger.info('Auth status check request received', { 
    sessionID: req.sessionID,
    hasSession: !!req.session,
    hasAccessToken: req.session && !!req.session.accessToken
  });

  const isAuthenticated = !!(req.session && req.session.accessToken);
  
  res.json({ 
    isAuthenticated: isAuthenticated,
    sessionID: req.sessionID,
    // Only include non-sensitive user info here
    userInfo: isAuthenticated ? {
      // e.g., username: req.session.username,
    } : null
  });
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
  logger.info('Token exchange request received', {
    sessionID: req.sessionID,
    hasSession: !!req.session
  });

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
      req.session.isNewLogin = true;

    logger.info('Session before save:', {
      sessionID: req.sessionID,
      session: req.session
    });
      
      req.session.save((err) => {
        if (err) {
          logger.error('Session save error:', { error: err });
          return res.status(500).json({ error: 'Failed to save session' });
        }
        logger.info('Session saved successfully', {
          sessionID: req.sessionID,
          sessionContent: req.session
          });
        res.json({ success: true, sessionId: req.sessionID });
      });
    } else {
      logger.warn('Failed to obtain access token');
      res.status(400).json({ error: 'Failed to obtain access token' });
    }
  } catch (error) {
    logger.error('Error exchanging token:', { 
      error: error.response ? error.response.data : error.message 
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/refresh-token', async (req, res) => {
  logger.info('Token refresh attempt', { sessionID: req.sessionID });
  
  if (!req.session || !req.session.refreshToken) {
    logger.warn('No refresh token available', { sessionID: req.sessionID });
    return res.status(401).json({ error: 'No refresh token available' });
  }

  // If this is a new login, skip the refresh
/*
  if (req.session.isNewLogin) {
    req.session.isNewLogin = false;
    return res.json({ success: true, message: 'New login, refresh not needed' });
  }  
*/

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
      logger.info('Token refreshed successfully', { sessionID: req.sessionID });
      res.json({ success: true });
    } else {
      throw new Error('Failed to refresh token: No access token in response');
    }
  } catch (error) {
    logger.error('Error refreshing token:', error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 400) {
      // The refresh token might be invalid or expired
      req.session.destroy((err) => {
        if (err) logger.error('Error destroying session:', err);
        res.status(401).json({ error: 'Session expired. Please log in again.' });
      });
    } else {
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  }
});

app.get('/api/user-data', async (req, res) => {
  logger.info('User data request received', { sessionID: req.sessionID });
  
  if (!req.session || !req.session.accessToken) {
    logger.warn('Unauthorized user data request', { sessionID: req.sessionID });
    return res.status(401).json({ error: 'Not authenticated' });
  }

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

    // Update the session with the latest user data
    req.session.userData = response.data;
    req.session.save((err) => {
      if (err) logger.error('Error saving session:', err);
    });

    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});


// Endpoint to check session validity
app.get('/api/check-session', (req, res) => {
  if (req.session && req.session.accessToken) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false, error: 'Invalid or expired session' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
