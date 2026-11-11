from datetime import date
from decimal import Decimal

from django.utils import timezone

from analysisActions.models import CEDEAR, Accion

from .models import SnapshotDiario, Transaccion

CERO = Decimal('0')


def posiciones(cartera):
    """Posiciones abiertas con costo promedio ponderado: {simbolo: {cantidad, costo_total}}."""
    pos = {}
    for t in cartera.transacciones.all():
        p = pos.setdefault(t.simbolo, {'cantidad': CERO, 'costo_total': CERO})
        if t.tipo == Transaccion.COMPRA:
            p['cantidad'] += t.cantidad
            p['costo_total'] += t.cantidad * t.precio + t.comision
        elif p['cantidad'] > 0:
            vendida = min(t.cantidad, p['cantidad'])
            costo_medio = p['costo_total'] / p['cantidad']
            p['costo_total'] -= costo_medio * vendida
            p['cantidad'] -= vendida
    return {s: p for s, p in pos.items() if p['cantidad'] > 0}


def precio_actual(simbolo):
    """Último precio conocido: primero en Accion, después en CEDEAR. None si no hay."""
    accion = Accion.objects.filter(simbolo=simbolo).first()
    if accion and accion.ultimo_precio:
        return accion.ultimo_precio
    cedear = CEDEAR.objects.filter(simbolo=simbolo).first()
    if cedear and cedear.ultimo_precio:
        return cedear.ultimo_precio
    return None


def valorar(cartera):
    """Composición de la cartera a precios actuales."""
    filas = []
    for simbolo, p in sorted(posiciones(cartera).items()):
        precio = precio_actual(simbolo)
        # Sin precio se valúa al costo, para no inventar una ganancia o pérdida.
        valor = p['cantidad'] * precio if precio is not None else p['costo_total']
        filas.append({
            'simbolo': simbolo,
            'cantidad': p['cantidad'],
            'precio': precio,
            'valor': valor,
            'costo': p['costo_total'],
            'sin_precio': precio is None,
        })
    return filas


def registrar_snapshot(cartera, fecha=None):
    """Guarda el valor de la cartera al día de hoy. Pensado para correr una vez por día."""
    fecha = fecha or timezone.localdate()
    filas = valorar(cartera)
    snapshot, _ = SnapshotDiario.objects.update_or_create(
        cartera=cartera,
        fecha=fecha,
        defaults={
            'valor_mercado': sum((f['valor'] for f in filas), CERO),
            'costo': sum((f['costo'] for f in filas), CERO),
            'detalle': [
                {
                    'simbolo': f['simbolo'],
                    'cantidad': float(f['cantidad']),
                    'precio': float(f['precio']) if f['precio'] is not None else None,
                    'valor': float(f['valor']),
                    'costo': float(f['costo']),
                    'sin_precio': f['sin_precio'],
                }
                for f in filas
            ],
        },
    )
    return snapshot


def flujo_neto(cartera, desde, hasta):
    """Dinero invertido menos dinero retirado en el periodo (fechas inclusive)."""
    flujo = CERO
    transacciones = cartera.transacciones.filter(fecha__date__gte=desde, fecha__date__lte=hasta)
    for t in transacciones:
        monto = t.cantidad * t.precio
        if t.tipo == Transaccion.COMPRA:
            flujo += monto + t.comision
        else:
            flujo -= monto - t.comision
    return flujo


def metricas(cartera, desde: date, hasta: date):
    """Métricas del periodo. Todos los valores son tipos JSON-serializables."""
    fin = SnapshotDiario.objects.filter(cartera=cartera, fecha__lte=hasta).first()
    ini = SnapshotDiario.objects.filter(cartera=cartera, fecha__lt=desde).first()
    advertencias = []

    datos = {
        'cartera': cartera.nombre,
        'moneda': cartera.moneda,
        'desde': desde.isoformat(),
        'hasta': hasta.isoformat(),
        'valor_inicio': None,
        'valor_fin': None,
        'flujo_neto': float(flujo_neto(cartera, desde, hasta)),
        'rendimiento_periodo_pct': None,
        'pnl_no_realizado': None,
        'pnl_no_realizado_pct': None,
        'asignacion': [],
        'mejor_posicion': None,
        'peor_posicion': None,
        'advertencias': advertencias,
    }

    if fin is None:
        advertencias.append('No hay snapshot de cierre para el periodo. Ejecutá registrar_snapshots antes del informe.')
        return datos

    valor_fin = float(fin.valor_mercado)
    costo_fin = float(fin.costo)
    datos['valor_fin'] = valor_fin
    datos['pnl_no_realizado'] = valor_fin - costo_fin
    if costo_fin > 0:
        datos['pnl_no_realizado_pct'] = round((valor_fin - costo_fin) / costo_fin * 100, 2)

    if ini is None:
        advertencias.append('No hay snapshot previo al periodo: el rendimiento del periodo no se puede calcular.')
    else:
        valor_inicio = float(ini.valor_mercado)
        datos['valor_inicio'] = valor_inicio
        if valor_inicio > 0:
            ganancia = valor_fin - valor_inicio - datos['flujo_neto']
            datos['rendimiento_periodo_pct'] = round(ganancia / valor_inicio * 100, 2)

    sin_precio = [f['simbolo'] for f in fin.detalle if f['sin_precio']]
    if sin_precio:
        advertencias.append(f"Sin precio actual (valuados al costo): {', '.join(sin_precio)}.")

    if valor_fin > 0:
        datos['asignacion'] = [
            {'simbolo': f['simbolo'], 'peso_pct': round(f['valor'] / valor_fin * 100, 2)}
            for f in sorted(fin.detalle, key=lambda f: f['valor'], reverse=True)
        ]

    con_costo = [f for f in fin.detalle if f['costo'] > 0 and not f['sin_precio']]
    if con_costo:
        rendimientos = [
            {'simbolo': f['simbolo'], 'pnl_pct': round((f['valor'] - f['costo']) / f['costo'] * 100, 2)}
            for f in con_costo
        ]
        datos['mejor_posicion'] = max(rendimientos, key=lambda r: r['pnl_pct'])
        datos['peor_posicion'] = min(rendimientos, key=lambda r: r['pnl_pct'])

    return datos
