"""Yahoo Finance (vía yfinance): precio en BYMA, tendencia y consenso de analistas."""
from datetime import datetime, timezone

import yfinance as yf

# Acciones locales con ADR en EE.UU.: los analistas cubren el ADR, no la acción local.
ADR = {
    'GGAL': 'GGAL', 'YPFD': 'YPF', 'PAMP': 'PAM', 'CEPU': 'CEPU', 'BMA': 'BMA', 'SUPV': 'SUPV',
    'BBAR': 'BBAR', 'TGSU2': 'TGS', 'TECO2': 'TEO', 'EDN': 'EDN', 'LOMA': 'LOMA', 'IRSA': 'IRS',
}
# CEDEAR cuyo ticker en EE.UU. no es igual al de BYMA.
CEDEAR_EEUU = {'BRKB': 'BRK-B'}


def tickers(simbolo, tipo):
    """(ticker en BYMA, ticker que cubren los analistas) para una acción o un CEDEAR."""
    if tipo == 'cedear':
        return simbolo + '.BA', CEDEAR_EEUU.get(simbolo, simbolo)
    return simbolo + '.BA', ADR.get(simbolo)


def _variacion(cierres, ruedas):
    if len(cierres) < 2:
        return None
    base = cierres.iloc[max(0, len(cierres) - 1 - ruedas)]
    return round(float(cierres.iloc[-1] / base - 1), 4)


def analizar(local, subyacente):
    """Precio y tendencia del ticker local, y consenso y precio objetivo del que cubren los analistas."""
    datos = {
        'fuente': 'Yahoo Finance', 'ticker': local, 'tickerAnalistas': subyacente or local,
        'leido': datetime.now(timezone.utc).isoformat(),
    }
    cierres = yf.Ticker(local).history(period='1y')['Close'].dropna()
    if len(cierres):
        datos['precioLocal'] = round(float(cierres.iloc[-1]), 2)
        datos['varDia'] = round(float(cierres.iloc[-1] / cierres.iloc[-2] - 1) * 100, 2) if len(cierres) > 1 else None
        datos['var6m'] = _variacion(cierres, 126)
        datos['var1y'] = _variacion(cierres, len(cierres) - 1)
    info = yf.Ticker(subyacente or local).info
    precio = info.get('currentPrice') or info.get('regularMarketPrice')
    objetivo = info.get('targetMeanPrice')
    consenso = info.get('recommendationKey')
    datos['consenso'] = None if consenso in (None, 'none') else consenso
    datos['analistas'] = info.get('numberOfAnalystOpinions')
    datos['upside'] = round(objetivo / precio - 1, 4) if objetivo and precio else None
    datos['per'] = round(info['trailingPE'], 1) if info.get('trailingPE') else None
    datos['nombre'] = info.get('shortName')
    return datos
