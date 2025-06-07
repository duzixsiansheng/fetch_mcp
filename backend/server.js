const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🔧 Initializing server...');

// Middleware configuration
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

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// URL whitelist configuration
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
  'bbc.co.uk',
  'cnn.com',
  'reuters.com',
  'microsoft.com',
  'google.com',
  'anthropic.com',
  'openai.com'
];

// Request logging function
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

// URL validation function
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

// Detect if question is asking for contact information
function isContactQuestion(question) {
  if (!question || typeof question !== 'string') {
    return false;
  }
  
  const questionLower = question.toLowerCase();
  
  const contactQuestions = [
    'contact',
    'contact information',
    'contact info', 
    'how to contact',
    'how to reach',
    'contact details',
    'phone number',
    'email address',
    'phone',
    'email',
    'reach out',
    'get in touch'
  ];
  
  return contactQuestions.some(pattern => questionLower.includes(pattern));
}

// Detect if content contains contact information
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
    'reach out', 'phone', 'email', 'address'
  ];
  
  const hasContactKeywords = contactKeywords.some(keyword => 
    contentLower.includes(keyword)
  );
  
  return hasEmail || hasPhone || hasContactKeywords;
}


function hasValidContactInfo(contactInfo) {
  if (!contactInfo) return false;
  
  return (contactInfo.emails && contactInfo.emails.length > 0) ||
         (contactInfo.phones && contactInfo.phones.length > 0) ||
         (contactInfo.other && contactInfo.other.length > 0);
}


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

    const validEmails = emails.filter(email => 
      !email.includes('noreply') && 
      !email.includes('example.com') && 
      !email.includes('test.com') &&
      !email.includes('placeholder')
    );
    contactInfo.emails = [...new Set(validEmails)];
  }
  
  
  const phonePatterns = [
    /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
    /(\+\d{1,3}[-.\s]?)?(\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4})/g, 
    /(\d{3}[-.\s]?\d{4}[-.\s]?\d{4})/g, 
    /(\d{3,4}[-.\s]?\d{7,8})/g 
  ];
  
  let allPhones = [];
  phonePatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      allPhones = allPhones.concat(matches);
    }
  });
  
  if (allPhones.length > 0) {
    const validPhones = allPhones.filter(phone => {
      const cleanPhone = phone.replace(/\D/g, '');
      return cleanPhone.length >= 7 && cleanPhone.length <= 15;
    });
    contactInfo.phones = [...new Set(validPhones)];
  }
  

  const sentences = content.split(/[.!?\n]+/);
  const contactSentences = sentences.filter(sentence => {
    const sentenceLower = sentence.toLowerCase();
    return (sentenceLower.includes('contact') || 
           sentenceLower.includes('联系') ||
           sentenceLower.includes('support') ||
           sentenceLower.includes('help') ||
           sentenceLower.includes('phone') ||
           sentenceLower.includes('email') ||
           sentenceLower.includes('address') ||
           sentenceLower.includes('call') ||
           sentenceLower.includes('reach') ||
           sentenceLower.includes('mailto:')) &&
           sentence.trim().length > 20 && 
           sentence.trim().length < 200; 
  });
  
  if (contactSentences.length > 0) {
    contactInfo.other = contactSentences.slice(0, 5).map(s => s.trim()); 
  }
  
  const hasAnyContact = contactInfo.emails.length > 0 || 
                       contactInfo.phones.length > 0 || 
                       contactInfo.other.length > 0;
  
  return hasAnyContact ? contactInfo : null;
}


function hasValidContactInfo(contactInfo) {
  if (!contactInfo) return false;
  
  return (contactInfo.emails && contactInfo.emails.length > 0) ||
         (contactInfo.phones && contactInfo.phones.length > 0) ||
         (contactInfo.other && contactInfo.other.length > 0);
}


async function fetchContentViaMCP(url) {
  return new Promise((resolve, reject) => {
    console.log('🔧 use official mcp');
    
    tryStdioMCP(url, resolve, reject);
  });
}


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
    
    console.log('📨 receive data:', JSON.stringify(chunk));
    
    const lines = output.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line) {
        console.log('🔍 dealing:', line);
        try {
          const response = JSON.parse(line);
          console.log('MCP response:', JSON.stringify(response, null, 2));
          
          if (response.result && response.result.protocolVersion && !initialized) {
            console.log('✅ MCP init done:', response.result.protocolVersion);
            initialized = true;
            
            setTimeout(() => {
              if (!notificationSent) {
                console.log('📤 send init information');
                const initNotification = JSON.stringify({
                  jsonrpc: "2.0",
                  method: "notifications/initialized"
                }) + '\n';
                
                mcpProcess.stdin.write(initNotification);
                notificationSent = true;
                
                setTimeout(() => {
                  if (!requestSent) {
                    console.log('📡 send fetch requests:', url);
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
                    
                    console.log('📤 sent requests:', fetchRequest.trim());
                    mcpProcess.stdin.write(fetchRequest);
                    requestSent = true;
                    
                    console.log('⏱️ requests sent, wating for response...');
                  }
                }, 200);
              }
            }, 100);
          }
          
          if (response.id === 2 && response.result) {
            console.log('🎯 receive fetch response:', response);
            
            if (response.result.content && Array.isArray(response.result.content)) {
              const content = response.result.content[0].text;
              console.log('✅ MCP fetch succuss, length:', content.length);
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
              console.log('⚠️ fetch response format error:', response.result);
            }
          }
          
          if (response.error) {
            console.log('❌ MCP error:', response.error);
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
            console.log('🔔 got ID=2:', response);
          }
          
        } catch (parseError) {
          console.log('error:', parseError.message, 'line:', line);
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
    console.log(`MCP exit, code: ${code}`);
    if (error) {
      console.log('MCP error output:', error);
    }
    
    if (!responseReceived) {
      console.log('⚠️ MCP exit without response, using fallback');
      resolve(fetchContentFallback(url));
    }
  });
  
  mcpProcess.on('error', (err) => {
    console.log('❌ MCP error:', err.message);
    if (!responseReceived) {
      resolve(fetchContentFallback(url));
    }
  });
  
  console.log('📤 sned MCP init requests');
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
  
  console.log('📤 send init requests:', initRequest.trim());
  mcpProcess.stdin.write(initRequest);
  
  setTimeout(() => {
    if (!responseReceived) {
      console.log('⏰ MCP timeout, no response received');
      console.log('output before timeout:', allOutput);
      
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
    console.log('📡 response:', url);
    
    if (typeof fetch === 'undefined') {
      try {
        const { default: nodeFetch } = await import('node-fetch');
        global.fetch = nodeFetch;
      } catch (e) {
        throw new Error('need install node-fetch: npm install node-fetch');
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


async function callLLM(content, question, contactInfo = null) {
  let prompt;
  let useContactEnhancement = false;
  

  if (contactInfo && isContactQuestion(question) && hasValidContactInfo(contactInfo)) {
    console.log('🔍 asking for contact info');
    useContactEnhancement = true;
    
    let contactSection = '\n\n===== contact info got =====\n';
    
    if (contactInfo.emails.length > 0) {
      contactSection += `📧 email address: ${contactInfo.emails.join(', ')}\n`;
    }
    
    if (contactInfo.phones.length > 0) {
      contactSection += `📞 phone number: ${contactInfo.phones.join(', ')}\n`;
    }
    
    if (contactInfo.other.length > 0) {
      contactSection += `📝 contact information: ${contactInfo.other.join(' ')}\n`;
    }
    
    contactSection += '========================\n';
    
prompt = `The user is asking for contact information. Please provide an accurate answer based on the webpage content and the extracted contact details.

Webpage Content:
${content}
${contactSection}
User Question: ${question}

Please provide accurate and complete contact information in English:`;
} else {
  console.log('🔍 Using standard prompt (no contact enhancement)');
  prompt = `Please answer the user's question based on the following webpage content. Provide an accurate, useful, and concise response.

Webpage Content:
${content}

User Question: ${question}

Please respond in English:`;
}

  try {
    if (process.env.OPENAI_API_KEY) {
      console.log('🤖 using OpenAI API');
      
      if (typeof fetch === 'undefined') {
        try {
          const { default: nodeFetch } = await import('node-fetch');
          global.fetch = nodeFetch;
        } catch (e) {
          console.log('⚠️ node-fetch error, skip OpenAI API');
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
      console.log('🧠 use Claude API');
      
      if (typeof fetch === 'undefined') {
        try {
          const { default: nodeFetch } = await import('node-fetch');
          global.fetch = nodeFetch;
        } catch (e) {
          console.log('⚠️ node-fetch error, skip Claude API');
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
    
    console.log('💡 use backend');
    return generateFallbackResponse(content, question, contactInfo);
    
  } catch (error) {
    console.error('LLM API Error:', error);
    return generateFallbackResponse(content, question, contactInfo);
  }
}

function generateFallbackResponse(content, question, contactInfo = null) {
  const questionLower = question.toLowerCase();
  

  if (isContactQuestion(question) && contactInfo && hasValidContactInfo(contactInfo)) {
    let response = 'according to webpage content, find following contact informations:\n\n';
    
    if (contactInfo.emails && contactInfo.emails.length > 0) {
      response += `📧 email: ${contactInfo.emails.join(', ')}\n`;
    }
    
    if (contactInfo.phones && contactInfo.phones.length > 0) {
      response += `📞 phone: ${contactInfo.phones.join(', ')}\n`;
    }
    
    if (contactInfo.other && contactInfo.other.length > 0) {
      response += `📝 others: ${contactInfo.other.join(' ')}\n`;
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
    return `Based on the webpage content, here is some relevant information related to "${question}":\n\n${relevantSentences.join('. ')}\n\nNote: This response was generated based on keyword matching from the content.`;
  }
  
  return `The webpage content was successfully retrieved, but no information directly related to "${question}" was found. Here is a brief summary of the main content:\n\n${content.substring(0, 300)}...`;
}


app.get('/', (req, res) => {
  res.json({
    message: '🚀 MCP Fetch running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: [
      'GET /health - health check',
      'GET /api/status - server status',
      'GET /api/domains - available whitelisted domains',
      'POST /api/ask - ask a question about a URL',
    ]
  });
});

app.post('/api/ask', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { url, question } = req.body;
    
    if (!url || !question) {
      logRequest(req, 'VALIDATION_ERROR', { error: 'Missing URL or question' });
      return res.status(400).json({
        success: false,
        error: 'missing required parameters: url and question'
      });
    }
    
    if (typeof url !== 'string' || typeof question !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'parameters must be strings'
      });
    }
    
    if (url.length > 2000 || question.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'longer than allowed length',
      });
    }
    
    if (!validateUrl(url)) {
      logRequest(req, 'URL_VALIDATION_ERROR', { url });
      return res.status(400).json({
        success: false,
        error: 'url not valid or not whitelisted'
      });
    }
    
    logRequest(req, 'FETCH_START', { url, question: question.substring(0, 100) });
    
    let rawContent, mcpUsed = false;
    try {
      rawContent = await fetchContentViaMCP(url);
      mcpUsed = true;
      console.log('✅ MCP fetch successful');
    } catch (error) {
      console.log('⚠️ MCP fetch failed');
      rawContent = await fetchContentFallback(url);
      mcpUsed = false;
    }
    
    if (!rawContent || rawContent.length < 50) {
      throw new Error('short or empty content received from fetch');
    }
    
    const processedContent = processContent(rawContent);
    
    if (!processedContent) {
      throw new Error('failed to process content');
    }
    
    const isAsking = isContactQuestion(question);
    let contactInfo = null;
    let contactInfoExtracted = false;
    
    if (isAsking) {
      console.log('🔍 user asked for contact info');
      const hasContact = hasContactInformation(processedContent);
      if (hasContact) {
        contactInfo = extractContactInformation(processedContent);
        if (hasValidContactInfo(contactInfo)) {
          contactInfoExtracted = true;
          console.log('✅ detected contact info:', contactInfo);
        } else {
          console.log('⚠️ detected contact information but it is not valid or complete');
          contactInfo = null;
        }
      } else {
        console.log('❌ did not detect contact information in content');
      }
    } else {
      console.log('🔍 not contact info');
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
          hasContactInfo: contactInfoExtracted,
          contactEnhanced: contactInfoExtracted && isAsking,
          contactInfoFound: !!contactInfo
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
    
    if (error.message.includes('timeout')) {
      return res.status(408).json({
        success: false,
        error: 'the request timed out, please try again later'
      });
    }
    
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return res.status(502).json({
        success: false,
        error: 'cannot fetch content from the provided URL, please check the URL or your network connection'
      });
    }
    
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' 
        ? 'error occurred, please try again later' 
        : error.message
    });
  }
});


app.get('/api/status', async (req, res) => {
  try {
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
    res.status(500).json({
      error: 'failed to retrieve server status',
    });
  }
});


app.get('/api/domains', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        whitelistedDomains: WHITELISTED_DOMAINS,
        total: WHITELISTED_DOMAINS.length
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'failed to retrieve whitelisted domains',
    });
  }
});


app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString() 
  });
});


app.use((req, res, next) => {
  console.log(`404: ${req.url}`);
  res.status(404).json({
    success: false,
    error: 'api not found',
    requestedPath: req.url,
    availablePaths: ['/', '/health', '/api/status', '/api/domains', '/api/ask']
  });
});


app.use((error, req, res, next) => {
  console.error('Unhandled Error:', error);
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'error occurred, please try again later' 
      : error.message
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, gracefully shutting down server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, gracefully shutting down server...');
  process.exit(0);
});

// Start server
const server = app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 MCP Fetch Server started successfully!`);
  console.log(`📡 Listening on port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Local address: http://localhost:${PORT}`);
  console.log(`🔗 API address: http://localhost:${PORT}/api`);
  console.log(`📊 Status check: http://localhost:${PORT}/api/status`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(`🛡️ Whitelisted domain count: ${WHITELISTED_DOMAINS.length}`);
  console.log(`🔑 OpenAI API: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`🔑 Claude API: ${process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`⚡ Server ready to process requests!`);
  console.log('='.repeat(60));
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
    console.log('Please try the following solutions:');
    console.log('1. Stop the program occupying the port');
    console.log('2. Or change the PORT environment variable to use another port');
    console.log(`   Example: PORT=3002 npm run dev`);
  } else {
    console.error('❌ Server failed to start:', error);
  }
  process.exit(1);
});
