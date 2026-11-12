from datetime import datetime, time, timedelta

from django.core.cache import cache
from django.test import Client, TestCase
from django.utils import timezone

from .medicion import medir
from .models import Indicador, PrecioDiario, SeleccionHistorica


class MedicionTests(TestCase):
    """La selección se calculó hace 40 días: el horizonte de 30 se cumplió y el de 90 no."""

    def setUp(self):
        cache.clear()
        self.calc = timezone.localdate() - timedelta(days=40)

    def _rango(self):
        return range(-15, 41)

    def _mep(self, antes, despues):
        Indicador.objects.bulk_create([
            Indicador(nombre='mep', fecha=self.calc + timedelta(days=k), valor=antes if k < 0 else despues, fuente='prueba')
            for k in self._rango()])

    def _precios(self, simbolo, antes, despues):
        PrecioDiario.objects.bulk_create([
            PrecioDiario(simbolo=simbolo, tipo='accion', fecha=self.calc + timedelta(days=k), cierre=antes if k < 0 else despues,
                         moneda='ARS', fuente='Yahoo Finance')
            for k in self._rango()])

    def _seleccion(self, simbolos, tipo='accion'):
        sel = SeleccionHistorica.objects.create(resultado={'tipos': {tipo: [{'simbolo': s} for s in simbolos]}})
        SeleccionHistorica.objects.filter(pk=sel.pk).update(
            calculada=timezone.make_aware(datetime.combine(self.calc, time(12))))

    def test_elegido_que_duplica_con_el_merval_plano(self):
        self._mep(1000, 1000)
        self._precios('^MERV', 1000, 1000)
        self._precios('XYZ', 100, 200)
        self._seleccion(['XYZ'])
        r = medir()
        resumen = r['resumen']['30']
        self.assertEqual(resumen['elegidos'], 1)
        self.assertEqual(resumen['medidos'], 1)
        self.assertAlmostEqual(resumen['retornoUsd'], 1.0, places=4)
        self.assertAlmostEqual(resumen['benchmarkUsd'], 0.0, places=4)
        self.assertAlmostEqual(resumen['alfaUsd'], 1.0, places=4)
        self.assertEqual(resumen['aciertos'], 1.0)

    def test_la_suba_en_pesos_no_es_alfa_si_el_mep_sube_igual(self):
        # El precio, el Merval y el MEP suben 10 % en pesos: en dólares nadie ganó nada.
        self._mep(1000, 1100)
        self._precios('^MERV', 1000, 1100)
        self._precios('XYZ', 100, 110)
        self._seleccion(['XYZ'])
        resumen = medir()['resumen']['30']
        self.assertAlmostEqual(resumen['retornoUsd'], 0.0, places=4)
        self.assertAlmostEqual(resumen['alfaUsd'], 0.0, places=4)

    def test_horizonte_no_cumplido_queda_pendiente(self):
        self._mep(1000, 1000)
        self._seleccion(['XYZ'])
        r = medir()
        self.assertEqual(r['resumen']['90'], {'pendiente': True})
        self.assertTrue(r['selecciones'][0]['horizontes']['90']['pendiente'])

    def test_elegido_sin_historia_no_entra_en_el_promedio(self):
        self._mep(1000, 1000)
        self._precios('^MERV', 1000, 1000)
        self._seleccion(['NOHAY'])
        resumen = medir()['resumen']['30']
        self.assertEqual(resumen['elegidos'], 1)
        self.assertEqual(resumen['sinHistoria'], 1)
        self.assertIsNone(resumen['alfaUsd'])

    def test_sin_selecciones_avisa(self):
        self.assertIn('error', medir())
        self.assertEqual(Client().get('/quorum/api/medicion/').status_code, 404)

    def test_endpoint_responde_con_la_medicion(self):
        self._mep(1000, 1000)
        self._precios('^MERV', 1000, 1000)
        self._precios('XYZ', 100, 200)
        self._seleccion(['XYZ'])
        r = Client().get('/quorum/api/medicion/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['resumen']['30']['medidos'], 1)
