"""Pesos contra dólar y tasa fija contra CER: las decisiones centrales de una cartera en Argentina.

- Carry: cuánto tendría que subir el MEP para que una LECAP rinda menos que pasarse a dólares hoy.
- Devaluación implícita: la que descuenta el mercado al comparar los dollar linked con la curva de LECAP.
- Breakeven de inflación: la inflación a partir de la cual un bono CER rinde más que la tasa fija del mismo plazo.
"""
import re
from datetime import date

from . import byma


def _curva_nominal(hoy):
    """Puntos (días al vencimiento, TEA) de las LECAP y BONCAP que publica ArgentinaDatos."""
    puntos = []
    for ticker, l in (byma._seguro(byma.letras) or {}).items():
        if not l.get('vence'):
            continue
        dias = (date.fromisoformat(l['vence'][:10]) - hoy).days
        # Las letras dollar linked traen una TEA en pesos sin sentido (negativa o enorme): no son parte de la curva nominal.
        if dias > 7 and 0.05 < l['tea'] < 1.0:
            puntos.append((dias, l['tea'], ticker))
    return sorted(puntos)


def _tea_en(curva, dias):
    """TEA interpolada para un plazo; fuera de la curva, el extremo más cercano."""
    if not curva:
        return None
    if dias <= curva[0][0]:
        return curva[0][1]
    for (d0, t0, _), (d1, t1, _) in zip(curva, curva[1:]):
        if dias <= d1:
            return t0 + (t1 - t0) * (dias - d0) / (d1 - d0)
    return curva[-1][1]


def _pct(x):
    return ('%.1f' % (x * 100)).replace('.', ',') + ' %'


def analizar(mep, oficial, inflacion_esperada, hoy=None):
    hoy = hoy or date.today()
    curva = _curva_nominal(hoy)
    if not curva:
        return {'error': 'No se pudo leer la curva de LECAP.'}
    cotizaciones = byma._seguro(byma.precios) or {}

    # Carry: LECAP a ~6 meses contra pasarse a dólares MEP.
    objetivo = min(curva, key=lambda p: abs(p[0] - 180))
    dias, tea, ticker = objetivo
    factor = (1 + tea) ** (dias / 365)
    carry = {
        'lecap': ticker, 'dias': dias, 'tea': round(tea, 4),
        'mepHoy': mep, 'mepEquilibrio': round(mep * factor, 1), 'subaEquilibrio': round(factor - 1, 4),
    }

    # Devaluación implícita del oficial en los dollar linked (letras D...).
    implicita = []
    liq = byma.liquidacion(hoy, '2')
    for s, c in cotizaciones.items():
        if c.get('tipo') != 'letra' or c.get('monedaCotizacion') != 'ARS' or not re.match(r'^D\d', s) or not c.get('vence'):
            continue
        d = (date.fromisoformat(c['vence'][:10]) - liq).days
        tea_d = _tea_en(curva, d)
        if d <= 7 or tea_d is None or not oficial:
            continue
        tipo_cambio = c['precio'] * (1 + tea_d) ** (d / 365) / 100
        total = tipo_cambio / oficial - 1
        if -0.2 < total < 2:
            implicita.append({'simbolo': s, 'vence': c['vence'][:10], 'dias': d, 'tipoCambio': round(tipo_cambio, 1),
                              'devaluacion': round(total, 4), 'anual': round((1 + total) ** (365 / d) - 1, 4)})
    implicita.sort(key=lambda x: x['dias'])

    # Breakeven de inflación: CER cero cupón contra la tasa fija del mismo plazo.
    breakeven = []
    for s, c in cotizaciones.items():
        if not s.startswith('TZX') or c.get('monedaCotizacion') != 'ARS' or not c.get('vence'):
            continue
        try:
            r = byma.analizar_renta_fija(s, c, mep, hoy)
        except Exception:
            continue
        if r.get('tir') is None or not r.get('tirReal'):
            continue
        d = (date.fromisoformat(c['vence'][:10]) - liq).days
        tea_d = _tea_en(curva, d)
        if tea_d is None or d <= 30:
            continue
        breakeven.append({'simbolo': s, 'vence': c['vence'][:10], 'dias': d, 'tirReal': r['tir'], 'tasaFija': round(tea_d, 4),
                          'breakeven': round((1 + tea_d) / (1 + r['tir']) - 1, 4)})
    breakeven.sort(key=lambda x: x['dias'])

    conclusiones = [
        'Carry: la ' + ticker + ' rinde ' + _pct(tea) + ' anual a ' + str(dias) + ' días. Para que pasarse a dólares fuera mejor, '
        'el MEP tendría que subir más de ' + _pct(carry['subaEquilibrio']) + ' (de ' + str(round(mep)) + ' a '
        + str(round(carry['mepEquilibrio'])) + ') en ese plazo.'
    ]
    cercana = min(implicita, key=lambda x: abs(x['dias'] - dias)) if implicita else None
    if cercana:
        conclusiones.append('El mercado descuenta una suba del dólar oficial de ' + _pct(cercana['devaluacion']) + ' hasta el '
                            + cercana['vence'] + ' (' + cercana['simbolo'] + ', ' + _pct(cercana['anual']) + ' anual).')
    if breakeven:
        b = min(breakeven, key=lambda x: abs(x['dias'] - 365))
        mejor = 'la tasa fija' if inflacion_esperada < b['breakeven'] else 'el CER'
        conclusiones.append('Tasa fija contra CER a ' + str(b['dias']) + ' días (' + b['simbolo'] + '): el breakeven de inflación es '
                            + _pct(b['breakeven']) + ' anual. Con la inflación esperada de ' + _pct(inflacion_esperada)
                            + ' (últimos 3 meses anualizados) conviene ' + mejor + '.')
    return {
        'curvaNominal': [{'dias': d, 'tea': round(t, 4), 'simbolo': k} for d, t, k in curva],
        'carry': carry,
        'devaluacionImplicita': implicita,
        'breakevenInflacion': breakeven,
        'inflacionEsperada': inflacion_esperada,
        'conclusiones': conclusiones,
        'notas': ['Señales del mercado para decidir la pata en pesos; no son una proyección propia.'],
    }
