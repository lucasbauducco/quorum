"""Datos abiertos de BYMA (open.bymadata.com.ar): precios del día, fichas técnicas y la TIR que se deriva de ellas."""
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

import requests
from django.core.cache import cache

SITIO = 'https://open.bymadata.com.ar'
BASE = SITIO + '/vanoms-be-core/rest/api/bymadata/free'
HEADERS = {'Origin': SITIO, 'Content-Type': 'application/json'}
# Panel de BYMA -> tipo de instrumento en Landgraft
PANELES = {
    'public-bonds': 'bono',
    'lebacs': 'letra',
    'negociable-obligations': 'on',
    'leading-equity': 'accion',
    'general-equity': 'accion',
    'cedears': 'cedear',
}
TAMANO_PAGINA = 500
CACHE_PRECIOS = 5 * 60
CACHE_FICHA = 24 * 60 * 60
logger = logging.getLogger(__name__)


def _post(ruta, cuerpo):
    r = requests.post(BASE + '/' + ruta, json=cuerpo, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json()


def _panel(nombre):
    """Todas las especies de un panel, página por página. Sin el plazo T0/T1 algunos paneles vienen vacíos."""
    filas, pagina = [], 1
    while pagina <= 10:
        datos = _post(nombre, {'page_number': pagina, 'page_size': TAMANO_PAGINA, 'excludeZeroPxAndQty': False,
                               'T2': True, 'T1': True, 'T0': True})
        lote = datos if isinstance(datos, list) else datos.get('data', [])
        filas.extend(lote)
        if isinstance(datos, list) or len(lote) < TAMANO_PAGINA:
            break
        pagina += 1
    return filas


def precios():
    """Último precio de cada especie, priorizando el plazo de 24 h. Se guarda 5 minutos."""
    guardado = cache.get('landgraft:byma:precios')
    if guardado is not None:
        return guardado
    resultado = {}
    with ThreadPoolExecutor(max_workers=6) as grupo:
        lotes = list(grupo.map(lambda p: (p, _seguro(_panel, p)), PANELES))
    for panel, filas in lotes:
        for f in filas or []:
            precio = f.get('trade') or f.get('closingPrice') or f.get('previousClosingPrice')
            if not precio:
                continue
            actual = resultado.get(f['symbol'])
            if actual and actual['plazo'] == '2' and f.get('settlementType') != '2':
                continue
            anterior = f.get('previousClosingPrice')
            resultado[f['symbol']] = {
                'precio': precio,
                'varDia': round((precio / anterior - 1) * 100, 2) if anterior else None,
                'plazo': f.get('settlementType'),
                'vence': f.get('maturityDate'),
                'monedaCotizacion': f.get('denominationCcy'),
                'volumen': f.get('volumeAmount') or 0,
                'tipo': PANELES[panel],
            }
    if resultado:
        cache.set('landgraft:byma:precios', resultado, CACHE_PRECIOS)
    return resultado


def _seguro(funcion, *args):
    try:
        return funcion(*args)
    except (requests.RequestException, ValueError, KeyError, TypeError):
        logger.warning('BYMA: falló %s', getattr(funcion, '__name__', funcion), exc_info=True)
        return None


def ficha(simbolo):
    """Ficha técnica de la especie (tasa, amortización, fechas). Se guarda un día."""
    clave = 'landgraft:byma:ficha:' + simbolo
    guardada = cache.get(clave)
    if guardada is not None:
        return guardada
    datos = (_post('bnown/fichatecnica/especies/general', {'symbol': simbolo}).get('data') or [{}])[0]
    # Una ficha vacía puede ser un fallo pasajero: se guarda poco tiempo.
    cache.set(clave, datos, CACHE_FICHA if datos else 10 * 60)
    return datos


# TIR
#
# Convenciones (BYMA): el precio en pantalla es LIMPIO y cada 100 nominales originales. Lo que se paga es el
# precio SUCIO = limpio + cupón corrido. La TIR se calcula sobre el sucio y se descuenta desde la fecha de
# liquidación (24 h = próximo día hábil). Los bonos que capitalizan o son cero cupón no tienen cupón corrido.

def _fecha(texto):
    return datetime.strptime(texto[:10], '%Y-%m-%d').date()


def _sumar_meses(f, meses):
    total = f.year * 12 + f.month - 1 + meses
    anio, mes = divmod(total, 12)
    return date(anio, mes + 1, min(f.day, 28 if mes + 1 == 2 else 30 if mes + 1 in (4, 6, 9, 11) else 31))


def liquidacion(hoy, plazo):
    """Fecha de liquidación: contado inmediato el mismo día; 24 h, el próximo día hábil (sin feriados)."""
    if plazo != '2':
        return hoy
    f = hoy + timedelta(days=1)
    while f.weekday() >= 5:
        f += timedelta(days=1)
    return f


# Soberanos de la reestructuración 2020 (ley local AL/AE y ley NY GD), cada 100 nominales originales.
# Pagan el 9/1 y el 9/7. 'tasas': (desde, tasa anual) vigente desde esa fecha. 'amortiza': (primera fecha, cuotas, % de cada una).
SOBERANOS = {
    '29': {'vence': date(2029, 7, 9), 'tasas': [(date(2020, 9, 4), 0.01)], 'amortiza': [(date(2025, 1, 9), 10, 10.0)]},
    '30': {'vence': date(2030, 7, 9), 'tasas': [(date(2023, 7, 9), 0.0075), (date(2027, 7, 9), 0.0175)],
           'amortiza': [(date(2024, 7, 9), 1, 4.0), (date(2025, 1, 9), 12, 8.0)]},
    '35': {'vence': date(2035, 7, 9), 'tasas': [(date(2024, 7, 9), 0.04125), (date(2027, 7, 9), 0.0475), (date(2028, 7, 9), 0.05)],
           'amortiza': [(date(2031, 1, 9), 10, 10.0)]},
    '38': {'vence': date(2038, 1, 9), 'tasas': [(date(2024, 7, 9), 0.05)], 'amortiza': [(date(2027, 7, 9), 22, 100 / 22)]},
    '41': {'vence': date(2041, 7, 9), 'tasas': [(date(2022, 7, 9), 0.035), (date(2029, 7, 9), 0.04875)],
           'amortiza': [(date(2028, 1, 9), 28, 100 / 28)]},
}
FAMILIA_SOBERANO = re.compile(r'^(?:AL|GD|AE)(29|30|35|38|41)[DC]?$')


def _flujos_soberano(familia, liq):
    """Flujos futuros y cupón corrido de un soberano AL/GD/AE, cada 100 nominales originales."""
    b = SOBERANOS[familia]
    amortizaciones = {}
    for inicio, cuotas, porcentaje in b['amortiza']:
        for k in range(cuotas):
            f = _sumar_meses(inicio, 6 * k)
            amortizaciones[f] = amortizaciones.get(f, 0) + porcentaje
    fechas = sorted({_sumar_meses(b['vence'], -6 * k) for k in range(0, 40)})
    residual = 100.0
    flujos_, corrido = [], 0.0
    anterior = None
    for f in fechas:
        if anterior is None:
            anterior = f
            continue
        tasa = [t for desde, t in b['tasas'] if desde <= anterior][-1] if any(desde <= anterior for desde, _ in b['tasas']) else 0
        cupon = residual * tasa / 2
        amort = amortizaciones.get(f, 0)
        if f > liq:
            if anterior <= liq:
                corrido = cupon * (liq - anterior).days / (f - anterior).days
            flujos_.append((f, cupon + amort))
        residual -= amort
        anterior = f
    return flujos_, corrido


def flujos(datos, liq, simbolo=''):
    """(flujos futuros cada 100 nominales, cupón corrido, método) si se puede interpretar; si no, None."""
    familia = FAMILIA_SOBERANO.match(simbolo)
    if familia:
        f, corrido = _flujos_soberano(familia.group(1), liq)
        return (f, corrido, 'cronograma del soberano ' + familia.group(1)) if f else None
    texto = datos.get('interes') or ''
    amortizacion = datos.get('formaAmortizacion') or ''
    # Solo títulos que devuelven el capital en un pago: los que amortizan en cuotas no traen el cronograma.
    if not re.search(r'vencimiento', amortizacion, re.I) or re.search(r'cuota|%', amortizacion, re.I):
        return None
    vence = _fecha(datos['fechaVencimiento'])
    if vence <= liq:
        return None
    tem = re.search(r'efectiva mensual:?\s*([\d.,]+)\s*%', texto, re.I)
    referencia = (_seguro(letras) or {}).get(simbolo)
    if referencia and referencia.get('precio') and (tem or re.search(r'capitaliz', texto, re.I)):
        # En las reaperturas la fecha de emisión de la ficha no es la de inicio de capitalización:
        # el pago final se deriva del precio y la TEA que publica ArgentinaDatos.
        final = referencia['precio'] * (1 + referencia['tea']) ** ((vence - liq).days / 365)
        return [(vence, final)], 0.0, 'capitalizable, pago final según ArgentinaDatos'
    if tem:
        meses = (vence - _fecha(datos['fechaEmision'])).days / (365 / 12)
        tasa = float(tem.group(1).replace(',', '.')) / 100
        return [(vence, 100 * (1 + tasa) ** meses)], 0.0, 'capitaliza ' + tem.group(1) + ' % mensual'
    # "Tasa fija del 7,50% nominal anual", "FIJO 7,750%", "8.75% anual, pagos semestrales"
    fija = (re.search(r'fij[oa][^\d%]{0,20}([\d]+[.,]?\d*)\s*%', texto, re.I)
            or re.search(r'([\d]+[.,]?\d*)\s*%\s*(?:nominal\s+)?anual', texto, re.I))
    if fija and not re.search(r'cero cup[oó]n|variable|badlar|tamar|cer\b', texto, re.I):
        tasa = float(fija.group(1).replace(',', '.')) / 100
        # Sin frecuencia en la ficha se asume semestral, lo habitual en ON y bonos.
        frecuencia = 4 if re.search('trimestral', texto, re.I) else 12 if re.search('mensual', texto, re.I) else 1 if re.search('pagos? anual', texto, re.I) else 2
        paso = 12 // frecuencia
        fechas, k = [], 0
        while True:
            f = _sumar_meses(vence, -paso * k)
            if f <= liq:
                ultimo = f
                break
            fechas.append(f)
            k += 1
        emision = _fecha(datos['fechaEmision']) if datos.get('fechaEmision') else ultimo
        ultimo = max(ultimo, emision)
        primero = min(fechas)
        cupon = 100 * tasa / frecuencia
        corrido = cupon * (liq - ultimo).days / max(1, (primero - ultimo).days)
        return [(f, cupon + (100 if f == vence else 0)) for f in sorted(fechas)], corrido, 'tasa fija ' + fija.group(1) + ' %'
    return None


def _valor_presente(flujos_, r, liq):
    return sum(m / (1 + r) ** ((f - liq).days / 365) for f, m in flujos_)


def tir(flujos_, precio, liq):
    """Tasa efectiva anual que iguala los flujos al precio sucio (cada 100 nominales), por bisección."""
    bajo, alto = -0.9, 10.0
    if not _valor_presente(flujos_, bajo, liq) > precio > _valor_presente(flujos_, alto, liq):
        return None
    for _ in range(120):
        medio = (bajo + alto) / 2
        if _valor_presente(flujos_, medio, liq) > precio:
            bajo = medio
        else:
            alto = medio
    return round((bajo + alto) / 2, 4)


def duration_modificada(flujos_, r, liq):
    """Duration modificada en años: cuánto cae el precio (%) si la tasa sube un punto."""
    pesos = [((f - liq).days / 365, m / (1 + r) ** ((f - liq).days / 365)) for f, m in flujos_]
    total = sum(p for _, p in pesos)
    if not total:
        return None
    return round(sum(t * p for t, p in pesos) / total / (1 + r), 2)


LETRAS_URL = 'https://api.argentinadatos.com/v1/finanzas/letras'
UVA_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/uva'


def letras():
    """LECAP y BONCAP con su TEA y TEM calculadas (ArgentinaDatos): las fichas de BYMA no traen la tasa."""
    guardadas = cache.get('landgraft:letras')
    if guardadas is not None:
        return guardadas
    filas = requests.get(LETRAS_URL, timeout=10).json().get('letras', [])
    resultado = {f['ticker']: {'tea': f['teaPorcentaje'] / 100, 'tem': f.get('temPorcentaje'), 'vence': f.get('fechaVencimiento'),
                               'precio': f.get('precioArs')}
                 for f in filas if f.get('teaPorcentaje') is not None}
    cache.set('landgraft:letras', resultado, CACHE_PRECIOS)
    return resultado


def uva():
    """Serie diaria de UVA (proporcional al CER), para bonos ajustados por inflación. Se guarda 6 horas."""
    guardada = cache.get('landgraft:uva')
    if guardada is not None:
        return guardada
    serie = {f['fecha']: f['valor'] for f in requests.get(UVA_URL, timeout=15).json()}
    cache.set('landgraft:uva', serie, 6 * 60 * 60)
    return serie


def _uva_en(serie, f):
    """Último valor de UVA disponible hasta la fecha f."""
    for k in range(0, 15):
        v = serie.get((f - timedelta(days=k)).isoformat())
        if v:
            return v
    return None


def _cer_cero_cupon(datos, simbolo, cotizacion, liq):
    """TIR real de un bono CER cero cupón (BONCER TZX): paga 100 ajustado por CER al vencimiento."""
    texto = ' '.join([datos.get('interes') or '', datos.get('denominacion') or '', datos.get('formaAmortizacion') or ''])
    if not re.search(r'\bCER\b|ajust', texto, re.I) or not re.search(r'cero cup[oó]n', texto, re.I):
        return None
    if not datos.get('fechaEmision') or not datos.get('fechaVencimiento') or cotizacion.get('monedaCotizacion') != 'ARS':
        return None
    serie = uva()
    # El CER se aplica con 10 días hábiles de rezago: se aproxima con 14 días corridos.
    base = _uva_en(serie, _fecha(datos['fechaEmision']) - timedelta(days=14))
    actual = _uva_en(serie, liq - timedelta(days=14))
    vence = _fecha(datos['fechaVencimiento'])
    if not base or not actual or vence <= liq:
        return None
    capital_ajustado = 100 * actual / base
    real = (capital_ajustado / cotizacion['precio']) ** (365 / (vence - liq).days) - 1
    return round(real, 4), round((vence - liq).days / 365 / (1 + real), 2)


def _precio_en_dolares(simbolo, cotizacion, mep):
    """Precio en USD de un título en dólares que cotiza en pesos: la especie D si existe, si no el MEP."""
    candidatos = [simbolo[:-1] + 'D'] if simbolo.endswith('O') else []
    candidatos.append(simbolo + 'D')
    precios_ = _seguro(precios) or {}
    for c in candidatos:
        d = precios_.get(c)
        if d and d.get('monedaCotizacion') in ('USD', 'EXT') and d.get('precio'):
            return d['precio'], 'especie ' + c
    if mep:
        return cotizacion['precio'] / mep, 'MEP'
    return None, None


def analizar_renta_fija(simbolo, cotizacion, mep, hoy=None):
    """Precio, TIR (sobre precio sucio), duration y método de un bono, letra u ON."""
    hoy = hoy or date.today()
    liq = liquidacion(hoy, cotizacion.get('plazo'))
    datos = ficha(simbolo)
    resultado = {
        'denominacion': datos.get('denominacion'),
        'monedaEmision': datos.get('moneda'),
        'amortizacion': datos.get('formaAmortizacion'),
        'tir': None,
        'tirMetodo': None,
        'tirReal': False,
        'duration': None,
        'isin': datos.get('codigoIsin'),
    }
    calculo = flujos(datos, liq, simbolo) if (datos.get('fechaVencimiento') or FAMILIA_SOBERANO.match(simbolo)) else None
    if not calculo:
        lecap = (_seguro(letras) or {}).get(simbolo)
        if lecap:
            dias = (_fecha(lecap['vence']) - liq).days if lecap.get('vence') else None
            resultado.update(tir=round(lecap['tea'], 4), tirEnDolares=False,
                             duration=round(dias / 365 / (1 + lecap['tea']), 2) if dias and dias > 0 else None,
                             tirMetodo='LECAP, TEM ' + str(lecap['tem']).replace('.', ',') + ' % (ArgentinaDatos)')
            return resultado
        cer = None
        try:
            cer = _cer_cero_cupon(datos, simbolo, cotizacion, liq)
        except (requests.RequestException, ValueError, KeyError, TypeError, ZeroDivisionError):
            logger.warning('No se pudo calcular CER para %s', simbolo, exc_info=True)
        if cer:
            resultado.update(tir=cer[0], duration=cer[1], tirReal=True, tirEnDolares=False,
                             tirMetodo='CER cero cupón: TIR real sobre inflación (UVA de ArgentinaDatos)')
            return resultado
        resultado['tirMetodo'] = 'sin TIR: la ficha no trae un cronograma que se pueda calcular'
        return resultado
    flujos_, corrido, metodo = calculo
    en_dolares = bool(FAMILIA_SOBERANO.match(simbolo)) or (datos.get('moneda') or '').lower().startswith('d')
    precio = cotizacion['precio']
    if en_dolares and cotizacion.get('monedaCotizacion') == 'ARS':
        precio, origen = _precio_en_dolares(simbolo, cotizacion, mep)
        if precio is None:
            return resultado
        metodo += ', precio en USD por ' + origen
    sucio = precio + corrido
    t = tir(flujos_, sucio, liq)
    resultado.update(tir=t, tirMetodo=metodo + ', sobre precio sucio', tirEnDolares=en_dolares,
                     cuponCorrido=round(corrido, 3), precioSucio=round(sucio, 3),
                     duration=duration_modificada(flujos_, t, liq) if t is not None else None)
    return resultado
