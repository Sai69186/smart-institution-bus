# Campus Transit AI — Python Microservice

## Setup (run once)

```bash
cd python_services
pip install -r requirements.txt

# Generate training data
python data/generate_training_data.py

# Train all 4 models (~30-60 seconds)
python models/train_models.py
```

## Run the microservice

```bash
python app.py
# Starts on http://localhost:5001
```

## Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/predict/boarding` | Predict boarding time |
| POST | `/optimize/route` | Optimize stop sequence |
| GET  | `/models/stats` | Model accuracy stats |
| POST | `/models/retrain` | Retrain all models |
| GET  | `/health` | Health check |

## Models

### Boarding Time Prediction
- **XGBoost** — default, best accuracy (~96%)
- **Random Forest** — ensemble, fast
- **Gradient Boosting** — sklearn GB
- **LSTM** — deep learning, sequence-aware

### Route Optimization
- **Dijkstra** — shortest path, static distances
- **A\* Search** — Dijkstra + spatial heuristic
- **Genetic Algorithm** — evolves optimal stop order
- **Reinforcement Learning** — Q-Learning agent

## Input Features (boarding prediction)
- `stop` — boarding stop name
- `weather` — Sunny / Rainy / Foggy
- `academic_period` — Regular Semester / Exam Week / Holidays
- `day_of_week` — Monday–Saturday
- `speed_kmh` — current bus speed
- `occupancy` — number of students on bus
