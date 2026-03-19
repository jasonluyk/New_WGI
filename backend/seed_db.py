import os
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import pymongo
import re
from datetime import datetime


def clean_class_name(raw_class):
    clean = re.sub(r'(?i)\s*-\s*(Prelims|Finals|Round.*|Semi.*)', '', raw_class)
    clean = re.sub(r'(?i)\s*\((Prelims|Finals|Round.*|Semi.*)\)', '', clean)
    return clean.strip()


def parse_show_date(date_str):
    """Try to parse WGI date strings like 'Feb 22, 2025' or 'February 22-23, 2025'."""
    if not date_str:
        return None
    # Strip day ranges like "22-23" -> "22"
    date_str = re.sub(r'(\d+)-\d+', r'\1', date_str).strip()
    for fmt in ('%B %d, %Y', '%b %d, %Y', '%m/%d/%Y'):
        try:
            return datetime.strptime(date_str, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def scrape_all_wgi_to_mongo():
    records = []

    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
        )
        page = context.new_page()

        # --- PART 1: GET ALL EVENT URLs + DATES FROM SCORES PAGE ---
        print("Fetching master list of WGI events...")
        page.goto("https://www.wgi.org/scores/color-guard-scores/", timeout=60000, wait_until="domcontentloaded")

        try:
            page.wait_for_selector("a[href*='ShowId']", timeout=20000)
        except Exception:
            print("Timeout waiting for ShowId links.")

        soup = BeautifulSoup(page.content(), 'html.parser')
        live_shows = {}  # url -> {name, date}

        for link in soup.find_all('a', href=True):
            href = link['href']
            if 'ShowId=' not in href:
                continue

            # Get show name
            show_name = link.get_text(strip=True)
            if not show_name or "View" in show_name or "Score" in show_name:
                row = link.find_parent('tr')
                if row:
                    cols = row.find_all('td')
                    if cols:
                        show_name = cols[0].get_text(strip=True)

            if not show_name:
                show_name = "Unknown Regional"

            # Try to get date from the same table row
            event_date = None
            row = link.find_parent('tr')
            if row:
                cols = row.find_all('td')
                for col in cols:
                    text = col.get_text(strip=True)
                    # Look for date patterns like "Feb 22, 2025" or "February 22-23, 2025"
                    date_match = re.search(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}[-–]?\d*,?\s*\d{4}', text, re.IGNORECASE)
                    if date_match:
                        event_date = parse_show_date(date_match.group())
                        break

            full_url = href if href.startswith('http') else f"https://www.wgi.org{href}"
            live_shows[full_url] = {"name": show_name, "date": event_date}

        print(f"Found {len(live_shows)} unique regional events.")

        # --- PART 2: SCRAPE EACH EVENT — KEEP PRELIMS AND FINALS SEPARATE ---
        for idx, (url, meta) in enumerate(live_shows.items()):
            show_name = meta["name"]
            event_date = meta["date"]
            print(f"Scraping {idx + 1}/{len(live_shows)}: {show_name} ({event_date or 'no date'})...")

            try:
                page.goto(url)
                page.wait_for_selector("table", timeout=15000)
                page.wait_for_timeout(4000)

                event_soup = BeautifulSoup(page.content(), 'html.parser')

                for table in event_soup.find_all('table'):
                    current_class = "Unknown Class"
                    current_round = None  # "Prelims" or "Finals"

                    for row in table.find_all('tr'):
                        # Check for division/round header
                        div_header = row.find('th', class_='division-name')
                        if div_header:
                            raw = div_header.get_text(strip=True)
                            # Detect if this header specifies prelims or finals
                            if re.search(r'final', raw, re.IGNORECASE):
                                current_round = "Finals"
                            elif re.search(r'prelim', raw, re.IGNORECASE):
                                current_round = "Prelims"
                            else:
                                current_round = None
                            current_class = clean_class_name(raw)
                            continue

                        cells = row.find_all('td')
                        if len(cells) >= 3:
                            try:
                                team_name = cells[1].get_text(strip=True)
                                score_clean = cells[2].get_text(strip=True).upper().replace("VIEW RECAP", "").strip()
                                score = float(score_clean)
                                if not team_name:
                                    continue

                                # Build show name with round suffix
                                # e.g. "Charlotte CG Prelims" or "Charlotte CG Finals"
                                if current_round:
                                    full_show_name = f"{show_name} {current_round}"
                                else:
                                    # Fall back: detect from URL or leave as-is
                                    full_show_name = show_name

                                records.append({
                                    "Show": full_show_name,
                                    "Class": current_class,
                                    "Guard": team_name,
                                    "Score": score,
                                    "Date": event_date,
                                    "Round": current_round or "Unknown"
                                })
                            except (ValueError, IndexError):
                                continue
            except Exception as e:
                print(f"  Error at {show_name}: {e}")

        browser.close()

    # --- PART 3: SAVE TO MONGODB ---
    if records:
        mongo_url = os.environ.get("MONGO_URI")
        client = pymongo.MongoClient(mongo_url)
        db = client["rankings_2026"]
        collection = db["wgi_analytics"]
        collection.drop()
        collection.insert_many(records)
        print(f"\n✅ Success! {len(records)} individual performances saved to MongoDB.")
    else:
        print("❌ No data found.")


if __name__ == "__main__":
    scrape_all_wgi_to_mongo()