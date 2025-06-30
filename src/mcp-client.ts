import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// Backend server URL
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3636';

// Logger utility (to stderr to avoid interfering with MCP protocol)
const log = (level: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [MCP-CLIENT] [${level}] ${message}`;
  if (data) {
    console.error(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.error(logMessage);
  }
};

// Create MCP server
const server = new Server(
  {
    name: 'linkedin-mcp-client',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

log('INFO', 'MCP Client initialized', { backendUrl: BACKEND_URL });

// Check backend connectivity
async function checkBackend(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/status`);
    if (response.ok) {
      const status = await response.json();
      log('INFO', 'Backend status', status);
      return true;
    }
    return false;
  } catch (error) {
    log('ERROR', 'Failed to connect to backend', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

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
      {
        name: 'show_linkedin_alert',
        description: 'Show an alert message on the LinkedIn page',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to display in the alert',
            },
            title: {
              type: 'string',
              description: 'Optional title for the alert',
            },
          },
          required: ['message'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log('INFO', 'Received tool call', { tool: name, args });

  // Check backend connection first
  const backendAvailable = await checkBackend();
  if (!backendAvailable) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: Cannot connect to backend server. Please ensure the LinkedIn MCP backend is running on port 3636.',
        },
      ],
    };
  }

  try {
    switch (name) {
      case 'create_linkedin_post': {
        const response = await fetch(`${BACKEND_URL}/api/tools/create_linkedin_post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        
        const result: any = await response.json();
        
        if (response.ok && result.success) {
          return {
            content: [
              {
                type: 'text',
                text: result.message,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${result.error || 'Failed to create post'}`,
              },
            ],
          };
        }
      }
      
      case 'get_post_data': {
        const response = await fetch(`${BACKEND_URL}/api/tools/get_post_data`);
        const result: any = await response.json();
        
        if (!result.data) {
          return {
            content: [
              {
                type: 'text',
                text: 'No posts available',
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      }
      
      case 'show_linkedin_alert': {
        const response = await fetch(`${BACKEND_URL}/api/tools/show_linkedin_alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        
        const result: any = await response.json();
        
        if (response.ok && result.success) {
          return {
            content: [
              {
                type: 'text',
                text: result.message,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${result.error || 'Failed to show alert'}`,
              },
            ],
          };
        }
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    log('ERROR', 'Tool execution failed', { tool: name, error: error instanceof Error ? error.message : String(error) });
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

// Start MCP server
async function main() {
  log('INFO', 'Starting MCP client...');
  
  // Check backend connection
  const backendAvailable = await checkBackend();
  if (!backendAvailable) {
    log('WARN', 'Backend server not available. Tools will fail until backend is running.');
  }
  
  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('INFO', 'MCP Client running on stdio');
}

main().catch((error) => {
  log('ERROR', 'MCP client startup failed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});