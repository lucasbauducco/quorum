"""El screener corre fuera del pedido web: en una tarea de Celery o en un hilo, y guarda cada resultado."""
import logging
import threading
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone

from . import seleccion
from .models import SeleccionHistorica

logger = logging.getLogger(__name__)
VIGENCIA = timedelta(hours=6)
CLAVE_LOCK = 'landgraft:seleccion:calculando'


def ultima():
    return SeleccionHistorica.objects.order_by('-calculada').first()


def vigente(sel):
    return sel is not None and timezone.now() - sel.calculada < VIGENCIA


def calcular():
    """Calcula y guarda una selección nueva. El lock evita que corran dos a la vez."""
    from .views import _leer_dolar, _leer_tasas  # import diferido: views importa este módulo
    if not cache.add(CLAVE_LOCK, True, 15 * 60):
        return 'ya se está calculando'
    try:
        mep = _leer_dolar()['mep']
        tasas = _leer_tasas()
        resultado = seleccion.seleccionar(mep, tasas['plazoFijo'], tasas['inflacionEsperada'])
        if any(resultado['tipos'].values()):
            SeleccionHistorica.objects.create(resultado=resultado)
        return {t: len(v) for t, v in resultado['tipos'].items()}
    except Exception:
        logger.exception('Falló el cálculo del screener')
        raise
    finally:
        cache.delete(CLAVE_LOCK)
        cache.delete(seleccion.CLAVE_PROGRESO)


def calcular_en_segundo_plano():
    """Lanza el cálculo en un hilo si no hay uno en curso (sin depender de que Celery esté levantado)."""
    if cache.get(CLAVE_LOCK):
        return False
    threading.Thread(target=calcular, daemon=True).start()
    return True


def en_curso():
    return bool(cache.get(CLAVE_LOCK))
