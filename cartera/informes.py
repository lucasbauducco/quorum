from datetime import date

from django.utils import timezone

from .models import Informe
from .redactor import generar_texto
from .services import metricas


def periodo(tipo, referencia: date):
    """Rango (desde, hasta) del informe. `referencia` es el último día del periodo."""
    if tipo == Informe.DIARIO:
        return referencia, referencia
    if tipo == Informe.MENSUAL:
        return referencia.replace(day=1), referencia
    if tipo == Informe.ANUAL:
        return referencia.replace(month=1, day=1), referencia
    raise ValueError(f"Tipo de informe desconocido: {tipo}")


def generar_informe(cartera, tipo, referencia=None):
    referencia = referencia or timezone.localdate()
    desde, hasta = periodo(tipo, referencia)
    datos = metricas(cartera, desde, hasta)
    informe, _ = Informe.objects.update_or_create(
        cartera=cartera,
        tipo=tipo,
        fecha_inicio=desde,
        defaults={
            'fecha_fin': hasta,
            'metricas': datos,
            'texto': generar_texto(datos, tipo),
        },
    )
    return informe
