#!/bin/bash

echo "MCP Debug Information"
echo "===================="
echo ""

# Check if backend is running
echo "1. Backend Server Status:"
if lsof -i :3636 >/dev/null 2>&1; then
    echo "   ✓ Backend server is running on port 3636"
    echo "   Process info:"
    lsof -i :3636 | grep LISTEN
else
    echo "   ✗ Backend server is NOT running on port 3636"
fi
echo ""

# Check MCP client config
echo "2. Claude MCP Configuration:"
CONFIG_FILE="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo "   ✓ Config file exists at: $CONFIG_FILE"
    echo "   Content:"
    cat "$CONFIG_FILE" | sed 's/^/   /'
else
    echo "   ✗ Config file NOT found at: $CONFIG_FILE"
fi
echo ""

# Check node and file paths
echo "3. File Paths:"
echo "   Node path: $(which node)"
echo "   MCP index.js: /Users/gcao/ai/claude-as-agent/tools/mcp-backend/dist/index.js"
if [ -f "/Users/gcao/ai/claude-as-agent/tools/mcp-backend/dist/index.js" ]; then
    echo "   ✓ index.js exists"
else
    echo "   ✗ index.js NOT found"
fi
echo ""

# Test MCP client directly
echo "4. Testing MCP Client:"
echo "   Running: echo '{}' | node /Users/gcao/ai/claude-as-agent/tools/mcp-backend/dist/index.js"
echo "   Output:"
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":true},"sampling":{}}},"id":1}' | timeout 5 node /Users/gcao/ai/claude-as-agent/tools/mcp-backend/dist/index.js 2>&1 | head -20 | sed 's/^/   /'
echo ""

# Check Claude logs
echo "5. Recent Claude Logs:"
LOG_FILE="$HOME/Library/Logs/Claude/main.log"
if [ -f "$LOG_FILE" ]; then
    echo "   Last 10 lines mentioning 'mcp' or 'linkedin':"
    tail -100 "$LOG_FILE" | grep -i -E "(mcp|linkedin)" | tail -10 | sed 's/^/   /'
else
    echo "   ✗ Claude log file not found at: $LOG_FILE"
fi
echo ""

echo "6. Recommendations:"
echo "   1. Ensure backend server is running: cd /Users/gcao/ai/claude-as-agent/tools/mcp-backend && ./start-backend.sh"
echo "   2. Restart Claude Desktop app after backend is running"
echo "   3. Check Claude's developer tools (View > Toggle Developer Tools) for errors"
echo "   4. Look for 'linkedin' in the tools menu in Claude"