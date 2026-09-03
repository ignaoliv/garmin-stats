#!/usr/bin/env python3
from __future__ import annotations
"""
Garmin Connect → local JSON sync script.

Usage:
    python sync.py                  # sync all activities
    python sync.py --limit 20       # only fetch 20 (for testing)
    python sync.py --since 2024-01-01  # only activities after this date

Credentials are read from ../.env (GARMIN_EMAIL, GARMIN_PASSWORD).
Auth tokens are cached in ~/.garth/ so login only happens once.

Output: ../public/data/activities.json + ../public/data/activity_{id}.json
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (parent of fetch/)
load_dotenv(Path(__file__).parent.parent / ".env")


def get_api():
    """Authenticate and return a Garmin Connect API client."""
    try:
        import garminconnect
    except ImportError:
        print("ERROR: garminconnect not installed. Run: pip install -r requirements.txt")
        sys.exit(1)

    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")

    if not email or not password:
        print("ERROR: Set GARMIN_EMAIL and GARMIN_PASSWORD in .env (copy from .env.example)")
        sys.exit(1)

    api = garminconnect.Garmin(email, password)
    try:
        api.login()
    except garminconnect.GarminConnectAuthenticationError as e:
        print(f"Authentication failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Login error: {e}")
        sys.exit(1)

    print(f"Logged in as {email}")
    return api


def fetch_activities(api, limit: int | None, since: str | None) -> list:
    """Download the activity list from Garmin Connect."""
    print("Fetching activity list...")

    if limit:
        raw = api.get_activities(0, limit)
    else:
        # Paginate through all activities in chunks of 100
        raw = []
        start = 0
        chunk = 100
        while True:
            batch = api.get_activities(start, chunk)
            if not batch:
                break
            raw.extend(batch)
            print(f"  Fetched {len(raw)} activities so far...")
            if len(batch) < chunk:
                break
            start += chunk
            time.sleep(0.3)

    # Filter by date if requested
    if since:
        raw = [a for a in raw if (a.get("startTimeLocal") or "") >= since]

    print(f"Total activities: {len(raw)}")
    return raw


def _try(fn, *args, label="", **kwargs):
    """Call fn(*args, **kwargs) with retries, return {} / [] / None on failure."""
    for attempt in range(3):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                if label:
                    print(f"  WARNING: {label}: {e}")
    return None


def fetch_activity_details(api, activity_id: int) -> dict:
    """Download core details for a single activity (garminconnect 0.2.x API)."""
    result = _try(api.get_activity_details, activity_id, label=f"details {activity_id}")
    return result or {}


def fetch_activity_hr_zones(api, activity_id: int) -> list:
    """Fetch HR zone breakdown (seconds per zone) for a single activity."""
    result = _try(api.get_activity_hr_in_timezones, activity_id, label=f"hr_zones {activity_id}")
    return result or []


def fetch_activity_splits(api, activity_id: int) -> dict:
    """Fetch lap/split data for a single activity."""
    result = _try(api.get_activity_splits, activity_id, label=f"splits {activity_id}")
    return result or {}


def fetch_activity_exercise_sets(api, activity_id: int) -> dict:
    """Sets, reps and load for gym sessions. Only Garmin's strength types carry it."""
    result = _try(api.get_activity_exercise_sets, activity_id, label=f"sets {activity_id}")
    return result or {}


def fetch_gpx_coords(api, activity_id: int) -> list:
    """Return [[lat, lon], ...] from GPX download, or [] on failure."""
    import re
    import garminconnect
    try:
        gpx_data = api.download_activity(
            activity_id,
            dl_fmt=garminconnect.Garmin.ActivityDownloadFormat.GPX,
        )
        if not gpx_data:
            return []
        text = gpx_data.decode("utf-8", errors="ignore")
        coords = re.findall(r'<trkpt lat="([\d.\-]+)" lon="([\d.\-]+)"', text)
        if len(coords) > 500:
            step = len(coords) // 500
            coords = coords[::step]
        return [[float(lat), float(lon)] for lat, lon in coords]
    except Exception:
        return []


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser(description="Sync Garmin activities to local JSON")
    parser.add_argument("--limit", type=int, default=None, help="Max activities to sync (for testing)")
    parser.add_argument("--since", type=str, default=None, help="Only sync activities after this date (YYYY-MM-DD)")
    parser.add_argument("--no-gpx", action="store_true", help="Skip GPS data download (faster)")
    parser.add_argument("--refresh-sport", type=str, default=None,
                        help="Re-download details for one sport even if cached (e.g. --refresh-sport strength)")
    parser.add_argument("--refresh-all", action="store_true",
                        help="Re-download every activity detail, ignoring the cache")
    args = parser.parse_args()

    from normalizer import normalize_summary, normalize_detail

    output_dir = Path(__file__).parent.parent / "public" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    api = get_api()

    # Step 1: Get activity list
    raw_activities = fetch_activities(api, args.limit, args.since)

    # Step 2: Normalize summaries
    summaries = []
    for raw in raw_activities:
        try:
            s = normalize_summary(raw)
            if s.get("id"):
                summaries.append(s)
        except Exception as e:
            print(f"  WARNING: Failed to normalize activity {raw.get('activityId')}: {e}")

    # Save summary list immediately so the app can start loading
    save_json(output_dir / "activities.json", summaries)
    print(f"Saved {len(summaries)} activity summaries → public/data/activities.json")

    # Step 3: Fetch and save details for each activity
    print(f"\nFetching details for {len(summaries)} activities (rate-limited)...")
    for i, summary in enumerate(summaries):
        activity_id = summary["id"]
        detail_path = output_dir / f"activity_{activity_id}.json"

        if detail_path.exists() and not args.refresh_all and args.refresh_sport != summary.get("sport"):
            print(f"  [{i+1}/{len(summaries)}] {activity_id} — already cached, skipping")
            continue

        print(f"  [{i+1}/{len(summaries)}] Fetching {activity_id} ({summary.get('title', '')})...")

        details = fetch_activity_details(api, activity_id)
        hr_zones = fetch_activity_hr_zones(api, activity_id)
        splits = fetch_activity_splits(api, activity_id)
        gpx_coords = [] if args.no_gpx else fetch_gpx_coords(api, activity_id)
        # Only strength sessions have exercise sets; asking for the rest is a
        # wasted round trip against a rate-limited API.
        exercise_sets = (
            fetch_activity_exercise_sets(api, activity_id)
            if summary.get("sport") == "strength"
            else {}
        )

        try:
            full = normalize_detail(summary, details, hr_zones, splits, gpx_coords, exercise_sets)
            save_json(detail_path, full)
        except Exception as e:
            print(f"  WARNING: Failed to process detail for {activity_id}: {e}")

        # Rate limiting — critical to avoid Garmin banning the account
        time.sleep(0.5)

    # Step 4: Archive the training calendar.
    # Garmin deletes one-off workouts once they are executed, so a plan that is
    # not captured before the session is gone for good. Piggy-backing on the
    # sync means the archive stays current without remembering a second command.
    try:
        from plan import archive_plan
        archive_plan(api, months_back=2)
    except Exception as e:
        print(f"  aviso: no se pudo archivar el plan ({str(e)[:90]})")

    # Daily step counts live on the wellness endpoint, not on activities, and
    # exist for days with no workout at all — so they ride along with the sync.
    try:
        from steps import archive_steps
        archive_steps(api, days=120)
    except Exception as e:
        print(f"  aviso: no se pudieron bajar los pasos ({str(e)[:90]})")

    try:
        from sleep import archive_sleep
        archive_sleep(api, days=21)
    except Exception as e:
        print(f"  aviso: no se pudo bajar el sueño ({str(e)[:90]})")

    try:
        from wellness import archive_wellness
        archive_wellness(api, days=30)
    except Exception as e:
        print(f"  aviso: no se pudo bajar la recuperación ({str(e)[:90]})")

    # El calendario de carreras no viene de Garmin, pero se refresca acá para
    # que el botón de sincronizar deje todo al día de una sola pasada.
    try:
        import subprocess
        subprocess.run(["python3", str(Path(__file__).parent / "eventos.py")],
                       check=False, capture_output=True, timeout=180)
        print("  ✔ calendario de carreras actualizado")
    except Exception as e:
        print(f"  aviso: no se pudo actualizar el calendario de carreras ({str(e)[:80]})")

    # Real HR zones and stream-derived TSS, folded back into the summaries.
    try:
        import subprocess
        subprocess.run(["python3", str(Path(__file__).parent / "enrich.py")], check=False)
    except Exception as e:
        print(f"  aviso: no se pudo enriquecer activities.json ({str(e)[:80]})")

    # Step 5: Compute and save global stats
    stats = compute_stats(summaries)
    save_json(output_dir / "stats.json", stats)
    print(f"\nDone! Saved stats → public/data/stats.json")
    print("Run 'npm run dev' to open the app.")


def compute_stats(summaries: list) -> dict:
    """Compute global stats that don't change per-activity."""
    by_sport = {}
    for s in summaries:
        sport = s.get("sport", "other")
        by_sport.setdefault(sport, []).append(s)

    vo2max_history = [
        {"date": s["startTime"][:10], "value": s["vo2max"]}
        for s in summaries
        if s.get("vo2max")
    ]
    vo2max_history.sort(key=lambda x: x["date"])

    return {
        "totalActivities": len(summaries),
        "byType": {sport: len(acts) for sport, acts in by_sport.items()},
        "vo2maxHistory": vo2max_history,
        "syncedAt": __import__("datetime").datetime.now().isoformat(),
    }


if __name__ == "__main__":
    main()
