"""
app.py  — Campus Transit AI Python Microservice
Runs on port 5001. Called by Node.js backend.

Endpoints:
  POST /predict/boarding    — predict boarding time using selected ML model
  POST /optimize/route      — optimize stop sequence using selected algorithm
  GET  /models/stats        — return model accuracy stats
  POST /models/retrain      — retrain all prediction models
  GET  /health              — health check
"""
import os, time, joblib, traceback
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

from models.route_optimizer import (
    dijkstra, astar, genetic_algorithm, rl_qlearning, STOP_COORDS, DESTINATION
)

app   = Flask(__name__)
CORS(app)

MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')

# ── Lazy-load ML models (loaded once on first use) ────────────────────────────
_cache = {}

def load_models():
    if _cache:
        return _cache
    try:
        _cache['xgboost']   = joblib.load(os.path.join(MODELS_DIR, 'xgboost_model.pkl'))
        _cache['rf']        = joblib.load(os.path.join(MODELS_DIR, 'rf_model.pkl'))
        _cache['gb']        = joblib.load(os.path.join(MODELS_DIR, 'gb_model.pkl'))
        _cache['encoders']  = joblib.load(os.path.join(MODELS_DIR, 'encoders.pkl'))
        _cache['stats']     = joblib.load(os.path.join(MODELS_DIR, 'model_stats.pkl'))
        _cache['scaler_X']  = joblib.load(os.path.join(MODELS_DIR, 'lstm_scaler_X.pkl'))
        _cache['scaler_y']  = joblib.load(os.path.join(MODELS_DIR, 'lstm_scaler_y.pkl'))

        # LSTM — optional, requires tensorflow
        try:
            from tensorflow.keras.models import load_model as keras_load
            lstm_path = os.path.join(MODELS_DIR, 'lstm_model.keras')
            if os.path.exists(lstm_path):
                _cache['lstm'] = keras_load(lstm_path)
                print('✅ All ML models loaded (including LSTM).')
            else:
                _cache['lstm'] = None
                print('✅ ML models loaded (LSTM not trained yet).')
        except ImportError:
            _cache['lstm'] = None
            print('✅ ML models loaded (LSTM skipped — install tensorflow to enable).')

    except FileNotFoundError as e:
        print(f'⚠  Models not trained yet: {e}')
    return _cache


def encode_features(data: dict, encoders: dict) -> list:
    """
    Encode a prediction request dict into the feature vector.
    Uses real GPS (bus_lat, bus_lng) for live distance calculation.
    Also supports the extra features from institution_bus_dataset.csv.
    """
    import math

    # Try to load the saved feature list (created during training)
    feature_list_path    = os.path.join(MODELS_DIR, 'feature_list.pkl')
    optional_path        = os.path.join(MODELS_DIR, 'optional_features.pkl')
    all_features         = joblib.load(feature_list_path)  if os.path.exists(feature_list_path)  else None
    optional_features    = joblib.load(optional_path)      if os.path.exists(optional_path)      else []

    def haversine_km(lat1, lng1, lat2, lng2):
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = (math.sin(dlat/2)**2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
             math.sin(dlng/2)**2)
        return R * 2 * math.asin(math.sqrt(a))

    # Static fallback distances (km from campus)
    STOP_DISTANCE_FALLBACK = {
        'Vadlamudi Bus Stand': 2.1,  'Guntur Highway Gate': 3.5,
        'VLITS Main Gate': 1.2,      'Tenali Road Stop': 8.4,
        'Pedaparupudi Junction': 6.1,'Chebrolu Cross Roads': 5.8,
        'Kollipara Village Stop': 4.3,'Mangalagiri Bypass': 3.9,
        'Hostel Block VLITS': 0.8,   'Amaravati Capital Stop': 7.2,
        'Undavalli Junction': 5.5,   'Tadepalli Gate': 4.1,
        'Guntur RTC Complex': 11.2,  'Brodipet Stop': 9.3,
        'Nallapadu Gate': 7.8,
        # Dataset stops
        'Mangalagiri': 3.9, 'Tenali': 8.4, 'Guntur': 11.2,
        'Pedakakani': 5.0,  'Namburu': 6.2, 'Prathipadu': 9.0,
    }

    stop     = data.get('stop', 'Vadlamudi Bus Stand')
    weather  = data.get('weather', 'Sunny')
    academic = data.get('academic_period', 'Regular Semester')
    day      = data.get('day_of_week', 'Monday')
    speed    = float(data.get('speed_kmh', 30))
    occ      = int(data.get('occupancy', 20))

    # Normalise weather from dataset values
    WEATHER_NORM = {
        'Cloudy': 'Sunny', 'Clear': 'Sunny', 'Hot': 'Sunny', 'Overcast': 'Sunny',
        'Rainy': 'Rainy',  'Rain': 'Rainy',  'Wet': 'Rainy',
        'Foggy': 'Foggy',  'Fog': 'Foggy',   'Mist': 'Foggy',
        'Sunny': 'Sunny',
    }
    weather = WEATHER_NORM.get(weather, 'Sunny')

    # ── Live GPS distance calculation ─────────────────────────────────────────
    bus_lat = data.get('bus_lat')
    bus_lng = data.get('bus_lng')

    if bus_lat is not None and bus_lng is not None and stop in STOP_COORDS:
        coord   = STOP_COORDS[stop]
        dist_km = haversine_km(float(bus_lat), float(bus_lng), coord[0], coord[1])
    else:
        dist_km = STOP_DISTANCE_FALLBACK.get(stop, 5.0)

    def safe_encode(enc, val, fallback=0):
        try:
            return int(enc.transform([val])[0])
        except ValueError:
            # Unknown label — use nearest known
            return fallback

    stop_enc     = safe_encode(encoders['stop'],            stop,     0)
    weather_enc  = safe_encode(encoders['weather'],         weather,  0)
    academic_enc = safe_encode(encoders['academic_period'], academic, 0)
    day_enc      = safe_encode(encoders['day_of_week'],     day,      0)

    # Base feature vector
    base = [stop_enc, round(dist_km, 3), weather_enc, academic_enc, day_enc, speed, occ]

    # Optional features (only added if they were present during training)
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


@app.route('/predict/boarding', methods=['POST'])
def predict_boarding():
    """
    Body: {
      model: 'XGBoost' | 'LSTM' | 'RandomForest' | 'GradientBoosting',
      stop: str,                  -- target boarding stop name
      bus_lat: float,             -- LIVE GPS latitude from driver device
      bus_lng: float,             -- LIVE GPS longitude from driver device
      speed_kmh: float,           -- current bus speed from GPS
      occupancy: int,             -- current passengers on bus
      weather: 'Sunny'|'Rainy'|'Foggy',
      academic_period: str,
      day_of_week: str
    }
    Returns: {
      predicted_mins, eta_time, model, mae, accuracy,
      distance_km, gps_used, train_time_s
    }
    """
    try:
        data     = request.get_json()
        models   = load_models()
        model_id = data.get('model', 'XGBoost')

        if not models.get('encoders'):
            return jsonify({'error': 'Models not trained yet. Run train_models.py first.'}), 503

        feats   = encode_features(data, models['encoders'])
        X       = np.array([feats])
        stats   = models.get('stats', {})

        if model_id == 'LSTM':
            if models.get('lstm') is None:
                # LSTM not available — fall back to XGBoost silently
                pred = float(models['xgboost'].predict(X)[0])
                model_stats = stats.get('LSTM', {'mae': 1.8, 'train_time': 0})
                model_id = 'LSTM (XGBoost fallback)'
            else:
                X_s     = models['scaler_X'].transform(X)
                X_lstm  = X_s.reshape(1, 1, X_s.shape[1])
                y_s     = models['lstm'].predict(X_lstm, verbose=0)
                pred    = float(models['scaler_y'].inverse_transform(y_s)[0][0])
                model_stats = stats.get('LSTM', {'mae': 1.8, 'train_time': 30})

        elif model_id == 'RandomForest':
            pred = float(models['rf'].predict(X)[0])
            model_stats = stats.get('RandomForest', {'mae': 1.5, 'train_time': 10})

        elif model_id == 'GradientBoosting':
            pred = float(models['gb'].predict(X)[0])
            model_stats = stats.get('GradientBoosting', {'mae': 1.4, 'train_time': 14})

        else:  # XGBoost (default)
            pred = float(models['xgboost'].predict(X)[0])
            model_stats = stats.get('XGBoost', {'mae': 1.2, 'train_time': 14})

        pred      = max(1.0, round(pred, 1))
        mae       = model_stats.get('mae', 1.5)
        accuracy  = round(max(0, 100 - (mae / 20) * 100), 1)
        train_sec = model_stats.get('train_time', 14)

        # Convert predicted minutes to actual clock time
        import datetime
        now    = datetime.datetime.now()
        eta_dt = now + datetime.timedelta(minutes=pred)
        eta_str = eta_dt.strftime('%I:%M %p')

        # Was live GPS used for distance calculation?
        gps_used = (data.get('bus_lat') is not None and data.get('bus_lng') is not None)

        return jsonify({
            'predicted_mins': pred,
            'eta_time':       eta_str,
            'model':          model_id,
            'mae':            mae,
            'accuracy':       accuracy,
            'train_time_s':   train_sec,
            'distance_km':    round(feats[1], 3),   # actual computed distance
            'gps_used':       gps_used,              # tells frontend if real GPS was used
            'bus_lat':        data.get('bus_lat'),
            'bus_lng':        data.get('bus_lng'),
            'speed_kmh':      data.get('speed_kmh', 30),
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/optimize/route', methods=['POST'])
def optimize_route():
    """
    Body: {
      algorithm: 'Dijkstra' | 'AStar' | 'Genetic' | 'RL',
      stops: [str],           -- remaining stop names for this route
      start: str,             -- nearest stop name to current GPS position
      bus_lat: float,         -- LIVE GPS latitude from driver device
      bus_lng: float,         -- LIVE GPS longitude from driver device
      traffic_avoidance: bool,
      weather: str
    }
    Returns: { algorithm, path, total_km, eta_mins, stops_count, gps_used }
    """
    try:
        import math

        data      = request.get_json()
        algo      = data.get('algorithm', 'Dijkstra')
        stops     = data.get('stops', list(STOP_COORDS.keys()))
        traffic   = data.get('traffic_avoidance', False)
        weather   = data.get('weather', 'Sunny')
        bus_lat   = data.get('bus_lat')
        bus_lng   = data.get('bus_lng')

        # ── If live GPS provided, find the nearest stop as the actual start ──
        if bus_lat is not None and bus_lng is not None:
            def dist_to_stop(stop_name):
                coord = STOP_COORDS.get(stop_name)
                if not coord:
                    return float('inf')
                dlat = math.radians(coord[0] - float(bus_lat))
                dlng = math.radians(coord[1] - float(bus_lng))
                a = math.sin(dlat/2)**2 + math.cos(math.radians(float(bus_lat))) * \
                    math.cos(math.radians(coord[0])) * math.sin(dlng/2)**2
                return 6371 * 2 * math.asin(math.sqrt(a))

            # Find the nearest remaining stop to the bus's current GPS position
            start    = min(stops, key=dist_to_stop)
            gps_used = True
        else:
            start    = data.get('start', stops[0] if stops else 'Vadlamudi Bus Stand')
            gps_used = False

        # Ensure DESTINATION is in stops list
        if DESTINATION not in stops:
            stops = stops + [DESTINATION]

        # Ensure start is in stops
        if start not in stops:
            stops = [start] + stops

        # Traffic factor based on weather and avoidance toggle
        tf = 1.0
        if traffic:
            tf = 1.15 if weather == 'Rainy' else 1.20 if weather == 'Foggy' else 1.10

        t0 = time.time()
        if algo == 'AStar':
            result = astar(stops, start, tf)
        elif algo == 'Genetic':
            result = genetic_algorithm(stops, start, tf)
        elif algo == 'RL':
            result = rl_qlearning(stops, start, tf)
        else:
            result = dijkstra(stops, start, tf)

        result['compute_ms']    = round((time.time() - t0) * 1000, 1)
        result['traffic_factor'] = tf
        result['gps_used']      = gps_used
        result['bus_lat']       = bus_lat
        result['bus_lng']       = bus_lng
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
            'model':       name,
            'mae':         s.get('mae', 0),
            'accuracy':    round(max(0, 100 - (s.get('mae', 0) / 20) * 100), 1),
            'train_time_s': s.get('train_time', 0),
        })
    return jsonify(out)


# ── POST /models/retrain ──────────────────────────────────────────────────────
@app.route('/models/retrain', methods=['POST'])
def retrain():
    """Admin triggers retraining. Runs trainer in background."""
    import subprocess, sys
    try:
        script = os.path.join(MODELS_DIR, 'train_models.py')
        subprocess.Popen([sys.executable, script])
        _cache.clear()   # clear cache so next request reloads fresh models
        return jsonify({'message': 'Retraining started in background.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── GET /health ───────────────────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    models   = load_models()
    trained  = bool(models.get('xgboost'))
    return jsonify({'status': 'ok', 'models_loaded': trained, 'port': 5001})


if __name__ == '__main__':
    print('🐍 Campus Transit Python Microservice starting on port 5001...')
    load_models()
    app.run(host='0.0.0.0', port=5001, debug=False)
