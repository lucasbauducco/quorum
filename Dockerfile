# Imagen de producción de Quórum: servidor web (gunicorn) con WhiteNoise.
# El mismo código sirve para el worker y el beat de Celery (cambia solo el comando).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Reúne los estáticos durante la construcción. La clave es solo para este paso.
RUN DJANGO_SECRET_KEY=solo-para-collectstatic python manage.py collectstatic --noinput \
 && useradd --create-home quorum \
 && mkdir -p /app/data \
 && chown -R quorum:quorum /app/data

USER quorum

ENV DJANGO_DB_PATH=/app/data/db.sqlite3 \
    DJANGO_DEBUG=0
EXPOSE 8000

# Migra la base al arrancar y luego sirve la app.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --access-logfile -"]
