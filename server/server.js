import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import winston from 'winston';
import MySQLStore from 'express-mysql-session';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const options = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

const app = express();
const port = process.env.PORT || 3000;

// Manually create SessionStore
const sessionStore = new (MySQLStore(session))(options);

// Function to set correct MIME types
const setCorrectMimeType = (res, path) => {
  if (path.endsWith('.js')) {
    res.set('Content-Type', 'application/javascript');
  } else if (path.endsWith('.cjs')) {
    res.set('Content-Type', 'application/javascript');
  }
};

// Serve static files with specific configurations
app.use('/js', express.static(path.join(__dirname, '../public/js'), {
  setHeaders: setCorrectMimeType
}));

app.use('/locales', express.static(path.join(__dirname, '../public/locales')));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: setCorrectMimeType
}));

// Serve necessary files from node_modules with correct MIME type
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules'), {
  setHeaders: setCorrectMimeType
}));

//This tells Express that it's behind a proxy and to trust the X-Forwarded-* headers
app.set('trust proxy', 1);

// Session middleware
app.use(session({
  key: 'nb_report_cookie',
  secret: process.env.SESSION_SECRET,
  resave: true,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    domain: 'nabezky.sk'
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

if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    logger.error('Missing required OAuth configuration');
    throw new Error('Missing required OAuth configuration');
}

const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token && (!req.session || !req.session.accessToken)) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }
  next();
};

app.post('/api/logout', async (req, res) => {
    logger.info('Logout request received');
    
    try {
        // If we have an access token, revoke it at the OAuth provider
        if (req.session?.accessToken) {
            try {
                await axios.post(`${OAUTH_PROVIDER_URL}/oauth2/revoke`, {
                    token: req.session.accessToken,
                    client_id: OAUTH_CLIENT_ID,
                    client_secret: OAUTH_CLIENT_SECRET
                });
            } catch (error) {
                logger.error('Error revoking token:', error);
            }
        }

        // Clear session
        if (req.session) {
            await new Promise((resolve, reject) => {
                req.session.destroy((err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
        }

        // Clear cookie
        res.clearCookie('nb_report_cookie');
        
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        logger.error('Error during logout:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

app.get('/api/auth-status', async (req, res) => {
    logger.info('Auth status check request received');

    // For new logins, trust the session without re-verification
    if (req.session?.isNewLogin) {
        req.session.isNewLogin = false; // Clear the flag
        return res.json({ 
            isAuthenticated: true,
            sessionID: req.sessionID
        });
    }

    if (!req.session?.accessToken) {
        return res.json({ isAuthenticated: false });
    }

    try {
        // Only verify with OAuth provider for non-new sessions
        const response = await axios.get(`${OAUTH_PROVIDER_URL}/oauth2/verify`, {
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`
            }
        });

        if (response.status === 200) {
            req.session.touch();
            res.json({ 
                isAuthenticated: true,
                sessionID: req.sessionID
            });
        } else {
            req.session.destroy();
            res.json({ isAuthenticated: false });
        }
    } catch (error) {
        logger.error('Token verification failed:', error);
        req.session.destroy();
        res.json({ isAuthenticated: false });
    }
});

app.post('/api/submit-snow-report', (req, res) => {
  // Log the received data
  console.log('Snow report received:', req.body);
  // Send success response
  res.json({ message: 'Snow report received successfully' });
});

app.post('/api/initiate-oauth', (req, res) => {
  const { state, scopes, forceReauth } = req.body;
  let authUrl = `${OAUTH_PROVIDER_URL}/oauth2/authorize?client_id=${OAUTH_CLIENT_ID}&redirect_uri=${OAUTH_REDIRECT_URI}&response_type=code&state=${state}&scope=${encodeURIComponent(scopes || '')}`;
  
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
    
    if (!code) {
        logger.error('No code provided in token exchange request');
        return res.status(400).json({ error: 'No code provided' });
    }

    try {
        // Log the request we're about to make for debugging
        logger.debug('Making token request to OAuth provider', {
            url: TOKEN_URL,
            code: code,
            redirect_uri: OAUTH_REDIRECT_URI
        });

        const tokenResponse = await axios.post(TOKEN_URL, 
            new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: OAUTH_CLIENT_ID,
                client_secret: OAUTH_CLIENT_SECRET,
                code: code,
                redirect_uri: OAUTH_REDIRECT_URI
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        logger.debug('Token response received', {
            status: tokenResponse.status,
            hasAccessToken: !!tokenResponse.data.access_token
        });
        
        if (tokenResponse.data && tokenResponse.data.access_token) {
            // Initialize session if it doesn't exist
            if (!req.session) {
                req.session = {};
            }

            // Store tokens in session
            req.session.accessToken = tokenResponse.data.access_token;
            req.session.refreshToken = tokenResponse.data.refresh_token;
            req.session.tokenType = tokenResponse.data.token_type;
            req.session.isNewLogin = true;

            // Save session
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) {
                        logger.error('Session save error:', err);
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });

            logger.info('Session saved successfully', {
                sessionID: req.sessionID,
                hasAccessToken: !!req.session.accessToken
            });

            // Set cookie with proper options
            res.cookie('nb_report_cookie', req.sessionID, {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                domain: '.nabezky.sk'
            });

            res.json({
                success: true,
                sessionId: req.sessionID
            });
        } else {
            logger.warn('No access token in response', tokenResponse.data);
            res.status(400).json({ error: 'No access token in response' });
        }
    } catch (error) {
        logger.error('Token exchange error:', {
            error: error.response?.data || error.message,
            status: error.response?.status
        });

        // Return appropriate error response
        if (error.response?.status === 401) {
            res.status(401).json({ error: 'Invalid token' });
        } else {
            res.status(500).json({ 
                error: 'Internal server error',
                details: error.response?.data || error.message
            });
        }
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

    logger.info('User data retrieved:', response.data);  // Add this log

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
