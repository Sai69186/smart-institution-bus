"""Benchmark Dijkstra on 1000-stop dataset."""
import sys, os, time, random, joblib
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from route_optimizer import dijkstra, haversine_km

random.seed(42)
np.random.seed(42)

df = pd.read_csv(os.path.join(os.path.dirname(__file__), '..', 'data', 'ap_stops_1000_reference.csv'))
ALL_STOPS = [{'name': r['stop'], 'lat': float(r['stop_lat']), 'lng': float(r['stop_lng'])} for _, r in df.iterrows()]
print(f'Stops loaded: {len(ALL_STOPS)}')

def route_km(stops):
    t = 0.0
    for i in range(len(stops) - 1):
        t += haversine_km(stops[i]['lat'], stops[i]['lng'], stops[i+1]['lat'], stops[i+1]['lng'])
    return round(t, 4)

routes = []
for i in range(50):
    n = random.randint(3, 8)
    chosen = random.sample(ALL_STOPS, n)
    random.shuffle(chosen)
    routes.append({'stops': chosen, 'si': 0, 'di': n - 1})

total_before = total_after = total_time = total_pct = 0.0
for r in routes:
    before  = route_km(r['stops'])
    t0      = time.perf_counter()
    result  = dijkstra(r['stops'], r['si'], r['di'])
    elapsed = (time.perf_counter() - t0) * 1000
    after   = result['total_km']
    pct     = (before - after) / before * 100 if before > 0 else 0
    total_before += before
    total_after  += after
    total_time   += elapsed
    total_pct    += pct

n = len(routes)
stats = {
    'avg_before_km':   round(total_before / n, 3),
    'avg_after_km':    round(total_after / n,  3),
    'avg_saved_pct':   round(total_pct / n,    2),
    'avg_time_ms':     round(total_time / n,   2),
    'runs':            n,
    'mae':             round(total_time / n / 1000, 4),
    'train_time':      round(total_time / 1000, 1),
    'improvement_pct': round(total_pct / n, 2),
}

print(f"Dijkstra | before={stats['avg_before_km']} km | after={stats['avg_after_km']} km | saved={stats['avg_saved_pct']}% | time={stats['avg_time_ms']} ms")

opt_path  = os.path.join(os.path.dirname(__file__), 'optimization_stats.pkl')
opt_stats = joblib.load(opt_path) if os.path.exists(opt_path) else {}
opt_stats['Dijkstra'] = stats
joblib.dump(opt_stats, opt_path)
print('Saved Dijkstra to optimization_stats.pkl')
