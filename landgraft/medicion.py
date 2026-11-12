"""Medición de las selecciones: cuánto rindió cada elegido frente al mercado, medido en dólares MEP.

Cada selección del screener queda guardada con su fecha. Esta medición la liquida después de 30, 90 y 180
días: el rendimiento en USD (precio ÷ MEP) de cada acción o CEDEAR elegido, contra el Merval en USD (^MERV ÷ MEP)
en el mismo período. La diferencia es el "alfa". Sin esta medición el screener no puede corregirse
(idea tomada del registro de decisiones de TradingAgents).

Reglas para no mirar el futuro:
- El precio de entrada es el último cierre ANTERIOR al día del cálculo.
- El precio de salida es el último cierre hasta el día del horizonte.
- Si un precio tiene más de 7 días de diferencia con la fecha que le corresponde, no se usa.

Alcance: solo acciones y CEDEAR. La renta fija no se mide por precio: su TIR se cumple al vencimiento.
"""
from bisect import bisect_left, bisect_right
from datetime import timedelta

from django.utils import timezone

from .models import Indicador, PrecioDiario, SeleccionHistorica

HORIZONTES = (30, 90, 180)  # días corridos desde el cálculo
INDICE = '^MERV'  # Merval, en pesos (Yahoo Finance)
TIPOS_MEDIBLES = ('accion', 'cedear')
ULTIMAS_SELECCIONES = 24
TOLERANCIA = timedelta(days=7)
FUENTE_PRECIOS = 'Yahoo Finance'


class _Serie:
    """Serie diaria ordenada. Búsqueda binaria del último valor hasta una fecha."""

    def __init__(self, pares):
        self.fechas = [f for f, _ in pares]
        self.valores = [v for _, v in pares]

    def hasta(self, fecha, estricto=False):
        """(fecha, valor) del último dato con fecha <= fecha (o < fecha si es estricto), o (None, None)."""
        i = bisect_left(self.fechas, fecha) if estricto else bisect_right(self.fechas, fecha)
        return (self.fechas[i - 1], self.valores[i - 1]) if i else (None, None)


def _series_precio(simbolos):
    if not simbolos:
        return {}
    filas = (PrecioDiario.objects.filter(simbolo__in=simbolos, fuente=FUENTE_PRECIOS)
             .order_by('fecha').values_list('simbolo', 'fecha', 'cierre'))
    datos = {}
    for simbolo, fecha, cierre in filas:
        datos.setdefault(simbolo, []).append((fecha, cierre))
    return {s: _Serie(pares) for s, pares in datos.items()}


def _serie_mep():
    filas = Indicador.objects.filter(nombre='mep').order_by('fecha').values_list('fecha', 'valor')
    return _Serie(list(filas))


def _retorno_usd(serie, mep, inicio, fin):
    """Rendimiento en USD de una serie entre dos fechas de cálculo, o None si no hay precios que lo sostengan."""
    if serie is None:
        return None
    f0, p0 = serie.hasta(inicio, estricto=True)
    f1, p1 = serie.hasta(fin)
    if p0 is None or p1 is None:
        return None
    if (inicio - f0) > TOLERANCIA or (fin - f1) > TOLERANCIA:
        return None
    _, m0 = mep.hasta(f0)
    _, m1 = mep.hasta(f1)
    if not m0 or not m1:
        return None
    return (p1 / m1) / (p0 / m0) - 1


def _promedio(valores):
    valores = [v for v in valores if v is not None]
    return round(sum(valores) / len(valores), 4) if valores else None


def _resumen(filas, benchmark):
    """Resumen de un grupo de elegidos: cuántos se midieron, rendimiento medio, alfa medio y aciertos."""
    medidos = [f for f in filas if f['retorno'] is not None]
    alfas = [f['alfa'] for f in medidos if f['alfa'] is not None]
    return {
        'elegidos': len(filas),
        'medidos': len(medidos),
        'sinHistoria': len(filas) - len(medidos),
        'retornoUsd': _promedio([f['retorno'] for f in medidos]),
        'benchmarkUsd': benchmark,
        'alfaUsd': _promedio(alfas),
        'aciertos': round(sum(1 for a in alfas if a > 0) / len(alfas), 4) if alfas else None,
    }


def medir(hoy=None):
    """Liquida todas las selecciones recientes que ya tienen su horizonte cumplido."""
    hoy = hoy or timezone.localdate()
    selecciones = list(SeleccionHistorica.objects.order_by('-calculada')[:ULTIMAS_SELECCIONES])
    if not selecciones:
        return {'error': 'Todavía no hay selecciones guardadas para medir.'}

    elegidos = {(t, p['simbolo']) for s in selecciones for t in TIPOS_MEDIBLES
                for p in (s.resultado.get('tipos') or {}).get(t) or []}
    series = _series_precio({simbolo for _, simbolo in elegidos} | {INDICE})
    mep = _serie_mep()
    merv = series.get(INDICE)

    filas_por_h = {h: [] for h in HORIZONTES}
    bench_por_h = {h: [] for h in HORIZONTES}
    por_seleccion = []
    for sel in selecciones:
        inicio = timezone.localtime(sel.calculada).date()
        bloque = {'calculada': sel.calculada.isoformat(), 'horizontes': {}}
        for h in HORIZONTES:
            fin = inicio + timedelta(days=h)
            if fin > hoy:
                bloque['horizontes'][str(h)] = {'pendiente': True}
                continue
            benchmark = _retorno_usd(merv, mep, inicio, fin)
            filas = []
            for tipo in TIPOS_MEDIBLES:
                for p in (sel.resultado.get('tipos') or {}).get(tipo) or []:
                    r = _retorno_usd(series.get(p['simbolo']), mep, inicio, fin)
                    alfa = None if r is None or benchmark is None else r - benchmark
                    filas.append({'simbolo': p['simbolo'], 'tipo': tipo, 'retorno': r, 'alfa': alfa})
            filas_por_h[h].extend(filas)
            if benchmark is not None:
                bench_por_h[h].append(benchmark)
            bloque['horizontes'][str(h)] = {'pendiente': False, **_resumen(filas, _redondear(benchmark))}
        por_seleccion.append(bloque)

    # Un resumen por horizonte, sumando todas las selecciones que ya lo cumplieron.
    resumen = {}
    for h in HORIZONTES:
        if filas_por_h[h]:
            resumen[str(h)] = _resumen(filas_por_h[h], _promedio(bench_por_h[h]))
        else:
            resumen[str(h)] = {'pendiente': True}

    return {
        'referencia': 'Merval en USD (^MERV ÷ MEP)',
        'medidoHasta': hoy.isoformat(),
        'horizontesDias': list(HORIZONTES),
        'resumen': resumen,
        'selecciones': por_seleccion,
        'notas': [
            'Rendimiento en dólares MEP: precio ÷ MEP, de cierre a cierre.',
            'Alfa = rendimiento del elegido menos el del Merval en USD en el mismo período.',
            'Bonos, letras y ON no se miden por precio: su TIR se cumple al vencimiento.',
            'Con pocas selecciones, el promedio es poco confiable: mirá la cantidad de elegidos medidos.',
        ],
    }


def _redondear(x):
    return None if x is None else round(x, 4)
