import * as dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import winston from 'winston';
import MySQLStore from 'express-mysql-session';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const requiredEnvVars = [
    'OAUTH_CLIENT_ID',
    'OAUTH_CLIENT_SECRET',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'SESSION_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars);
    process.exit(1);
}

console.log('All required environment variables are present');

// OAuth Configuration
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI;
const OAUTH_PROVIDER_URL = process.env.OAUTH_PROVIDER_URL;
const TOKEN_URL = process.env.TOKEN_URL;

// Create logs directory
const logDir = path.resolve(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.resolve(logDir, 'server-error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.resolve(logDir, 'server-combined.log')
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
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

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = '/tmp/uploads/';
        try {
            if (!fs.existsSync(uploadDir)){
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
}).fields([
    { name: 'filedata', maxCount: 1 },
    { name: 'caption', maxCount: 1 }
]);

app.use(express.json());

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
  resave: false,
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

app.post('/api/log-error', (req, res) => {
  try {

    if (!req.body) {
      logger.warn('Empty request body in log-error endpoint');
      return res.status(400).json({ status: 'error', message: 'No data provided' });
    }

    const { level = 'error', message, data } = req.body;
    
    // Log with session context if available
    const logData = {
      message,
      data,
      timestamp: new Date().toISOString(),
      clientIP: req.ip,
      userAgent: req.get('User-Agent'),
      sessionID: req.session?.id || 'no-session',
      isAuthenticated: !!req.session?.accessToken
    };

    // Log even if there's no session - these could be important startup errors
    logger.error('Client-side error', logData);
    
    res.status(200).json({ status: 'logged' });
  } catch (err) {
    logger.error('Error in log-error endpoint:', err);
    res.status(500).json({ error: 'Failed to log error' });
  }
});

//logging errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.error('JSON parsing error:', err);
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid JSON format'
    });
  }
  next(err);
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

  // Check if session exists and has valid tokens
  const isAuthenticated = !!(req.session && req.session.accessToken);
  
  if (isAuthenticated) {
    // Refresh the session expiry
    req.session.touch();
  }

  res.json({ 
    isAuthenticated,
    sessionID: req.sessionID,
    // Only include non-sensitive user info here
    userInfo: isAuthenticated ? {
      // e.g., username: req.session.username,
    } : null
  });
});

// Handle photo and gpx files uploads
app.post('/api/upload-file', (req, res, next) => {
    logger.debug('Upload request received:', {
        contentType: req.headers['content-type']
    });

    upload(req, res, async (err) => {
        if (err) {
            logger.error('Multer error:', {
                error: err.message,
                stack: err.stack,
                code: err.code
            });
            return res.status(500).json({ error: 'File upload failed', details: err.message });
        }

        try {
            logger.debug('Upload request processing:', {
                hasFiles: !!req.files,
                fields: req.body,
                files: req.files
            });

            if (!req.session?.accessToken) {
                logger.warn('File upload attempted without auth token');
                return res.status(401).json({ error: 'Not authenticated' });
            }

            if (!req.files?.filedata?.[0]) {
                logger.error('No file received');
                return res.status(400).json({ error: 'No file received' });
            }

            const file = req.files.filedata[0];
            const caption = req.body.caption;

            // Create form data
            const formData = new FormData();
            formData.append('filedata', fs.createReadStream(file.path), {
                filename: file.originalname,
                contentType: file.mimetype
            });

            if (caption) {
                formData.append('caption', caption);
                logger.debug('Adding caption to Drupal request:', caption);
            }

            logger.info('Sending file to Drupal endpoint');
            const response = await axios.post(
                `${OAUTH_PROVIDER_URL}/nabezky/nb_file`,
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${req.session.accessToken}`,
                        ...formData.getHeaders()
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );

            // Clean up temporary file
            fs.unlink(file.path, (err) => {
                if (err) logger.error('Error deleting temp file:', err);
            });

            logger.info('File upload successful', response.data);
            res.json(response.data);

        } catch (error) {
            logger.error('Upload processing error:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            // Clean up temporary file if it exists
            if (req.files?.filedata?.[0]?.path) {
                fs.unlink(req.files.filedata[0].path, (err) => {
                    if (err) logger.error('Error deleting temp file:', err);
                });
            }

            if (error.response?.status === 413) {
                res.status(413).json({ error: 'File too large' });
            } else {
                res.status(500).json({
                    error: 'Failed to upload file',
                    details: error.response?.data || error.message
                });
            }
        }
    });
});

app.post('/api/submit-snow-report', async (req, res) => {
  try {
    // Log the incoming request
    logger.info('Snow report submission received', {
      headers: req.headers,
      body: req.body,
      hasData: !!req.body.data,
      bodyKeys: Object.keys(req.body),
      sessionExists: !!req.session,
      hasAccessToken: !!req.session?.accessToken,
      tokenValue: req.session?.accessToken ? 'exists' : 'missing'
    });

    if (!req.session || !req.session.accessToken) {
      logger.warn('No valid session or access token found');
      return res.status(401).json({ 
        success: false, 
        message: 'Log in again to send the report' 
      });
    }

    // Extract form data from the request
    const formData = req.body.data;
    if (!formData) {
      return res.status(400).json({
        success: false,
        message: 'No form data provided'
      });
    }

    // Prepare the complete data object for submission
    const submissionData = {
      data: {
        // Regular user form fields
        reportTitle: formData.reportTitle,
        reportDate: formData.reportDate,
        country: formData.country,
        region: formData.region,
        snowDepth250: formData.snowDepth250,
        snowDepth500: formData.snowDepth500,
        snowDepth750: formData.snowDepth750,
        snowDepth1000: formData.snowDepth1000,
        note: formData.note,
        
        // Snow conditions
        classicstyle: formData.classicstyle,
        freestyle: formData.freestyle,
        snowage: formData.snowage,
        wetness: formData.wetness,
        snowType: formData.snowType,

        // Admin form fields
        snowDepthTotal: formData.snowDepthTotal,
        snowDepthNew: formData.snowDepthNew,
        trailConditions: formData.trailConditions,
        ski_center_id: formData.skiCenterId,
        post_to_fb: formData.post_to_fb,
        post2FbTimeline: formData.post2FbTimeline || 0,

        // Rewards data
        laborTime: formData.laborTime,
        rewardRequested: formData.rewardRequested,

        // Files data
        photoIds: formData.photoIds || [],
        photoCaptions: formData.photoCaptions || {},
        gpxId: formData.gpxId || null,

        privateReport: formData.privateReport || false

      }
    };

    logger.info('Making request to nabezky service', {
      url: `${OAUTH_PROVIDER_URL}/nabezky/rules/rules_process_data_from_the_nb_report_app`,
      hasAuthHeader: true,
      requestBody: submissionData
    });

    const response = await axios.post(
      `${OAUTH_PROVIDER_URL}/nabezky/rules/rules_process_data_from_the_nb_report_app`,
      submissionData,
      {
        headers: {
          'Authorization': `Bearer ${req.session.accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Language': 'en-us',
          'Accept-Encoding': 'gzip, deflate',
          'User-Agent': 'PWA-SnowReport/1.0',
          'Connection': 'keep-alive'
        }
      }
    );

    logger.info('Received response from nabezky service', {
      status: response.status,
      data: response.data
    });

    // Response will be true/false from the nabezky endpoint
    res.json({ 
      success: response.data.success === "1",
      message: response.data.success === "1" ? 'Snow report submitted successfully' : 'Failed to submit snow report'
    });

  } catch (error) {
    logger.error('Error in submit-snow-report:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      isAxiosError: error.isAxiosError,
      stack: error.stack
    });
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Pre odoslanie správy sa musíte znovu prihlásiť'
      });
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Server error while submitting snow report'
    });
  }
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
  logger.info('Token refresh request received', {
      sessionID: req.sessionID,
      hasSession: !!req.session,
      hasRefreshToken: !!req.session?.refreshToken,
      refreshTokenLength: req.session?.refreshToken?.length,
      cookies: req.cookies
  });
  
  if (!req.session || !req.session.refreshToken) {
    logger.warn('No refresh token available', {
        sessionID: req.sessionID,
        sessionContent: req.session ? Object.keys(req.session) : null
    });
    return res.status(401).json({ error: 'No refresh token available' });
  }

  try {
    logger.debug('Sending refresh request to OAuth server', {
        grant_type: 'refresh_token',
        client_id: OAUTH_CLIENT_ID,
        refresh_token_length: req.session.refreshToken.length
    });
    const response = await axios.post(TOKEN_URL, {
      grant_type: 'refresh_token',
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      refresh_token: req.session.refreshToken
    });

    logger.debug('Token refresh response from OAuth provider:', {
        status: response.status,
        hasAccessToken: !!response.data.access_token,
        hasRefreshToken: !!response.data.refresh_token,
        newRefreshTokenLength: response.data.refresh_token?.length,
        oldRefreshTokenLength: req.session.refreshToken.length

    });

    if (response.data && response.data.access_token) {
      // Store the old refresh token temporarily for comparison
      const oldRefreshToken = req.session.refreshToken;

      req.session.accessToken = response.data.access_token;
      if (response.data.refresh_token) {
        req.session.refreshToken = response.data.refresh_token;
      }
      logger.info('Token refresh successful', {
        sessionID: req.sessionID,
        tokenLength: response.data.access_token.length,
        refreshTokenChanged: oldRefreshToken !== req.session.refreshToken,
        oldRefreshTokenLength: oldRefreshToken.length,
        newRefreshTokenLength: req.session.refreshToken.length
      });
      res.json({ success: true });
    } else {
      logger.error('Invalid token refresh response:', response.data);
      res.status(400).json({ error: 'Invalid response from auth server' });
    }
  } catch (error) {
    logger.error('Token refresh error:', {
        error: error.response?.data || error.message,
        status: error.response?.status,
        headers: error.response?.headers
    });
    if (error.response?.status === 400 || error.response?.data?.error === 'invalid_grant') {
      logger.warn('Clearing invalid session', {
          sessionID: req.sessionID,
          error: error.response?.data
      });
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

    logger.info('User data retrieved:', response.data);

    req.session.userData = response.data;

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          logger.error('Error saving session:', err);
          reject(err);
        }
        resolve();
      });
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
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
