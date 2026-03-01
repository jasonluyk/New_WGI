#!/bin/bash

export MONGO_URI="mongodb+srv://jason:bsidata@bsicluster.uifuc9m.mongodb.net/?appName=BSICluster"
export ADMIN_PASS="WE7AJNoQ456^%$"

source /root/New_WGI/venv/bin/activate

# Start the scraper worker in the background
python /root/New_WGI/backend/scraper_worker.py &

# Start FastAPI in the background
cd /root/New_WGI/backend
uvicorn main:app --host 0.0.0.0 --port 8000 &

# Nginx serves the React build on port 80
nginx -g "daemon off;"