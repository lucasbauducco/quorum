import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests
from django.core.cache import cache
import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_http_methods
from django.views.generic import TemplateView

from . import byma, seleccion, servicio_seleccion, yahoo
from .models import Documento

DOLAR_URL = 'https://dolarapi.com/v1/dolares'
CRIPTO_URL = 'https://api.coingecko.com/api/v3/simple/price'
CRIPTO_MERCADOS_URL = 'https://api.coingecko.com/api/v3/coins/markets'
# Tasas de plazo fijo (BCRA) e inflación mensual (INDEC), publicadas por ArgentinaDatos.
TASAS_URL = 'https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo'
INFLACION_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion'

# Símbolo en Landgraft -> id en CoinGecko
CRIPTOS = {'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'BNB': 'binancecoin', 'XRP': 'ripple'}
CACHE_MERCADO = 60
CACHE_ANALISIS = 30 * 60
logger = logging.getLogger(__name__)
SIMBOLO = re.compile(r'^[A-Z0-9.-]{1,12}$')
ERRORES_RED = (requests.RequestException, KeyError, ValueError, TypeError, IndexError, ZeroDivisionError)


class ComiteView(TemplateView):
    template_name = 'landgraft/index.html'


def _ahora():
    return datetime.now(timezone.utc).isoformat()


def _fraccion(valor):
    return None if valor is None else round(valor / 100, 4)


# Mercado: dólar, criptos y tasas

def _leer_dolar():
    casas = {c['casa']: c for c in requests.get(DOLAR_URL, timeout=8).json()}
    return {
        'oficial': casas['oficial']['venta'],
        'mep': casas['bolsa']['venta'],
        'ccl': casas['contadoconliqui']['venta'],
        'fecha': casas['bolsa'].get('fechaActualizacion'),
    }


def _leer_cripto():
    datos = requests.get(
        CRIPTO_URL,
        params={'ids': ','.join(CRIPTOS.values()), 'vs_currencies': 'ars', 'include_24hr_change': 'true'},
        timeout=8,
    ).json()
    return {
        simbolo: {'precio': datos[cg]['ars'], 'varDia': round(datos[cg].get('ars_24h_change', 0), 2)}
        for simbolo, cg in CRIPTOS.items() if cg in datos
    }


def _leer_tasas():
    bancos = requests.get(TASAS_URL, timeout=8).json()
    tnas = [b['tnaClientes'] for b in bancos if b.get('tnaClientes')]
    meses = requests.get(INFLACION_URL, timeout=8).json()[-12:]
    acumulada = 1
    for m in meses:
        acumulada *= 1 + m['valor'] / 100
    # La inflación esperada se aproxima con los últimos 3 meses anualizados: refleja mejor la tendencia actual
    # que los últimos 12 meses, que arrastran meses de inflación más alta.
    trimestre = 1
    for m in meses[-3:]:
        trimestre *= 1 + m['valor'] / 100
    return {
        'plazoFijo': round(sum(tnas) / len(tnas), 4),
        'bancos': len(tnas),
        'inflacion12m': round(acumulada - 1, 4),
        'inflacionEsperada': round(trimestre ** 4 - 1, 4),
        'inflacionHasta': meses[-1]['fecha'],
    }


def mercado(request):
    """Dólar, criptos y tasas en vivo. Cada fuente falla por separado."""
    respuesta = cache.get('landgraft:mercado')
    if respuesta is None:
        respuesta = {'leido': _ahora(), 'fuentes': {}}
        for clave, lector in (('dolar', _leer_dolar), ('cripto', _leer_cripto), ('tasas', _leer_tasas)):
            try:
                respuesta[clave] = lector()
                respuesta['fuentes'][clave] = {'ok': True}
            except ERRORES_RED as e:
                respuesta[clave] = None
                respuesta['fuentes'][clave] = {'ok': False, 'error': type(e).__name__}
        cache.set('landgraft:mercado', respuesta, CACHE_MERCADO)
    return JsonResponse(respuesta)


# Análisis por activo

def _analizar_criptos(simbolos):
    ids = {CRIPTOS[s]: s for s in simbolos}
    filas = requests.get(
        CRIPTO_MERCADOS_URL,
        params={'vs_currency': 'ars', 'ids': ','.join(ids), 'price_change_percentage': '30d,1y'},
        timeout=8,
    ).json()
    resultado = {}
    for f in filas:
        resultado[ids[f['id']]] = {
            'fuente': 'CoinGecko',
            'ticker': f['id'],
            'leido': _ahora(),
            'precioLocal': f['current_price'],
            'varDia': round(f.get('price_change_percentage_24h') or 0, 2),
            'var30d': _fraccion(f.get('price_change_percentage_30d_in_currency')),
            'var1y': _fraccion(f.get('price_change_percentage_1y_in_currency')),
        }
    return resultado


def _yahoo_seguro(simbolo, tipo):
    try:
        return simbolo, yahoo.analizar(*yahoo.tickers(simbolo, tipo)), None
    except Exception as e:  # yfinance lanza errores propios además de los de red
        logger.warning('Yahoo Finance falló para %s', simbolo, exc_info=True)
        return simbolo, None, type(e).__name__


def analisis(request):
    """Información financiera por activo: BYMA (precio y TIR), Yahoo Finance (analistas y tendencia) y CoinGecko."""
    # Solo símbolos con forma válida, y un máximo por pedido para no usar el servidor como proxy masivo.
    pedidos = [s for s in request.GET.get('simbolos', '').upper().split(',') if SIMBOLO.match(s)][:60]
    activos, errores = {}, {}
    cotizaciones = byma._seguro(byma.precios) or {}

    # Acciones y CEDEAR: Yahoo Finance, con el tipo que informa BYMA.
    renta_variable, criptos = [], []
    for s in pedidos:
        guardado = cache.get('landgraft:analisis:' + s)
        if guardado is not None:
            activos[s] = guardado
        elif s in CRIPTOS:
            criptos.append(s)
        elif (cotizaciones.get(s) or {}).get('tipo') in ('accion', 'cedear'):
            renta_variable.append(s)
    with ThreadPoolExecutor(max_workers=8) as grupo:
        for simbolo, datos, error in grupo.map(lambda s: _yahoo_seguro(s, cotizaciones[s]['tipo']), renta_variable):
            if datos:
                activos[simbolo] = datos
                cache.set('landgraft:analisis:' + simbolo, datos, CACHE_ANALISIS)
            else:
                errores[simbolo] = error

    if criptos:
        try:
            for simbolo, datos in _analizar_criptos(criptos).items():
                activos[simbolo] = datos
                cache.set('landgraft:analisis:' + simbolo, datos, CACHE_ANALISIS)
        except ERRORES_RED as e:
            for s in criptos:
                errores[s] = type(e).__name__

    # BYMA: precio oficial del día para todo lo que cotiza en Argentina, y TIR de bonos, letras y ON.
    locales = [s for s in pedidos if s in cotizaciones]
    mep = None
    if any(cotizaciones[s]['tipo'] in ('bono', 'letra', 'on') for s in locales):
        try:
            mep = _leer_dolar()['mep']
        except ERRORES_RED:
            mep = None
    for s in locales:
        c = cotizaciones[s]
        datos = dict(activos.get(s) or {'ticker': s, 'leido': _ahora()})
        datos['fuente'] = 'BYMA' if 'fuente' not in datos else 'BYMA y ' + datos['fuente']
        datos.update(precioLocal=c['precio'], varDia=c['varDia'], vence=c['vence'], tipoByma=c['tipo'])
        if c['tipo'] in ('bono', 'letra', 'on'):
            try:
                datos.update(byma.analizar_renta_fija(s, c, mep))
            except ERRORES_RED:
                datos['tirMetodo'] = 'sin TIR: no se pudo leer la ficha técnica'
        activos[s] = datos
    sin_fuente = [s for s in pedidos if s not in activos]
    return JsonResponse({'leido': _ahora(), 'activos': activos, 'errores': errores, 'sinFuente': sin_fuente})


def seleccion_view(request):
    """Último resultado del screener. Si tiene más de 6 horas (o no hay), se recalcula en segundo plano
    y se informa el progreso; mientras tanto se devuelve el anterior, si existe."""
    ultima = servicio_seleccion.ultima()
    if not servicio_seleccion.vigente(ultima) or request.GET.get('recalcular') == '1':
        servicio_seleccion.calcular_en_segundo_plano()
    respuesta = {
        'calculando': servicio_seleccion.en_curso(),
        'progreso': cache.get(seleccion.CLAVE_PROGRESO),
        'calculada': ultima.calculada.isoformat() if ultima else None,
    }
    if ultima:
        respuesta.update(ultima.resultado)
    return JsonResponse(respuesta, status=200 if ultima else 202)


# Sesión y datos del usuario: con sesión iniciada, la app guarda en la base en vez de en el navegador.

CLAVE_DOC = re.compile(r'^[a-zA-Z0-9_.:-]{1,120}$')


def sesion(request):
    usuario = request.user
    return JsonResponse({
        'autenticado': usuario.is_authenticated,
        'usuario': usuario.get_username() if usuario.is_authenticated else None,
        'csrf': get_token(request),
    })


@login_required
@require_http_methods(['GET', 'PUT', 'DELETE'])
def datos(request, clave):
    if not CLAVE_DOC.match(clave):
        return JsonResponse({'error': 'Clave inválida.'}, status=400)
    if request.method == 'GET':
        doc = Documento.objects.filter(usuario=request.user, clave=clave).first()
        if doc is None:
            return JsonResponse({'error': 'Sin datos.'}, status=404)
        return JsonResponse({'valor': doc.valor, 'actualizado': doc.actualizado.isoformat()})
    if request.method == 'DELETE':
        Documento.objects.filter(usuario=request.user, clave=clave).delete()
        return JsonResponse({'ok': True})
    if len(request.body) > 2 * 1024 * 1024:
        return JsonResponse({'error': 'El dato supera 2 MB.'}, status=413)
    try:
        valor = json.loads(request.body or b'null').get('valor')
    except (ValueError, AttributeError):
        return JsonResponse({'error': 'Se esperaba JSON con el campo "valor".'}, status=400)
    doc, _ = Documento.objects.update_or_create(usuario=request.user, clave=clave, defaults={'valor': valor})
    return JsonResponse({'ok': True, 'actualizado': doc.actualizado.isoformat()})
