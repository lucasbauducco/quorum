"""Tareas programadas de Landgraft (ver CELERY_BEAT_SCHEDULE en settings)."""
from celery import shared_task
from django.core.cache import cache

from . import historia, servicio_seleccion


@shared_task
def ingestar_precios():
    return {'byma': historia.ingestar_precios_byma()}


@shared_task
def ingestar_indicadores():
    return historia.ingestar_indicadores()


@shared_task
def calcular_seleccion():
    return servicio_seleccion.calcular()


@shared_task
def preparar_medicion():
    # Historia del índice y de los elegidos: la medición de cada selección se calcula al pedirla.
    resultado = historia.completar_historia_de_selecciones()
    cache.delete('landgraft:medicion')
    return resultado
