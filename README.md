# 🧠 Design Process

**Problem**: Web content → LLM analysis requires reliable fetching, processing, and smart prompt construction.

**Solution Architecture**:
1. **MCP Fetch** → Raw web content extraction
2. **Content Processing** → Noise removal, contact info detection (can use NLP for higher accuracy)
3. **Smart Prompting** → Context-aware LLM queries with enhanced data
4. **Secure Pipeline** → URL validation, rate limiting, error handling

**Key Innovation**: Automatic contact information detection and prompt enhancement for more accurate LLM responses.

---

# 🚀 Installation & Setup

## Prerequisites
- **Node.js** ≥16.0.0
- **Python** ≥3.8 (for MCP tools)
- **uvx** (Python package runner)

## Quick Start

### 1. Install MCP Fetch Tool
```bash
# Install uvx if not already installed
pip install uvx

# Verify MCP fetch tool is available
uvx mcp-server-fetch --help
```

### 2. Setup Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys (optional)
```

### 3. Start Services
```bash
# Start backend server
cd backend
npm run dev
# Server runs on http://localhost:3001

# Open frontend (in another terminal)
cd frontend
# Open index.html in browser or use live server
```

### 4. Test the System
1. Open `frontend/index.html` in your browser
2. Check server status (should show "Server Online ✅")
3. Click "View Available Domains" to see whitelisted sites
4. Test with StackOverflow contact page preset

## Configuration
- **API Keys**: Add OpenAI/Anthropic keys to `backend/.env` for enhanced LLM responses
- **Domains**: Modify `WHITELISTED_DOMAINS` in `backend/server.js` to add allowed URLs
- **Port**: Change `PORT=3001` in `.env` if needed

---

# 1. Objective

Build a service where users submit safe, pre-approved URLs and questions.

The system fetches web content, processes it, and injects it into prompts for LLM-based question answering or summarization.

Ensure reliability, scalability, security, and privacy.

# 2. Workflow Steps

## User Submission
User enters a (pre-approved) URL and a question into the web interface.
Data is sent to the backend via API.

## Content Fetching
The backend calls MCP Fetch tool to scrape the web page and convert it to structured text.
Falls back to Node.js fetch if MCP is unavailable.

## Content Processing
- Cleans up raw content, removes noise/ads, deduplicates
- **Contact Information Detection**: Automatically extracts emails, phone numbers, and contact details
- Prepares content for LLM input (token limits, formatting)

## Smart Prompt Construction
- **Standard Mode**: Basic content + user question
- **Contact Enhanced Mode**: Includes extracted contact info for contact-related queries
- Dynamically adjusts prompt based on question type

## LLM Query
The enhanced prompt is sent to the selected LLM service (OpenAI GPT/Claude/Fallback).

## Result Delivery
The backend formats and returns the LLM answer to the frontend.
The frontend displays the complete processing pipeline with results.

# 3. Core Components

## Frontend Interface (`frontend/index.html`)
- **Server Status Monitor**: Real-time connection checking
- **Content Fetch Testing**: URL + question input with validation
- **Processing Pipeline Display**: Shows MCP results → Contact extraction → LLM response
- **Quick Test Presets**: StackOverflow contact page for testing contact detection

## Backend API Service (`backend/server.js`)

### Core Endpoints:
- `POST /api/ask`: Accepts URL and question, returns full analysis
- `GET /api/status`: Server health and configuration status  
- `GET /api/domains`: Lists whitelisted domains
- `GET /health`: Basic health check

### Security Features:
- **URL Validation**: Whitelist-only domains (Wikipedia, GitHub, StackOverflow, etc.)
- **Input Sanitization**: Length limits, type checking
- **Rate Limiting**: Request throttling and timeout protection
- **CORS Configuration**: Secure cross-origin policies

## Web Fetching Module

### MCP Integration:
- **Primary**: Uses `uvx mcp-server-fetch` with JSON-RPC protocol
- **Fallback**: Node.js fetch with HTML parsing when MCP fails
- **Content Processing**: Converts HTML to clean text, removes scripts/styles

### Error Handling:
- Graceful MCP failures with automatic fallback
- Timeout management (15s for MCP, 15s for fallback)
- Comprehensive logging for debugging

## Content Processing & Contact Detection

### Intelligent Extraction:
- **Email Detection**: Regex patterns with validation filtering
- **Phone Detection**: Multiple international formats
- **Context Analysis**: Extracts contact-related sentences
- **Deduplication**: Removes duplicate and invalid entries

### Question Type Recognition:
- Detects contact-related queries automatically
- Triggers enhanced processing pipeline
- Applies contact information to LLM prompts

## LLM Integration Module

### Supported Providers:
- **OpenAI GPT**: Via API with environment key
- **Anthropic Claude**: Via API with environment key  
- **Fallback Processing**: Pattern matching when APIs unavailable

### Smart Prompting:
- **Enhanced Contact Mode**: Includes extracted contact data in structured format
- **Standard Mode**: Clean content analysis
- **Response Optimization**: Handles token limits and formatting

## Security & Privacy

### Data Protection:
- No persistent storage of user data
- Request logging without sensitive content
- Memory-only processing pipeline

### Access Control:
- Domain whitelist enforcement
- Input validation and sanitization
- Error message sanitization in production

### Performance:
- Response time monitoring
- Memory usage tracking
- Graceful degradation strategies
