#!/bin/bash

echo "Starting LinkedIn MCP Backend Server..."
echo "======================================="
echo ""
echo "This is the persistent backend server that:"
echo "- Runs on port 3636"
echo "- Accepts WebSocket connections from browser extension"
echo "- Provides REST API for MCP client"
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

# Run the backend server
npm run backend