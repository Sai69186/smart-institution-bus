"""
train_optimization_models.py
=============================
Benchmarks and saves performance stats for all 5 route optimization algorithms
using the actual stop coordinates from ap_smart_institution_bus_data_100k.csv.

The route optimization algorithms are NOT gradient-descent trained —
they are classical algorithms (NN+2opt, Dijkstra, A*, Genetic, RL).
"Training" here means:
  1. Extract all unique stops and their GPS coords from the dataset
  2. Build representative multi-stop route test cases
  3. Run every algorithm against every test case
  4. Measure: route distance, computation time, improvement % over naive input
  5. Save benchmark stats as optimization_stats.pkl (loaded by app.py /models/stats)

Run:
    cd "d:/Major Project/smart institution bus"
    python python_services/models/train_optimization_models.py
"""

import os, sys, time, math, random, joblib
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from route_optimizer import (
    nearest_neighbor_2opt,
    dijkstra,
    astar,
    genetic_algorithm,
    rl_qlearning,
    haversine_km,
    route_km,
)

MODELS_DIR  = os.path.dirname(__file__)
DATA_DIR    = os.path.join(MODELS_DIR, '..', 'data')

# Use 1000-stop reference table if available, otherwise fall back to main dataset
STOPS_REF = os.path.join(DATA_DIR, 'ap_stops_1000_reference.csv')
DATASET   = os.path.join(DATA_DIR, 'ap_bus_dataset_1000stops.csv')
if not os.path.exists(STOPS_REF):
    STOPS_REF = os.path.join(DATA_DIR, 'ap_smart_institution_bus_data_100k.csv')
    DATASET   = STOPS_REF

random.seed(42)
np.random.seed(42)

# ── 1. Load unique stops from dataset ────────────────────────────────────────
print("\n📂 Loading stop coordinates from dataset...")
# Use the dedicated stops reference table (1000 stops) if available
if os.path.exists(STOPS_REF) and 'reference' in STOPS_REF:
    stop_df = pd.read_csv(STOPS_REF)
    # Ensure required columns exist
    stop_df = stop_df[['stop', 'stop_lat', 'stop_lng']].drop_duplicates().sort_values('stop').reset_index(drop=True)
else:
    df_main = pd.read_csv(DATASET)
    stop_df = df_main[['stop', 'stop_lat', 'stop_lng']].drop_duplicates().sort_values('stop').reset_index(drop=True)

ALL_STOPS = [
    {'name': row['stop'], 'lat': float(row['stop_lat']), 'lng': float(row['stop_lng'])}
    for _, row in stop_df.iterrows()
]

print(f"  {len(ALL_STOPS)} unique stops loaded")

# ── 2. Build realistic institution route test cases ───────────────────────────
# Group stops by approximate geographic region (institution service area)
# and build 3-7 stop routes similar to real institution bus routes

def build_test_routes(all_stops, num_routes=20, min_stops=3, max_stops=7, seed=42):
    """
    Generate diverse test routes:
    - Each route has 3-7 stops
    - Last stop is always the "destination" (campus)
    - Stops are shuffled to simulate non-optimal input order
    """
    random.seed(seed)
    routes = []
    for i in range(num_routes):
        n = random.randint(min_stops, max_stops)
        chosen = random.sample(all_stops, n)
        # Shuffle middle stops (simulate bad input order)
        dest = chosen[-1]
        middle = chosen[:-1]
        random.shuffle(middle)
        route = middle + [dest]
        routes.append({
            'route_id':   f'TEST_ROUTE_{i+1:02d}',
            'stops':      route,
            'n_stops':    n,
            'start_idx':  0,
            'dest_idx':   n - 1,
        })
    return routes

TEST_ROUTES = build_test_routes(ALL_STOPS, num_routes=30)
print(f"  {len(TEST_ROUTES)} test routes built ({min(r['n_stops'] for r in TEST_ROUTES)}-{max(r['n_stops'] for r in TEST_ROUTES)} stops each)")

# ── 3. Baseline: naive input order distance ───────────────────────────────────
def route_total_km_from_list(stops):
    total = 0.0
    for i in range(len(stops) - 1):
        total += haversine_km(stops[i]['lat'], stops[i]['lng'],
                              stops[i+1]['lat'], stops[i+1]['lng'])
    return round(total, 4)

# ── 4. Benchmark each algorithm ───────────────────────────────────────────────
ALGORITHMS = {
    'NN_2opt':  lambda stops, si, di: nearest_neighbor_2opt(stops, si, di),
    'Dijkstra': lambda stops, si, di: dijkstra(stops, si, di),
    'AStar':    lambda stops, si, di: astar(stops, si, di),
    'Genetic':  lambda stops, si, di: genetic_algorithm(stops, si, di, pop_size=50, generations=100),
    'RL':       lambda stops, si, di: rl_qlearning(stops, si, di, episodes=200),
}

print("\n🔄 Benchmarking optimization algorithms...")
print(f"  {'Algorithm':<12} {'Avg km (before)':>16} {'Avg km (after)':>15} {'Avg saved %':>12} {'Avg time ms':>12} {'Runs':>6}")
print(f"  {'─'*75}")

stats = {}

for algo_name, runner in ALGORITHMS.items():
    total_before = 0.0
    total_after  = 0.0
    total_time   = 0.0
    total_saved_pct = 0.0
    runs = 0

    for route in TEST_ROUTES:
        stops    = route['stops']
        si       = route['start_idx']
        di       = route['dest_idx']
        before   = route_total_km_from_list(stops)

        t0 = time.perf_counter()
        try:
            result = runner(stops, si, di)
            elapsed_ms = (time.perf_counter() - t0) * 1000

            after = result['total_km']
            saved_pct = ((before - after) / before * 100) if before > 0 else 0.0

            total_before    += before
            total_after     += after
            total_time      += elapsed_ms
            total_saved_pct += saved_pct
            runs += 1
        except Exception as e:
            print(f"    ⚠ {algo_name} failed on {route['route_id']}: {e}")

    if runs == 0:
        continue

    avg_before   = total_before / runs
    avg_after    = total_after  / runs
    avg_time_ms  = total_time   / runs
    avg_saved    = total_saved_pct / runs

    print(f"  {algo_name:<12} {avg_before:>16.3f} {avg_after:>15.3f} {avg_saved:>11.1f}% {avg_time_ms:>11.1f} {runs:>6}")

    stats[algo_name] = {
        'avg_before_km':    round(avg_before,  3),
        'avg_after_km':     round(avg_after,   3),
        'avg_saved_pct':    round(avg_saved,   2),
        'avg_time_ms':      round(avg_time_ms, 1),
        'runs':             runs,
        # For /models/stats endpoint format compatibility
        'mae':              round(avg_time_ms / 1000, 3),   # latency in seconds as "mae"
        'train_time':       round(avg_time_ms * runs / 1000, 1),
        'improvement_pct':  round(avg_saved, 2),
    }

# ── 5. Save optimization stats ────────────────────────────────────────────────
out_path = os.path.join(MODELS_DIR, 'optimization_stats.pkl')
joblib.dump(stats, out_path)
print(f"\n✅ Optimization stats saved → {out_path}")

# ── 6. Save stop coordinate lookup for Flask service ─────────────────────────
# This allows app.py to resolve stop names → lat/lng at prediction time
# without needing the full dataset loaded
stop_coords_lookup = {
    row['stop']: {'lat': float(row['stop_lat']), 'lng': float(row['stop_lng'])}
    for _, row in stop_df.iterrows()
}
coords_path = os.path.join(MODELS_DIR, 'stop_coords_lookup.pkl')
joblib.dump(stop_coords_lookup, coords_path)
print(f"✅ Stop coordinates lookup saved → {coords_path}")
print(f"   {len(stop_coords_lookup)} stops cached")

# ── 7. Final summary ──────────────────────────────────────────────────────────
print("\n═══════════════════════════════════════════════════════════")
print("  OPTIMIZATION BENCHMARK SUMMARY")
print("═══════════════════════════════════════════════════════════")
best_quality = min(stats, key=lambda k: stats[k]['avg_after_km'])
best_speed   = min(stats, key=lambda k: stats[k]['avg_time_ms'])
print(f"  Best route quality : {best_quality} ({stats[best_quality]['avg_saved_pct']}% avg improvement)")
print(f"  Fastest algorithm  : {best_speed} ({stats[best_speed]['avg_time_ms']:.1f} ms avg)")
print(f"\n  All algorithms benchmarked against {len(TEST_ROUTES)} routes")
print(f"  Stop data from: {len(ALL_STOPS)} real AP institution stops")
print("═══════════════════════════════════════════════════════════\n")
