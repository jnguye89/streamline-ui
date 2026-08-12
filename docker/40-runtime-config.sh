#!/bin/sh
set -eu

api_base_url="${API_BASE_URL:-http://localhost:3000}"
escaped_api_base_url="$(printf '%s' "$api_base_url" | sed 's/\\/\\\\/g; s/"/\\"/g')"

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__SKRIIN_CONFIG__ = { apiBaseUrl: "$escaped_api_base_url" };
EOF
