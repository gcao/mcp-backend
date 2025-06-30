#!/bin/bash

echo "Starting LinkedIn MCP Client (Development/Testing Only)..."
echo "========================================================="
echo ""
echo "⚠️  WARNING: This is for development/testing only!"
echo ""
echo "For normal use:"
echo "1. Run ./start-backend.sh to start the backend server"
echo "2. Claude will automatically start the MCP client when needed"
echo ""
echo "This script is only useful for:"
echo "- Testing the MCP client without Claude"
echo "- Debugging MCP protocol issues"
echo ""
echo "Press Ctrl+C to stop"
echo "========================================================="
echo ""

# Check if backend is running
if ! curl -s http://localhost:3636/api/status > /dev/null; then
    echo "WARNING: Backend server is not running on port 3636!"
    echo "Please run ./start-backend.sh first"
    echo ""
fi

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

# Run the MCP client
npm run dev