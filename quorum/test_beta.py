from datetime import date, timedelta

from django.test import TestCase

from . import riesgo
from .models import Indicador, PrecioDiario


class BetaTests(TestCase):
    """Con un índice igual al activo, el beta tiene que ser 1 y el alfa 0."""

    def setUp(self):
        hoy = date.today()
        indicadores, precios = [], []
        for k in range(120):
            f = hoy - timedelta(days=120 - k)
            mep = 1000 * (1.001 ** k)
            indicadores.append(Indicador(nombre='mep', fecha=f, valor=mep, fuente='prueba'))
            ars = 100 * (1.01 ** k) * (1.03 if k % 2 else 0.97)
            precios.append(PrecioDiario(simbolo='XYZ', tipo='accion', fecha=f, cierre=ars, fuente='Yahoo Finance'))
            precios.append(PrecioDiario(simbolo='^MERV', tipo='indice', fecha=f, cierre=ars, fuente='Yahoo Finance'))
        Indicador.objects.bulk_create(indicadores)
        PrecioDiario.objects.bulk_create(precios)

    def test_indice_identico_da_beta_uno_y_alfa_cero(self):
        r = riesgo.medir([{'simbolo': 'XYZ', 'tipo': 'accion', 'moneda': 'ARS', 'valorARS': 500}])
        self.assertAlmostEqual(r['cartera']['beta'], 1.0, places=2)
        self.assertAlmostEqual(r['cartera']['alfaAnual'], 0.0, places=4)
        self.assertAlmostEqual(r['cartera']['correlacionMerval'], 1.0, places=2)

    def test_sin_historia_del_merval_no_inventa_beta(self):
        PrecioDiario.objects.filter(simbolo='^MERV').delete()
        r = riesgo.medir([{'simbolo': 'XYZ', 'tipo': 'accion', 'moneda': 'ARS', 'valorARS': 500}])
        self.assertIsNone(r['cartera']['beta'])
        self.assertIsNone(r['cartera']['alfaAnual'])
        self.assertNotIn('error', r)
