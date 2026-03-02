import os
import time
import threading
import pymongo
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
import re
import requests
import pdfplumber
import io
from datetime import datetime

# Connect to MongoDB
mongo_url = os.environ.get("MONGO_URI")
if not mongo_url:
    raise ValueError("MONGO_URI environment variable not set")
client = pymongo.MongoClient(mongo_url)
db = client["rankings_2026"]
national_collection = db["wgi_analytics"]
live_collection = db["live_state"]
command_collection = db["system_state"]

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

STANDINGS_URLS = {
    "Scholastic A": "https://www.wgi.org/color-guard/scholastic-a-group-standings/",
    "Scholastic Open": "https://www.wgi.org/color-guard/scholastic-open-group-standings/",
    "Scholastic World": "https://www.wgi.org/color-guard/scholastic-world-group-standings/",
    "Independent A": "https://www.wgi.org/color-guard/independent-a-group-standings/",
    "Independent Open": "https://www.wgi.org/color-guard/independent-open-group-standings/",
    "Independent World": "https://www.wgi.org/color-guard/independent-world-group-standings/",
}

# =====================================================================
# --- UTILITY FUNCTIONS ---
# =====================================================================

def clean_class_name(raw_class):
    """Strips out WGI round/prelim/finals tags to keep classes unified."""
    clean = raw_class.strip()
    if re.match(r'(?i)^Round\s*\d+', clean):
        return "Scholastic A"
    clean = re.sub(r'(?i)\s*(?:-|\()?\s*(Prelims|Finals|Round\s*\d+|Semi.*)\)?', '', clean)
    return clean.strip() if clean.strip() else "Scholastic A"


# =====================================================================
# --- SCHEDULE PARSERS (Pass 1) ---
# =====================================================================

def parse_pdf_schedule(pdf_url, combined_data):
    print(f"📄 [TRAFFIC COP] Running Ultimate PDF Parser: {pdf_url}")

    class_map = {
        "SRA": "Scholastic Regional A",
        "SA": "Scholastic A",
        "SO": "Scholastic Open",
        "SW": "Scholastic World",
        "IRA": "Independent Regional A",
        "IA": "Independent A",
        "IO": "Independent Open",
        "IW": "Independent World"
    }

    try:
        response = requests.get(pdf_url)
        with pdfplumber.open(io.BytesIO(response.content)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text: continue

                for line in text.split('\n'):
                    line = line.strip()
                    if len(line) < 5: continue

                    match = re.search(
                        r'^(.*?)\s+(SRA|SA|SO|SW|IRA|IA|IO|IW)(?:\s*-\s*ROUND\D*(\d+))?\s+(\d{1,2}:\d{2}\s*[AP]M)$',
                        line, re.IGNORECASE
                    )

                    if match:
                        raw_front_text = match.group(1).strip()
                        base_abbr = match.group(2).upper()
                        round_num = match.group(3)
                        time_str = match.group(4).strip()

                        if ',' in raw_front_text:
                            before_comma = raw_front_text.rsplit(',', 1)[0].strip()
                            before_comma = re.sub(r'\(\w{2}\)', '', before_comma).strip()
                            before_comma = re.sub(r'\b\d{5}\b', '', before_comma).strip()

                            school_pattern = re.search(
                                r'^(.*?(?:High School|HS|Academy|Winterguard|WG|Independent|Performing Arts|Visual Productions|Nuance\s+\w+)(?:\s+(?:JV|Varsity|[A-Z]))?)',
                                before_comma, re.IGNORECASE
                            )
                            if school_pattern:
                                guard_name = school_pattern.group(1).strip()
                            else:
                                guard_name = before_comma.rsplit(' ', 1)[0].strip()
                        else:
                            guard_name = raw_front_text

                        guard_name = re.sub(r'^[A-Z](?=[A-Z])', '', guard_name).strip()
                        guard_name = re.sub(r'^\d+\s+', '', guard_name).strip()
                        guard_name = re.sub(r'\s+from\s+\w+..?$', '', guard_name, flags=re.IGNORECASE).strip()

                        base_clean = clean_class_name(class_map.get(base_abbr, base_abbr))
                        g_class = f"{base_clean} - Round {round_num}" if round_num else base_clean

                        combined_data[guard_name] = {
                            "Guard": guard_name, "Class": g_class,
                            "Prelims Time": time_str, "Prelims Score": 0.0,
                            "Finals Time": "", "Finals Score": 0.0
                        }
                        print(f"➕ Found Guard: {guard_name} ({g_class}) @ {time_str}")

    except Exception as e:
        print(f"⚠️ [WORKER] PDF Parser Failed: {e}")


def parse_html_schedule(html_url, combined_data, page):
    print(f"📡 [TRAFFIC COP] Routing to HTML Parser: {html_url}")

    class_map = {
        "SRA": "Scholastic Regional A", "SA": "Scholastic A",
        "SO": "Scholastic Open", "SW": "Scholastic World",
        "IRA": "Independent Regional A", "IA": "Independent A",
        "IO": "Independent Open", "IW": "Independent World"
    }

    try:
        page.goto(html_url)
        page.wait_for_timeout(5000)
        page.wait_for_selector(".schedule-row", timeout=15000)

        soup = BeautifulSoup(page.content(), 'html.parser')

        for row in soup.find_all('div', class_='schedule-row'):
            if 'schedule-row--custom' in row.get('class', []):
                continue

            name_div = row.find('div', class_='schedule-row__name')
            initials_div = row.find('div', class_='schedule-row__initials')
            time_div = row.find('div', class_='schedule-row__time')

            if not name_div or not initials_div or not time_div:
                continue

            guard_name = name_div.get_text(strip=True)
            raw_initials = initials_div.get_text(strip=True)
            time_str = time_div.get_text(strip=True)

            parts = raw_initials.split(' - ')
            base_abbr = parts[0].strip().upper()
            base_class = class_map.get(base_abbr, base_abbr)
            g_class = f"{base_class} - {parts[1].strip()}" if len(parts) > 1 else base_class

            combined_data[guard_name] = {
                "Guard": guard_name, "Class": g_class,
                "Prelims Time": time_str, "Prelims Score": 0.0,
                "Finals Time": "", "Finals Score": 0.0
            }
            print(f"➕ Found Guard: {guard_name} ({g_class}) @ {time_str}")

    except Exception as e:
        print(f"⚠️ [WORKER] HTML Parser Failed: {e}")


# =====================================================================
# --- FINALS SPOT COUNTERS (Pass 2) ---
# =====================================================================

def count_pdf_finals_spots(pdf_url, class_spots):
    print(f"📄 [TRAFFIC COP] Routing to PDF Finals Spot Counter: {pdf_url}")
    class_map = {
        "SRA": "Scholastic Regional A", "SA": "Scholastic A",
        "SO": "Scholastic Open", "SW": "Scholastic World",
        "IRA": "Independent Regional A", "IA": "Independent A",
        "IO": "Independent Open", "IW": "Independent World"
    }
    try:
        response = requests.get(pdf_url)
        with pdfplumber.open(io.BytesIO(response.content)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text: continue
                for line in text.split('\n'):
                    line = line.strip()
                    if len(line) < 5: continue
                    match = re.search(r'(SRA|SA|SO|SW|IRA|IA|IO|IW)\s+(\d{1,2}:\d{2}\s*[AP]M)$', line, re.IGNORECASE)
                    if match:
                        base_abbr = match.group(1).upper()
                        full_class = class_map.get(base_abbr, base_abbr)
                        g_class = clean_class_name(full_class)
                        class_spots[g_class] = class_spots.get(g_class, 0) + 1
                        print(f"🎯 Finals Spot Found: {g_class} (Total so far: {class_spots[g_class]})")
    except Exception as e:
        print(f"⚠️ [WORKER] PDF Finals Parser Failed: {e}")


def count_html_finals_spots(html_url, class_spots, page):
    print(f"📡 [TRAFFIC COP] Routing to HTML Finals Spot Counter: {html_url}")
    class_map = {
        "SRA": "Scholastic Regional A", "SA": "Scholastic A",
        "SO": "Scholastic Open", "SW": "Scholastic World",
        "IRA": "Independent Regional A", "IA": "Independent A",
        "IO": "Independent Open", "IW": "Independent World"
    }
    try:
        page.goto(html_url)
        page.wait_for_timeout(5000)
        page.wait_for_selector(".schedule-row", timeout=15000)
        soup = BeautifulSoup(page.content(), 'html.parser')
        for row in soup.find_all('div', class_='schedule-row'):
            if 'schedule-row--custom' in row.get('class', []):
                continue
            initials_div = row.find('div', class_='schedule-row__initials')
            if not initials_div: continue
            base_abbr = initials_div.get_text(strip=True).split(' - ')[0].strip().upper()
            base_class = class_map.get(base_abbr, base_abbr)
            g_class = clean_class_name(base_class)
            class_spots[g_class] = class_spots.get(g_class, 0) + 1
            print(f"🎯 Finals Spot Found: {g_class} (Total: {class_spots[g_class]})")
    except Exception as e:
        print(f"⚠️ [WORKER] HTML Finals Parser Failed: {e}")


# =====================================================================
# --- GROUP STANDINGS ---
# =====================================================================

def scrape_group_standings():
    print("📊 [WORKER] Scraping WGI Group Standings...")
    all_results = []
    for class_name, url in STANDINGS_URLS.items():
        try:
            response = requests.get(url, timeout=15)
            soup = BeautifulSoup(response.text, "html.parser")
            table = soup.find("table")
            if not table:
                print(f"⚠️ No table found for {class_name}")
                continue
            rows = table.find_all("tr")[1:]
            for row in rows:
                cols = [td.get_text(strip=True) for td in row.find_all("td")]
                if len(cols) >= 6:
                    all_results.append({
                        "Rank": cols[0],
                        "Guard": cols[1],
                        "Location": cols[2],
                        "Latest_Score": float(cols[3]) if cols[3] else 0.0,
                        "Week": cols[4],
                        "Seeding_Score": float(cols[5]) if cols[5] else 0.0,
                        "Class": class_name
                    })
            print(f"✅ {class_name}: {len(rows)} guards")
        except Exception as e:
            print(f"⚠️ Failed {class_name}: {e}")

    if all_results:
        db["group_standings"].delete_many({})
        db["group_standings"].insert_many(all_results)
        db["system_state"].update_one(
            {"type": "standings_status"},
            {"$set": {"status": "complete", "count": len(all_results), "updated": datetime.utcnow().isoformat()}},
            upsert=True
        )
        print(f"🎉 Group Standings saved: {len(all_results)} total guards")


# =====================================================================
# --- NATIONAL SCORES & DISCOVERY ---
# =====================================================================

def scrape_national_scores():
    print("🚀 [WORKER] Running Zero-Touch Discovery (Calendar -> Details -> Scores)...")
    master_events = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(user_agent=USER_AGENT)
        page = context.new_page()

        # --- HOP 1: GET EVENT DETAILS LINKS FROM CALENDAR ---
        print("🗓️ Hop 1: Hunting for Event Pages on WGI Calendar...")
        details_links = {}
        try:
            page.goto("https://www.wgi.org/color-guard/cg-calendar/")
            page.wait_for_timeout(5000)
            soup = BeautifulSoup(page.content(), 'html.parser')
            for link in soup.find_all('a', href=re.compile(r'event-details-page')):
                href = link['href']
                event_name = "Unknown Event"
                parent = link.find_parent(['div', 'li', 'article', 'td'])
                if parent:
                    header = parent.find(['h2', 'h3', 'h4', 'strong', 'span'])
                    if header:
                        event_name = header.get_text(strip=True)
                clean_name = event_name.split(",")[0].replace("Regional", "").strip()
                full_url = href if href.startswith('http') else f"https://www.wgi.org{href}"
                details_links[clean_name] = full_url
            print(f"✅ Found {len(details_links)} Event Details pages.")
        except Exception as e:
            print(f"⚠️ [WORKER] Calendar Scrape Error: {e}")

        # --- HOP 2: SCAN EVENT PAGES FOR SCHEDULE URLS ---
        print("🔍 Hop 2: Scanning Event Pages for Schedule Links...")
        for event_name, event_url in details_links.items():
            print(f"  -> Scanning Event Page: {event_name}...")
            p_url = ""
            f_url = ""
            try:
                page.goto(event_url)
                page.wait_for_timeout(5000)
                soup = BeautifulSoup(page.content(), 'html.parser')
                for a in soup.find_all('a', href=True):
                    link_text = a.get_text(strip=True).lower()
                    href = a['href']
                    if "prelims" in link_text and "regional a" not in link_text and not p_url:
                        p_url = href
                        print(f"      🔗 Found Main Prelims: {p_url}")
                    elif "finals" in link_text and "regional a" not in link_text and not f_url:
                        f_url = href
                        print(f"      🔗 Found Main Finals: {f_url}")
            except Exception as e:
                print(f"⚠️ [WORKER] Error scanning {event_name}: {e}")

            master_events[event_name] = {
                "name": event_name,
                "p_url": p_url,
                "f_url": f_url,
                "show_id": ""
            }

        # --- HOP 3: WGI SCORES FOR SHOW IDs ---
        print("🔍 Hop 3: Hunting for ShowIDs on WGI Scores Page...")
        try:
            page.goto("https://www.wgi.org/scores/color-guard-scores/")
            page.wait_for_timeout(5000)
            soup = BeautifulSoup(page.content(), 'html.parser')
            for link in soup.find_all('a', href=True):
                href = link['href']
                if 'ShowId=' in href:
                    show_name = link.get_text(strip=True)
                    if not show_name or "View" in show_name or "Score" in show_name:
                        row = link.find_parent('tr')
                        if row:
                            cols = row.find_all('td')
                            if len(cols) > 0:
                                show_name = cols[0].get_text(strip=True)
                    clean_score_name = show_name.split("Regional")[0].strip() if show_name else "Unknown Event"
                    extracted_id = href.split("ShowId=")[-1]
                    matched = False
                    for key in master_events.keys():
                        if clean_score_name.lower() in key.lower() or key.lower() in clean_score_name.lower():
                            master_events[key]["show_id"] = extracted_id
                            matched = True
                            break
                    if not matched:
                        master_events[clean_score_name] = {"name": clean_score_name, "show_id": extracted_id, "p_url": "", "f_url": ""}
            print(f"✅ Successfully mapped ShowIDs to the master dictionary.")
        except Exception as e:
            print(f"⚠️ [WORKER] Scores Scrape Error: {e}")

        browser.close()

    # --- FINAL DB UPDATE ---
    event_metadata_list = list(master_events.values())
    if event_metadata_list:
        db["event_metadata"].delete_many({})
        db["event_metadata"].insert_many(event_metadata_list)
        db["system_state"].update_one(
            {"type": "discovery_status"},
            {"$set": {"status": "complete", "count": len(event_metadata_list)}},
            upsert=True
        )
        print(f"🎉 [WORKER] Zero-Touch Sync Complete! {len(event_metadata_list)} total events ready.")
    else:
        db["system_state"].update_one(
            {"type": "discovery_status"},
            {"$set": {"status": "failed", "error": "No events found"}},
            upsert=True
        )
        print("❌ [WORKER] Discovery failed. No events found.")


# =====================================================================
# --- LIVE HUB ---
# =====================================================================

def poll_for_show_id(show_name):
    """
    Polls WGI scores page every 5 minutes looking for a ShowID matching
    the latched show name. Runs in a background daemon thread.
    Uses same name extraction + fuzzy matching logic as Hop 3.
    """
    print(f"🔍 [WORKER] Background polling for ShowID: {show_name}...")

    while True:
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=["--disable-blink-features=AutomationControlled"]
                )
                context = browser.new_context(user_agent=USER_AGENT)
                page = context.new_page()
                page.goto("https://www.wgi.org/scores/color-guard-scores/")
                page.wait_for_timeout(5000)
                soup = BeautifulSoup(page.content(), 'html.parser')
                browser.close()

                for link in soup.find_all('a', href=True):
                    href = link['href']
                    if 'ShowId=' not in href:
                        continue

                    # Same name extraction as Hop 3
                    link_name = link.get_text(strip=True)
                    if not link_name or "View" in link_name or "Score" in link_name:
                        row = link.find_parent('tr')
                        if row:
                            cols = row.find_all('td')
                            if cols:
                                link_name = cols[0].get_text(strip=True)

                    clean_name = link_name.split("Regional")[0].strip() if link_name else ""
                    extracted_id = href.split("ShowId=")[-1]

                    # Same fuzzy match as Hop 3
                    if clean_name.lower() in show_name.lower() or show_name.lower() in clean_name.lower():
                        print(f"🎯 [WORKER] ShowID found for {show_name}: {extracted_id}")

                        # Update event_metadata and active_show_name with discovered ShowID
                        db["event_metadata"].update_one(
                            {"name": show_name},
                            {"$set": {"show_id": extracted_id}},
                            upsert=True
                        )
                        db["system_state"].update_one(
                            {"type": "active_show_name"},
                            {"$set": {"show_id": extracted_id}},
                            upsert=True
                        )

                        # Re-run live scrape now with ShowID
                        session = db["live_state"].find_one({"type": "current_session"})
                        if session:
                            scrape_live_show(
                                show_name,
                                session.get("prelims_url"),
                                session.get("finals_url"),
                                show_id=extracted_id
                            )
                        return  # Stop polling once found

        except Exception as e:
            print(f"⚠️ [WORKER] Poll error: {e}")

        print(f"⏳ ShowID not found yet for {show_name}, retrying in 5 min...")
        time.sleep(300)


def scrape_live_show(show_name, prelims_url, finals_url, show_id=None):
    print(f"🚀 [WORKER] Running Hybrid Live Scrape: {show_name}...")
    combined_data = {}
    class_spots = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=USER_AGENT)
        page = context.new_page()

        # --- PASS 1: PRELIMS SCHEDULE (Build roster + times) ---
        if prelims_url:
            if prelims_url.lower().endswith('.pdf'):
                parse_pdf_schedule(prelims_url, combined_data)
            else:
                parse_html_schedule(prelims_url, combined_data, page)

        # --- PASS 2: FINALS SPOT COUNTER ---
        if finals_url:
            if finals_url.lower().endswith('.pdf'):
                count_pdf_finals_spots(finals_url, class_spots)
            else:
                count_html_finals_spots(finals_url, class_spots, page)

        # --- PASS 3: WGI SCORES (only if ShowID is available) ---
        if show_id and str(show_id).strip() != "":
            wgi_url = f"https://www.wgi.org/scores/color-guard-score-event/?ShowId={show_id}"
            print(f"📡 Probing WGI Scores: {wgi_url}")
            try:
                page.goto(wgi_url)
                page.wait_for_timeout(4000)
                soup = BeautifulSoup(page.content(), 'html.parser')

                for table in soup.find_all('table'):
                    raw_class = "Unknown Class"
                    for row in table.find_all('tr'):
                        th_cells = row.find_all('th')
                        if th_cells:
                            if len(th_cells) == 1:
                                raw_class = th_cells[0].get_text(strip=True)
                            elif row.find(['th', 'td'], class_='division-name'):
                                raw_class = row.find(['th', 'td'], class_='division-name').get_text(strip=True)
                            continue

                        cols = row.find_all('td')
                        if len(cols) >= 3:
                            team_name = cols[1].get_text(strip=True)
                            score_text = cols[2].get_text(strip=True).upper().replace("VIEW RECAP", "").strip()
                            try:
                                score = float(score_text)
                            except ValueError:
                                continue
                            if not team_name: continue

                            base_class = clean_class_name(raw_class)

                            # If guard isn't on roster yet, add them
                            if team_name not in combined_data:
                                combined_data[team_name] = {
                                    "Guard": team_name, "Class": base_class,
                                    "Prelims Time": "Finished", "Prelims Score": 0.0,
                                    "Finals Time": "", "Finals Score": 0.0
                                }

                            # Inject score
                            if "Final" in raw_class or "Finals" in raw_class:
                                combined_data[team_name]["Finals Score"] = score
                                combined_data[team_name]["Finals Time"] = "✅"
                            else:
                                combined_data[team_name]["Prelims Score"] = score
                                combined_data[team_name]["Prelims Time"] = "✅"

            except Exception as e:
                print(f"⚠️ [WORKER] WGI Scrape Error: {e}")
        else:
            print("ℹ️ No ShowID yet — roster saved, awaiting scores.")

        browser.close()

    final_list = list(combined_data.values())
    if final_list:
        live_collection.update_one(
            {"type": "current_session"},
            {"$set": {
                "show_name": show_name,
                "show_id": show_id,
                "prelims_url": prelims_url,
                "finals_url": finals_url,
                "data": final_list,
                "spots": class_spots,
                "status": "live" if show_id else "roster_only"
            }},
            upsert=True
        )
        print(f"✅ [WORKER] Updated Live Show with {len(final_list)} guards.")
    else:
        print("❌ [WORKER] Live scrape finished, but no data was found.")


# =====================================================================
# --- ARCHIVE ---
# =====================================================================

def scrape_archive(show_id, event_name):
    print(f"📦 [WORKER] Pulling Archive Scores for {event_name} (ShowID: {show_id})...")
    archive_data = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=USER_AGENT)
        page = context.new_page()

        wgi_url = f"https://www.wgi.org/scores/color-guard-score-event/?ShowId={show_id}"
        try:
            page.goto(wgi_url)
            page.wait_for_timeout(5000)
            soup = BeautifulSoup(page.content(), 'html.parser')
            current_class = "Unknown Class"

            for table in soup.find_all('table'):
                for row in table.find_all('tr'):
                    th_cells = row.find_all('th')
                    if th_cells:
                        if len(th_cells) == 1:
                            current_class = th_cells[0].get_text(strip=True)
                        elif row.find(['th', 'td'], class_='division-name'):
                            current_class = row.find(['th', 'td'], class_='division-name').get_text(strip=True)
                        continue

                    cols = row.find_all('td')
                    if len(cols) >= 3:
                        team = cols[1].get_text(strip=True)
                        score_text = cols[2].get_text(strip=True).upper().replace("VIEW RECAP", "").strip()
                        try:
                            score = float(score_text)
                        except ValueError:
                            continue
                        if team:
                            archive_data.append({
                                "Guard": team,
                                "Class": clean_class_name(current_class),
                                "Final Score": score
                            })
        except Exception as e:
            print(f"⚠️ [WORKER] Archive Scrape Error: {e}")

        browser.close()

    if archive_data:
        archive_data = sorted(archive_data, key=lambda x: (x["Class"], -x["Final Score"]))
        db["archive_state"].update_one(
            {"type": "current_archive"},
            {"$set": {"event_name": event_name, "show_id": show_id, "data": archive_data, "status": "complete"}},
            upsert=True
        )
        print(f"✅ [WORKER] Successfully archived {len(archive_data)} scores for {event_name}.")
    else:
        db["archive_state"].update_one(
            {"type": "current_archive"},
            {"$set": {"status": "empty", "event_name": event_name}},
            upsert=True
        )
        print("❌ [WORKER] Archive finished, but no scores were found.")


# =====================================================================
# --- PROJECTION ---
# =====================================================================

def scrape_projection(show_name, prelims_url, finals_url):
    print(f"🔮 [WORKER] Building Projection for: {show_name}...")
    combined_data = {}
    class_spots = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=USER_AGENT)
        page = context.new_page()

        # --- PASS 1: Roster from prelims (PDF or HTML) ---
        if prelims_url:
            if prelims_url.lower().endswith('.pdf'):
                parse_pdf_schedule(prelims_url, combined_data)
            else:
                parse_html_schedule(prelims_url, combined_data, page)

        if not combined_data:
            db["projection_state"].update_one(
                {"type": "current_projection"},
                {"$set": {"status": "failed", "error": "No guards found. Is the schedule posted yet?"}},
                upsert=True
            )
            browser.close()
            return

        print(f"✅ Found {len(combined_data)} guards in roster.")

        # --- PASS 2: Finals spot counts (PDF or HTML) ---
        if finals_url:
            if finals_url.lower().endswith('.pdf'):
                count_pdf_finals_spots(finals_url, class_spots)
            else:
                count_html_finals_spots(finals_url, class_spots, page)
            print(f"✅ Finals spots: {class_spots}")

        browser.close()

    # --- PASS 3: Replace live scores with season averages ---
    for guard_name, guard_data in combined_data.items():
        base_class = guard_data["Class"].split(" - ")[0].strip()
        scores = list(db["wgi_analytics"].find(
            {"Guard": guard_name, "Class": base_class},
            {"_id": 0, "Score": 1}
        ))
        if scores:
            combined_data[guard_name]["Prelims Score"] = round(
                sum(s["Score"] for s in scores) / len(scores), 3
            )
            combined_data[guard_name]["Shows Attended"] = len(scores)

    final_list = list(combined_data.values())
    if final_list:
        db["projection_state"].update_one(
            {"type": "current_projection"},
            {"$set": {
                "show_name": show_name,
                "data": final_list,
                "spots": class_spots,
                "status": "complete"
            }},
            upsert=True
        )
        print(f"🎉 [WORKER] Projection complete! {len(final_list)} guards saved.")
    else:
        db["projection_state"].update_one(
            {"type": "current_projection"},
            {"$set": {"status": "failed", "error": "No projection data generated."}},
            upsert=True
        )


# =====================================================================
# --- THE WORKER BRAIN (Command Listener) ---
# =====================================================================

if __name__ == "__main__":
    print("⚙️ Worker Node Online. Listening for commands...")

    db["system_state"].delete_many({"type": "scraper_command"})

    last_live_sync = 0

    while True:
        command = db["system_state"].find_one({"type": "scraper_command"})

        if command:
            action = command.get("action")
            print(f"\n📥 Received command: {action}")

            try:
                if action == "sync_national":
                    scrape_national_scores()

                elif action == "sync_live":
                    show_name = command.get("show_name")
                    prelims_url = command.get("prelims_url")
                    finals_url = command.get("finals_url")
                    show_id = command.get("show_id")

                    # Always build roster first
                    scrape_live_show(show_name, prelims_url, finals_url, show_id=show_id)
                    last_live_sync = time.time()

                    # If no ShowID yet, start background polling thread
                    if not show_id:
                        t = threading.Thread(target=poll_for_show_id, args=(show_name,), daemon=True)
                        t.start()
                        print(f"🔄 Background polling started for ShowID: {show_name}")

                elif action == "sync_archive":
                    scrape_archive(
                        command.get("show_id"),
                        command.get("event_name")
                    )

                elif action == "sync_projection":
                    scrape_projection(
                        command.get("show_name"),
                        command.get("prelims_url"),
                        command.get("finals_url")
                    )

                elif action == "sync_standings":
                    scrape_group_standings()

            except Exception as e:
                print(f"❌ [WORKER] Fatal error executing command '{action}': {e}")

            db["system_state"].delete_one({"_id": command["_id"]})
            print("⏳ Task complete. Listening for next command...")

        # Auto-resync live scores every 3 minutes if a show is active AND ShowID is known
        else:
            active_show = db["system_state"].find_one({"type": "active_show_name"})
            if active_show and (time.time() - last_live_sync > 180):
                show_id = active_show.get("show_id")
                if show_id:
                    print("⏰ Auto-resyncing live scores...")
                    try:
                        scrape_live_show(
                            active_show.get("name"),
                            active_show.get("p_url"),
                            active_show.get("f_url"),
                            show_id=show_id
                        )
                        last_live_sync = time.time()
                    except Exception as e:
                        print(f"❌ [WORKER] Auto-sync error: {e}")

        time.sleep(2)