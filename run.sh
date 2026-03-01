#!/bin/bash

source /root/New_WGI/venv/bin/activate

# Start the scraper worker in the background
python /root/New_WGI/backend/scraper_worker.py &

# Start the FastAPI server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload