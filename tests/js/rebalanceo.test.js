// Pruebas del rebalanceo (ventas sugeridas). Sin dependencias: `node tests/js/rebalanceo.test.js`.
const assert = require('node:assert/strict');
const path = require('node:path');

global.window = {};
require(path.join(__dirname, '..', '..', 'quorum', 'static', 'quorum', 'funciones.js'));
const F = window['Quórum'];

const objetivoSinCripto = { variable: 0, soberana: 1, privada: 0, liquidez: 0, cripto: 0 };

function ventasDe(cartera) {
  return F.rebalanceo(cartera, objetivoSinCripto, 0, 0.05, 0).ventas;
}

// 1. Cripto fraccionaria: la cantidad conserva decimales y nunca queda en 0.
{
  const v = ventasDe([
    { simbolo: 'ETH', tipo: 'cripto', grupo: 'cripto', cantidad: 0.5, valorARS: 1000000, ganancia: -0.1 },
    { simbolo: 'AL30', tipo: 'bono', grupo: 'soberana', cantidad: 1000, valorARS: 1000000, ganancia: 0.1 },
  ]);
  const eth = v.find((x) => x.simbolo === 'ETH');
  assert.ok(eth, 'debe sugerir vender ETH');
  assert.ok(eth.cantidad > 0, 'la cantidad no puede ser 0');
  assert.equal(eth.decimales, 8);
}

// 2. Venta parcial de cripto: el cripto pesa 60 % y su objetivo es 10 %.
//    Se vende 5.000.000 ARS de ETH a 12.000.000 ARS por unidad: 0,41666667 ETH, no 1 ni 0.
{
  const v = F.rebalanceo([
    { simbolo: 'ETH', tipo: 'cripto', grupo: 'cripto', cantidad: 0.5, valorARS: 6000000, ganancia: -0.1 },
    { simbolo: 'AL30', tipo: 'bono', grupo: 'soberana', cantidad: 1000, valorARS: 4000000, ganancia: 0.1 },
  ], { variable: 0, soberana: 0.9, privada: 0, liquidez: 0, cripto: 0.1 }, 0, 0.05, 0).ventas;
  const eth = v.find((x) => x.simbolo === 'ETH');
  assert.ok(eth, 'debe haber venta parcial de ETH');
  assert.ok(eth.cantidad > 0 && eth.cantidad < 0.5, 'venta parcial entre 0 y la tenencia');
  assert.ok(Math.abs(eth.cantidad - 0.41666667) < 1e-8, 'cantidad esperada 0,41666667');
  assert.ok(Math.abs(eth.cantidad * 12000000 - eth.montoARS) < 1, 'cantidad × precio ≈ monto');
}

// 3. Acciones y bonos: cantidad entera, redondeada hacia arriba, y decimales = 0.
{
  const v = ventasDe([
    { simbolo: 'GGAL', tipo: 'accion', grupo: 'variable', cantidad: 10, valorARS: 48000, ganancia: -0.3 },
    { simbolo: 'AL30', tipo: 'bono', grupo: 'soberana', cantidad: 100, valorARS: 100000, ganancia: 0.1 },
  ]);
  const ggal = v.find((x) => x.simbolo === 'GGAL');
  assert.ok(ggal, 'debe sugerir vender GGAL');
  assert.equal(Number.isInteger(ggal.cantidad), true);
  assert.equal(ggal.decimales, 0);
}

console.log('rebalanceo: 3 pruebas OK');
