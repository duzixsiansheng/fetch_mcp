// debug-server.js - 简化版服务器用于调试
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// 基础中间件
app.use(cors({
  origin: '*',  // 允许所有来源（仅用于调试）
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// 添加请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  next();
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: '🚀 MCP Fetch 调试服务器正在运行',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /',
      'GET /health',
      'GET /api/status',
      'POST /api/ask'
    ]
  });
});

// 健康检查
app.get('/health', (req, res) => {
  console.log('健康检查请求');
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// API 状态
app.get('/api/status', (req, res) => {
  console.log('状态检查请求');
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0-debug',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  });
});

// 简化的询问接口
app.post('/api/ask', (req, res) => {
  console.log('收到询问请求');
  console.log('请求体:', req.body);
  
  const { url, question } = req.body;
  
  if (!url || !question) {
    return res.status(400).json({
      success: false,
      error: 'URL 和问题都是必需的'
    });
  }
  
  // 简单响应（不进行实际抓取）
  res.json({
    success: true,
    data: {
      url: url,
      question: question,
      answer: `这是一个调试响应。你询问的 URL 是 ${url}，问题是："${question}"。调试服务器正常工作！`,
      timestamp: new Date().toISOString()
    }
  });
});

// 404 处理
app.use((req, res) => {
  console.log(`404 - 未找到路径: ${req.url}`);
  res.status(404).json({
    success: false,
    error: '接口不存在',
    requestedPath: req.url,
    availablePaths: ['/', '/health', '/api/status', '/api/ask']
  });
});

// 错误处理
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    message: error.message
  });
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 调试服务器启动成功！');
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`🌐 本地地址: http://localhost:${PORT}`);
  console.log(`🔗 状态检查: http://localhost:${PORT}/api/status`);
  console.log(`💚 健康检查: http://localhost:${PORT}/health`);
  console.log('='.repeat(50));
  
  // 额外检查
  console.log('📋 环境检查:');
  console.log(`- Node.js 版本: ${process.version}`);
  console.log(`- 工作目录: ${process.cwd()}`);
  console.log(`- 平台: ${process.platform}`);
  console.log('='.repeat(50));
});

// 监听错误
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被占用！`);
    console.log('请尝试以下解决方案:');
    console.log('1. 关闭占用端口的程序');
    console.log('2. 或者修改 PORT 环境变量使用其他端口');
    console.log(`   例如: PORT=3002 node debug-server.js`);
  } else {
    console.error('❌ 服务器启动失败:', error);
  }
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n📴 收到关闭信号，正在停止服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n📴 收到终止信号，正在停止服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});