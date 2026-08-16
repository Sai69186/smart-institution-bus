"""
generate_large_dataset.py
=========================
Generates a realistic 50 000+ row dataset for the Smart Institution Bus
Boarding-Time Prediction system.

Design goals
------------
* Matches EXACTLY the column schema expected by train_models.py
* Covers 3 real Andhra Pradesh institutions (Vijayawada / Vizag / Guntur)
* 9 buses total (4 + 3 + 2), variable stops per bus (3–6)
* Boarding time is derived from a physics-based formula:
      time = (distance / speed) * 60  + weather_delay
             + academic_load + day_load + traffic_load
             + passenger_slowdown + peak_hour_penalty
             + road_type_factor + Gaussian noise
* Noise is calibrated so models achieve MAE < 2 min (realistic for a campus bus)
* Includes all optional features: traffic_level, peak_hour, road_type, delay_min

Run:
    cd "d:/Major Project/smart institution bus"
    python python_services/data/generate_large_dataset.py
"""

import numpy as np
import pandas as pd
import math
import os
from datetime import date, timedelta

np.random.seed(2024)

# ══════════════════════════════════════════════════════════════════════════════
# 1.  INSTITUTION + STOP DEFINITIONS
# ══════════════════════════════════════════════════════════════════════════════

INSTITUTIONS = [
    {
        "id":   "INST001",
        "name": "Vignan University, Vijayawada",
        "campus_lat": 16.5449, "campus_lng": 80.6400,
        "buses": [
            {
                "bus": "VU-01",
                "stops": [
                    ("Benz Circle",        16.5062, 80.6480, "Main Road"),
                    ("Governorpet",        16.5093, 80.6355, "Main Road"),
                    ("Patamata",           16.5200, 80.6290, "Main Road"),
                ]
            },
            {
                "bus": "VU-02",
                "stops": [
                    ("Eluru Road",         16.5150, 80.6240, "Highway"),
                    ("Kanuru",             16.5280, 80.6310, "Main Road"),
                    ("Ramavarappadu",      16.5390, 80.6360, "Main Road"),
                    ("Auto Nagar",         16.5330, 80.6420, "Village Road"),
                ]
            },
            {
                "bus": "VU-03",
                "stops": [
                    ("Nunna",              16.4910, 80.6780, "Village Road"),
                    ("Ajit Singh Nagar",   16.5050, 80.6620, "Main Road"),
                    ("Gunadala",           16.5170, 80.6510, "Main Road"),
                ]
            },
            {
                "bus": "VU-04",
                "stops": [
                    ("Gannavaram Airport", 16.5330, 80.7980, "Highway"),
                    ("Krishna Lanka",      16.5140, 80.7450, "Main Road"),
                    ("Bhavani Nagar",      16.5260, 80.7100, "Main Road"),
                    ("Seethammadhara",     16.5350, 80.6780, "Main Road"),
                    ("Kanuru Junction",    16.5420, 80.6510, "Main Road"),
                ]
            },
        ]
    },
    {
        "id":   "INST002",
        "name": "GITAM University, Visakhapatnam",
        "campus_lat": 17.7350, "campus_lng": 83.3300,
        "buses": [
            {
                "bus": "GU-01",
                "stops": [
                    ("Dwaraka Nagar",      17.7230, 83.3140, "Main Road"),
                    ("Ram Nagar",          17.7180, 83.3020, "Main Road"),
                    ("Siripuram",          17.7110, 83.2960, "Main Road"),
                    ("Murali Nagar",       17.7050, 83.2880, "Village Road"),
                ]
            },
            {
                "bus": "GU-02",
                "stops": [
                    ("Gajuwaka",           17.6840, 83.2040, "Highway"),
                    ("NAD Junction",       17.6960, 83.2280, "Highway"),
                    ("Kommadi",            17.7150, 83.2650, "Main Road"),
                ]
            },
            {
                "bus": "GU-03",
                "stops": [
                    ("Bheemunipatnam",     17.8930, 83.4560, "Village Road"),
                    ("Rushikonda",         17.7820, 83.3780, "Main Road"),
                    ("Beach Road",         17.7640, 83.3520, "Main Road"),
                    ("Lawsons Bay Colony", 17.7480, 83.3380, "Main Road"),
                    ("MVP Colony",         17.7400, 83.3310, "Main Road"),
                ]
            },
        ]
    },
    {
        "id":   "INST003",
        "name": "Acharya Nagarjuna University, Guntur",
        "campus_lat": 16.3240, "campus_lng": 80.4350,
        "buses": [
            {
                "bus": "ANU-01",
                "stops": [
                    ("Brodipet",           16.3070, 80.4370, "Main Road"),
                    ("Arundelpet",         16.3010, 80.4420, "Main Road"),
                    ("Kothapet",           16.2950, 80.4500, "Village Road"),
                    ("Nallapadu",          16.3110, 80.4280, "Village Road"),
                ]
            },
            {
                "bus": "ANU-02",
                "stops": [
                    ("Amaravati Road",     16.3420, 80.4180, "Highway"),
                    ("Gorantla",           16.3310, 80.4220, "Main Road"),
                    ("Prathipadu",         16.3180, 80.4300, "Main Road"),
                ]
            },
        ]
    },
]

# ══════════════════════════════════════════════════════════════════════════════
# 2.  ENVIRONMENT LOOKUP TABLES
# ══════════════════════════════════════════════════════════════════════════════

def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(max(0, a)))


# Weather weights: 60% Sunny, 30% Rainy, 10% Foggy
WEATHER_CHOICES  = ["Sunny",  "Rainy",  "Foggy"]
WEATHER_WEIGHTS  = [0.60,      0.30,     0.10]
# Extra minutes delay per weather condition
WEATHER_DELAY    = {"Sunny": 0.0, "Rainy": 6.5, "Foggy": 9.0}

# Academic period weights
ACADEMIC_CHOICES = ["Regular Semester", "Exam Week",  "Holidays"]
ACADEMIC_WEIGHTS = [0.70,               0.20,          0.10]
ACADEMIC_FACTOR  = {"Regular Semester": 0.0, "Exam Week": 4.5, "Holidays": -3.5}

# Day of week weights — Mon–Sat, no Sunday bus service
DAY_CHOICES      = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
DAY_WEIGHTS      = [0.20,    0.18,    0.18,       0.18,      0.16,   0.10]
DAY_FACTOR       = {"Monday":2.5,"Tuesday":1.0,"Wednesday":1.0,
                    "Thursday":1.0,"Friday":-0.5,"Saturday":-2.5}

# Traffic level
TRAFFIC_CHOICES  = ["Low", "Medium", "High"]
TRAFFIC_WEIGHTS  = [0.25,   0.50,    0.25]
TRAFFIC_DELAY    = {"Low": -1.5, "Medium": 0.0, "High": 3.5}

# Road type speed modifier (km/h added to base speed)
ROAD_SPEED_DELTA = {"Highway": 12, "Main Road": 0, "Village Road": -8}

# Peak hour flag (07:00–09:30 = 1)
def is_peak_hour():
    return np.random.choice([1, 0], p=[0.65, 0.35])


# ══════════════════════════════════════════════════════════════════════════════
# 3.  PRE-COMPUTE STOP DISTANCES
# ══════════════════════════════════════════════════════════════════════════════

stop_meta = {}  # stop_name -> {dist_km, road_type, inst_id, bus_id}

for inst in INSTITUTIONS:
    clat, clng = inst["campus_lat"], inst["campus_lng"]
    for bus_def in inst["buses"]:
        for stop_name, slat, slng, road_type in bus_def["stops"]:
            dist = haversine_km(slat, slng, clat, clng)
            stop_meta[stop_name] = {
                "dist_km":   round(dist, 3),
                "road_type": road_type,
                "inst_id":   inst["id"],
                "bus_id":    bus_def["bus"],
                "lat":       slat,
                "lng":       slng,
            }

ALL_STOPS = list(stop_meta.keys())
print(f"Stops defined: {len(ALL_STOPS)} across {len(INSTITUTIONS)} institutions")


# ══════════════════════════════════════════════════════════════════════════════
# 4.  RECORD GENERATOR
# ══════════════════════════════════════════════════════════════════════════════

TARGET_ROWS = 54_000   # just over 50k to account for any drops during cleaning
ROWS_PER_STOP = math.ceil(TARGET_ROWS / len(ALL_STOPS))

# Date range: 2023-01-01 to 2024-12-31 (2 academic years)
START_DATE = date(2023, 1, 1)
END_DATE   = date(2024, 12, 31)
DATE_RANGE = [START_DATE + timedelta(days=i) for i in range((END_DATE - START_DATE).days + 1)]
# Filter to Mon–Sat only (no Sundays)
VALID_DATES = [d for d in DATE_RANGE if d.weekday() < 6]

records = []

for stop_name, meta in stop_meta.items():
    dist_km   = meta["dist_km"]
    road_type = meta["road_type"]

    for _ in range(ROWS_PER_STOP):
        # ── Sample context ─────────────────────────────────────────────────
        chosen_date = VALID_DATES[np.random.randint(len(VALID_DATES))]
        day_name    = chosen_date.strftime("%A")

        weather    = np.random.choice(WEATHER_CHOICES,  p=WEATHER_WEIGHTS)
        academic   = np.random.choice(ACADEMIC_CHOICES, p=ACADEMIC_WEIGHTS)
        traffic    = np.random.choice(TRAFFIC_CHOICES,  p=TRAFFIC_WEIGHTS)
        peak       = is_peak_hour()

        # Speed: base 32 km/h ± road modifier ± random noise
        base_speed = 32 + ROAD_SPEED_DELTA[road_type]
        speed_kmh  = max(10.0, np.random.normal(base_speed, 7.0))

        # Occupancy: 0–55 students, slightly higher during peak
        max_occ  = 55 if peak else 40
        occupancy = int(np.clip(np.random.normal(max_occ * 0.6, max_occ * 0.25), 0, max_occ))

        # ── Physics-based target: boarding time in minutes ──────────────────
        travel_time = (dist_km / speed_kmh) * 60.0   # pure travel

        # Additive delay components
        delay = 0.0
        delay += WEATHER_DELAY[weather]
        delay += ACADEMIC_FACTOR[academic]
        delay += DAY_FACTOR[day_name]
        delay += TRAFFIC_DELAY[traffic]
        delay += 0.06 * occupancy         # each extra passenger: ~3.6s loading time
        delay += 2.5 if peak else 0.0     # peak hour congestion
        # Road type already baked into speed; add micro-delay for village roads
        if road_type == "Village Road":
            delay += np.random.uniform(1.0, 3.0)

        # Total target + realistic Gaussian noise (std = 1.2 min)
        boarding_mins = travel_time + delay + np.random.normal(0, 1.2)
        boarding_mins = max(1.5, round(boarding_mins, 2))   # floor at 1.5 min
        boarding_mins = min(boarding_mins, 55.0)             # cap at 55 min (longest realistic route)

        # Explicit delay_min column (the raw delay component)
        delay_min = round(delay + np.random.normal(0, 0.5), 2)

        records.append({
            # Core features (required by train_models.py)
            "stop":             stop_name,
            "stop_distance_km": dist_km,
            "weather":          weather,
            "academic_period":  academic,
            "day_of_week":      day_name,
            "speed_kmh":        round(speed_kmh, 1),
            "occupancy":        occupancy,
            "boarding_mins":    boarding_mins,   # TARGET variable

            # Optional features (improve model accuracy)
            "traffic_level":    traffic,
            "peak_hour":        peak,
            "road_type":        road_type,
            "delay_min":        max(0.0, delay_min),

            # Metadata (not used in training, useful for analysis)
            "institution_id":   meta["inst_id"],
            "bus_id":           meta["bus_id"],
            "date":             chosen_date.isoformat(),
            "stop_lat":         meta["lat"],
            "stop_lng":         meta["lng"],
        })

df = pd.DataFrame(records)

# ══════════════════════════════════════════════════════════════════════════════
# 5.  QUALITY CHECKS
# ══════════════════════════════════════════════════════════════════════════════

print(f"\nGenerated {len(df):,} raw rows")
print(f"boarding_mins range: {df['boarding_mins'].min():.1f} – {df['boarding_mins'].max():.1f} min")
print(f"speed_kmh range:     {df['speed_kmh'].min():.1f} – {df['speed_kmh'].max():.1f} km/h")
print(f"occupancy range:     {df['occupancy'].min()} – {df['occupancy'].max()}")
print(f"\nWeather distribution:\n{df['weather'].value_counts(normalize=True).mul(100).round(1)}")
print(f"\nTraffic distribution:\n{df['traffic_level'].value_counts(normalize=True).mul(100).round(1)}")
print(f"\nRows per institution:\n{df['institution_id'].value_counts()}")
print(f"\nRows per bus:\n{df['bus_id'].value_counts()}")

# Verify no impossible values
assert df['boarding_mins'].isna().sum() == 0, "NaN in target!"
assert (df['boarding_mins'] > 0).all(),        "Non-positive boarding_mins!"
assert (df['speed_kmh'] > 0).all(),            "Non-positive speed!"

# ══════════════════════════════════════════════════════════════════════════════
# 6.  SAVE
# ══════════════════════════════════════════════════════════════════════════════

out_dir  = os.path.dirname(__file__)
out_path = os.path.join(out_dir, "institution_bus_dataset_large.csv")
df.to_csv(out_path, index=False)

print(f"\n✅ Saved {len(df):,} rows → {out_path}")
print(f"   Columns: {list(df.columns)}")

# Also show a few sample rows
print("\nSample rows:")
print(df[["stop","stop_distance_km","weather","academic_period","day_of_week",
          "speed_kmh","occupancy","boarding_mins","traffic_level","peak_hour"]].head(8).to_string(index=False))
