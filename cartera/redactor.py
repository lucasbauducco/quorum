import json
import logging

import anthropic
from django.conf import settings

logger = logging.getLogger(__name__)

NOMBRE_TIPO = {'diario': 'diario', 'mensual': 'mensual', 'anual': 'anual'}

SYSTEM_PROMPT = """Sos un analista que redacta informes de una cartera de inversión en español.
Reglas:
- Usá solo las cifras del JSON que recibís. No inventes ni recalcules números.
- Si un campo es null, o aparece en "advertencias", decilo explícitamente.
- No recomiendes comprar ni vender.
- Estructura: resumen del periodo, rendimiento, composición y posiciones destacadas.
- Máximo 250 palabras, texto corrido con breves subtítulos."""


def generar_texto(datos, tipo):
    """Redacta el informe con Claude. Si no hay API key o falla la llamada, usa la plantilla."""
    if not settings.ANTHROPIC_API_KEY:
        return texto_plantilla(datos, tipo)
    try:
        cliente = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        respuesta = cliente.messages.create(
            model=settings.CARTERA_MODELO_REDACTOR,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{
                'role': 'user',
                'content': f"Tipo de informe: {NOMBRE_TIPO[tipo]}\nDatos:\n{json.dumps(datos, ensure_ascii=False)}",
            }],
        )
        return ''.join(bloque.text for bloque in respuesta.content if bloque.type == 'text')
    except anthropic.APIError:
        logger.exception('Falló la redacción con Claude; se usa la plantilla.')
        return texto_plantilla(datos, tipo)


def texto_plantilla(datos, tipo):
    lineas = [
        f"Informe {NOMBRE_TIPO[tipo]} de {datos['cartera']} ({datos['desde']} a {datos['hasta']}).",
        f"Valor al cierre: {_fmt(datos['valor_fin'])} {datos['moneda']}.",
        f"Rendimiento del periodo: {_fmt(datos['rendimiento_periodo_pct'], '%')}.",
        f"P&L no realizado: {_fmt(datos['pnl_no_realizado'])} {datos['moneda']} "
        f"({_fmt(datos['pnl_no_realizado_pct'], '%')}).",
    ]
    if datos['mejor_posicion']:
        lineas.append(f"Mejor posición: {datos['mejor_posicion']['simbolo']} ({datos['mejor_posicion']['pnl_pct']}%).")
    if datos['peor_posicion']:
        lineas.append(f"Peor posición: {datos['peor_posicion']['simbolo']} ({datos['peor_posicion']['pnl_pct']}%).")
    lineas += [f"Atención: {a}" for a in datos['advertencias']]
    return '\n'.join(lineas)


def _fmt(valor, sufijo=''):
    return 'n/d' if valor is None else f"{valor:,.2f}{sufijo}"
