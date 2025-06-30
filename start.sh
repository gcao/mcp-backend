#!/bin/bash

echo "Starting LinkedIn MCP Backend Server..."
echo "======================================="
echo ""
echo "Logs will be shown below. The server writes to stderr to avoid"
echo "interfering with the MCP protocol on stdout."
echo ""
echo "To use with Claude:"
echo "1. Add this server to your MCP configuration"
echo "2. The WebSocket server runs on port 3636 for the browser extension"
echo ""
echo "Press Ctrl+C to stop the server"
echo "======================================="
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build TypeScript if not built
if [ ! -d "dist" ]; then
    echo "Building TypeScript..."
    npm run build
fi

# Run the server
npm run dev