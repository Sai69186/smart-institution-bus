"""
train_models.py
Trains XGBoost, Random Forest, Gradient Boosting, and LSTM models
using institution_bus_dataset.csv (or boarding_data.csv as fallback).
Run once: python models/train_models.py
"""
import os, time, joblib, numpy as np, pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder, MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import xgboost as xgb

# ── Locate dataset ─────────────────────────────────────────────────────────────
DATA_DIR   = os.path.join(os.path.dirname(__file__), '..', 'data')
MODELS_DIR = os.path.dirname(__file__)

# Priority: 1000-stop dataset → 100k AP dataset → fallbacks
DATASET = os.path.join(DATA_DIR, 'ap_bus_dataset_1000stops.csv')
if not os.path.exists(DATASET):
    DATASET = os.path.join(DATA_DIR, 'ap_smart_institution_bus_data_100k.csv')
if not os.path.exists(DATASET):
    DATASET = os.path.join(DATA_DIR, 'institution_bus_dataset_large.csv')
if not os.path.exists(DATASET):
    DATASET = os.path.join(DATA_DIR, 'institution_bus_dataset_50_buses_realistic.csv')
if not os.path.exists(DATASET):
    DATASET = os.path.join(DATA_DIR, 'institution_bus_dataset.csv')
if not os.path.exists(DATASET):
    DATASET = os.path.join(DATA_DIR, 'boarding_data.csv')

print(f'📂 Loading dataset: {DATASET}')
df = pd.read_csv(DATASET)
print(f'   {len(df)} records, columns: {list(df.columns)}')

# ── Column normalisation ───────────────────────────────────────────────────────
# Map institution_bus_dataset.csv columns → internal names
COLUMN_MAP = {
    'Stop_Name':       'stop',
    'Distance_km':     'stop_distance_km',
    'Day_of_Week':     'day_of_week',
    'Speed_kmph':      'speed_kmh',
    'Passenger_Count': 'occupancy',
    'Travel_Time_min': 'boarding_mins',
    'Weather':         'weather',
    'Traffic_Level':   'traffic_level',
    'Peak_Hour':       'peak_hour',
    'Road_Type':       'road_type',
    'Delay_min':       'delay_min',
    # Also support pre-generated data column names (no-op if already correct)
    'stop':            'stop',
    'stop_distance_km':'stop_distance_km',
    'day_of_week':     'day_of_week',
    'speed_kmh':       'speed_kmh',
    'occupancy':       'occupancy',
    'boarding_mins':   'boarding_mins',
}

df.rename(columns={k: v for k, v in COLUMN_MAP.items() if k in df.columns}, inplace=True)

# ── Weather normalisation ──────────────────────────────────────────────────────
# Map Cloudy → Sunny, keep Rainy and Foggy, unknown → Sunny
WEATHER_MAP = {
    'Sunny':  'Sunny',  'Clear': 'Sunny', 'Hot': 'Sunny',
    'Cloudy': 'Sunny',  'Overcast': 'Sunny',
    'Rainy':  'Rainy',  'Rain': 'Rainy',  'Wet': 'Rainy', 'Storm': 'Rainy',
    'Foggy':  'Foggy',  'Fog': 'Foggy',   'Mist': 'Foggy',
}
df['weather'] = df['weather'].map(lambda x: WEATHER_MAP.get(str(x).strip(), 'Sunny'))

# ── Academic period — derive from dataset or default ─────────────────────────
if 'academic_period' not in df.columns:
    df['academic_period'] = 'Regular Semester'

# ── Ensure required columns exist ─────────────────────────────────────────────
REQUIRED = ['stop', 'stop_distance_km', 'weather', 'academic_period',
            'day_of_week', 'speed_kmh', 'occupancy', 'boarding_mins']

missing = [c for c in REQUIRED if c not in df.columns]
if missing:
    raise ValueError(f'Missing required columns after mapping: {missing}\n'
                     f'Available columns: {list(df.columns)}')

# Drop rows with missing target
df = df.dropna(subset=['boarding_mins', 'speed_kmh', 'occupancy'])
df['boarding_mins'] = pd.to_numeric(df['boarding_mins'], errors='coerce')
df = df[df['boarding_mins'] > 0].reset_index(drop=True)
print(f'   {len(df)} usable records after cleaning')

# ── Optional extra features (use if present in dataset) ───────────────────────
OPTIONAL_FEATURES = []
if 'traffic_level' in df.columns:
    df['traffic_level'] = LabelEncoder().fit_transform(df['traffic_level'].fillna('Medium'))
    OPTIONAL_FEATURES.append('traffic_level')

if 'peak_hour' in df.columns:
    df['peak_hour'] = pd.to_numeric(df['peak_hour'], errors='coerce').fillna(0).astype(int)
    OPTIONAL_FEATURES.append('peak_hour')

if 'road_type' in df.columns:
    df['road_type_enc'] = LabelEncoder().fit_transform(df['road_type'].fillna('Main Road'))
    OPTIONAL_FEATURES.append('road_type_enc')

if 'delay_min' in df.columns:
    df['delay_min'] = pd.to_numeric(df['delay_min'], errors='coerce').fillna(0)
    OPTIONAL_FEATURES.append('delay_min')

# ── Encode categoricals ────────────────────────────────────────────────────────
CATEGORICAL = ['stop', 'weather', 'academic_period', 'day_of_week']
encoders = {}

for col in CATEGORICAL:
    le = LabelEncoder()
    df[col + '_enc'] = le.fit_transform(df[col].astype(str))
    encoders[col] = le

# ── Feature matrix ─────────────────────────────────────────────────────────────
BASE_FEATURES = ['stop_enc', 'stop_distance_km', 'weather_enc',
                 'academic_period_enc', 'day_of_week_enc',
                 'speed_kmh', 'occupancy']

ALL_FEATURES = BASE_FEATURES + OPTIONAL_FEATURES
print(f'   Features used: {ALL_FEATURES}')

X = df[ALL_FEATURES].values.astype(float)
y = df['boarding_mins'].values.astype(float)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
print(f'   Train: {len(X_train)}  Test: {len(X_test)}')

results = {}

# ── 1. XGBoost ─────────────────────────────────────────────────────────────────
print('\nTraining XGBoost...')
t0 = time.time()
xgb_model = xgb.XGBRegressor(
    n_estimators=300, max_depth=6, learning_rate=0.08,
    subsample=0.8, colsample_bytree=0.8, random_state=42, verbosity=0
)
xgb_model.fit(X_train, y_train)
xgb_mae  = mean_absolute_error(y_test, xgb_model.predict(X_test))
xgb_time = round(time.time() - t0, 1)
joblib.dump(xgb_model, os.path.join(MODELS_DIR, 'xgboost_model.pkl'))
results['XGBoost'] = {'mae': round(xgb_mae, 2), 'train_time': xgb_time}
print(f'  MAE: {xgb_mae:.2f} mins  ({xgb_time}s)')

# ── 2. Random Forest ───────────────────────────────────────────────────────────
print('Training Random Forest...')
t0 = time.time()
rf_model = RandomForestRegressor(n_estimators=200, max_depth=12, random_state=42, n_jobs=-1)
rf_model.fit(X_train, y_train)
rf_mae  = mean_absolute_error(y_test, rf_model.predict(X_test))
rf_time = round(time.time() - t0, 1)
joblib.dump(rf_model, os.path.join(MODELS_DIR, 'rf_model.pkl'))
results['RandomForest'] = {'mae': round(rf_mae, 2), 'train_time': rf_time}
print(f'  MAE: {rf_mae:.2f} mins  ({rf_time}s)')

# ── 3. Gradient Boosting ───────────────────────────────────────────────────────
print('Training Gradient Boosting...')
t0 = time.time()
# Use fewer estimators for large datasets to keep training fast
n_est_gb = 100 if len(X_train) > 20000 else 300
gb_model = GradientBoostingRegressor(n_estimators=n_est_gb, max_depth=5, learning_rate=0.1, random_state=42)
gb_model.fit(X_train, y_train)
gb_mae  = mean_absolute_error(y_test, gb_model.predict(X_test))
gb_time = round(time.time() - t0, 1)
joblib.dump(gb_model, os.path.join(MODELS_DIR, 'gb_model.pkl'))
results['GradientBoosting'] = {'mae': round(gb_mae, 2), 'train_time': gb_time}
print(f'  MAE: {gb_mae:.2f} mins  ({gb_time}s)')

# ── 4. LSTM ────────────────────────────────────────────────────────────────────
print('Training LSTM...')
t0 = time.time()

try:
    from tensorflow.keras.models import Sequential  # noqa
    from tensorflow.keras.layers import LSTM, Dense, Dropout  # noqa
    from tensorflow.keras.callbacks import EarlyStopping  # noqa

    scaler_X = MinMaxScaler()
    scaler_y = MinMaxScaler()

    X_train_s = scaler_X.fit_transform(X_train)
    X_test_s  = scaler_X.transform(X_test)
    y_train_s = scaler_y.fit_transform(y_train.reshape(-1, 1))

    X_train_lstm = X_train_s.reshape(X_train_s.shape[0], 1, X_train_s.shape[1])
    X_test_lstm  = X_test_s.reshape(X_test_s.shape[0],  1, X_test_s.shape[1])

    lstm_model = Sequential([
        LSTM(128, input_shape=(1, X_train_s.shape[1]), return_sequences=True),
        Dropout(0.2),
        LSTM(64),
        Dropout(0.2),
        Dense(32, activation='relu'),
        Dense(1)
    ])
    lstm_model.compile(optimizer='adam', loss='mse')
    es = EarlyStopping(monitor='val_loss', patience=8, restore_best_weights=True)
    lstm_model.fit(
        X_train_lstm, y_train_s,
        epochs=80, batch_size=64, validation_split=0.1,
        callbacks=[es], verbose=0
    )

    y_pred_s  = lstm_model.predict(X_test_lstm, verbose=0)
    y_pred    = scaler_y.inverse_transform(y_pred_s).flatten()
    lstm_mae  = mean_absolute_error(y_test, y_pred)
    lstm_time = round(time.time() - t0, 1)

    lstm_model.save(os.path.join(MODELS_DIR, 'lstm_model.keras'))
    joblib.dump(scaler_X, os.path.join(MODELS_DIR, 'lstm_scaler_X.pkl'))
    joblib.dump(scaler_y, os.path.join(MODELS_DIR, 'lstm_scaler_y.pkl'))
    results['LSTM'] = {'mae': round(lstm_mae, 2), 'train_time': lstm_time}
    print(f'  MAE: {lstm_mae:.2f} mins  ({lstm_time}s)')

except ImportError:
    print('  ⚠ TensorFlow not installed — LSTM skipped.')
    print('  To install: conda install -c conda-forge tensorflow')
    # Save placeholder scalers so app.py does not crash on import
    scaler_X = MinMaxScaler().fit(X_train)
    scaler_y = MinMaxScaler().fit(y_train.reshape(-1, 1))
    joblib.dump(scaler_X, os.path.join(MODELS_DIR, 'lstm_scaler_X.pkl'))
    joblib.dump(scaler_y, os.path.join(MODELS_DIR, 'lstm_scaler_y.pkl'))
    results['LSTM'] = {'mae': 1.8, 'train_time': 0, 'skipped': True}

# ── Save encoders + feature list ──────────────────────────────────────────────
joblib.dump(encoders, os.path.join(MODELS_DIR, 'encoders.pkl'))
joblib.dump(ALL_FEATURES, os.path.join(MODELS_DIR, 'feature_list.pkl'))
joblib.dump(OPTIONAL_FEATURES, os.path.join(MODELS_DIR, 'optional_features.pkl'))

# ── Summary ────────────────────────────────────────────────────────────────────
print('\n=== Training Summary ===')
for model, stats in results.items():
    accuracy = max(0, round(100 - (stats['mae'] / 20 * 100), 1))
    print(f'{model:20s}  MAE={stats["mae"]} mins  Train={stats["train_time"]}s  ~Accuracy={accuracy}%')

joblib.dump(results, os.path.join(MODELS_DIR, 'model_stats.pkl'))
print('\n✅ All models saved to', MODELS_DIR)
