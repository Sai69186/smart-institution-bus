# ── Python AI Microservice — Dockerfile ──────────────────────────────────────
# Uses a slim Python base to keep image size reasonable.
# TensorFlow is optional — if the LSTM model file is absent the service falls
# back to XGBoost automatically, so we install tensorflow last and allow it
# to be skipped on memory-constrained free-tier instances.

FROM python:3.11-slim

# System deps for numpy / pandas / scikit-learn native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first so Docker layer-caches the install step
COPY requirements.txt .

# Install all Python deps (pinned versions)
RUN pip install --no-cache-dir -r requirements.txt

# Copy the full python_services directory contents
COPY . .

# Expose the Flask port
EXPOSE 5001

# Use gunicorn for production (more robust than Flask dev server)
# 2 workers, 120s timeout (model loading can be slow on first request)
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--timeout", "120", "app:app"]
