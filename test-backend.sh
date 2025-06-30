#!/bin/bash

echo "Testing LinkedIn MCP Backend API..."
echo "==================================="
echo ""

# Check if backend is running
echo "1. Checking backend status..."
STATUS=$(curl -s http://localhost:3636/api/status)

if [ $? -ne 0 ]; then
    echo "❌ Backend is not running. Please run ./start-backend.sh first"
    exit 1
fi

echo "✅ Backend is running"
echo "   Status: $STATUS"
echo ""

# Test show alert
echo "2. Testing show_linkedin_alert..."
ALERT_RESPONSE=$(curl -s -X POST http://localhost:3636/api/tools/show_linkedin_alert \
  -H "Content-Type: application/json" \
  -d '{"message": "Test alert from API", "title": "API Test"}')

echo "   Response: $ALERT_RESPONSE"
echo ""

# Test create post
echo "3. Testing create_linkedin_post..."
POST_RESPONSE=$(curl -s -X POST http://localhost:3636/api/tools/create_linkedin_post \
  -H "Content-Type: application/json" \
  -d '{"content": "Test post from API test script"}')

echo "   Response: $POST_RESPONSE"
echo ""

# Get latest post
echo "4. Getting latest post data..."
LATEST_POST=$(curl -s http://localhost:3636/api/tools/get_post_data)

echo "   Latest post: $LATEST_POST"
echo ""

echo "==================================="
echo "Test complete!"