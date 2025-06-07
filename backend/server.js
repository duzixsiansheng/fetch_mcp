const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🔧 正在初始化服务器...');

// 中间件配置
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://', 'null'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 速率限制配置
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'api_limit',
  points: 20,
  duration: 60,
});

const strictRateLimiter = new RateLimiterMemory({
  keyPrefix: 'strict_limit',
  points: 5,
  duration: 60,
});

// URL 白名单配置
const WHITELISTED_DOMAINS = [
  'wikipedia.org',
  'github.com',
  'stackoverflow.com',
  'medium.com',
  'news.ycombinator.com',
  'example.com',
  'arxiv.org',
  'reddit.com',
  'hackernews.com',
  'techcrunch.com',
  'bbc.com',
  'cnn.com',
  'reuters.com'
];

// 日志记录
const logRequest = (req, type, details = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    type: type,
    ...details
  };
  console.log(`[${type}]`, JSON.stringify(logEntry, null, 2));
};

// URL 验证函数
function validateUrl(url) {
  try {
    const urlObj = new URL(url);
    
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    
    const isWhitelisted = WHITELISTED_DOMAINS.some(domain => 
      urlObj.hostname.includes(domain) || urlObj.hostname.endsWith(domain)
    );
    
    if (!isWhitelisted) {
      return false;
    }
    
    const dangerousPaths = ['/admin', '/api', '/config', '/private'];
    const hasDangerousPath = dangerousPaths.some(path => 
      urlObj.pathname.toLowerCase().includes(path)
    );
    
    return !hasDangerousPath;
  } catch (error) {
    return false;
  }
}

// 检测问题是否询问联系方式
function isContactQuestion(question) {
  if (!question || typeof question !== 'string') {
    return false;
  }
  
  const questionLower = question.toLowerCase();
  
  const contactQuestions = [
    '联系方式',
    '联系信息', 
    '如何联系',
    '怎么联系',
    '联系电话',
    '联系邮箱',
    '联系地址',
    'contact',
    'contact information',
    'how to contact',
    'phone number',
    'email address'
  ];
  
  return contactQuestions.some(pattern => questionLower.includes(pattern));
}

// 检测内容是否包含联系信息
function hasContactInformation(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }
  
  const contentLower = content.toLowerCase();
  
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const hasEmail = emailPattern.test(content);
  
  const phonePattern = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/;
  const hasPhone = phonePattern.test(content);
  
  const contactKeywords = [
    'contact us', 'contact information', 'get in touch',
    '联系我们', '联系方式', '联系信息'
  ];
  
  const hasContactKeywords = contactKeywords.some(keyword => 
    contentLower.includes(keyword)
  );
  
  return hasEmail || hasPhone || hasContactKeywords;
}

// 提取联系信息
function extractContactInformation(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }
  
  const contactInfo = {
    emails: [],
    phones: [],
    other: []
  };
  
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = content.match(emailPattern);
  if (emails) {
    contactInfo.emails = [...new Set(emails)];
  }
  
  const phonePattern = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
  const phones = content.match(phonePattern);
  if (phones) {
    contactInfo.phones = [...new Set(phones)];
  }
  
  const sentences = content.split(/[.!?\n]+/);
  const contactSentences = sentences.filter(sentence => {
    const sentenceLower = sentence.toLowerCase();
    return sentenceLower.includes('contact') || 
           sentenceLower.includes('联系') ||
           sentenceLower.includes('phone') ||
           sentenceLower.includes('email') ||
           sentenceLower.includes('address');
  });
  
  if (contactSentences.length > 0) {
    contactInfo.other = contactSentences.slice(0, 3);
  }
  
  const hasAnyContact = contactInfo.emails.length > 0 || 
                       contactInfo.phones.length > 0 || 
                       contactInfo.other.length > 0;
  
  return hasAnyContact ? contactInfo : null;
}

// 官方 MCP Fetch 工具集成
async function fetchContentViaMCP(url) {
  return new Promise((resolve, reject) => {
    console.log('🔧 使用官方 MCP fetch 服务器');
    
    tryStdioMCP(url, resolve, reject);
  });
}

// 使用标准的 MCP stdio 协议
function tryStdioMCP(url, resolve, reject) {
  const mcpProcess = spawn('uvx', ['mcp-server-fetch'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000
  });
  
  let output = '';
  let error = '';
  let initialized = false;
  let notificationSent = false;
  let requestSent = false;
  let responseReceived = false;
  let allOutput = '';
  
  mcpProcess.stdout.on('data', (data) => {
    const chunk = data.toString();
    output += chunk;
    allOutput += chunk;
    
    console.log('📨 收到数据块:', JSON.stringify(chunk));
    
    const lines = output.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        console.log('🔍 处理行:', line);
        try {
          const response = JSON.parse(line);
          console.log('MCP 响应:', JSON.stringify(response, null, 2));
          
          if (response.result && response.result.protocolVersion && !initialized) {
            console.log('✅ MCP 初始化成功，协议版本:', response.result.protocolVersion);
            initialized = true;
            
            setTimeout(() => {
              if (!notificationSent) {
                console.log('📤 发送初始化完成通知');
                const initNotification = JSON.stringify({
                  jsonrpc: "2.0",
                  method: "notifications/initialized"
                }) + '\n';
                
                mcpProcess.stdin.write(initNotification);
                notificationSent = true;
                
                setTimeout(() => {
                  if (!requestSent) {
                    console.log('📡 发送 fetch 请求:', url);
                    const fetchRequest = JSON.stringify({
                      jsonrpc: "2.0",
                      id: 2,
                      method: "tools/call",
                      params: {
                        name: "fetch",
                        arguments: {
                          url: url,
                          max_length: 2000
                        }
                      }
                    }) + '\n';
                    
                    console.log('📤 发送的请求:', fetchRequest.trim());
                    mcpProcess.stdin.write(fetchRequest);
                    requestSent = true;
                    
                    console.log('⏱️ 请求已发送，等待响应...');
                  }
                }, 200);
              }
            }, 100);
          }
          
          if (response.id === 2 && response.result) {
            console.log('🎯 收到 fetch 响应:', response);
            
            if (response.result.content && Array.isArray(response.result.content)) {
              const content = response.result.content[0].text;
              console.log('✅ MCP fetch 成功，内容长度:', content.length);
              responseReceived = true;
              
              try {
                mcpProcess.stdin.end();
              } catch (e) {}
              
              setTimeout(() => {
                if (mcpProcess.pid) {
                  mcpProcess.kill();
                }
              }, 100);
              
              resolve(content);
              return;
            } else {
              console.log('⚠️ fetch 响应格式异常:', response.result);
            }
          }
          
          if (response.error) {
            console.log('❌ MCP 错误:', response.error);
            responseReceived = true;
            
            try {
              mcpProcess.stdin.end();
            } catch (e) {}
            
            setTimeout(() => {
              if (mcpProcess.pid) {
                mcpProcess.kill();
              }
            }, 100);
            
            resolve(fetchContentFallback(url));
            return;
          }
          
          if (response.id === 2) {
            console.log('🔔 收到 ID=2 的响应但不是预期格式:', response);
          }
          
        } catch (parseError) {
          console.log('解析错误（忽略）:', parseError.message, '行内容:', line);
        }
      }
    }
    
    if (lines.length > 1) {
      output = lines[lines.length - 1];
    }
  });
  
  mcpProcess.stderr.on('data', (data) => {
    const errorChunk = data.toString();
    error += errorChunk;
    console.log('MCP stderr:', errorChunk);
  });
  
  mcpProcess.on('close', (code) => {
    console.log(`MCP 进程退出，代码: ${code}`);
    if (error) {
      console.log('MCP 错误输出:', error);
    }
    
    if (!responseReceived) {
      console.log('⚠️ MCP 进程退出但未收到响应，使用备用方案');
      resolve(fetchContentFallback(url));
    }
  });
  
  mcpProcess.on('error', (err) => {
    console.log('❌ MCP 进程错误:', err.message);
    if (!responseReceived) {
      resolve(fetchContentFallback(url));
    }
  });
  
  console.log('📤 发送 MCP 初始化请求');
  const initRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: {
          listChanged: false
        }
      },
      clientInfo: {
        name: "mcp-fetch-client",
        version: "1.0.0"
      }
    }
  }) + '\n';
  
  console.log('📤 发送的初始化请求:', initRequest.trim());
  mcpProcess.stdin.write(initRequest);
  
  setTimeout(() => {
    if (!responseReceived) {
      console.log('⏰ MCP 请求超时，使用备用方案');
      console.log('超时前的所有输出:', allOutput);
      
      try {
        mcpProcess.stdin.end();
      } catch (e) {}
      
      setTimeout(() => {
        if (mcpProcess.pid) {
          mcpProcess.kill();
        }
      }, 100);
      
      resolve(fetchContentFallback(url));
    }
  }, 15000);
}

// 备用内容获取方案
async function fetchContentFallback(url) {
  try {
    console.log('📡 使用备用方案获取内容:', url);
    
    if (typeof fetch === 'undefined') {
      try {
        const { default: nodeFetch } = await import('node-fetch');
        global.fetch = nodeFetch;
      } catch (e) {
        throw new Error('需要安装 node-fetch: npm install node-fetch');
      }
    }
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MCP-Fetch-Service/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 15000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    
    return textContent;
  } catch (error) {
    throw new Error(`Failed to fetch content: ${error.message}`);
  }
}

// 内容处理和清理
function processContent(rawContent, maxLength = 4000) {
  if (!rawContent || typeof rawContent !== 'string') {
    return '';
  }
  
  let processed = rawContent
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const sentences = processed.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const uniqueSentences = [...new Set(sentences)];
  processed = uniqueSentences.join('. ').trim();
  
  if (processed.length > maxLength) {
    const truncated = processed.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    
    if (lastSentenceEnd > maxLength * 0.7) {
      processed = truncated.substring(0, lastSentenceEnd + 1);
    } else {
      processed = truncated + '...';
    }
  }
  
  return processed;
}

// LLM API 调用
async function callLLM(content, question, contactInfo = null) {
  let prompt;
  
  if (contactInfo && isContactQuestion(question)) {
    console.log('🔍 询问联系方式且检测到联系信息，使用增强 prompt');
    
    let contactSection = '\n\n===== 提取的联系信息 =====\n';
    
    if (contactInfo.emails.length > 0) {
      contactSection += `📧 邮箱地址: ${contactInfo.emails.join(', ')}\n`;
    }
    
    if (contactInfo.phones.length > 0) {
      contactSection += `📞 电话号码: ${contactInfo.phones.join(', ')}\n`;
    }
    
    if (contactInfo.other.length > 0) {
      contactSection += `📝 联系信息说明: ${contactInfo.other.join(' ')}\n`;
    }
    
    contactSection += '========================\n';
    
    prompt = `用户询问联系方式，请基于网页内容和提取的联系信息提供准确回答。

网页内容：
${content}
${contactSection}
用户问题：${question}

请提供准确、完整的联系方式信息，用中文回答：`;
  } else {
    console.log('🔍 非联系方式询问或无联系信息，使用标准 prompt');
    prompt = `请基于以下网页内容回答用户的问题。请提供准确、有用且简洁的回答。

网页内容：
${content}

用户问题：${question}

请提供中文回答：`;
  }

  try {
    if (process.env.OPENAI_API_KEY) {
      console.log('🤖 使用 OpenAI API');
      
      if (typeof fetch === 'undefined') {
        try {
          const { default: nodeFetch } = await import('node-fetch');
          global.fetch = nodeFetch;
        } catch (e) {
          console.log('⚠️ node-fetch 不可用，跳过 OpenAI API');
        }
      }
      
      if (typeof fetch !== 'undefined') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 1000,
            temperature: 0.7
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          return result.choices[0].message.content.trim();
        }
      }
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      console.log('🧠 使用 Claude API');
      
      if (typeof fetch === 'undefined') {
        try {
          const { default: nodeFetch } = await import('node-fetch');
          global.fetch = nodeFetch;
        } catch (e) {
          console.log('⚠️ node-fetch 不可用，跳过 Claude API');
        }
      }
      
      if (typeof fetch !== 'undefined') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-sonnet-20240229',
            max_tokens: 1000,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          return result.content[0].text.trim();
        }
      }
    }
    
    console.log('💡 使用备用回答生成');
    return generateFallbackResponse(content, question, contactInfo);
    
  } catch (error) {
    console.error('LLM API Error:', error);
    return generateFallbackResponse(content, question, contactInfo);
  }
}

// 备用回答生成
function generateFallbackResponse(content, question, contactInfo = null) {
  const questionLower = question.toLowerCase();
  
  if (isContactQuestion(question) && contactInfo) {
    let response = '根据网页内容，找到以下联系方式：\n\n';
    
    if (contactInfo.emails.length > 0) {
      response += `📧 邮箱: ${contactInfo.emails.join(', ')}\n`;
    }
    
    if (contactInfo.phones.length > 0) {
      response += `📞 电话: ${contactInfo.phones.join(', ')}\n`;
    }
    
    if (contactInfo.other.length > 0) {
      response += `📝 其他信息: ${contactInfo.other.join(' ')}\n`;
    }
    
    return response;
  }
  
  const keywords = questionLower.split(' ').filter(word => word.length > 2);
  const relevantSentences = content.split(/[.!?]+/)
    .filter(sentence => {
      const sentenceLower = sentence.toLowerCase();
      return keywords.some(keyword => sentenceLower.includes(keyword));
    })
    .slice(0, 3);
  
  if (relevantSentences.length > 0) {
    return `基于网页内容，关于"${question}"的相关信息如下：\n\n${relevantSentences.join('. ')}\n\n注：这是基于内容关键词匹配生成的回答。`;
  }
  
  return `已获取到网页内容，但无法找到与"${question}"直接相关的信息。网页主要内容摘要：\n\n${content.substring(0, 300)}...`;
}

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: '🚀 MCP Fetch 服务器正在运行',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: [
      'GET /health - 健康检查',
      'GET /api/status - 服务状态',
      'GET /api/domains - 允许的域名',
      'POST /api/ask - 内容分析'
    ]
  });
});

// 主要 API 端点
app.post('/api/ask', async (req, res) => {
  const startTime = Date.now();
  
  try {
    await strictRateLimiter.consume(req.ip);
    
    const { url, question } = req.body;
    
    if (!url || !question) {
      logRequest(req, 'VALIDATION_ERROR', { error: 'Missing URL or question' });
      return res.status(400).json({
        success: false,
        error: 'URL 和问题都是必需的参数'
      });
    }
    
    if (typeof url !== 'string' || typeof question !== 'string') {
      return res.status(400).json({
        success: false,
        error: '参数类型错误'
      });
    }
    
    if (url.length > 2000 || question.length > 1000) {
      return res.status(400).json({
        success: false,
        error: '输入内容过长'
      });
    }
    
    if (!validateUrl(url)) {
      logRequest(req, 'URL_VALIDATION_ERROR', { url });
      return res.status(400).json({
        success: false,
        error: '提供的 URL 不在允许的域名列表中，或包含不安全的路径'
      });
    }
    
    logRequest(req, 'FETCH_START', { url, question: question.substring(0, 100) });
    
    let rawContent, mcpUsed = false;
    try {
      rawContent = await fetchContentViaMCP(url);
      mcpUsed = true;
      console.log('✅ 使用 MCP fetch 获取内容成功');
    } catch (error) {
      console.log('⚠️ MCP fetch 失败，使用备用方案');
      rawContent = await fetchContentFallback(url);
      mcpUsed = false;
    }
    
    if (!rawContent || rawContent.length < 50) {
      throw new Error('获取的内容为空或过短');
    }
    
    const processedContent = processContent(rawContent);
    
    if (!processedContent) {
      throw new Error('内容处理失败');
    }
    
    const isAsking = isContactQuestion(question);
    let contactInfo = null;
    
    if (isAsking) {
      console.log('🔍 用户询问联系方式，开始检测联系信息');
      const hasContact = hasContactInformation(processedContent);
      if (hasContact) {
        contactInfo = extractContactInformation(processedContent);
        console.log('✅ 检测到联系信息:', contactInfo);
      } else {
        console.log('❌ 未在内容中找到联系信息');
      }
    } else {
      console.log('🔍 非联系方式询问，跳过联系信息检测');
    }
    
    const answer = await callLLM(processedContent, question, contactInfo);
    
    const processingTime = Date.now() - startTime;
    
    logRequest(req, 'SUCCESS', { 
      url, 
      contentLength: processedContent.length,
      processingTime,
      answerLength: answer.length
    });
    
    res.json({
      success: true,
      data: {
        url,
        question,
        answer,
        rawContent: processedContent,
        contactInfo: contactInfo,
        metadata: {
          contentLength: processedContent.length,
          processingTime,
          timestamp: new Date().toISOString(),
          mcpUsed: mcpUsed,
          answerLength: answer.length,
          source: mcpUsed ? 'MCP Fetch' : 'Fallback Fetch',
          isContactQuestion: isAsking,
          hasContactInfo: !!contactInfo,
          contactEnhanced: !!(isAsking && contactInfo)
        }
      }
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logRequest(req, 'ERROR', { 
      error: error.message,
      processingTime,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    if (error.remainingPoints !== undefined) {
      return res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil(error.msBeforeNext / 1000)
      });
    }
    
    if (error.message.includes('timeout')) {
      return res.status(408).json({
        success: false,
        error: '请求超时，请稍后重试'
      });
    }
    
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return res.status(502).json({
        success: false,
        error: '无法访问指定的网址，请检查 URL 是否正确'
      });
    }
    
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' 
        ? '服务器内部错误，请稍后重试' 
        : error.message
    });
  }
});

// 状态检查端点
app.get('/api/status', async (req, res) => {
  try {
    await rateLimiter.consume(req.ip);
    
    const status = {
      status: 'running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      whitelistedDomains: WHITELISTED_DOMAINS.length,
      environment: process.env.NODE_ENV || 'development'
    };
    
    const mcpPath = path.join(__dirname, '../servers_mcp/src/fetch/dist/index.js');
    try {
      await fs.access(mcpPath);
      status.mcpFetchAvailable = true;
    } catch {
      status.mcpFetchAvailable = false;
    }
    
    status.llmApis = {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY
    };
    
    res.json(status);
  } catch (error) {
    if (error.remainingPoints !== undefined) {
      return res.status(429).json({
        error: '请求过于频繁'
      });
    }
    
    res.status(500).json({
      error: '状态检查失败'
    });
  }
});

// 获取允许的域名列表
app.get('/api/domains', async (req, res) => {
  try {
    await rateLimiter.consume(req.ip);
    
    res.json({
      success: true,
      data: {
        whitelistedDomains: WHITELISTED_DOMAINS,
        total: WHITELISTED_DOMAINS.length
      }
    });
  } catch (error) {
    if (error.remainingPoints !== undefined) {
      return res.status(429).json({
        error: '请求过于频繁'
      });
    }
    
    res.status(500).json({
      error: '获取域名列表失败'
    });
  }
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString() 
  });
});

// 404 处理
app.use((req, res, next) => {
  console.log(`404 - 未找到路径: ${req.url}`);
  res.status(404).json({
    success: false,
    error: '接口不存在',
    requestedPath: req.url,
    availablePaths: ['/', '/health', '/api/status', '/api/domains', '/api/ask']
  });
});

// 全局错误处理
app.use((error, req, res, next) => {
  console.error('Unhandled Error:', error);
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : error.message
  });
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在优雅关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT 信号，正在优雅关闭服务器...');
  process.exit(0);
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 MCP Fetch 服务器启动成功！`);
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 本地地址: http://localhost:${PORT}`);
  console.log(`🔗 API 地址: http://localhost:${PORT}/api`);
  console.log(`📊 状态检查: http://localhost:${PORT}/api/status`);
  console.log(`💚 健康检查: http://localhost:${PORT}/health`);
  console.log(`🛡️ 允许的域名数量: ${WHITELISTED_DOMAINS.length}`);
  console.log(`🔑 OpenAI API: ${process.env.OPENAI_API_KEY ? '已配置' : '未配置'}`);
  console.log(`🔑 Claude API: ${process.env.ANTHROPIC_API_KEY ? '已配置' : '未配置'}`);
  console.log(`⚡ 服务器就绪，可以开始处理请求！`);
  console.log('='.repeat(60));
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被占用！`);
    console.log('请尝试以下解决方案:');
    console.log('1. 关闭占用端口的程序');
    console.log('2. 或者修改 PORT 环境变量使用其他端口');
    console.log(`   例如: PORT=3002 npm run dev`);
  } else {
    console.error('❌ 服务器启动失败:', error);
  }
  process.exit(1);
});