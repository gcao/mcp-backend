import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { createServer } from 'http';

// Logger utility
const log = (level: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  if (data) {
    console.error(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.error(logMessage);
  }
};

// Store for LinkedIn post data
interface LinkedInPostData {
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

const postDataStore: LinkedInPostData[] = [];

// Create MCP server
const server = new Server(
  {
    name: 'linkedin-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

log('INFO', 'MCP Server initialized', { name: 'linkedin-mcp-server', version: '1.0.0' });

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  log('DEBUG', 'Received ListTools request');
  return {
    tools: [
      {
        name: 'create_linkedin_post',
        description: 'Create a LinkedIn post with the provided content',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The content of the LinkedIn post',
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata for the post',
              properties: {},
              additionalProperties: true,
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'get_post_data',
        description: 'Retrieve the latest LinkedIn post data',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log('INFO', 'Received tool call', { tool: name, args });

  switch (name) {
    case 'create_linkedin_post': {
      const { content, metadata } = args as { content: string; metadata?: Record<string, any> };
      
      log('INFO', 'Creating LinkedIn post', { contentLength: content.length });
      
      const postData: LinkedInPostData = {
        content,
        timestamp: new Date(),
        metadata,
      };
      
      postDataStore.push(postData);
      log('DEBUG', 'Post added to store', { totalPosts: postDataStore.length });
      
      // Notify WebSocket clients
      broadcastToClients({
        type: 'new_post',
        data: postData,
      });
      
      log('INFO', 'Post created and broadcasted successfully');
      
      return {
        content: [
          {
            type: 'text',
            text: `LinkedIn post created: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
          },
        ],
      };
    }
    
    case 'get_post_data': {
      log('INFO', 'Retrieving latest post data');
      const latestPost = postDataStore[postDataStore.length - 1];
      
      if (!latestPost) {
        log('DEBUG', 'No posts found in store');
        return {
          content: [
            {
              type: 'text',
              text: 'No posts available',
            },
          ],
        };
      }
      
      log('DEBUG', 'Returning latest post', { timestamp: latestPost.timestamp });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(latestPost, null, 2),
          },
        ],
      };
    }
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// WebSocket setup for browser extension communication
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const wsClients = new Set<any>();

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
    const data = JSON.parse(message.toString());
    log('INFO', 'Received message from extension', data);
    
    if (data.type === 'get_latest_post') {
      const latestPost = postDataStore[postDataStore.length - 1];
      const response = {
        type: 'post_data',
        data: latestPost || null,
      };
      ws.send(JSON.stringify(response));
      log('DEBUG', 'Sent post data to extension', { hasPost: !!latestPost });
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

// REST API endpoints
app.get('/api/posts', (req, res) => {
  log('DEBUG', 'GET /api/posts requested');
  res.json(postDataStore);
});

app.get('/api/posts/latest', (req, res) => {
  log('DEBUG', 'GET /api/posts/latest requested');
  const latestPost = postDataStore[postDataStore.length - 1];
  res.json(latestPost || null);
});

// Start servers
async function main() {
  log('INFO', 'Starting servers...');
  
  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('INFO', 'MCP Server running on stdio');
  
  // Start HTTP/WebSocket server
  const PORT = process.env.PORT || 3636;
  httpServer.listen(PORT, () => {
    log('INFO', `HTTP/WebSocket server running on port ${PORT}`);
    log('INFO', 'Server initialization complete');
  });
}

main().catch((error) => {
  log('ERROR', 'Server startup failed', { error: error.message });
  process.exit(1);
});