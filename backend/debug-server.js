// debug-server.js - 
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;


app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());


app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  next();
});


app.get('/', (req, res) => {
  res.json({
    message: '🚀 MCP Fetch',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /',
      'GET /health',
      'GET /api/status',
      'POST /api/ask'
    ]
  });
});


app.get('/health', (req, res) => {
  console.log('health check');
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});


app.get('/api/status', (req, res) => {
  console.log('check requests');
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0-debug',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  });
});


app.post('/api/ask', (req, res) => {
  console.log('receive requests');
  console.log('request:', req.body);
  
  const { url, question } = req.body;
  
  if (!url || !question) {
    return res.status(400).json({
      success: false,
      error: 'URL request'
    });
  }
  

  res.json({
    success: true,
    data: {
      url: url,
      question: question,
      answer: `server normal！`,
      timestamp: new Date().toISOString()
    }
  });
});


app.use((req, res) => {
  console.log(`404 : ${req.url}`);
  res.status(404).json({
    success: false,
    error: 'api not exist',
    requestedPath: req.url,
    availablePaths: ['/', '/health', '/api/status', '/api/ask']
  });
});


app.use((error, req, res, next) => {
  console.error('server error:', error);
  res.status(500).json({
    success: false,
    error: 'server error',
    message: error.message
  });
});


const server = app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 test start');
  console.log(`📡 listen: ${PORT}`);
  console.log(`🌐 local: http://localhost:${PORT}`);
  console.log(`🔗 status: http://localhost:${PORT}/api/status`);
  console.log(`💚 health: http://localhost:${PORT}/health`);
  console.log('='.repeat(50));
  

  console.log('📋 env:');
  console.log(`- Node.js : ${process.version}`);
  console.log(`- folder: ${process.cwd()}`);
  console.log(`- platform: ${process.platform}`);
  console.log('='.repeat(50));
});


server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ port ${PORT} occupied！`);
    console.log('try:');
    console.log('1. close port');
    console.log('2. change port');
    console.log(`  PORT=3002 node debug-server.js`);
  } else {
    console.error('❌ server start fail:', error);
  }
  process.exit(1);
});


process.on('SIGINT', () => {
  console.log('\n📴 closing...');
  server.close(() => {
    console.log('✅ server down');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n📴 server closing...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});
