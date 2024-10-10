const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_REDIRECT_URI = 'https://report.nabezky.sk/nblogin/';
const OAUTH_PROVIDER_URL = 'https://nabezky.sk';

app.post('/api/initiate-oauth', (req, res) => {
  const authUrl = `${OAUTH_PROVIDER_URL}/oauth/authorize?client_id=${OAUTH_CLIENT_ID}&redirect_uri=${OAUTH_REDIRECT_URI}&response_type=code`;
  res.json({ url: authUrl });
});

app.post('/api/exchange-token', async (req, res) => {
  const { code } = req.body;
  try {
    const response = await axios.post(`${OAUTH_PROVIDER_URL}/oauth/token`, {
      grant_type: 'authorization_code',
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code: code,
      redirect_uri: OAUTH_REDIRECT_URI
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
