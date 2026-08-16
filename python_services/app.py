"""
app.py  — Campus Transit AI Python Microservice  (v3 — multi-tenant)
Port 5001.

Endpoints:
  POST /predict/boarding    — predict boarding time (ML models)
  POST /optimize/route      — optimize stop sequence (any institution)
  POST /optimize/audit      — before/after distance comparison
  GET  /models/stats        — model accuracy stats
  POST /models/retrain      — retrain all prediction models
  GET  /health              — health check
"""
import os, time, joblib, traceback, math
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

from models.route_optimizer import (
    nearest_neighbor_2opt,
    dijkstra,
    astar,
    genetic_algorithm,
    rl_qlearning,
    audit_route,
    haversine_km,
)

app  = Flask(__name__)
CORS(app)

MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')

# ── Lazy-load ML models ───────────────────────────────────────────────────────
_cache = {}

def load_models():
    if _cache:
        return _cache
    try:
        _cache['xgboost']  = joblib.load(os.path.join(MODELS_DIR, 'xgboost_model.pkl'))
        _cache['rf']       = joblib.load(os.path.join(MODELS_DIR, 'rf_model.pkl'))
        _cache['gb']       = joblib.load(os.path.join(MODELS_DIR, 'gb_model.pkl'))
        _cache['encoders'] = joblib.load(os.path.join(MODELS_DIR, 'encoders.pkl'))
        _cache['stats']    = joblib.load(os.path.join(MODELS_DIR, 'model_stats.pkl'))
        _cache['scaler_X'] = joblib.load(os.path.join(MODELS_DIR, 'lstm_scaler_X.pkl'))
        _cache['scaler_y'] = joblib.load(os.path.join(MODELS_DIR, 'lstm_scaler_y.pkl'))

        # Load optimization stats and stop coordinate lookup
        opt_stats_path = os.path.join(MODELS_DIR, 'optimization_stats.pkl')
        if os.path.exists(opt_stats_path):
            _cache['optimization_stats'] = joblib.load(opt_stats_path)

        stop_coords_path = os.path.join(MODELS_DIR, 'stop_coords_lookup.pkl')
        if os.path.exists(stop_coords_path):
            _cache['stop_coords_lookup'] = joblib.load(stop_coords_path)

        try:
            from tensorflow.keras.models import load_model as keras_load
            lstm_path = os.path.join(MODELS_DIR, 'lstm_model.keras')
            _cache['lstm'] = keras_load(lstm_path) if os.path.exists(lstm_path) else None
        except ImportError:
            _cache['lstm'] = None
        print('✅ ML models loaded.')
    except FileNotFoundError as e:
        print(f'⚠  Models not trained yet: {e}')
    return _cache


def encode_features(data: dict, encoders: dict) -> list:
    feature_list_path = os.path.join(MODELS_DIR, 'feature_list.pkl')
    optional_path     = os.path.join(MODELS_DIR, 'optional_features.pkl')
    optional_features = joblib.load(optional_path) if os.path.exists(optional_path) else []

    stop     = data.get('stop', 'Vadlamudi Bus Stand')
    weather  = data.get('weather', 'Sunny')
    academic = data.get('academic_period', 'Regular Semester')
    day      = data.get('day_of_week', 'Monday')
    speed    = float(data.get('speed_kmh', 30))
    occ      = int(data.get('occupancy', 20))

    WEATHER_NORM = {
        'Cloudy':'Sunny','Clear':'Sunny','Hot':'Sunny','Overcast':'Sunny',
        'Rainy':'Rainy','Rain':'Rainy','Wet':'Rainy',
        'Foggy':'Foggy','Fog':'Foggy','Mist':'Foggy','Sunny':'Sunny',
    }
    weather = WEATHER_NORM.get(weather, 'Sunny')

    # Distance: use live GPS if provided, else stop_lat/stop_lng, else fallback 5 km
    bus_lat  = data.get('bus_lat')
    bus_lng  = data.get('bus_lng')
    stop_lat = data.get('stop_lat')
    stop_lng = data.get('stop_lng')

    if bus_lat is not None and bus_lng is not None and stop_lat is not None and stop_lng is not None:
        dist_km = haversine_km(float(bus_lat), float(bus_lng), float(stop_lat), float(stop_lng))
    else:
        dist_km = float(data.get('distance_km', 5.0))

    def safe_encode(enc, val, fallback=0):
        try:
            return int(enc.transform([val])[0])
        except (ValueError, KeyError):
            return fallback

    stop_enc     = safe_encode(encoders['stop'],            stop,     0)
    weather_enc  = safe_encode(encoders['weather'],         weather,  0)
    academic_enc = safe_encode(encoders['academic_period'], academic, 0)
    day_enc      = safe_encode(encoders['day_of_week'],     day,      0)

    base = [stop_enc, round(dist_km, 3), weather_enc, academic_enc, day_enc, speed, occ]

    extras = []
    if 'traffic_level' in optional_features:
        tl_map = {'Low': 0, 'Medium': 1, 'High': 2}
        extras.append(tl_map.get(data.get('traffic_level', 'Medium'), 1))
    if 'peak_hour' in optional_features:
        extras.append(int(data.get('peak_hour', 0)))
    if 'road_type_enc' in optional_features:
        rt_map = {'Highway': 0, 'Main Road': 1, 'Village Road': 2}
        extras.append(rt_map.get(data.get('road_type', 'Main Road'), 1))
    if 'delay_min' in optional_features:
        extras.append(float(data.get('delay_min', 0)))

    return base + extras


# ── POST /predict/boarding ────────────────────────────────────────────────────
@app.route('/predict/boarding', methods=['POST'])
def predict_boarding():
    """
    Body: {
      model: 'XGBoost'|'LSTM'|'RandomForest'|'GradientBoosting',
      stop: str,
      stop_lat: float,   (optional — stop's GPS lat, used for distance calc)
      stop_lng: float,   (optional — stop's GPS lng)
      bus_lat: float,    (live GPS lat from driver device)
      bus_lng: float,    (live GPS lng)
      speed_kmh: float,
      occupancy: int,
      weather: str,
      academic_period: str,
      day_of_week: str
    }
    """
    try:
        data     = request.get_json()
        models   = load_models()
        model_id = data.get('model', 'XGBoost')

        if not models.get('encoders'):
            return jsonify({'error': 'Models not trained yet. Run train_models.py first.'}), 503

        feats = encode_features(data, models['encoders'])
        X     = np.array([feats])
        stats = models.get('stats', {})

        if model_id == 'LSTM':
            if models.get('lstm') is None:
                pred        = float(models['xgboost'].predict(X)[0])
                model_stats = stats.get('LSTM', {'mae': 1.8, 'train_time': 0})
                model_id    = 'LSTM (XGBoost fallback)'
            else:
                X_s    = models['scaler_X'].transform(X)
                X_lstm = X_s.reshape(1, 1, X_s.shape[1])
                y_s    = models['lstm'].predict(X_lstm, verbose=0)
                pred   = float(models['scaler_y'].inverse_transform(y_s)[0][0])
                model_stats = stats.get('LSTM', {'mae': 1.8, 'train_time': 30})
        elif model_id == 'RandomForest':
            pred        = float(models['rf'].predict(X)[0])
            model_stats = stats.get('RandomForest', {'mae': 1.5, 'train_time': 10})
        elif model_id == 'GradientBoosting':
            pred        = float(models['gb'].predict(X)[0])
            model_stats = stats.get('GradientBoosting', {'mae': 1.4, 'train_time': 14})
        else:
            pred        = float(models['xgboost'].predict(X)[0])
            model_stats = stats.get('XGBoost', {'mae': 1.2, 'train_time': 14})

        pred     = max(1.0, round(pred, 1))
        mae      = model_stats.get('mae', 1.5)
        accuracy = round(max(0, 100 - (mae / 20) * 100), 1)

        import datetime
        eta_dt  = datetime.datetime.now() + datetime.timedelta(minutes=pred)
        eta_str = eta_dt.strftime('%I:%M %p')

        gps_used = (data.get('bus_lat') is not None and data.get('bus_lng') is not None)

        return jsonify({
            'predicted_mins': pred,
            'eta_time':       eta_str,
            'model':          model_id,
            'mae':            mae,
            'accuracy':       accuracy,
            'train_time_s':   model_stats.get('train_time', 14),
            'distance_km':    round(feats[1], 3),
            'gps_used':       gps_used,
            'bus_lat':        data.get('bus_lat'),
            'bus_lng':        data.get('bus_lng'),
            'speed_kmh':      data.get('speed_kmh', 30),
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ── POST /optimize/route ──────────────────────────────────────────────────────
@app.route('/optimize/route', methods=['POST'])
def optimize_route():
    """
    Body: {
      algorithm: 'NN2opt'|'Dijkstra'|'AStar'|'Genetic'|'RL',
      stops: [{ name, lat, lng }],     -- ALL stops including destination last
      destination_index: int,           -- index of campus stop (default: last)
      start_name: str,                  -- name of starting stop (optional)
      bus_lat: float,                   -- live GPS (optional, overrides start_name)
      bus_lng: float,
      traffic_avoidance: bool,
      weather: str
    }
    Returns: { algorithm, path, path_coords, total_km, eta_mins, stops_count,
               gps_used, compute_ms, traffic_factor }
    """
    try:
        data     = request.get_json()
        algo     = data.get('algorithm', 'NN2opt')
        stops    = data.get('stops', [])          # list of {name, lat, lng}
        traffic  = data.get('traffic_avoidance', False)
        weather  = data.get('weather', 'Sunny')
        bus_lat  = data.get('bus_lat')
        bus_lng  = data.get('bus_lng')

        if not stops or len(stops) < 2:
            return jsonify({'error': 'At least 2 stops required.'}), 400

        # Ensure every stop has lat/lng
        for s in stops:
            if 'lat' not in s or 'lng' not in s:
                return jsonify({'error': f'Stop "{s.get("name","?")}" is missing lat/lng.'}), 400

        dest_idx = int(data.get('destination_index', len(stops) - 1))

        # Determine start: nearest stop to bus GPS, or first stop
        gps_used = False
        if bus_lat is not None and bus_lng is not None:
            dists = [
                haversine_km(float(bus_lat), float(bus_lng), s['lat'], s['lng'])
                for s in stops
            ]
            # Don't make destination the start
            non_dest = [(d, i) for i, d in enumerate(dists) if i != dest_idx]
            start_idx = min(non_dest, key=lambda x: x[0])[1]
            gps_used  = True
        else:
            start_name = data.get('start_name', '')
            start_idx  = next(
                (i for i, s in enumerate(stops) if s['name'] == start_name),
                0
            )
            if start_idx == dest_idx:
                start_idx = 0

        # Traffic factor
        tf = 1.0
        if traffic:
            tf = 1.15 if weather == 'Rainy' else 1.20 if weather == 'Foggy' else 1.10

        t0 = time.time()
        if algo == 'Dijkstra':
            result = dijkstra(stops, start_idx, dest_idx, tf)
        elif algo == 'AStar':
            result = astar(stops, start_idx, dest_idx, tf)
        elif algo == 'Genetic':
            result = genetic_algorithm(stops, start_idx, dest_idx, tf)
        elif algo == 'RL':
            result = rl_qlearning(stops, start_idx, dest_idx, tf)
        else:
            result = nearest_neighbor_2opt(stops, start_idx, dest_idx, tf)

        result['compute_ms']     = round((time.time() - t0) * 1000, 1)
        result['traffic_factor'] = tf
        result['gps_used']       = gps_used
        result['bus_lat']        = bus_lat
        result['bus_lng']        = bus_lng
        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ── POST /optimize/audit ─────────────────────────────────────────────────────
@app.route('/optimize/audit', methods=['POST'])
def audit_route_endpoint():
    """
    Compute before/after distance for a single bus route.
    Body: { stops: [{name, lat, lng}], traffic_factor: float }
    Returns: { before_km, after_km, improvement_km, improvement_pct,
               before_order, after_order }
    """
    try:
        data    = request.get_json()
        stops   = data.get('stops', [])
        tf      = float(data.get('traffic_factor', 1.0))

        if not stops or len(stops) < 2:
            return jsonify({'error': 'At least 2 stops required.'}), 400

        result = audit_route(stops, tf)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ── GET /models/stats ─────────────────────────────────────────────────────────
@app.route('/models/stats', methods=['GET'])
def model_stats():
    models = load_models()
    stats  = models.get('stats', {})
    if not stats:
        return jsonify({'error': 'Models not trained yet.'}), 503
    out = []
    for name, s in stats.items():
        out.append({
            'model':        name,
            'mae':          s.get('mae', 0),
            'accuracy':     round(max(0, 100 - (s.get('mae', 0) / 20) * 100), 1),
            'train_time_s': s.get('train_time', 0),
        })
    return jsonify(out)


# ── POST /models/retrain ──────────────────────────────────────────────────────
@app.route('/models/retrain', methods=['POST'])
def retrain():
    import subprocess, sys
    try:
        script = os.path.join(MODELS_DIR, 'train_models.py')
        subprocess.Popen([sys.executable, script])
        _cache.clear()
        return jsonify({'message': 'Retraining started in background.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── GET /health ───────────────────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    models  = load_models()
    trained = bool(models.get('xgboost'))
    return jsonify({'status': 'ok', 'models_loaded': trained, 'port': 5001, 'version': '3.0'})


if __name__ == '__main__':
    print('🐍 Campus Transit Python Microservice v3 (multi-tenant) — port 5001')
    load_models()
    app.run(host='0.0.0.0', port=5001, debug=False)
