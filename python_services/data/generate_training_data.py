"""
generate_training_data.py
Generates synthetic but realistic boarding time training data for Vignan LARA.
Run once: python data/generate_training_data.py
"""
import numpy as np
import pandas as pd
import os

np.random.seed(42)
N = 5000  # number of records

STOPS = [
    'Vadlamudi Bus Stand', 'Guntur Highway Gate', 'VLITS Main Gate',
    'Tenali Road Stop', 'Pedaparupudi Junction', 'Chebrolu Cross Roads',
    'Kollipara Village Stop', 'Mangalagiri Bypass', 'Hostel Block VLITS',
    'Amaravati Capital Stop', 'Undavalli Junction', 'Tadepalli Gate',
    'Guntur RTC Complex', 'Brodipet Stop', 'Nallapadu Gate',
]

# Distance from campus in km (approximate)
STOP_DISTANCE = {
    'Vadlamudi Bus Stand': 2.1, 'Guntur Highway Gate': 3.5, 'VLITS Main Gate': 1.2,
    'Tenali Road Stop': 8.4, 'Pedaparupudi Junction': 6.1, 'Chebrolu Cross Roads': 5.8,
    'Kollipara Village Stop': 4.3, 'Mangalagiri Bypass': 3.9, 'Hostel Block VLITS': 0.8,
    'Amaravati Capital Stop': 7.2, 'Undavalli Junction': 5.5, 'Tadepalli Gate': 4.1,
    'Guntur RTC Complex': 11.2, 'Brodipet Stop': 9.3, 'Nallapadu Gate': 7.8,
}

WEATHER_DELAY = {'Sunny': 0, 'Rainy': 5, 'Foggy': 9}
ACADEMIC_LOAD = {'Regular Semester': 1.0, 'Exam Week': 1.3, 'Holidays': 0.5}
DAY_LOAD = {'Monday': 1.1, 'Tuesday': 1.0, 'Wednesday': 1.0,
            'Thursday': 1.0, 'Friday': 0.9, 'Saturday': 0.7}

records = []
for _ in range(N):
    stop       = np.random.choice(STOPS)
    weather    = np.random.choice(list(WEATHER_DELAY.keys()), p=[0.6, 0.3, 0.1])
    academic   = np.random.choice(list(ACADEMIC_LOAD.keys()), p=[0.7, 0.2, 0.1])
    day        = np.random.choice(list(DAY_LOAD.keys()))
    dist_km    = STOP_DISTANCE[stop]
    speed_kmh  = max(15, np.random.normal(30, 8))
    occupancy  = np.random.randint(0, 51)   # 0–50 students on bus

    # Base travel time in minutes
    base_time = (dist_km / speed_kmh) * 60

    # Add contextual delays
    delay  = WEATHER_DELAY[weather]
    delay += (ACADEMIC_LOAD[academic] - 1.0) * 5
    delay += (DAY_LOAD[day] - 1.0) * 3
    delay += occupancy * 0.05   # denser bus = slightly slower

    # Actual boarding time in minutes from route start
    actual_mins = base_time + delay + np.random.normal(0, 1.5)  # ±1.5 min noise

    # Target: error in minutes (predicted - actual); model learns to output actual mins
    records.append({
        'stop':             stop,
        'stop_distance_km': round(dist_km, 2),
        'weather':          weather,
        'academic_period':  academic,
        'day_of_week':      day,
        'speed_kmh':        round(speed_kmh, 1),
        'occupancy':        occupancy,
        'boarding_mins':    round(max(1, actual_mins), 2),  # target variable
    })

df = pd.DataFrame(records)

out_path = os.path.join(os.path.dirname(__file__), 'boarding_data.csv')
df.to_csv(out_path, index=False)
print(f'✅ Generated {len(df)} records → {out_path}')
print(df.describe())
