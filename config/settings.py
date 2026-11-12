"""
Configuración de Django para el proyecto config.

Los valores sensibles o propios de cada entorno se leen de variables de entorno.
En desarrollo se pueden poner en un archivo .env en la raíz (no se versiona); ver .env.example.
"""

import os
from pathlib import Path

from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent


def _cargar_env(ruta):
    """Carga CLAVE=valor de un .env sin pisar variables ya definidas."""
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding='utf-8').splitlines():
        linea = linea.strip()
        if not linea or linea.startswith('#') or '=' not in linea:
            continue
        clave, valor = linea.split('=', 1)
        os.environ.setdefault(clave.strip(), valor.strip().strip('"').strip("'"))


_cargar_env(BASE_DIR / '.env')


def _bool(nombre, defecto=False):
    return os.environ.get(nombre, str(defecto)).strip().lower() in ('1', 'true', 'si', 'sí', 'yes')


DEBUG = _bool('DJANGO_DEBUG', False)
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '')
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError('Falta DJANGO_SECRET_KEY: definila en el entorno o en el archivo .env (ver .env.example).')
    SECRET_KEY = 'solo-para-desarrollo-local-no-usar-en-produccion'
ALLOWED_HOSTS = [h.strip() for h in os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]

# Redacción de informes con Claude. Sin API key se usa una plantilla de texto.
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
CARTERA_MODELO_REDACTOR = 'claude-haiku-5-5'

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'analysisActions',
    'cartera',
    'quorum',
    'django_celery_beat',
    'rest_framework',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LOGIN_URL = '/quorum/ingresar/'
LOGIN_REDIRECT_URL = '/quorum/'
LOGOUT_REDIRECT_URL = '/quorum/'

LANGUAGE_CODE = 'es-ar'
TIME_ZONE = 'America/Argentina/Buenos_Aires'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Caché compartida: Redis si REDIS_URL está definido (varios procesos y Celery ven lo mismo);
# si no, memoria local, válida solo con un proceso (desarrollo).
REDIS_URL = os.environ.get('REDIS_URL', '')
if REDIS_URL:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': REDIS_URL}}
else:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'simple': {'format': '{asctime} {levelname} {name}: {message}', 'style': '{'}},
    'handlers': {'consola': {'class': 'logging.StreamHandler', 'formatter': 'simple'}},
    'loggers': {
        'quorum': {'handlers': ['consola'], 'level': os.environ.get('QUORUM_LOG', 'INFO')},
        'cartera': {'handlers': ['consola'], 'level': 'INFO'},
    },
}

# Celery
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', REDIS_URL or 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_ACCEPT_CONTENT = ['application/json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Horarios en hora argentina. El mercado opera de 11 a 17 en días hábiles.
CELERY_BEAT_SCHEDULE = {
    'actualizar-cedears-en-horario-de-mercado': {
        'task': 'analysisActions.tasks.actualizar_cedears_task',
        'schedule': crontab(minute='*/20', hour='11-17', day_of_week='1-5'),
    },
    'cartera-snapshots-diarios': {
        'task': 'cartera.tasks.registrar_snapshots',
        'schedule': crontab(hour=18, minute=0, day_of_week='1-5'),
    },
    'cartera-informe-diario': {
        'task': 'cartera.tasks.generar_informes',
        'args': ('diario',),
        'schedule': crontab(hour=18, minute=15, day_of_week='1-5'),
    },
    'cartera-informe-mensual': {
        'task': 'cartera.tasks.generar_informes',
        'args': ('mensual',),
        'schedule': crontab(day_of_month=1, hour=9, minute=0),
    },
    'cartera-informe-anual': {
        'task': 'cartera.tasks.generar_informes',
        'args': ('anual',),
        'schedule': crontab(month_of_year=1, day_of_month=1, hour=9, minute=5),
    },
    # Quórum: historia de precios e indicadores al cierre, screener cada 6 horas, medición de decisiones.
    'quorum-ingestar-precios': {
        'task': 'quorum.tasks.ingestar_precios',
        'schedule': crontab(hour=18, minute=30, day_of_week='1-5'),
    },
    'quorum-ingestar-indicadores': {
        'task': 'quorum.tasks.ingestar_indicadores',
        'schedule': crontab(hour=18, minute=35),
    },
    'quorum-seleccion': {
        'task': 'quorum.tasks.calcular_seleccion',
        'schedule': crontab(minute=0, hour='10,16', day_of_week='1-5'),
    },
    'quorum-preparar-medicion': {
        'task': 'quorum.tasks.preparar_medicion',
        'schedule': crontab(hour=18, minute=45, day_of_week='1-5'),
    },
}
