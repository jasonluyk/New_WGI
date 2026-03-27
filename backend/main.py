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

app = FastAPI(title="WGI Analytics API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    items = list(db["wgi_analytics"].find({}, {"_id": 0}))
    return {"data": items}

@app.get("/api/national/classes")
def get_classes():
    classes = db["wgi_analytics"].distinct("Class")
    return {"classes": sorted(classes)}

@app.get("/api/national/{class_name}")
def get_national_by_class(class_name: str):
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

# =====================================================================
# NATIONAL / WGI GROUP STANDINGS (seedings page)
# =====================================================================
@app.get("/api/standings")
def get_standings():
    """Returns official WGI group standings (seedings page)."""
    data = list(db["group_standings"].find({}, {"_id": 0}))
    status_doc = db["system_state"].find_one({"type": "standings_status"}, {"_id": 0})
    return {
        "data": data,
        "updated": status_doc.get("updated") if status_doc else None
    }

@app.post("/api/admin/sync-standings")
def admin_sync_standings(username: str = Depends(verify_admin)):
    db["system_state"].insert_one({
        "type": "scraper_command",
        "action": "sync_standings"
    })
    return {"message": "Standings sync command sent."}

# =====================================================================
# SEASON STANDINGS (all guards from wgi_analytics)
# =====================================================================
@app.get("/api/all-guards")
def get_all_guards():
    from collections import defaultdict

    CLASS_ORDER = [
        "Scholastic A", "Scholastic Open", "Scholastic World",
        "Independent A", "Independent Open", "Independent World"
    ]

    all_scores = list(db["wgi_analytics"].find({}, {"_id": 0}))

    guard_map = defaultdict(list)
    for row in all_scores:
        key = (row["Guard"], row["Class"])
        guard_map[key].append(row)

    results = []
    for (guard, cls), rows in guard_map.items():
        # Group by base show name, prefer finals over prelims
        show_map = defaultdict(dict)
        for row in rows:
            show = row.get("Show", "")
            is_finals = "final" in show.lower()
            base = show.lower().replace("finals", "").replace("final", "").strip()
            if is_finals:
                show_map[base]["finals"] = row
            else:
                show_map[base]["prelims"] = row

        all_show_scores = []
        for base, entries in show_map.items():
            best = entries.get("finals") or entries.get("prelims")
            all_show_scores.append({
                "Show": best["Show"],
                "Score": best["Score"],
                "Date": best.get("Date")
            })

        all_show_scores.sort(key=lambda x: x.get("Date") or x["Show"])
        season_high = max(s["Score"] for s in all_show_scores)
        season_avg = round(sum(s["Score"] for s in all_show_scores) / len(all_show_scores), 3)
        best_show = max(all_show_scores, key=lambda x: x["Score"])

        results.append({
            "Guard": guard,
            "Class": cls,
            "Latest_Score": round(season_high, 3),
            "Latest_Show": best_show["Show"],
            "Made_Finals": "final" in best_show["Show"].lower(),
            "Season_High": round(season_high, 3),
            "Season_Avg": season_avg,
            "Shows": len(show_map),
            "All_Scores": all_show_scores
        })

    results.sort(key=lambda x: (
        CLASS_ORDER.index(x["Class"]) if x["Class"] in CLASS_ORDER else 99,
        -x["Latest_Score"]
    ))

    class_rank = {}
    for r in results:
        c = r["Class"]
        class_rank[c] = class_rank.get(c, 0) + 1
        r["Rank"] = class_rank[c]

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
    doc = db["live_state"].find_one({"type": "current_session"}, {"_id": 0})
    if not doc:
        return {"data": [], "spots": {}, "show_name": None, "status": "none"}
    # Fall back to active_show_name if show_name missing from doc
    show_name = doc.get("show_name") or ""
    if not show_name:
        active = db["system_state"].find_one({"type": "active_show_name"}, {"_id": 0})
        show_name = active.get("name", "") if active else ""
    return {
        "data": doc.get("data", []),
        "spots": doc.get("spots", {}),
        "show_name": show_name,
        "status": doc.get("status", "roster_only")
    }

# =====================================================================
# PROJECTOR
# =====================================================================
@app.get("/api/projection")
def get_projection():
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
    events = list(db["event_metadata"].find({}, {"_id": 0}))
    return {"events": sorted(events, key=lambda x: x.get("name", ""))}

@app.get("/api/events/{show_id}/archive")
def get_archive(show_id: str):
    doc = db["archive_state"].find_one({"type": "current_archive", "show_id": show_id}, {"_id": 0})
    if not doc:
        return {"data": [], "status": "none", "event_name": ""}
    return {
        "data": doc.get("data", []),
        "status": doc.get("status", "none"),
        "event_name": doc.get("event_name", "")
    }

# =====================================================================
# WORLD CHAMPIONSHIPS
# =====================================================================
@app.get("/api/worlds/sessions")
def get_worlds_sessions():
    sessions = list(db["worlds_sessions"].find({}, {"_id": 0}))
    return {"sessions": sorted(sessions, key=lambda x: (x.get("day", ""), x.get("round", ""), x.get("name", "")))}

@app.get("/api/worlds/state")
def get_worlds_state():
    sessions = list(db["worlds_state"].find({}, {"_id": 0}))
    return {"data": sessions}

@app.post("/api/admin/worlds-discover")
def admin_worlds_discover(username: str = Depends(verify_admin)):
    db["system_state"].insert_one({
        "type": "scraper_command",
        "action": "sync_worlds_discover"
    })
    return {"message": "World Championship discovery command sent."}

@app.post("/api/admin/worlds-session")
def admin_worlds_session(payload: dict, username: str = Depends(verify_admin)):
    update = {}
    if payload.get("show_id"):
        update["show_id"] = payload.get("show_id")
    if payload.get("schedule_url"):
        update["schedule_url"] = payload.get("schedule_url")
    if update:
        db["worlds_sessions"].update_one(
            {"session_id": payload.get("session_id")},
            {"$set": update},
            upsert=True
        )
    db["system_state"].insert_one({
        "type": "scraper_command",
        "action": "sync_worlds_session",
        "session_id": payload.get("session_id"),
        "show_id": payload.get("show_id", ""),
        "schedule_url": payload.get("schedule_url", "")
    })
    return {"message": f"Worlds session sync command sent for {payload.get('session_id')}."}

@app.post("/api/admin/worlds-set-showid")
def admin_worlds_set_showid(payload: dict, username: str = Depends(verify_admin)):
    db["worlds_sessions"].update_one(
        {"session_id": payload.get("session_id")},
        {"$set": {"show_id": payload.get("show_id")}},
        upsert=True
    )
    return {"message": f"ShowID set for {payload.get('session_id')}."}

# =====================================================================
# ADMIN ENDPOINTS (password protected)
# =====================================================================
@app.post("/api/admin/discover")
def admin_discover(username: str = Depends(verify_admin)):
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
    import subprocess
    try:
        subprocess.Popen(["python", "/root/New_WGI/backend/seed_db.py"])
        return {"message": "Seed started in background."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/sync-live")
def admin_sync_live(payload: dict, username: str = Depends(verify_admin)):
    db["system_state"].insert_one({
        "type": "scraper_command",
        "action": "sync_live",
        "show_name": payload.get("show_name"),
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