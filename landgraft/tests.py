import json
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from . import byma, seleccion
from .models import Documento, SeleccionHistorica


class DatosApiTests(TestCase):
    def setUp(self):
        self.usuario = get_user_model().objects.create_user('lucas', password='clave-de-prueba-123')
        self.cliente = Client(enforce_csrf_checks=True)

    def _ingresar(self):
        self.cliente.login(username='lucas', password='clave-de-prueba-123')
        return self.cliente.get('/landgraft/api/sesion/').json()['csrf']

    def test_sin_sesion_no_hay_acceso(self):
        r = self.cliente.get('/landgraft/api/datos/carteras/')
        self.assertEqual(r.status_code, 302)  # redirige a ingresar
        self.assertFalse(self.cliente.get('/landgraft/api/sesion/').json()['autenticado'])

    def test_guardar_leer_y_borrar(self):
        csrf = self._ingresar()
        self.assertEqual(self.cliente.get('/landgraft/api/datos/carteras/').status_code, 404)
        valor = [{'id': 'lucas', 'nombre': 'Lucas'}, {'id': 'familia', 'nombre': 'Familia'}]
        r = self.cliente.put('/landgraft/api/datos/carteras/', json.dumps({'valor': valor}),
                             content_type='application/json', HTTP_X_CSRFTOKEN=csrf)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.cliente.get('/landgraft/api/datos/carteras/').json()['valor'], valor)
        self.cliente.delete('/landgraft/api/datos/carteras/', HTTP_X_CSRFTOKEN=csrf)
        self.assertFalse(Documento.objects.filter(clave='carteras').exists())

    def test_escribir_sin_csrf_se_rechaza(self):
        self._ingresar()
        r = self.cliente.put('/landgraft/api/datos/carteras/', json.dumps({'valor': []}), content_type='application/json')
        self.assertEqual(r.status_code, 403)

    def test_cada_usuario_ve_solo_lo_suyo(self):
        otro = get_user_model().objects.create_user('otro', password='otra-clave-456')
        Documento.objects.create(usuario=otro, clave='carteras', valor=['privado'])
        self._ingresar()
        self.assertEqual(self.cliente.get('/landgraft/api/datos/carteras/').status_code, 404)

    def test_clave_invalida(self):
        csrf = self._ingresar()
        r = self.cliente.put('/landgraft/api/datos/a%20b/', '{}', content_type='application/json', HTTP_X_CSRFTOKEN=csrf)
        self.assertEqual(r.status_code, 400)


class SeleccionApiTests(TestCase):
    @mock.patch('landgraft.servicio_seleccion.calcular_en_segundo_plano')
    def test_sin_resultado_responde_202_y_lanza_el_calculo(self, lanzar):
        r = Client().get('/landgraft/api/seleccion/')
        self.assertEqual(r.status_code, 202)
        lanzar.assert_called_once()

    @mock.patch('landgraft.servicio_seleccion.calcular_en_segundo_plano')
    def test_resultado_vigente_no_recalcula(self, lanzar):
        SeleccionHistorica.objects.create(resultado={'tipos': {'accion': [{'simbolo': 'GGAL'}]}})
        r = Client().get('/landgraft/api/seleccion/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['tipos']['accion'][0]['simbolo'], 'GGAL')
        lanzar.assert_not_called()


class TirTests(TestCase):
    def test_bono_cero_cupon_conocido(self):
        # Paga 110 en un año: a precio 100 la TIR es 10 % y la duration modificada 1/1,1.
        liq = date(2026, 1, 1)
        flujos = [(date(2027, 1, 1), 110.0)]
        self.assertAlmostEqual(byma.tir(flujos, 100.0, liq), 0.10, places=3)
        self.assertAlmostEqual(byma.duration_modificada(flujos, 0.10, liq), 0.91, places=2)

    def test_tasa_fija_suma_cupon_corrido(self):
        ficha = {'interes': 'Tasa fija del 10,00% nominal anual. Pagos semestrales.', 'formaAmortizacion': 'Íntegra al vencimiento',
                 'fechaVencimiento': '2028-01-01 00:00:00.0', 'fechaEmision': '2025-01-01 00:00:00.0'}
        flujos, corrido, metodo = byma.flujos(ficha, date(2026, 4, 1))
        self.assertEqual(len(flujos), 4)  # 1/7/26, 1/1/27, 1/7/27, 1/1/28
        self.assertAlmostEqual(flujos[-1][1], 105.0)
        self.assertAlmostEqual(corrido, 5.0 * 90 / 181, places=2)  # 1/1 al 1/4 de un semestre de 181 días

    def test_soberano_gd30_amortiza_y_tiene_corrido(self):
        flujos, corrido = byma._flujos_soberano('30', date(2026, 11, 12))
        # Quedan 8 pagos (ene-27 a jul-30), cada uno con una cuota de 8 % más el cupón sobre el residual.
        self.assertEqual(len(flujos), 8)
        self.assertEqual(flujos[-1][0], date(2030, 7, 9))
        self.assertAlmostEqual(flujos[-1][1], 8 + 8 * 0.0175 / 2, places=6)  # última cuota y cupón de 1,75 % sobre 8
        self.assertGreater(corrido, 0)

    def test_liquidacion_24h_salta_fin_de_semana(self):
        self.assertEqual(byma.liquidacion(date(2026, 11, 13), '2'), date(2026, 11, 16))  # viernes -> lunes
        self.assertEqual(byma.liquidacion(date(2026, 11, 13), '1'), date(2026, 11, 13))


class CurvaTests(TestCase):
    def test_interpolacion(self):
        curva = [(1.0, 0.10), (5.0, 0.12)]
        self.assertAlmostEqual(seleccion._interpolar(curva, 3.0), 0.11)
        self.assertEqual(seleccion._interpolar(curva, 0.5), 0.10)
        self.assertEqual(seleccion._interpolar(curva, 9.0), 0.12)
