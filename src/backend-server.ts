import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';

// Logger utility
const log = (level: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [BACKEND] [${level}] ${message}`;
  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
};

// Types
interface LinkedInPostData {
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface BrowserRequest {
  id: string;
  type: 'execute' | 'capture_dom' | 'capture_screenshot' | 'navigate' | 'new_post' | 'show_alert';
  data: {
    // For execute
    code?: string;
    url?: string;
    targetSite?: string;
    timeout?: number;
    // For DOM capture
    selector?: string;
    includeMetadata?: boolean;
    // For screenshot capture
    fullPage?: boolean;
    quality?: number;
    // For navigate
    waitFor?: string;
    // For LinkedIn legacy
    content?: string;
    message?: string;
    title?: string;
    metadata?: Record<string, any>;
  };
}

interface BrowserResponse {
  id: string;
  success: boolean;
  result?: {
    // JS execution result
    value?: any;
    // Screenshot data (base64)
    screenshot?: string;
    // DOM content
    dom?: {
      body: string;
      title: string;
      url: string;
    };
    // Execution metadata
    metadata?: {
      executionTime: number;
      currentUrl: string;
      pageTitle: string;
    };
  };
  error?: string;
}

interface PendingRequest {
  id: string;
  type: string;
  data: any;
  callback: (result: any) => void;
  timestamp: Date;
  timeout?: NodeJS.Timeout;
}

// State
const postDataStore: LinkedInPostData[] = [];
const pendingRequests = new Map<string, PendingRequest>();
const wsClients = new Set<any>();

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// WebSocket message broadcasting
function broadcastToClients(message: any) {
  const messageStr = JSON.stringify(message);
  log('DEBUG', 'Broadcasting to WebSocket clients', {
    clientCount: wsClients.size,
    messageType: message.type
  });

  wsClients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(messageStr);
      log('DEBUG', 'Message sent to client');
    }
  });
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  log('INFO', 'Browser extension connected');
  wsClients.add(ws);
  log('DEBUG', 'Total connected clients', { count: wsClients.size });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      log('INFO', 'Received message from extension', data);

      // Handle different message types from extension
      if (data.type === 'request_complete') {
        const pending = pendingRequests.get(data.requestId);
        if (pending) {
          if (pending.timeout) clearTimeout(pending.timeout);
          pending.callback({ success: true, ...data.result });
          pendingRequests.delete(data.requestId);
          log('INFO', 'Request completed', { requestId: data.requestId });
        }
      } else if (data.type === 'request_failed') {
        const pending = pendingRequests.get(data.requestId);
        if (pending) {
          if (pending.timeout) clearTimeout(pending.timeout);
          pending.callback({ success: false, error: data.error });
          pendingRequests.delete(data.requestId);
          log('ERROR', 'Request failed', { requestId: data.requestId, error: data.error });
        }
      } else if (data.type === 'get_latest_post') {
        const latestPost = postDataStore[postDataStore.length - 1];
        ws.send(JSON.stringify({
          type: 'post_data',
          data: latestPost || null,
        }));
      }
    } catch (error) {
      log('ERROR', 'Failed to parse WebSocket message', { error: error instanceof Error ? error.message : String(error) });
    }
  });

  ws.on('close', () => {
    log('INFO', 'Browser extension disconnected');
    wsClients.delete(ws);
    log('DEBUG', 'Total connected clients', { count: wsClients.size });
  });

  ws.on('error', (error) => {
    log('ERROR', 'WebSocket error', { error: error.message });
  });
});

// MCP Tool Endpoints
app.post('/api/tools/create_linkedin_post', async (req, res) => {
  try {
    const { content, metadata } = req.body;
    log('INFO', 'Creating LinkedIn post via API', { contentLength: content?.length });

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check if any clients are connected
    if (wsClients.size === 0) {
      return res.status(503).json({
        error: 'No browser extension connected. Please ensure the extension is active on a LinkedIn tab.'
      });
    }

    const postData: LinkedInPostData = {
      content,
      timestamp: new Date(),
      metadata,
    };

    postDataStore.push(postData);

    // Create request with callback
    const requestId = uuidv4();
    const request = {
      id: requestId,
      type: 'new_post',
      data: postData,
    };

    // Wait for browser to complete the action
    const result: any = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve({ success: false, error: 'Request timed out after 30 seconds' });
      }, 30000);

      pendingRequests.set(requestId, {
        ...request,
        callback: resolve,
        timestamp: new Date(),
        timeout,
      });

      // Broadcast to clients
      broadcastToClients({
        ...request,
        requestId,
      });
    });

    if (result.success) {
      res.json({
        success: true,
        message: `LinkedIn post created: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    log('ERROR', 'Failed to create post', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/tools/show_linkedin_alert', async (req, res) => {
  try {
    const { message, title } = req.body;
    log('INFO', 'Showing LinkedIn alert via API', { message, title });

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (wsClients.size === 0) {
      return res.status(503).json({
        error: 'No browser extension connected. Please ensure the extension is active on a LinkedIn tab.'
      });
    }

    const requestId = uuidv4();
    const request = {
      id: requestId,
      type: 'show_alert',
      data: {
        message,
        title: title || 'LinkedIn MCP Alert',
        timestamp: new Date(),
      },
    };

    const result: any = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve({ success: false, error: 'Request timed out after 10 seconds' });
      }, 10000);

      pendingRequests.set(requestId, {
        ...request,
        callback: resolve,
        timestamp: new Date(),
        timeout,
      });

      broadcastToClients({
        ...request,
        requestId,
      });
    });

    if (result.success) {
      res.json({ success: true, message: `Alert sent to LinkedIn: "${message}"` });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    log('ERROR', 'Failed to show alert', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/tools/get_post_data', (req, res) => {
  log('DEBUG', 'Getting latest post data via API');
  const latestPost = postDataStore[postDataStore.length - 1];
  res.json({ data: latestPost || null });
});

// New flexible browser control endpoints
app.post('/api/tools/browser_execute', async (req, res) => {
  try {
    const { code, url, targetSite, timeout } = req.body;
    log('INFO', 'Executing browser code via API', {
      codeLength: code?.length,
      url,
      targetSite,
      timeout
    });

    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    if (wsClients.size === 0) {
      return res.status(503).json({
        error: 'No browser extension connected. Please ensure the extension is active.'
      });
    }

    const requestId = uuidv4();
    const request: BrowserRequest = {
      id: requestId,
      type: 'execute',
      data: {
        code,
        url,
        targetSite,
        timeout: timeout || 30000,
      },
    };

    const result: any = await new Promise((resolve) => {
      const timeoutMs = timeout || 30000;
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve({ success: false, error: `Request timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      pendingRequests.set(requestId, {
        ...request,
        callback: resolve,
        timestamp: new Date(),
        timeout: timer,
      });

      broadcastToClients({
        ...request,
        requestId,
      });
    });

    if (result.success) {
      res.json({ success: true, result: result.result });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    log('ERROR', 'Failed to execute browser code', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/tools/browser_capture_dom', async (req, res) => {
  try {
    const { selector, includeMetadata } = req.body;
    log('INFO', 'Capturing DOM via API', { selector, includeMetadata });

    if (wsClients.size === 0) {
      return res.status(503).json({
        error: 'No browser extension connected. Please ensure the extension is active.'
      });
    }

    const requestId = uuidv4();
    const request: BrowserRequest = {
      id: requestId,
      type: 'capture_dom',
      data: {
        selector,
        includeMetadata: includeMetadata !== false, // Default true
      },
    };

    const result: any = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve({ success: false, error: 'Request timed out after 10 seconds' });
      }, 10000);

      pendingRequests.set(requestId, {
        ...request,
        callback: resolve,
        timestamp: new Date(),
        timeout: timer,
      });

      broadcastToClients({
        ...request,
        requestId,
      });
    });

    if (result.success) {
      res.json({ success: true, result: result.result });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    log('ERROR', 'Failed to capture DOM', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/tools/browser_capture_screenshot', async (req, res) => {
  try {
    const { selector, fullPage, quality } = req.body;
    log('INFO', 'Capturing screenshot via API', { selector, fullPage, quality });

    if (wsClients.size === 0) {
      return res.status(503).json({
        error: 'No browser extension connected. Please ensure the extension is active.'
      });
    }

    const requestId = uuidv4();
    const request: BrowserRequest = {
      id: requestId,
      type: 'capture_screenshot',
      data: {
        selector,
        fullPage: fullPage || false,
        quality: quality || 100,
      },
    };

    const result: any = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve({ success: false, error: 'Request timed out after 10 seconds' });
      }, 10000);

      pendingRequests.set(requestId, {
        ...request,
        callback: resolve,
        timestamp: new Date(),
        timeout: timer,
      });

      broadcastToClients({
        ...request,
        requestId,
      });
    });

    if (result.success) {
      res.json({ success: true, result: result.result });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    log('ERROR', 'Failed to capture screenshot', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/tools/browser_navigate', async (req, res) => {
  try {
    const { url, waitFor } = req.body;
    log('INFO', 'Navigating browser via API', { url, waitFor });

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (wsClients.size === 0) {
      return res.status(503).json({
        error: 'No browser extension connected. Please ensure the extension is active.'
      });
    }

    const requestId = uuidv4();
    const request: BrowserRequest = {
      id: requestId,
      type: 'navigate',
      data: {
        url,
        waitFor: waitFor || "document.readyState === 'complete'",
      },
    };

    const result: any = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve({ success: false, error: 'Request timed out after 30 seconds' });
      }, 30000);

      pendingRequests.set(requestId, {
        ...request,
        callback: resolve,
        timestamp: new Date(),
        timeout: timer,
      });

      broadcastToClients({
        ...request,
        requestId,
      });
    });

    if (result.success) {
      res.json({ success: true, message: `Navigated to ${url}` });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    log('ERROR', 'Failed to navigate browser', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Status endpoints
app.get('/api/status', (req, res) => {
  res.json({
    server: 'running',
    connectedClients: wsClients.size,
    pendingRequests: pendingRequests.size,
    totalPosts: postDataStore.length,
  });
});

// Start server
const PORT = process.env.BACKEND_PORT || 3636;
httpServer.listen(PORT, () => {
  log('INFO', `Backend server running on port ${PORT}`);
  log('INFO', 'Waiting for browser extension connections...');
});

// Cleanup pending requests periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, request] of pendingRequests.entries()) {
    if (now - request.timestamp.getTime() > 60000) { // 1 minute timeout
      log('WARN', 'Cleaning up stale request', { requestId: id });
      if (request.timeout) clearTimeout(request.timeout);
      request.callback({ success: false, error: 'Request expired' });
      pendingRequests.delete(id);
    }
  }
}, 30000);