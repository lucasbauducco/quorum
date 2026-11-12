from __future__ import absolute_import, unicode_literals
import os
from celery import Celery

# establece el setting predeterminado de Django para la aplicación de celery.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('config')

# namespace='CELERY' significa que todas las configuraciones relacionadas con celery,
# deberán tener el prefijo `CELERY_`.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Carga automáticamente las tareas definidas en tus aplicaciones de Django
app.autodiscover_tasks()