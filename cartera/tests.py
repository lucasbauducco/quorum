from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase, override_settings

from analysisActions.models import Accion

from .informes import periodo
from .models import Cartera, Informe, SnapshotDiario, Transaccion
from .redactor import texto_plantilla
from .services import flujo_neto, metricas, posiciones, registrar_snapshot


def dt(y, m, d):
    return datetime(y, m, d, 12, 0, tzinfo=dt_timezone.utc)


class PosicionesTests(TestCase):
    def setUp(self):
        self.cartera = Cartera.objects.create(nombre='Test')

    def test_costo_promedio_ponderado_y_venta_parcial(self):
        Transaccion.objects.create(cartera=self.cartera, simbolo='GGAL', tipo=Transaccion.COMPRA,
                                   cantidad=10, precio=100, comision=0, fecha=dt(2026, 1, 1))
        Transaccion.objects.create(cartera=self.cartera, simbolo='GGAL', tipo=Transaccion.COMPRA,
                                   cantidad=10, precio=200, comision=0, fecha=dt(2026, 1, 2))
        Transaccion.objects.create(cartera=self.cartera, simbolo='GGAL', tipo=Transaccion.VENTA,
                                   cantidad=5, precio=300, comision=0, fecha=dt(2026, 1, 3))

        p = posiciones(self.cartera)['GGAL']

        self.assertEqual(p['cantidad'], Decimal('15'))
        # Costo medio 150 por unidad; quedan 15 unidades a 150 = 2250.
        self.assertEqual(p['costo_total'], Decimal('2250'))

    def test_posicion_cerrada_no_aparece(self):
        Transaccion.objects.create(cartera=self.cartera, simbolo='YPFD', tipo=Transaccion.COMPRA,
                                   cantidad=1, precio=10, fecha=dt(2026, 1, 1))
        Transaccion.objects.create(cartera=self.cartera, simbolo='YPFD', tipo=Transaccion.VENTA,
                                   cantidad=1, precio=12, fecha=dt(2026, 1, 2))
        self.assertEqual(posiciones(self.cartera), {})


class MetricasTests(TestCase):
    def setUp(self):
        self.cartera = Cartera.objects.create(nombre='Test')
        Accion.objects.create(simbolo='GGAL', nombre='Galicia', mercado='BYMA', ultimo_precio=Decimal('110'))
        Transaccion.objects.create(cartera=self.cartera, simbolo='GGAL', tipo=Transaccion.COMPRA,
                                   cantidad=10, precio=100, fecha=dt(2026, 1, 1))

    def test_rendimiento_descuenta_aportes(self):
        # Cierre de enero: valor 1000.
        SnapshotDiario.objects.create(cartera=self.cartera, fecha=date(2026, 1, 31),
                                      valor_mercado=Decimal('1000'), costo=Decimal('1000'), detalle=[])
        # Aporte de 500 en febrero y el valor sube a 1650 al cierre de febrero.
        Transaccion.objects.create(cartera=self.cartera, simbolo='GGAL', tipo=Transaccion.COMPRA,
                                   cantidad=5, precio=100, fecha=dt(2026, 2, 10))
        SnapshotDiario.objects.create(cartera=self.cartera, fecha=date(2026, 2, 28),
                                      valor_mercado=Decimal('1650'), costo=Decimal('1500'), detalle=[])

        datos = metricas(self.cartera, date(2026, 2, 1), date(2026, 2, 28))

        self.assertEqual(datos['flujo_neto'], 500.0)
        # (1650 - 1000 - 500) / 1000 = 15 %
        self.assertEqual(datos['rendimiento_periodo_pct'], 15.0)

    def test_sin_snapshot_avisa(self):
        datos = metricas(self.cartera, date(2026, 3, 1), date(2026, 3, 31))
        self.assertIsNone(datos['valor_fin'])
        self.assertTrue(datos['advertencias'])

    def test_registrar_snapshot_valua_con_precio_actual(self):
        snapshot = registrar_snapshot(self.cartera, fecha=date(2026, 1, 5))
        self.assertEqual(snapshot.valor_mercado, Decimal('1100'))
        self.assertEqual(snapshot.costo, Decimal('1000'))
        self.assertFalse(snapshot.detalle[0]['sin_precio'])


class PeriodoTests(TestCase):
    def test_periodos(self):
        ref = date(2026, 12, 31)
        self.assertEqual(periodo(Informe.DIARIO, ref), (ref, ref))
        self.assertEqual(periodo(Informe.MENSUAL, ref), (date(2026, 12, 1), ref))
        self.assertEqual(periodo(Informe.ANUAL, ref), (date(2026, 1, 1), ref))


class PlantillaTests(TestCase):
    @override_settings(ANTHROPIC_API_KEY='')
    def test_plantilla_sin_api_key(self):
        datos = {
            'cartera': 'Test', 'moneda': 'USD', 'desde': '2026-01-01', 'hasta': '2026-01-31',
            'valor_fin': 1100.0, 'rendimiento_periodo_pct': None, 'pnl_no_realizado': 100.0,
            'pnl_no_realizado_pct': 10.0, 'mejor_posicion': None, 'peor_posicion': None,
            'advertencias': ['Falta snapshot previo.'],
        }
        texto = texto_plantilla(datos, Informe.MENSUAL)
        self.assertIn('n/d', texto)
        self.assertIn('Falta snapshot previo.', texto)
