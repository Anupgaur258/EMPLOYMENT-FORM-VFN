import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB, isDBConnected } from './config/db.js';
import { getPendingSubmissions } from './services/syncService.js';
import { hasDriveOAuthConfig } from './services/googleDrive.js';
import leadRoutes from './routes/leadRoutes.js';
import eligibilityRoutes from './routes/eligibilityRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Setup environment
dotenv.config();

// Initialize database
connectDB();

const app = express();

// Set CLIENT_URL to the exact Pages URLs for both frontends in production.
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((url) => url.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Root index endpoint
app.get(['/', '/api'], (req, res) => {
  const dbConnected = isDBConnected();
  res.json({
    success: true,
    message: 'Visa For Nation Backend API Server is running',
    version: '1.0.0',
    status: dbConnected ? 'healthy' : 'degraded',
    database: dbConnected ? 'connected' : 'disconnected',
    endpoints: {
      health: '/api/health',
      leads: '/api/leads',
      admin: '/api/admin'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbConnected = isDBConnected();
  const pendingCount = getPendingSubmissions().length;
  res.json({
    status: dbConnected ? 'healthy' : 'degraded',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      connected: dbConnected,
      status: dbConnected ? 'connected' : 'disconnected'
    },
    googleDrive: {
      configured: hasDriveOAuthConfig()
    },
    offlineQueue: {
      pendingSubmissions: pendingCount
    }
  });
});

// Mount Routes
app.use('/api/leads', leadRoutes);
app.use('/api/eligibility-assessments', eligibilityRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  const status = err.status || (err.name === 'MulterError' || err.message?.startsWith('Invalid file type') ? 400 : 500);
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// 404 Route Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route ${req.originalUrl} not found`
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Visa For Nation Backend Server running on port ${PORT}`);
  console.log(`📍 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📝 Leads Endpoint: http://localhost:${PORT}/api/leads`);
  console.log(`🔒 Admin Endpoint: http://localhost:${PORT}/api/admin`);
  console.log(`====================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [Port Error] Port ${PORT} is already in use by another process.`);
    console.error(`👉 Solution: Run this command in PowerShell to free port ${PORT}:`);
    console.error(`   Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
    process.exit(1);
  } else {
    console.error('[Server Error]', err);
  }
});
