from __future__ import annotations
"""
Converts raw Garmin Connect API responses into the normalized JSON shape
that the React frontend expects. See src/types/garmin.ts for the TypeScript
types that mirror these structures.
"""

SPORT_MAP = {
    # endurance
    "running": "running",
    "trail_running": "running",
    "treadmill_running": "running",
    "track_running": "running",
    "indoor_running": "running",
    "virtual_run": "running",
    "cycling": "cycling",
    "road_biking": "cycling",
    "road_cycling": "cycling",
    "indoor_cycling": "cycling",
    "virtual_ride": "cycling",
    "mountain_biking": "cycling",
    "gravel_cycling": "cycling",
    "cyclocross": "cycling",
    "track_cycling": "cycling",
    "commuting": "cycling",
    "swimming": "swimming",
    "open_water_swimming": "swimming",
    "lap_swimming": "swimming",
    "pool_swimming": "swimming",
    # gym work — previously collapsed into "other", which hid it from the app
    "strength_training": "strength",
    "indoor_strength": "strength",
    "pilates": "strength",
    "yoga": "strength",
    "breathwork": "strength",
    "indoor_cardio": "cardio",
    "cardio_training": "cardio",
    "hiit": "cardio",
    "elliptical": "cardio",
    "indoor_rowing": "cardio",
    "rowing_v2": "cardio",
    "stair_climbing": "cardio",
    "walking": "walking",
    "casual_walking": "walking",
    "speed_walking": "walking",
    "hiking": "walking",
}


def _sport(activity: dict) -> str:
    return SPORT_MAP.get(_raw_sport(activity), "other")


def _raw_sport(activity: dict) -> str:
    """Garmin's own activityType key, kept verbatim so the frontend can regroup
    without a re-sync when the taxonomy changes."""
    return (activity.get("activityType") or {}).get("typeKey", "other").lower()


def _safe(d: dict, *keys, default=None):
    for k in keys:
        if d is None:
            return default
        d = d.get(k)
    return d if d is not None else default


def normalize_summary(activity: dict) -> dict:
    """Produces the lightweight ActivitySummary used in the activities list."""
    sport = _sport(activity)

    # Pace in seconds per km (only meaningful for running/swimming)
    avg_speed = _safe(activity, "averageSpeed") or 0  # m/s
    avg_pace = round(1000 / avg_speed) if avg_speed > 0 else None

    summary = {
        "id": activity.get("activityId"),
        "title": activity.get("activityName", "Untitled"),
        "sport": sport,
        "rawSport": _raw_sport(activity),
        "workoutId": activity.get("workoutId"),  # set when the activity ran a planned workout
        "startTime": activity.get("startTimeLocal") or activity.get("startTimeGMT"),
        "distance": round((_safe(activity, "distance") or 0) / 1000, 2),  # km
        "duration": round(_safe(activity, "duration") or 0),  # seconds
        "movingTime": round(_safe(activity, "movingDuration") or _safe(activity, "duration") or 0),
        "elevationGain": round(_safe(activity, "elevationGain") or 0),
        "avgHR": round(_safe(activity, "averageHR") or 0),
        "maxHR": round(_safe(activity, "maxHR") or 0),
        "calories": round(_safe(activity, "calories") or 0),
        "tss": _safe(activity, "trainingStressScore"),
        "avgPace": avg_pace,  # sec/km, running/swim only
        "avgSpeed": round(avg_speed * 3.6, 1) if avg_speed else None,  # km/h, cycling
        "avgPower": round(_safe(activity, "avgPower") or 0) or None,
        "normalizedPower": round(_safe(activity, "normPower") or 0) or None,
        "avgCadence": round(_safe(activity, "averageRunningCadenceInStepsPerMinute") or
                           _safe(activity, "averageBikingCadenceInRevPerMinute") or 0) or None,
        "vo2max": _safe(activity, "vO2MaxValue"),
        "aerobicTE": _safe(activity, "aerobicTrainingEffect"),
        "anaerobicTE": _safe(activity, "anaerobicTrainingEffect"),
    }

    # Swimming-specific
    if sport == "swimming":
        summary["swolf"] = _safe(activity, "averageSwolf")
        summary["avgStrokesPerLength"] = _safe(activity, "averageStrokeDistance")

    return summary


def normalize_detail(summary: dict, details: dict, hr_zones_raw: list, splits_raw: dict, gpx_coords: list, exercise_sets_raw: dict | None = None) -> dict:
    """Merges summary + activity details + HR zones + splits + GPS into the full ActivityDetail."""
    detail = dict(summary)

    # Laps from splits endpoint (garminconnect 0.2.x)
    # get_activity_splits returns {"lapDTOs": [...]} or {"splits": [...]}
    laps_data = (
        splits_raw.get("lapDTOs")
        or splits_raw.get("splits")
        or _safe(details, "activityDetailMetrics")
        or []
    )
    detail["laps"] = _normalize_laps(laps_data, summary.get("sport"))

    if exercise_sets_raw:
        detail["strength"] = normalize_exercise_sets(exercise_sets_raw)

    # HR zones from get_activity_hr_in_timezones (returns a list directly)
    # or fall back to whatever details has
    hr_zones = hr_zones_raw or _safe(details, "heartRateZones") or []
    detail["hrZones"] = _normalize_hr_zones(hr_zones)

    detail["gpxCoords"] = gpx_coords or []
    detail["streams"] = normalize_streams(details)

    # Extra metrics from the details summaryDTO if present
    metrics = _safe(details, "summaryDTO") or {}
    if metrics:
        detail["avgStrideLength"] = _safe(metrics, "avgStrideLength")
        detail["trainingEffect"] = _safe(metrics, "trainingEffect")

    return detail


def _normalize_laps(laps_data: list, sport: str) -> list:
    """Handles both lapDTOs format and legacy activityDetailMetrics format."""
    laps = []
    for i, lap in enumerate(laps_data):
        if not isinstance(lap, dict):
            continue
        # lapDTOs format
        if "lapIndex" in lap or "distance" in lap:
            speed = lap.get("averageSpeed") or 0
            avg_pace = round(1000 / speed) if speed > 0 else None
            laps.append({
                "index": lap.get("lapIndex", i + 1),
                "distance": round((lap.get("distance") or 0) / 1000, 3),
                "duration": round(lap.get("duration") or lap.get("elapsedDuration") or 0),
                "avgHR": round(lap.get("averageHR") or 0) or None,
                "avgPace": avg_pace,
                "avgSpeed": round(speed * 3.6, 1) if speed else None,
                "avgPower": round(lap.get("avgPower") or 0) or None,
                "elevationGain": round(lap.get("elevationGain") or 0),
            })
        else:
            # Legacy activityDetailMetrics format
            metrics = lap.get("metrics", {})
            speed = metrics.get("averageSpeed") or 0
            avg_pace = round(1000 / speed) if speed > 0 else None
            laps.append({
                "index": i + 1,
                "distance": round((metrics.get("distance") or 0) / 1000, 3),
                "duration": round(metrics.get("duration") or 0),
                "avgHR": round(metrics.get("averageHR") or 0) or None,
                "avgPace": avg_pace,
                "avgSpeed": round(speed * 3.6, 1) if speed else None,
                "avgPower": round(metrics.get("avgPower") or 0) or None,
                "elevationGain": round(metrics.get("elevationGain") or 0),
            })
    return laps


def _normalize_hr_zones(hr_zones: list) -> list:
    """Handles both get_activity_hr_in_timezones and heartRateZones formats."""
    if not hr_zones:
        return []
    result = []
    for zone in hr_zones:
        if not isinstance(zone, dict):
            continue
        # get_activity_hr_in_timezones returns: {zoneNumber, zoneName, secsInZone, ...}
        zone_num = zone.get("zoneNumber") or zone.get("zone")
        seconds = zone.get("secsInZone") or zone.get("seconds") or 0
        result.append({
            "zone": zone_num,
            "name": zone.get("zoneName") or zone.get("name") or f"Zona {zone_num}",
            "seconds": round(seconds),
            "lowBPM": zone.get("zoneLowBoundary") or zone.get("lowBPM"),
            "highBPM": zone.get("zoneHighBoundary") or zone.get("highBPM"),
        })
    return result


# ─── Strength: exercise sets ──────────────────────────────────────────────────

def normalize_exercise_sets(raw: dict) -> dict:
    """
    Turns Garmin's exercise-set payload into per-exercise totals.

    Garmin reports weight in grams and only for sets the watch actually
    captured, so sets without a load still count toward reps and volume time.
    """
    sets = (raw or {}).get("exerciseSets") or []
    exercises: dict[str, dict] = {}
    total_reps = 0
    total_volume_kg = 0.0
    working_sets = 0

    for s in sets:
        if (s.get("setType") or "").upper() != "ACTIVE":
            continue
        info = (s.get("exercises") or [{}])[0]
        name = (info.get("name") or info.get("category") or "Desconocido").replace("_", " ").title()
        reps = s.get("repetitionCount") or 0
        weight_kg = round((s.get("weight") or 0) / 1000, 2)

        e = exercises.setdefault(name, {"name": name, "sets": 0, "reps": 0, "volumeKg": 0.0, "maxWeightKg": 0.0})
        e["sets"] += 1
        e["reps"] += reps
        e["volumeKg"] = round(e["volumeKg"] + reps * weight_kg, 1)
        e["maxWeightKg"] = max(e["maxWeightKg"], weight_kg)

        working_sets += 1
        total_reps += reps
        total_volume_kg += reps * weight_kg

    return {
        "exercises": sorted(exercises.values(), key=lambda x: -x["volumeKg"]),
        "totalSets": working_sets,
        "totalReps": total_reps,
        "totalVolumeKg": round(total_volume_kg, 1),
    }


# ─── Time series (streams) ────────────────────────────────────────────────────

# Garmin returns a descriptor list plus a parallel array of metric rows. These
# are the channels worth keeping; anything else is dropped to keep files small.
STREAM_KEYS = {
    "directHeartRate": "hr",
    "directSpeed": "speed",              # m/s
    "directPower": "power",              # watts
    "directBikeCadence": "cadence",
    "directRunCadence": "cadence",
    "directDoubleCadence": "cadence",
    "directElevation": "elevation",      # m
    "sumDistance": "distance",           # m
    "sumDuration": "seconds",
    "sumElapsedDuration": "seconds",
}

MAX_STREAM_POINTS = 300


def normalize_streams(details: dict) -> list:
    """
    Flattens Garmin's activityDetailMetrics into [{seconds, distance, hr, ...}].

    Downsampled by averaging into at most MAX_STREAM_POINTS buckets: a three-hour
    ride is ~11k samples, which would bloat every detail file for a chart that
    cannot resolve more than a few hundred pixels anyway.
    """
    descriptors = details.get("metricDescriptors") or []
    rows = details.get("activityDetailMetrics") or []
    if not descriptors or not rows:
        return []

    index = {}
    for d in descriptors:
        field = STREAM_KEYS.get(d.get("key"))
        if field and field not in index:
            index[field] = d.get("metricsIndex")

    if "seconds" not in index and "distance" not in index:
        return []

    points = []
    for row in rows:
        metrics = row.get("metrics") or []
        point = {}
        for field, i in index.items():
            if i is None or i >= len(metrics):
                continue
            v = metrics[i]
            if v is None:
                continue
            point[field] = v
        if point:
            points.append(point)

    if not points:
        return []

    # Bucket-average down to a chartable number of points.
    step = max(1, len(points) // MAX_STREAM_POINTS)
    out = []
    for i in range(0, len(points), step):
        chunk = points[i:i + step]
        agg = {}
        for field in index:
            vals = [c[field] for c in chunk if field in c]
            if not vals:
                continue
            if field in ("seconds", "distance"):
                agg[field] = vals[-1]          # cumulative channels: take the edge
            else:
                agg[field] = sum(vals) / len(vals)
        if not agg:
            continue
        out.append({
            "seconds": round(agg.get("seconds", 0)),
            "km": round(agg.get("distance", 0) / 1000, 3),
            "hr": round(agg["hr"]) if "hr" in agg else None,
            "speed": round(agg["speed"] * 3.6, 1) if "speed" in agg else None,
            "power": round(agg["power"]) if "power" in agg else None,
            "cadence": round(agg["cadence"]) if "cadence" in agg else None,
            "elevation": round(agg["elevation"]) if "elevation" in agg else None,
        })
    return out
