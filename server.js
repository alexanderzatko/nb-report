require('dotenv').config();

const express = require('express');
const session = require('express-session');
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
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
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

app.post('/api/logout', authenticateUser, (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ error: 'Failed to destroy session' });
      }
      res.clearCookie('session_cookie_name'); // Use the custom cookie name
      res.status(200).json({ message: 'Logged out successfully' });
    });
  } else {
    res.status(200).json({ message: 'No active session to logout' });
  }
});

// Session middleware
app.use(session({
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET, // Set in the .env file
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 1 day
        }
}));

app.post('/api/submit-snow-report', authenticateUser, (req, res) => {
  
  // Process the snow report submission
  
  console.log('Snow report received:', req.body);
  res.json({ message: 'Snow report submitted successfully' });
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
      res.json(response.data);
    } else {
      res.status(400).json({ error: 'Failed to obtain access token' });
    }
  } catch (error) {
    console.error('Error exchanging token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/user-data', (req, res) => {
  if (req.session.accessToken) {
    
      // insert code to fetch actual user data using the access token
      
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
