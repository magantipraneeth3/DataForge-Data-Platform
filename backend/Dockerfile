FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN python -m pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
RUN useradd --system --uid 10001 --create-home dataforge \
    && mkdir -p /app/backend/storage/uploads /app/backend/storage/airflow_processed \
    && chown -R dataforge:dataforge /app/backend

WORKDIR /app/backend
USER dataforge

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]