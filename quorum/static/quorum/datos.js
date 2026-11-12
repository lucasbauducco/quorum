/* Datos de ejemplo de Quórum: lo que el backend traería de las fuentes.
   Precios, tasas, noticias e historia son ficticios. */
(function (global) {
  'use strict';

  var HOY = '2026-11-11';

  // Tipo de cambio de ejemplo (ARS por USD).
  var FX = { oficial: 1420, mep: 1465, ccl: 1490 };

  var REFERENCIAS = {
    tasaCaucion: 0.30,       // TNA en pesos
    tasaUsd: 0.07,           // rendimiento de referencia en dólares
    inflacionEsperada: 0.24  // anual, como la publicaría el REM
  };

  // Instrumentos conocidos. precio en su moneda; bonos, letras y ON cotizan cada 100 nominales.
  // flujos[].monto: lo que paga cada 100 nominales (o por unidad en la caución).
  var INSTRUMENTOS = {
    GGAL:  { tipo: 'accion', moneda: 'ARS', emisor: 'Galicia', sector: 'Bancos', precio: 6100, varDia: 1.2 },
    YPFD:  { tipo: 'accion', moneda: 'ARS', emisor: 'YPF', sector: 'Energía', precio: 24800, varDia: -0.8 },
    PAMP:  { tipo: 'accion', moneda: 'ARS', emisor: 'Pampa', sector: 'Energía', precio: 2600, varDia: 0.6 },
    ALUA:  { tipo: 'accion', moneda: 'ARS', emisor: 'Aluar', sector: 'Industria', precio: 1850, varDia: -1.4 },
    AAPL:  { tipo: 'cedear', moneda: 'ARS', emisor: 'Apple', sector: 'Tecnología', precio: 11200, varDia: 0.9 },
    KO:    { tipo: 'cedear', moneda: 'ARS', emisor: 'Coca-Cola', sector: 'Consumo', precio: 9800, varDia: 0.3 },
    AL30D: { tipo: 'bono', moneda: 'USD', emisor: 'Tesoro Nacional', sector: 'Soberano', precio: 62.5, varDia: 0.4, rend: 0.10, duration: 2.1,
             flujos: [{ fecha: '2027-01-09', concepto: 'Amortización y cupón', monto: 8.24 }] },
    AL35D: { tipo: 'bono', moneda: 'USD', emisor: 'Tesoro Nacional', sector: 'Soberano', precio: 52, varDia: 0.7, rend: 0.105, duration: 5.6 },
    GD30D: { tipo: 'bono', moneda: 'USD', emisor: 'Tesoro Nacional', sector: 'Soberano', precio: 63.4, varDia: 0.3, rend: 0.095, duration: 2.0 },
    'LECAP-EJ':  { tipo: 'letra', moneda: 'ARS', emisor: 'Tesoro Nacional', sector: 'Soberano', precio: 112.4, varDia: 0.1, rend: 0.33, duration: 0.2, vence: '2027-01-29',
                   flujos: [{ fecha: '2027-01-29', concepto: 'Vencimiento', monto: 115.6 }] },
    'LECAP-EJ2': { tipo: 'letra', moneda: 'ARS', emisor: 'Tesoro Nacional', sector: 'Soberano', precio: 104.1, varDia: 0.1, rend: 0.27, duration: 0.4, vence: '2027-04-30' },
    CAUCION:   { tipo: 'caucion', moneda: 'ARS', emisor: 'Caución bursátil', sector: 'Liquidez', precio: 1, varDia: 0, rend: 0.30, duration: 0, vence: '2026-11-18',
                 flujos: [{ fecha: '2026-11-18', concepto: 'Vencimiento de caución', monto: 1.0058 }] },
    'FCI-MM':  { tipo: 'fci', moneda: 'ARS', emisor: 'FCI money market', sector: 'Liquidez', precio: 1345, varDia: 0.08, rend: 0.28, duration: 0 },
    'ON-EJ29': { tipo: 'on', moneda: 'USD', emisor: 'Energética Ejemplo SA', sector: 'Energía', precio: 98, varDia: 0.2, rend: 0.085, duration: 2.6,
                 flujos: [{ fecha: '2026-12-15', concepto: 'Cupón', monto: 4.25 }] }
  };

  // Tenencias de ejemplo. costo: precio promedio de compra, en la moneda del instrumento.
  var CARTERA_EJEMPLO = [
    { simbolo: 'GGAL',     cantidad: 1200,    costo: 4800 },
    { simbolo: 'YPFD',     cantidad: 350,     costo: 21000 },
    { simbolo: 'AAPL',     cantidad: 900,     costo: 9600 },
    { simbolo: 'AL30D',    cantidad: 20000,   costo: 58 },
    { simbolo: 'LECAP-EJ', cantidad: 5000000, costo: 108.9 },
    { simbolo: 'CAUCION',  cantidad: 4000000, costo: 1 },
    { simbolo: 'FCI-MM',   cantidad: 3000,    costo: 1300 },
    { simbolo: 'ON-EJ29',  cantidad: 3000,    costo: 95 }
  ];

  // Cartera real, tomada de IOL: valor de mercado, PPC (precio promedio de compra) y rendimiento.
  // Con esos tres datos se reconstruyen el precio actual y la cantidad (estimada).
  // Bonos y ON cotizan cada 100 nominales.
  var SECTORES = {
    GGAL: 'Bancos', YPFD: 'Energía', CEPU: 'Energía', BYMA: 'Servicios financieros', YM38O: 'Energía',
    GLD: 'Oro', GOOGL: 'Tecnología', AMZN: 'Tecnología', META: 'Tecnología'
  };

  var IOL = [
    // simbolo, tipo, emisor, valor ARS, PPC, rendimiento[, cantidad exacta si se conoce]
    ['AMZN', 'cedear', 'Amazon', 108937.5, 2801.00, 0.1023],
    ['GLD', 'cedear', 'SPDR Gold Trust', 418200, 11952.65, 0.0274],
    ['GOOGL', 'cedear', 'Alphabet', 117390, 9757.14, -0.1401],
    ['META', 'cedear', 'Meta', 178240, 38090.00, 0.1599],
    ['YM38O', 'on', 'YPF', 375260, 160155.89, 0.0100, 232],
    ['BYMA', 'accion', 'BYMA', 45655, 288.33, -0.3081],
    ['CEPU', 'accion', 'Central Puerto', 82663, 2184.92, -0.2192],
    ['GGAL', 'accion', 'Grupo Financiero Galicia', 49300, 7560.00, -0.3409],
    ['YPFD', 'accion', 'YPF', 186300, 6315.00, -0.0103],
    ['T15E7', 'bono', 'Tesoro Nacional', 233247.55, 150.72, 0.0241, 151116],
    ['ADRDOLA', 'fci', 'Adcap', 34145.85, 18.32, 0.0707],
    ['IOLCAMA', 'fci', 'IOL Cash Management', 147003.12, 12.17, 0.0352]
  ];
  var CARTERA_IOL = IOL.map(function (f) {
    var cotiza = f[1] === 'bono' || f[1] === 'on' ? 100 : 1;
    var exacta = f[6] != null;
    var cantidad = exacta ? f[6] : f[3] * cotiza / (f[4] * (1 + f[5]));
    return { simbolo: f[0], tipo: f[1], moneda: 'ARS', emisor: f[2], cantidad: cantidad, precioManual: f[3] * cotiza / cantidad, costo: f[4], varDia: null, cantidadEstimada: !exacta, sector: SECTORES[f[0]] };
  }).concat([
    // Criptos: cantidad exacta y PPC de IOL; el precio sale de dividir el valor por la cantidad.
    { simbolo: 'BTC', tipo: 'cripto', moneda: 'ARS', cantidad: 0.00342488, precio: 424748.44 / 0.00342488, costo: 120810854.66 },
    { simbolo: 'ETH', tipo: 'cripto', moneda: 'ARS', cantidad: 0.06335709, precio: 219450.76 / 0.06335709, costo: 3630216.97 },
    { simbolo: 'SOL', tipo: 'cripto', moneda: 'ARS', cantidad: 0.55881398, precio: 79201.18 / 0.55881398, costo: 146349.56 },
    { simbolo: 'BNB', tipo: 'cripto', moneda: 'ARS', cantidad: 0.05607661, precio: 64347.77 / 0.05607661, costo: 1140589.56 },
    { simbolo: 'XRP', tipo: 'cripto', moneda: 'ARS', cantidad: 64.92429671, precio: 115695.1 / 64.92429671, costo: 2494.91 },
    { simbolo: 'USD', tipo: 'caja', moneda: 'USD', emisor: 'Dólares en caja', valorDirecto: 162 }
  ]);

  // Candidatos sugeridos para que el comité los evalúe. Podés quitarlos o agregar otros.
  var LISTA_SUGERIDA = [
    { simbolo: 'PAMP', tipo: 'accion', cantidad: 100, nota: 'Sugerida: energía, acción local' },
    { simbolo: 'ALUA', tipo: 'accion', cantidad: 100, nota: 'Sugerida: industria, acción local' },
    { simbolo: 'KO', tipo: 'cedear', cantidad: 50, nota: 'Sugerida: consumo, CEDEAR' },
    { simbolo: 'AL35D', tipo: 'bono', cantidad: 20000, nota: 'Sugerida: soberano en dólares' },
    { simbolo: 'GD30D', tipo: 'bono', cantidad: 20000, nota: 'Sugerida: soberano en dólares' },
    { simbolo: 'LECAP-EJ2', tipo: 'letra', cantidad: 1000000, nota: 'Sugerida: letra corta' }
  ];

  var NOTICIAS = {
    GGAL: { texto: 'Presenta su balance trimestral esta semana.', tono: 'neutral' },
    YPFD: { texto: 'Hecho relevante: anuncia una nueva emisión de deuda.', tono: 'alerta' }
  };

  var FUENTES_EJEMPLO = [
    { id: 'precios', nombre: 'Precios BYMA, tendencia y analistas (Yahoo Finance)', url: 'https://finance.yahoo.com', tipo: 'Precios', activa: true, estado: null },
    { id: 'dolar',   nombre: 'Dólar oficial, MEP y CCL (dolarapi)', url: 'https://dolarapi.com/v1/dolares', tipo: 'Tipo de cambio', activa: true, estado: null },
    { id: 'tasas',   nombre: 'Plazo fijo (BCRA) e inflación (INDEC) vía ArgentinaDatos', url: 'https://api.argentinadatos.com', tipo: 'Tasas', activa: true, estado: null },
    { id: 'hechos',  nombre: 'Hechos relevantes', url: 'https://www.cnv.gob.ar', tipo: 'Hechos relevantes', activa: true, estado: null },
    { id: 'portafolio', nombre: 'Portafolio del broker (IOL)', url: 'https://www.invertironline.com', tipo: 'Portafolio', activa: false, estado: null },
    { id: 'cripto', nombre: 'Precios de criptomonedas (CoinGecko)', url: 'https://api.coingecko.com/api/v3/simple/price', tipo: 'Cripto', activa: true, estado: null },
    { id: 'cuotapartes', nombre: 'Valor de cuotapartes de FCI', url: 'https://www.cafci.org.ar', tipo: 'Valor de cuotapartes', activa: true, estado: null }
  ];

  // Cómo se verá AI Memoria cuando haya historia: aciertos por agente a 90 días (ejemplo).
  var MEMORIA_EJEMPLO = [
    { agente: 'AI Acciones', decisiones: 14, aciertos: 9 },
    { agente: 'AI Renta Fija', decisiones: 11, aciertos: 8 },
    { agente: 'AI Guardián', decisiones: 6, aciertos: 5 },
    { agente: 'AI Compliance', decisiones: 4, aciertos: 4 },
    { agente: 'AI Noticias', decisiones: 7, aciertos: 3 }
  ];

  // Variación mensual en %, de enero 2025 a noviembre 2026 (noviembre, parcial).
  var CARTERA_MENSUAL = [3.1, 1.2, -0.8, 4.5, 2.2, 1.9, 3.8, -1.2, 5.6, 2.4, 6.1,
                         1.8, 3.0, -1.5, 2.8, 4.2, 1.1, 2.6, 3.9, -0.6, 2.9, 4.4, 1.5];
  var MEP_MENSUAL = [1.5, 1.2, 2.0, 8.0, 1.0, 0.5, 3.0, 2.5, 6.0, 1.0, -2.0,
                     1.0, 0.8, 1.5, -0.5, 2.0, 1.2, 0.6, 1.8, 3.0, -1.0, 0.9, 1.1];

  // Últimos 12 meses, de diciembre 2025 a noviembre 2026, en %.
  var MESES_BENCH = ['dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov'];
  var BENCHMARKS = {
    merval:    [5.0, -3.2, 4.1, 6.0, -2.5, 1.8, 7.2, -4.0, 3.3, 8.1, -1.5, 2.4],
    inflacion: [2.4, 2.2, 2.3, 2.1, 2.0, 1.9, 1.9, 1.8, 1.9, 2.0, 1.8, 1.7],
    plazoFijo: [2.3, 2.2, 2.2, 2.1, 2.0, 2.0, 1.9, 1.9, 1.9, 1.8, 1.8, 1.8]
  };

  // Historia diaria: índice de valor de la cartera (1 = hoy) y MEP, desde el 1/1/2025.
  function generarHistoria() {
    var dias = [];
    var ini = Date.UTC(2025, 0, 1);
    var fin = Date.parse(HOY + 'T00:00:00Z');
    var nivel = 1;
    var mep = 1;
    for (var t = ini, i = 0; t <= fin; t += 864e5, i += 1) {
      var d = new Date(t);
      var m = (d.getUTCFullYear() - 2025) * 12 + d.getUTCMonth();
      var diasMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      nivel *= Math.pow(1 + CARTERA_MENSUAL[m] / 100, 1 / diasMes);
      mep *= Math.pow(1 + MEP_MENSUAL[m] / 100, 1 / diasMes);
      dias.push({
        fecha: d.toISOString().slice(0, 10),
        nivel: nivel * Math.exp(0.008 * Math.sin(i / 4) + 0.005 * Math.sin(i / 11)),
        mep: mep
      });
    }
    var ultimo = dias[dias.length - 1];
    return dias.map(function (x) {
      return { fecha: x.fecha, indice: x.nivel / ultimo.nivel, mep: FX.mep * x.mep / ultimo.mep };
    });
  }

  global.QuorumDatos = {
    HOY: HOY,
    FX: FX,
    REFERENCIAS: REFERENCIAS,
    INSTRUMENTOS: INSTRUMENTOS,
    CARTERA_EJEMPLO: CARTERA_EJEMPLO,
    NOTICIAS: NOTICIAS,
    CARTERA_IOL: CARTERA_IOL,
    LISTA_SUGERIDA: LISTA_SUGERIDA,
    FUENTES_EJEMPLO: FUENTES_EJEMPLO,
    MEMORIA_EJEMPLO: MEMORIA_EJEMPLO,
    MEP_MENSUAL: MEP_MENSUAL,
    MESES_BENCH: MESES_BENCH,
    BENCHMARKS: BENCHMARKS,
    HISTORIA: generarHistoria()
  };
})(window);
