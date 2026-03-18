#!/bin/bash
set -a
source /etc/environment
set +a

cd /root/New_WGI
source venv/bin/activate

# Kill anything leftover on these ports
fuser -k 80/tcp 2>/dev/null
fuser -k 8000/tcp 2>/dev/null

# Start worker
python backend/scraper_worker.py &

# Start API
uvicorn backend.main:app --host 0.0.0.0 --port 8000 &

# Start nginx
nginx -g "daemon off;"