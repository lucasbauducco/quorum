"""Riesgo de la cartera medido en dólares MEP, con la historia guardada en la base.

Serie de retornos diarios en USD de cada posición:
- Acciones, CEDEAR y cripto: precio en pesos (Yahoo Finance o CoinGecko) dividido por el MEP de ese día.
- Renta fija en pesos, FCI y caución: devengan su tasa, pero en dólares pierden lo que sube el MEP.
- Bonos y ON en dólares: se mueven con el riesgo país por su duration, más lo que devengan.
- Dólares en caja: cero.
Todo en dólares porque en pesos la inflación esconde el riesgo.
"""
import math

import pandas as pd

from .models import Indicador, PrecioDiario

DIAS = 365  # historia que se mira, en días corridos
RUEDAS_ANIO = 252  # ruedas de mercado por año, para anualizar retornos diarios
TASA_LIBRE_USD = 0.04  # aproximación de una letra del Tesoro de EE.UU.
FIJA_PESOS = ('bono', 'letra', 'on', 'fci', 'caucion')


def _serie_indicador(nombre, desde):
    filas = Indicador.objects.filter(nombre=nombre, fecha__gte=desde).order_by('fecha').values_list('fecha', 'valor')
    return pd.Series({pd.Timestamp(f): v for f, v in filas}, dtype=float)


def _serie_precio(simbolo, desde):
    filas = (PrecioDiario.objects.filter(simbolo=simbolo, fecha__gte=desde, fuente__in=('Yahoo Finance', 'CoinGecko'))
             .order_by('fecha').values_list('fecha', 'cierre'))
    return pd.Series({pd.Timestamp(f): v for f, v in filas}, dtype=float)


def _retornos_posicion(p, mep, riesgo_pais, tasa_pesos):
    """Retornos diarios en USD de una posición, alineados al calendario del MEP. Devuelve (serie, método)."""
    tipo = p.get('tipo')
    en_dolares = p.get('moneda') == 'USD' or p.get('rendEnUsd')
    if tipo in ('accion', 'cedear', 'cripto'):
        precio = _serie_precio(p['simbolo'], mep.index.min())
        if len(precio) >= 60:
            usd = (precio.reindex(mep.index, method='ffill') / mep).dropna()
            return usd.pct_change().dropna(), 'historia de precios'
        return None, 'sin historia de precios'
    if tipo == 'caja':
        return pd.Series(0.0, index=mep.index[1:]), 'dólares en caja'
    if tipo in FIJA_PESOS and en_dolares:
        duration = p.get('duration') or 2.0
        rp = riesgo_pais.reindex(mep.index, method='ffill')
        devengo = (p.get('rend') or 0.08) / 252
        return (-duration * rp.diff() / 10000 + devengo).dropna(), 'riesgo país × duration'
    if tipo in FIJA_PESOS:
        tasa = p.get('rend') if p.get('rend') is not None and not p.get('rendReal') else tasa_pesos
        return ((1 + tasa / 252) / (mep / mep.shift(1)) - 1).dropna(), 'tasa en pesos contra el MEP'
    return None, 'tipo sin modelo de riesgo'


def _max_drawdown(retornos):
    acumulado = (1 + retornos).cumprod()
    return float((acumulado / acumulado.cummax() - 1).min())


INDICE_MERCADO = '^MERV'  # Merval, cargado con la historia de precios (ver historia.ingestar_indice)


def _beta_y_alfa(cartera, mep):
    """Beta, alfa anual (de Jensen) y correlación de la cartera contra el Merval en USD, con retornos diarios.

    Idea tomada de la regresión CAPM de OpenBB: cuánto se mueve la cartera con el mercado y cuánto rinde de más."""
    precio = _serie_precio(INDICE_MERCADO, mep.index.min())
    if len(precio) < 60:
        return None
    mercado = (precio.reindex(mep.index, method='ffill') / mep).dropna().pct_change().dropna()
    alineado = pd.concat([cartera.rename('cartera'), mercado.rename('mercado')], axis=1).dropna()
    if len(alineado) < 60 or alineado['mercado'].var() == 0:
        return None
    beta = alineado['cartera'].cov(alineado['mercado']) / alineado['mercado'].var()
    alfa = (alineado['cartera'].mean() - beta * alineado['mercado'].mean()) * RUEDAS_ANIO
    return {
        'beta': round(float(beta), 2),
        'alfaAnual': round(float(alfa), 4),
        'correlacion': round(float(alineado['cartera'].corr(alineado['mercado'])), 2),
    }


def medir(posiciones, tasa_pesos=0.22):
    """Métricas de riesgo de la cartera y de cada posición. posiciones: [{simbolo, tipo, moneda, valorARS, ...}]."""
    desde = pd.Timestamp.today().normalize() - pd.Timedelta(days=DIAS)
    mep = _serie_indicador('mep', desde.date())
    riesgo_pais = _serie_indicador('riesgo_pais', desde.date())
    if len(mep) < 60:
        return {'error': 'No hay historia del MEP en la base: corré "manage.py cargar_historia".'}

    series, metodos, valores = {}, {}, {}
    for p in posiciones:
        if not p.get('valorARS'):
            continue
        r, metodo = _retornos_posicion(p, mep, riesgo_pais, tasa_pesos)
        metodos[p['simbolo']] = metodo
        if r is not None and len(r) >= 40:
            series[p['simbolo']] = r
            valores[p['simbolo']] = float(p['valorARS'])
    if not series:
        return {'error': 'Ninguna posición tiene historia suficiente para medir el riesgo.'}

    retornos = pd.DataFrame(series).fillna(0.0)
    total = sum(valores.values())
    pesos = pd.Series({s: v / total for s, v in valores.items()})[retornos.columns]
    cartera = retornos @ pesos

    vol = float(cartera.std() * math.sqrt(252))
    media = float(cartera.mean() * 252)
    abajo = cartera[cartera < 0]
    vol_baja = float(abajo.std() * math.sqrt(252)) if len(abajo) > 1 else None
    diez = (1 + cartera).rolling(10).apply(lambda x: x.prod(), raw=True).dropna() - 1
    var = float(-diez.quantile(0.05)) if len(diez) else None
    cvar = float(-diez[diez <= diez.quantile(0.05)].mean()) if len(diez) else None

    covarianza = retornos.cov() * 252
    marginal = covarianza @ pesos
    contribucion = (pesos * marginal) / (vol ** 2) if vol else pesos * 0

    correlacion = retornos.corr()
    pares = []
    nombres = list(retornos.columns)
    for i, a in enumerate(nombres):
        for b in nombres[i + 1:]:
            c = correlacion.loc[a, b]
            if c >= 0.75:
                pares.append({'a': a, 'b': b, 'correlacion': round(float(c), 2)})
    pares.sort(key=lambda x: -x['correlacion'])

    por_posicion = []
    for s in nombres:
        r = retornos[s]
        por_posicion.append({
            'simbolo': s,
            'peso': round(float(pesos[s]), 4),
            'volatilidad': round(float(r.std() * math.sqrt(252)), 4),
            'maxDrawdown': round(_max_drawdown(r), 4),
            'retornoUsd': round(float((1 + r).prod() - 1), 4),
            'contribucionRiesgo': round(float(contribucion[s]), 4),
            'metodo': metodos[s],
        })
    por_posicion.sort(key=lambda x: -x['contribucionRiesgo'])

    mercado = _beta_y_alfa(cartera, mep)
    notas = ['Todo en dólares MEP, con la historia guardada en la base.',
             'Renta fija en dólares: aproximada con el riesgo país y la duration.',
             'Tasa libre de riesgo en dólares: 4 % anual.']
    if mercado:
        notas.append('Beta y alfa frente al Merval en USD, con retornos diarios.')
    return {
        'desde': str(retornos.index.min().date()),
        'hasta': str(retornos.index.max().date()),
        'dias': len(retornos),
        'cartera': {
            'volatilidad': round(vol, 4),
            'retornoAnualizado': round(media, 4),
            'var10d95': round(var, 4) if var is not None else None,
            'cvar10d95': round(cvar, 4) if cvar is not None else None,
            'maxDrawdown': round(_max_drawdown(cartera), 4),
            'sharpe': round((media - TASA_LIBRE_USD) / vol, 2) if vol else None,
            'sortino': round((media - TASA_LIBRE_USD) / vol_baja, 2) if vol_baja else None,
            'beta': mercado['beta'] if mercado else None,
            'alfaAnual': mercado['alfaAnual'] if mercado else None,
            'correlacionMerval': mercado['correlacion'] if mercado else None,
        },
        'posiciones': por_posicion,
        'correlacionAlta': pares[:6],
        'sinMedir': [{'simbolo': s, 'motivo': m} for s, m in metodos.items() if s not in series],
        'notas': notas,
    }


def volatilidades(simbolos):
    """Volatilidad anual en USD de cada símbolo con historia (para el puntaje ajustado por riesgo)."""
    desde = pd.Timestamp.today().normalize() - pd.Timedelta(days=DIAS)
    mep = _serie_indicador('mep', desde.date())
    resultado = {}
    if len(mep) < 60:
        return resultado
    for s in simbolos:
        precio = _serie_precio(s, mep.index.min())
        if len(precio) >= 60:
            usd = (precio.reindex(mep.index, method='ffill') / mep).dropna().pct_change().dropna()
            resultado[s] = round(float(usd.std() * math.sqrt(252)), 4)
    return resultado
