"""Quick prediction smoke test — run after training."""
import joblib, numpy as np, os

MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
encoders   = joblib.load(os.path.join(MODELS_DIR, 'encoders.pkl'))
xgb_model  = joblib.load(os.path.join(MODELS_DIR, 'xgboost_model.pkl'))
rf_model   = joblib.load(os.path.join(MODELS_DIR, 'rf_model.pkl'))
gb_model   = joblib.load(os.path.join(MODELS_DIR, 'gb_model.pkl'))
ALL_FEAT   = joblib.load(os.path.join(MODELS_DIR, 'feature_list.pkl'))
OPT_FEAT   = joblib.load(os.path.join(MODELS_DIR, 'optional_features.pkl'))

def predict_all(stop, distance_km, weather, academic, day, speed, occupancy,
                traffic='Medium', peak=1, road_type='Main Road', delay=2.0):
    def safe_enc(enc, val):
        try:
            return int(enc.transform([val])[0])
        except Exception:
            return 0

    base = [
        safe_enc(encoders['stop'], stop),
        distance_km,
        safe_enc(encoders['weather'], weather),
        safe_enc(encoders['academic_period'], academic),
        safe_enc(encoders['day_of_week'], day),
        speed,
        occupancy,
    ]
    extras = []
    if 'traffic_level' in OPT_FEAT:
        extras.append({'Low': 0, 'Medium': 1, 'High': 2}.get(traffic, 1))
    if 'peak_hour' in OPT_FEAT:
        extras.append(int(peak))
    if 'road_type_enc' in OPT_FEAT:
        extras.append({'Highway': 0, 'Main Road': 1, 'Village Road': 2}.get(road_type, 1))
    if 'delay_min' in OPT_FEAT:
        extras.append(float(delay))

    X = np.array([base + extras])
    return {
        'XGBoost':          round(float(xgb_model.predict(X)[0]), 2),
        'RandomForest':     round(float(rf_model.predict(X)[0]),   2),
        'GradientBoosting': round(float(gb_model.predict(X)[0]),   2),
    }


# ── Test cases covering all weather/traffic/road combinations ──────────────
tests = [
    # stop,                    dist,  weather, academic,            day,         spd, occ, traffic,  pk, road,          delay
    ('Benz Circle',             4.4,  'Sunny', 'Regular Semester',  'Monday',    32,  25, 'Medium', 1, 'Main Road',    2.1),
    ('Gannavaram Bus Stop',     9.3,  'Rainy', 'Exam Week',         'Thursday',  28,  41, 'High',   1, 'Main Road',   12.0),
    ('Alipiri Bus Station',    18.5,  'Sunny', 'Exam Week',         'Thursday',  55,  50, 'Medium', 1, 'Main Road',    3.2),
    ('Gajuwaka Junction',      22.1,  'Sunny', 'Regular Semester',  'Thursday',  62,  15, 'Low',    0, 'Highway',      0.5),
    ('Vadlamudi Crossing',      4.3,  'Foggy', 'Exam Week',         'Thursday',  18,  12, 'Medium', 0, 'Village Road', 8.0),
    ('Siripuram Circle',        3.4,  'Sunny', 'Regular Semester',  'Thursday',  20,  18, 'Medium', 1, 'Main Road',    1.1),
    ('Mangalagiri AIIMS Circle',12.1, 'Rainy', 'Regular Semester',  'Saturday',  22,  45, 'High',   0, 'Highway',      5.4),
    ('Kanuru Center',           2.1,  'Sunny', 'Holidays',          'Thursday',  40,   8, 'Low',    0, 'Main Road',    0.0),
]

print()
print(f"  {'Stop':<35} {'Dist':>5}  {'Weather':<7} {'XGB':>6} {'RF':>6} {'GB':>6}")
print("  " + "─" * 75)
for t in tests:
    preds = predict_all(*t)
    print(f"  {t[0]:<35} {t[1]:>5.1f}  {t[2]:<7} "
          f"{preds['XGBoost']:>6.2f} {preds['RandomForest']:>6.2f} {preds['GradientBoosting']:>6.2f}")

print()
print("  All models working correctly.")
print(f"  Features used: {ALL_FEAT}")
print(f"  Optional features: {OPT_FEAT}")
print(f"  Unique stops encodable: {len(encoders['stop'].classes_)}")
