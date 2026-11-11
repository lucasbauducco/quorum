"""Carga de la historia de precios e indicadores en la base (la usan las tareas de Celery y los comandos)."""
import logging
from datetime import date, datetime, timedelta

import requests
import yfinance as yf

from . import byma, yahoo
from .models import Indicador, PrecioDiario

logger = logging.getLogger(__name__)

ARGENTINADATOS = 'https://api.argentinadatos.com/v1'
# Indicador -> (ruta en ArgentinaDatos, campo con el valor)
SERIES = {
    'mep': ('/cotizaciones/dolares/bolsa', 'venta'),
    'ccl': ('/cotizaciones/dolares/contadoconliqui', 'venta'),
    'oficial': ('/cotizaciones/dolares/oficial', 'venta'),
    'riesgo_pais': ('/finanzas/indices/riesgo-pais', 'valor'),
    'uva': ('/finanzas/indices/uva', 'valor'),
    'inflacion_mensual': ('/finanzas/indices/inflacion', 'valor'),
}
CRIPTOS = {'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'BNB': 'binancecoin', 'XRP': 'ripple'}


def _fecha(texto):
    return datetime.strptime(texto[:10], '%Y-%m-%d').date()


def ingestar_indicadores(desde=None):
    """Series históricas de ArgentinaDatos. Devuelve cuántas filas nuevas se guardaron por indicador."""
    desde = desde or date.today() - timedelta(days=3 * 365)
    resumen = {}
    for nombre, (ruta, campo) in SERIES.items():
        try:
            filas = requests.get(ARGENTINADATOS + ruta, timeout=20).json()
        except (requests.RequestException, ValueError):
            logger.warning('No se pudo leer %s', nombre, exc_info=True)
            resumen[nombre] = 'error'
            continue
        nuevos = [Indicador(nombre=nombre, fecha=_fecha(f['fecha']), valor=float(f[campo]), fuente='ArgentinaDatos')
                  for f in filas if f.get(campo) is not None and f.get('fecha') and _fecha(f['fecha']) >= desde]
        antes = Indicador.objects.filter(nombre=nombre).count()
        Indicador.objects.bulk_create(nuevos, ignore_conflicts=True)
        resumen[nombre] = Indicador.objects.filter(nombre=nombre).count() - antes
    # El plazo fijo solo tiene el valor de hoy: se guarda día a día.
    try:
        bancos = requests.get(ARGENTINADATOS + '/finanzas/tasas/plazoFijo', timeout=15).json()
        tnas = [b['tnaClientes'] for b in bancos if b.get('tnaClientes')]
        if tnas:
            Indicador.objects.update_or_create(nombre='plazo_fijo_tna', fecha=date.today(),
                                               defaults={'valor': sum(tnas) / len(tnas), 'fuente': 'ArgentinaDatos (BCRA)'})
            resumen['plazo_fijo_tna'] = 1
    except (requests.RequestException, ValueError):
        resumen['plazo_fijo_tna'] = 'error'
    return resumen


def ingestar_precios_byma():
    """Precio del día de todas las especies de BYMA. Devuelve cuántas se guardaron."""
    cotizaciones = byma.precios()
    hoy = date.today()
    filas = [PrecioDiario(simbolo=s, tipo=c['tipo'], fecha=hoy, cierre=float(c['precio']),
                          moneda='USD' if c.get('monedaCotizacion') in ('USD', 'EXT') else 'ARS',
                          volumen=c.get('volumen'), fuente='BYMA')
             for s, c in cotizaciones.items() if c.get('precio')]
    PrecioDiario.objects.filter(fecha=hoy, fuente='BYMA').delete()
    PrecioDiario.objects.bulk_create(filas, ignore_conflicts=True)
    return len(filas)


def backfill_yahoo(simbolos_tipos, dias=365):
    """Historia diaria en pesos (ticker .BA en Yahoo Finance) de acciones y CEDEAR."""
    guardados = {}
    for simbolo, tipo in simbolos_tipos:
        local, _ = yahoo.tickers(simbolo, tipo)
        try:
            cierres = yf.Ticker(local).history(period=f'{dias}d')['Close'].dropna()
        except Exception:  # yfinance lanza errores propios además de los de red
            logger.warning('Yahoo Finance: sin historia para %s', local, exc_info=True)
            guardados[simbolo] = 0
            continue
        filas = [PrecioDiario(simbolo=simbolo, tipo=tipo, fecha=i.date(), cierre=float(v), moneda='ARS', fuente='Yahoo Finance')
                 for i, v in cierres.items()]
        PrecioDiario.objects.bulk_create(filas, ignore_conflicts=True)
        guardados[simbolo] = len(filas)
    return guardados


def backfill_criptos(dias=365):
    """Historia diaria en pesos de las criptos (CoinGecko)."""
    guardados = {}
    for simbolo, cg in CRIPTOS.items():
        try:
            datos = requests.get(f'https://api.coingecko.com/api/v3/coins/{cg}/market_chart',
                                 params={'vs_currency': 'ars', 'days': dias, 'interval': 'daily'}, timeout=20).json()
        except (requests.RequestException, ValueError):
            guardados[simbolo] = 0
            continue
        filas = [PrecioDiario(simbolo=simbolo, tipo='cripto', fecha=datetime.utcfromtimestamp(ms / 1000).date(),
                              cierre=float(p), moneda='ARS', fuente='CoinGecko')
                 for ms, p in datos.get('prices', [])]
        PrecioDiario.objects.bulk_create(filas, ignore_conflicts=True)
        guardados[simbolo] = len(filas)
    return guardados


def universo_renta_variable(maximo=60):
    """Acciones y CEDEAR más operados en BYMA, para la historia de precios."""
    cotizaciones = byma.precios()
    filas = [(s, c) for s, c in cotizaciones.items()
             if c['tipo'] in ('accion', 'cedear') and c.get('monedaCotizacion') == 'ARS']
    filas.sort(key=lambda x: -(x[1].get('volumen') or 0))
    return [(s, c['tipo']) for s, c in filas[:maximo]]
