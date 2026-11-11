from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .informes import generar_informe
from .models import Cartera, Informe
from .services import registrar_snapshot


@shared_task
def registrar_snapshots():
    for cartera in Cartera.objects.all():
        registrar_snapshot(cartera)


@shared_task
def generar_informes(tipo):
    # El diario cubre hoy. El mensual y el anual se disparan el día 1 y cubren el periodo que acaba de cerrar.
    hoy = timezone.localdate()
    referencia = hoy if tipo == Informe.DIARIO else hoy - timedelta(days=1)
    for cartera in Cartera.objects.all():
        generar_informe(cartera, tipo, referencia)
