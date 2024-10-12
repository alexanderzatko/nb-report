const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const app = express();
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_REDIRECT_URI = 'https://report.nabezky.sk/api/nblogin/';
const OAUTH_PROVIDER_URL = 'https://nabezky.sk';

const authenticateUser = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Here you would typically verify the token
  // For now, we'll just check if it exists
  next();
};

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET, // Set this in your .env file
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI, // Set this in your .env file
    collectionName: 'sessions'
  }),
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
    const response = await axios.post(`${OAUTH_PROVIDER_URL}/oauth2/token`, {
      grant_type: 'authorization_code',
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code: code,
      redirect_uri: OAUTH_REDIRECT_URI
    });
  
    if (response.data && response.data.access_token) {
      
      // Instead of sending the token to the client, we store it in the session
      req.session.accessToken = userData.access_token;
      req.session.userData = userData;
      
      // Sending only a session identifier to the client
      res.json({ sessionId: req.sessionID });
    } else {
      throw new Error('Failed to obtain access token');
    }
  } catch (error) {
    console.error('Error exchanging token:', error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

app.get('/api/user-data', (req, res) => {
  if (req.session.userData) {
    res.json(req.session.userData);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
