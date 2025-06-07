# 1.Objective

Build a service where users submit safe, pre-approved URLs and questions.

The system fetches web content, processes it, and injects it into prompts for LLM-based question answering or summarization.

Ensure reliability, scalability, security, and privacy.

# 2.Workflow Steps

## User Submission

User enters a (pre-approved) URL and a question into the web interface.
Data is sent to the backend via API.

## Content Fetching

The backend calls the fetching module, which scrapes the web page and converts it to Markdown or plain text.

## Content Processing

Cleans up raw content, removes noise/ads, deduplicates, and summarizes if content is lengthy.

## Prompt Construction

The processed content is injected into a prompt template

## LLM Query

The prompt is sent to the selected LLM service

## Result Delivery

The backend formats and returns the LLM answer to the frontend.
The frontend displays the answer to the user.

## Logging, Monitoring, and Error Handling

Logs all requests and errors.




# 3.Core Components

### Frontend/UI

### Backend API Service

POST /ask: Accepts URL and question.

GET /status: (Optional) Check job status.

URL validation and security checks (only allow whitelisted domains).

### Web Fetching Module

MCP Fetch to crawl the provided URL

Converts HTML to Markdown or structured text.

Handles failures (timeouts, inaccessible URLs, etc.).

### Content Processing/Summarization

Cleans up, deduplicates, and optionally summarizes fetched content.

Can extract specific fields (e.g., contacts, tables) if needed.

Prepares the content for LLM input (token limit, format).

### LLM Invocation Module

Assembles prompt with processed content and user question.

Sends to selected LLM (OpenAI, Claude, local models, etc.).

Manages prompt size, formatting, and model-specific constraints.

### Security & Privacy

Sanitizes content to avoid prompt injection attacks.

Protects sensitive information.

Rate limits and request authentication as needed.
