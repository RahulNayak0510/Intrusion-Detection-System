FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential gcc libmariadb-dev pkg-config \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends libmariadb3 curl ca-certificates procps \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos "" --uid 1000 appuser \
 && mkdir -p /app/data \
 && chown -R appuser:appuser /app

COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels /wheels/* \
 && rm -rf /wheels

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
