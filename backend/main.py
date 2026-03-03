from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from contextlib import asynccontextmanager
import pymongo
import os
import secrets
import re

# =====================================================================
# DATABASE CONNECTION
# =====================================================================
mongo_url = os.environ.get("MONGO_URI")
client = pymongo.MongoClient(mongo_url)
db = client["rankings_2026"]

# =====================================================================
# APP SETUP
# =====================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 WGI Analytics API starting up...")
    yield
    print("🛑 WGI Analytics API shutting down...")

app = FastAPI(
    title="WGI Analytics API",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten this to your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBasic()

def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    admin_pass = os.environ.get("ADMIN_PASS", "")
    is_correct = secrets.compare_digest(credentials.password.encode(), admin_pass.encode())
    if not is_correct:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

# =====================================================================
# NATIONAL RANKINGS
# =====================================================================
@app.get("/api/national")
def get_national():
    """Returns all national scores from wgi_analytics."""
    items = list(db["wgi_analytics"].find({}, {"_id": 0}))
    return {"data": items}

@app.get("/api/national/classes")
def get_classes():
    """Returns list of unique classes."""
    classes = db["wgi_analytics"].distinct("Class")
    return {"classes": sorted(classes)}

@app.get("/api/national/{class_name}")
def get_national_by_class(class_name: str):
    """Returns national scores for a specific class, aggregated by guard."""
    pipeline = [
        {"$match": {"Class": class_name}},
        {"$group": {
            "_id": "$Guard",
            "Guard": {"$first": "$Guard"},
            "Class": {"$first": "$Class"},
            "Season_High": {"$max": "$Score"},
            "Average_Score": {"$avg": "$Score"},
            "Shows_Attended": {"$sum": 1}
        }},
        {"$sort": {"Season_High": -1}}
    ]
    results = list(db["wgi_analytics"].aggregate(pipeline))
    for r in results:
        r.pop("_id", None)
        r["Average_Score"] = round(r["Average_Score"], 3)
    return {"data": results}




@app.get("/api/guard-history")
def get_guard_history(name: str, cls: str = None):
    query = {"Guard": name}
    if cls:
        query["Class"] = cls
    data = list(db["wgi_analytics"].find(query, {"_id": 0}))
    return {"data": data}


# =====================================================================
# LIVE HUB
# =====================================================================
@app.get("/api/live")
def get_live():
    """Returns current live show data."""
    doc = db["live_state"].find_one({"type": "current_session"}, {"_id": 0})
    if not doc:
        return {"data": [], "spots": {}, "show_name": None}
    return {
        "data": doc.get("data", []),
        "spots": doc.get("spots", {}),
        "show_name": doc.get("show_name", "")
    }

# =====================================================================
# PROJECTOR
# =====================================================================
@app.get("/api/projection")
def get_projection():
    """Returns current projection data."""
    doc = db["projection_state"].find_one({"type": "current_projection"}, {"_id": 0})
    if not doc:
        return {"data": [], "spots": {}, "show_name": None, "status": "none"}
    return {
        "data": doc.get("data", []),
        "spots": doc.get("spots", {}),
        "show_name": doc.get("show_name", ""),
        "status": doc.get("status", "none")
    }

# =====================================================================
# PAST EVENTS
# =====================================================================
@app.get("/api/events")
def get_events():
    """Returns all discovered events from event_metadata."""
    events = list(db["event_metadata"].find({}, {"_id": 0}))
    return {"events": sorted(events, key=lambda x: x.get("name", ""))}

@app.get("/api/events/{show_id}/archive")
def get_archive(show_id: str):
    """Returns archive scores for a specific show."""
    doc = db["archive_state"].find_one({"type": "current_archive", "show_id": show_id}, {"_id": 0})
    if not doc:
        return {"data": [], "status": "none", "event_name": ""}
    return {
        "data": doc.get("data", []),
        "status": doc.get("status", "none"),
        "event_name": doc.get("event_name", "")
    }

# =====================================================================
# SEASON STANDINGS (all guards, ranked by most recent score)
# =====================================================================
@app.get("/api/all-guards")
def get_all_guards():
    """
    Builds a season leaderboard from wgi_analytics.
    For each guard+class, finds their most recent show score.
    Prefers finals over prelims when both exist for the same show.
    Ranked by latest score descending within each class.
    """
    from collections import defaultdict

    CLASS_ORDER = [
        "Scholastic A", "Scholastic Open", "Scholastic World",
        "Independent A", "Independent Open", "Independent World"
    ]

    all_scores = list(db["wgi_analytics"].find({}, {"_id": 0}))

    # Group by (Guard, Class)
    guard_map = defaultdict(list)
    for row in all_scores:
        key = (row["Guard"], row["Class"])
        guard_map[key].append(row)

    results = []
    for (guard, cls), rows in guard_map.items():
        # For each base show name, prefer finals over prelims
        show_map = defaultdict(dict)
        for row in rows:
            show = row.get("Show", "")
            is_finals = "final" in show.lower()
            base = show.lower().replace("finals", "").replace("final", "").strip()
            if is_finals:
                show_map[base]["finals"] = row
            else:
                show_map[base]["prelims"] = row

        # Build per-show best scores
        show_entries = []
        for base, entries in show_map.items():
            best = entries.get("finals") or entries.get("prelims")
            show_entries.append((base, best))

        # Sort by show name — acts as rough chronological order
        show_entries.sort(key=lambda x: x[0])

        # Most recent = last after sort
        _, most_recent = show_entries[-1]
        latest_score = most_recent.get("Score", 0)
        latest_show = most_recent.get("Show", "")
        is_finals = "final" in latest_show.lower()

        season_high = max(
            (entries.get("finals") or entries.get("prelims"))["Score"]
            for _, entries in show_map.items()
        )

        all_show_scores = sorted([
            {
                "Show": (entries.get("finals") or entries.get("prelims"))["Show"],
                "Score": (entries.get("finals") or entries.get("prelims"))["Score"]
            }
            for _, entries in show_map.items()
        ], key=lambda x: x["Show"])

        results.append({
            "Guard": guard,
            "Class": cls,
            "Latest_Score": round(latest_score, 3),
            "Latest_Show": latest_show,
            "Made_Finals": is_finals,
            "Season_High": round(season_high, 3),
            "Shows": len(show_map),
            "All_Scores": all_show_scores
        })

    # Sort by class order then latest score descending
    results.sort(key=lambda x: (
        CLASS_ORDER.index(x["Class"]) if x["Class"] in CLASS_ORDER else 99,
        -x["Latest_Score"]
    ))

    # Add rank within each class
    class_rank = {}
    for r in results:
        c = r["Class"]
        class_rank[c] = class_rank.get(c, 0) + 1
        r["Rank"] = class_rank[c]

    return {"data": results}

# =====================================================================
# ADMIN ENDPOINTS (password protected)
# =====================================================================
@app.post("/api/admin/discover")
def admin_discover(username: str = Depends(verify_admin)):
    """Triggers auto-discovery of WGI events."""
    db["system_state"].insert_one({
        "type": "scraper_command",
        "action": "sync_national"
    })
    db["system_state"].update_one(
        {"type": "discovery_status"},
        {"$set": {"status": "running"}},
        upsert=True
    )
    return {"message": "Auto-discovery command sent."}

@app.post("/api/admin/seed")
def admin_seed(username: str = Depends(verify_admin)):
    """Triggers a full database seed via GitHub Actions webhook or direct call."""
    import subprocess
    try:
        subprocess.Popen(["python", "/root/WGI-v2/backend/seed_db.py"])
        return {"message": "Seed started in background."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/sync-live")
def admin_sync_live(payload: dict, username: str = Depends(verify_admin)):
    """Triggers a live show scrape."""
    db["system_state"].insert_one({
        "type": "scraper_command",
        "action": "sync_live",
        "show_id": payload.get("show_id"),
        "prelims_url": payload.get("prelims_url"),
        "finals_url": payload.get("finals_url")
    })
    db["system_state"].update_one(
        {"type": "active_show_name"},
        {"$set": {
            "name": payload.get("show_name"),
            "show_id": payload.get("show_id"),
            "p_url": payload.get("prelims_url"),
            "f_url": payload.get("finals_url")
        }},
        upsert=True
    )
    return {"message": f"Live sync command sent for {payload.get('show_name')}."}

@app.post("/api/admin/sync-projection")
def admin_sync_projection(payload: dict, username: str = Depends(verify_admin)):
    """Triggers a projection build."""
    db["projection_state"].update_one(
        {"type": "current_projection"},
        {"$set": {"status": "loading", "show_name": payload.get("show_name")}},
        upsert=True
    )
    db["system_state"].insert_one({
        "type": "scraper_command",
        "action": "sync_projection",
        "show_name": payload.get("show_name"),
        "prelims_url": payload.get("prelims_url"),
        "finals_url": payload.get("finals_url")
    })
    return {"message": f"Projection command sent for {payload.get('show_name')}."}

@app.post("/api/admin/sync-archive")
def admin_sync_archive(payload: dict, username: str = Depends(verify_admin)):
    """Triggers an archive scrape for a past event."""
    db["archive_state"].update_one(
        {"type": "current_archive"},
        {"$set": {
            "status": "loading",
            "event_name": payload.get("event_name"),
            "show_id": payload.get("show_id")
        }},
        upsert=True
    )
    db["system_state"].insert_one({
        "type": "scraper_command",
        "action": "sync_archive",
        "show_id": payload.get("show_id"),
        "event_name": payload.get("event_name")
    })
    return {"message": f"Archive command sent for {payload.get('event_name')}."}

@app.get("/api/admin/status")
def admin_status(username: str = Depends(verify_admin)):
    """Returns current system status for admin dashboard."""
    discovery = db["system_state"].find_one({"type": "discovery_status"}, {"_id": 0})
    active_show = db["system_state"].find_one({"type": "active_show_name"}, {"_id": 0})
    projection = db["projection_state"].find_one({"type": "current_projection"}, {"_id": 0})
    archive = db["archive_state"].find_one({"type": "current_archive"}, {"_id": 0})
    national_count = db["wgi_analytics"].count_documents({})
    standings_status = db["system_state"].find_one({"type": "standings_status"}, {"_id": 0})

    return {
        "discovery_status": discovery.get("status") if discovery else "none",
        "discovery_count": discovery.get("count") if discovery else 0,
        "active_show": active_show.get("name") if active_show else None,
        "projection_status": projection.get("status") if projection else "none",
        "projection_show": projection.get("show_name") if projection else None,
        "archive_status": archive.get("status") if archive else "none",
        "archive_event": archive.get("event_name") if archive else None,
        "national_records": national_count,
        "standings_status": standings_status.get("status") if standings_status else "none",
        "standings_count": standings_status.get("count") if standings_status else 0,
    }

@app.delete("/api/admin/clear-live")
def admin_clear_live(username: str = Depends(verify_admin)):
    db["live_state"].delete_many({})
    db["system_state"].delete_one({"type": "active_show_name"})
    return {"message": "Live data cleared."}

@app.delete("/api/admin/clear-projection")
def admin_clear_projection(username: str = Depends(verify_admin)):
    db["projection_state"].delete_many({})
    return {"message": "Projection cleared."}

# =====================================================================
# HEALTH CHECK
# =====================================================================
@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0.0"}