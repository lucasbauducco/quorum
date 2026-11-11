"""Screener de Landgraft: elige los 10 mejores activos de cada tipo según su proyección a 2027.

Criterio:
- Acciones y CEDEAR: precio objetivo de los analistas a 12 meses (Yahoo Finance), ponderado por cuántos
  analistas lo cubren, más el consenso y la tendencia de 6 meses. Se exigen al menos 3 analistas en
  acciones y 10 en CEDEAR; se descartan caídas fuertes de 6 meses (más de 35 % en acciones, 30 % en
  CEDEAR) y la suba esperada tiene techo (80 % y 60 %), porque más allá el precio objetivo es poco confiable.
- Bonos, letras y ON: TIR al vencimiento (ficha técnica de BYMA; las LECAP, con la TEA de ArgentinaDatos),
  medida contra la referencia de su moneda: plazo fijo llevado a tasa efectiva anual en pesos, 7 % en
  dólares. Se descartan TIR extremas, que suelen indicar riesgo de default o falta de liquidez, y los
  duplicados del mismo título (mismo ISIN).
"""
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

from django.core.cache import cache

from . import byma, yahoo

POR_TIPO = 10
MONTO_TENTATIVO = 100000  # ARS por activo, para sugerir una cantidad
REFERENCIA_USD = 0.07
CLAVE_PROGRESO = 'landgraft:seleccion:progreso'
CACHE_YAHOO = 6 * 60 * 60
CACHE_ERROR = 5 * 60
logger = logging.getLogger(__name__)
# Cuántos candidatos se analizan por tipo, empezando por los más operados.
UNIVERSO = {'accion': 30, 'cedear': 40, 'bono': 60, 'letra': 60, 'on': 60}
# Por tipo: (mínimo de analistas, peor caída de 6 meses aceptada, techo de la suba esperada)
FILTROS = {'accion': (3, -0.35, 0.80), 'cedear': (10, -0.30, 0.60)}
CONSENSO = {'strong_buy': 0.05, 'buy': 0.03, 'hold': 0, 'underperform': -0.05, 'sell': -0.08, 'strong_sell': -0.1}
NOMBRE_CONSENSO = {'strong_buy': 'compra fuerte', 'buy': 'compra', 'hold': 'mantener', 'underperform': 'bajo rendimiento', 'sell': 'venta', 'strong_sell': 'venta fuerte'}


def _pct(x):
    return ('+' if x > 0 else '') + ('%.1f' % (x * 100)).replace('.', ',') + ' %'


def _fecha_corta(iso):
    return iso[8:10] + '/' + iso[5:7] + '/' + iso[:4]


def _yahoo(simbolo, tipo):
    clave = 'landgraft:yahoo:' + simbolo
    guardado = cache.get(clave)
    if guardado is not None:
        return guardado
    try:
        datos = yahoo.analizar(*yahoo.tickers(simbolo, tipo))
    except Exception:  # yfinance lanza errores propios además de los de red
        # Un fallo (por ejemplo un límite de pedidos) se recuerda solo 5 minutos, no 6 horas.
        logger.warning('Yahoo Finance falló para %s', simbolo, exc_info=True)
        cache.set(clave, {}, CACHE_ERROR)
        return {}
    cache.set(clave, datos, CACHE_YAHOO if datos.get('precioLocal') else CACHE_ERROR)
    return datos


def _cantidad(precio, tipo):
    if tipo in ('bono', 'letra', 'on'):
        return max(1, round(MONTO_TENTATIVO * 100 / precio))
    return max(1, round(MONTO_TENTATIVO / precio))


def _universo(cotizaciones, tipo):
    """Especies del tipo que cotizan en pesos, de la más operada a la menos."""
    # Renta fija: al menos 45 días al vencimiento; más cerca, la TIR es ruido y no proyecta nada.
    limite = (date.today() + timedelta(days=45)).isoformat()
    filas = [(s, c) for s, c in cotizaciones.items()
             if c['tipo'] == tipo and c.get('monedaCotizacion') == 'ARS'
             and (tipo in ('accion', 'cedear') or (c.get('vence') or '') >= limite)]
    filas.sort(key=lambda x: -(x[1].get('volumen') or 0))
    return filas[:UNIVERSO[tipo]]


def _renta_variable(cotizaciones, tipo):
    candidatos = _universo(cotizaciones, tipo)
    with ThreadPoolExecutor(max_workers=8) as grupo:
        analisis = list(grupo.map(lambda x: _yahoo(x[0], tipo), candidatos))
    elegidos = []
    for (simbolo, c), d in zip(candidatos, analisis):
        minimo, peor_caida, techo = FILTROS[tipo]
        if not d or d.get('upside') is None or (d.get('analistas') or 0) < minimo:
            continue
        if d.get('var6m') is not None and d['var6m'] < peor_caida:
            continue
        confianza = min(d['analistas'], 20) / 20
        tendencia = max(-0.3, min(0.3, d.get('var6m') or 0)) * 0.3
        puntaje = min(d['upside'], techo) * (0.5 + 0.5 * confianza) + CONSENSO.get(d.get('consenso'), 0) + tendencia
        elegidos.append({
            'simbolo': simbolo, 'tipo': tipo, 'precio': c['precio'], 'cantidad': _cantidad(c['precio'], tipo),
            'puntaje': round(puntaje, 4),
            'proyeccion': 'Precio objetivo ' + _pct(d['upside']) + ' a 12 meses según ' + str(d['analistas'])
                          + ' analistas (' + NOMBRE_CONSENSO.get(d.get('consenso'), 'sin consenso') + ', '
                          + d['tickerAnalistas'] + ')' + ('; 6 meses ' + _pct(d['var6m']) if d.get('var6m') is not None else ''),
            'fuente': 'BYMA y Yahoo Finance',
        })
    return sorted(elegidos, key=lambda x: -x['puntaje'])[:POR_TIPO]


def curva_soberana(cotizaciones, mep):
    """Puntos (duration, TIR en USD) de los soberanos ley Nueva York: la referencia de riesgo para las ON."""
    puntos = []
    for s in ('GD29', 'GD30', 'GD35', 'GD38', 'GD41'):
        c = cotizaciones.get(s)
        if not c:
            continue
        try:
            r = byma.analizar_renta_fija(s, c, mep)
        except Exception:
            continue
        if r.get('tir') is not None and r.get('duration'):
            puntos.append((r['duration'], r['tir']))
    return sorted(puntos)


def _interpolar(curva, d):
    if not curva:
        return None
    if d <= curva[0][0]:
        return curva[0][1]
    for (d0, t0), (d1, t1) in zip(curva, curva[1:]):
        if d <= d1:
            return t0 + (t1 - t0) * (d - d0) / (d1 - d0)
    return curva[-1][1]


def _renta_fija(cotizaciones, tipo, mep, referencia_pesos, inflacion, curva):
    candidatos = _universo(cotizaciones, tipo)
    hoy = date.today()

    def analizar(par):
        simbolo, c = par
        try:
            return simbolo, c, byma.analizar_renta_fija(simbolo, c, mep, hoy)
        except Exception:
            logger.warning('No se pudo analizar %s', simbolo, exc_info=True)
            return simbolo, c, None

    with ThreadPoolExecutor(max_workers=8) as grupo:
        resultados = list(grupo.map(analizar, candidatos))
    elegidos, isins = [], set()
    for simbolo, c, r in resultados:
        if not r or r.get('tir') is None or (r.get('isin') and r['isin'] in isins):
            continue
        isins.add(r.get('isin'))
        en_dolares = r.get('tirEnDolares')
        tir = r['tir']
        # TIR extremas suelen ser default o falta de liquidez: no entran.
        if tir <= -0.05 or tir > (0.20 if en_dolares else 1.0):
            continue
        duration = max(r.get('duration') or 0.25, 0.25)
        # El plazo fijo se informa como TNA: se lleva a tasa efectiva anual para comparar con la TIR.
        plazo_fijo = (1 + referencia_pesos * 30 / 365) ** (365 / 30) - 1
        if r.get('tirReal'):
            referencia, nombre_ref = (1 + plazo_fijo) / (1 + inflacion) - 1, 'el plazo fijo en términos reales'
        elif en_dolares:
            soberano = _interpolar(curva, duration) if tipo == 'on' else None
            if soberano is not None:
                referencia, nombre_ref = soberano, 'la curva soberana'
            else:
                referencia, nombre_ref = REFERENCIA_USD, 'la referencia en dólares'
        else:
            referencia, nombre_ref = plazo_fijo, 'el plazo fijo en TEA'
        exceso = tir - referencia
        elegidos.append({
            'simbolo': simbolo, 'tipo': tipo, 'precio': c['precio'], 'cantidad': _cantidad(c['precio'], tipo),
            # Exceso por cada año de duration: cuánto rinde de más por unidad de riesgo de tasa.
            'puntaje': round(exceso / duration, 4),
            'tir': tir, 'tirEnDolares': bool(en_dolares), 'tirReal': bool(r.get('tirReal')), 'duration': r.get('duration'),
            'proyeccion': 'TIR ' + _pct(tir).lstrip('+') + (' real' if r.get('tirReal') else ' en dólares' if en_dolares else '')
                          + ' al vencimiento (' + _fecha_corta(c['vence']) + '), ' + _pct(exceso) + ' sobre ' + nombre_ref
                          + ', duration ' + ('%.1f' % duration).replace('.', ',') + ' años; ' + (r.get('tirMetodo') or ''),
            'fuente': 'BYMA (precio y ficha técnica)',
            'segmento': 'CER' if r.get('tirReal') else 'dólares' if en_dolares else 'tasa fija en pesos',
        })
    # Se elige lo mejor de cada segmento (dólares, CER, tasa fija en pesos) y se alterna: comparar monedas
    # distintas en un solo ranking deja afuera segmentos enteros.
    segmentos = {}
    for x in sorted(elegidos, key=lambda x: -x['puntaje']):
        segmentos.setdefault(x['segmento'], []).append(x)
    orden, resultado = ['dólares', 'CER', 'tasa fija en pesos'], []
    while len(resultado) < POR_TIPO and any(segmentos.get(s) for s in orden):
        for s in orden:
            if segmentos.get(s) and len(resultado) < POR_TIPO:
                resultado.append(segmentos[s].pop(0))
    return resultado


def _progreso(paso, total, texto):
    cache.set(CLAVE_PROGRESO, {'paso': paso, 'total': total, 'texto': texto}, 30 * 60)


def seleccionar(mep, referencia_pesos, inflacion=0.25):
    """Los 10 mejores de cada tipo. Recorre cientos de especies: se llama desde servicio_seleccion, no desde el pedido."""
    _progreso(0, 7, 'Leyendo precios de BYMA')
    cotizaciones = byma.precios()
    resultado = {'leido': datetime.now(timezone.utc).isoformat(), 'tipos': {}, 'criterio': __doc__.strip()}
    nombres = {'accion': 'acciones', 'cedear': 'CEDEAR', 'bono': 'bonos', 'letra': 'letras', 'on': 'ON'}
    for i, tipo in enumerate(('accion', 'cedear')):
        _progreso(1 + i, 7, 'Analizando ' + nombres[tipo] + ' (Yahoo Finance)')
        resultado['tipos'][tipo] = _renta_variable(cotizaciones, tipo)
    _progreso(3, 7, 'Armando la curva soberana')
    curva = curva_soberana(cotizaciones, mep)
    resultado['curvaSoberana'] = curva
    for i, tipo in enumerate(('bono', 'letra', 'on')):
        _progreso(4 + i, 7, 'Calculando TIR de ' + nombres[tipo] + ' (BYMA)')
        resultado['tipos'][tipo] = _renta_fija(cotizaciones, tipo, mep, referencia_pesos, inflacion, curva)
    return resultado
