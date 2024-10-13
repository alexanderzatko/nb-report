require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));

app.use(express.json());

// Database configuration
const options = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

const sessionStore = new MySQLStore(options);

// Session middleware setup
app.use(session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization || (req.session && req.session.token);
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  next();
};

app.post('/api/logout', authenticateUser, (req, res) => {
  try {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
          return res.status(500).json({ message: 'Error logging out' });
        }
        res.json({ message: 'Logged out successfully' });
      });
    } else {
      res.json({ message: 'Logged out successfully' });
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Error logging out' });
  }
});

app.post('/api/submit-snow-report', authenticateUser, (req, res) => {
  console.log('Received snow report:', req.body);
  res.json({ message: 'Snow report submitted successfully' });
});

app.post('/api/initiate-oauth', (req, res) => {
  const { clientId, redirectUri, scope, state } = req.body;
  const authorizationUrl = `https://auth.northernbasin.ca/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
  res.json({ url: authorizationUrl });
});

app.get('/api/nblogin', (req, res) => {
  const { code, state } = req.query;
  if (!state) {
    return res.status(400).send('State parameter is missing');
  }
  res.redirect(`${process.env.CLIENT_URL}/callback?code=${code}&state=${state}`);
});

app.post('/api/exchange-token', async (req, res) => {
  const { code, redirectUri, clientId, clientSecret } = req.body;
  try {
    const response = await axios.post('https://auth.northernbasin.ca/oauth2/token', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    if (req.session) {
      req.session.token = response.data.access_token;
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('Token exchange error:', error.response ? error.response.data : error.message);
    res.status(500).json({ message: 'Error exchanging token' });
  }
});

app.get('/api/user-data', authenticateUser, (req, res) => {
  if (req.session && req.session.token) {
    res.json({ token: req.session.token });
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
