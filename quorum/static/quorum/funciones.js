/* Funciones de Quórum: los 14 agentes del comité y los cálculos de la cartera.
   No toca el DOM: recibe datos y devuelve resultados. front.js los pinta. */
(function (global) {
  'use strict';

  // cotizaPor: el precio es por cada N unidades (bonos, letras y ON, cada 100 nominales).
  var TIPOS = {
    accion:  { nombre: 'Acción',                grupo: 'variable', cotizaPor: 1 },
    cedear:  { nombre: 'CEDEAR',                grupo: 'variable', cotizaPor: 1 },
    bono:    { nombre: 'Bono',                  grupo: 'soberana', cotizaPor: 100 },
    letra:   { nombre: 'Letra',                 grupo: 'soberana', cotizaPor: 100 },
    on:      { nombre: 'Obligación negociable', grupo: 'privada',  cotizaPor: 100 },
    caucion: { nombre: 'Caución',               grupo: 'liquidez', cotizaPor: 1 },
    fci:     { nombre: 'FCI',                   grupo: 'liquidez', cotizaPor: 1 },
    cripto:  { nombre: 'Cripto',                grupo: 'cripto',   cotizaPor: 1 },
    caja:    { nombre: 'Caja en dólares',       grupo: 'liquidez', cotizaPor: 1 }
  };

  var GRUPOS = {
    variable: 'Renta variable',
    soberana: 'Renta fija soberana',
    privada: 'Obligaciones negociables',
    liquidez: 'Liquidez',
    cripto: 'Criptomonedas'
  };

  // Límites y asignación objetivo por perfil o estrategia. Todo en fracción: 0.20 = 20 %.
  // sector: máximo por sector; contribRiesgo: máximo aporte de una posición al riesgo de la cartera;
  // banda: tolerancia del rebalanceo, en puntos porcentuales absolutos.
  function limitesDe(base, cambios) {
    var o = {};
    Object.keys(base).forEach(function (k) { o[k] = base[k]; });
    Object.keys(cambios || {}).forEach(function (k) { o[k] = cambios[k]; });
    return o;
  }

  var LIMITES_MODERADO = {
    emisor: 0.20, soberana: 0.35, liquidezMin: 0.05, gananciaReducir: 0.25, pesoReducir: 0.10, perdidaRevisar: -0.15,
    recorte: 0.15, perdidaEscenario: 0.03, comision: 0.006, sector: 0.40, contribRiesgo: 0.25, banda: 0.05
  };

  var PERFILES = {
    conservador: {
      nombre: 'Conservador',
      descripcion: 'Prioriza no perder: mucha renta fija y liquidez, poca renta variable y nada de cripto.',
      riesgos: 'Puede quedar atrás de la inflación y del dólar si el mercado sube mucho.',
      limites: limitesDe(LIMITES_MODERADO, { emisor: 0.10, soberana: 0.50, liquidezMin: 0.10, gananciaReducir: 0.15, pesoReducir: 0.06, perdidaRevisar: -0.08, recorte: 0.20, perdidaEscenario: 0.02, sector: 0.30, contribRiesgo: 0.20, banda: 0.04 }),
      objetivo: { variable: 0.15, soberana: 0.45, privada: 0.15, liquidez: 0.25, cripto: 0 }
    },
    moderado: {
      nombre: 'Moderado',
      descripcion: 'Equilibrio entre crecimiento y estabilidad: renta variable como motor, renta fija como base.',
      riesgos: 'Pierde valor en una crisis cambiaria o una caída fuerte de las acciones.',
      limites: limitesDe(LIMITES_MODERADO, {}),
      objetivo: { variable: 0.35, soberana: 0.30, privada: 0.15, liquidez: 0.15, cripto: 0.05 }
    },
    agresivo: {
      nombre: 'Agresivo',
      descripcion: 'Busca crecer: mayoría en renta variable y algo de cripto, con poca liquidez.',
      riesgos: 'Caídas de 30 % o más en períodos cortos; exige tolerar la volatilidad.',
      limites: limitesDe(LIMITES_MODERADO, { emisor: 0.30, soberana: 0.25, liquidezMin: 0.03, gananciaReducir: 0.40, pesoReducir: 0.15, perdidaRevisar: -0.25, recorte: 0.10, perdidaEscenario: 0.06, sector: 0.50, contribRiesgo: 0.35, banda: 0.07 }),
      objetivo: { variable: 0.55, soberana: 0.15, privada: 0.10, liquidez: 0.10, cripto: 0.10 }
    },
    carry_pesos: {
      nombre: 'Carry en pesos',
      descripcion: 'Vive de la tasa en pesos: letras y bonos a tasa fija, con liquidez para reinvertir. Conviene cuando la tasa supera lo que se espera que suba el dólar (ver Pesos contra dólar).',
      riesgos: 'Un salto del dólar mayor al que descuenta la tasa borra la ganancia. Se pierde contra la inflación si la tasa real es negativa.',
      limites: limitesDe(LIMITES_MODERADO, { soberana: 0.60, liquidezMin: 0.10, emisor: 0.15, sector: 0.35, contribRiesgo: 0.30, banda: 0.05 }),
      objetivo: { variable: 0.10, soberana: 0.55, privada: 0.10, liquidez: 0.25, cripto: 0 }
    },
    dolarizacion: {
      nombre: 'Dolarización',
      descripcion: 'Protege el poder de compra en dólares: CEDEAR, ON en dólares y soberanos hard dollar, con caja en dólares.',
      riesgos: 'Renuncia a la tasa en pesos si el dólar queda quieto; las ON y los bonos dependen del riesgo país.',
      limites: limitesDe(LIMITES_MODERADO, { soberana: 0.25, liquidezMin: 0.10, emisor: 0.15, sector: 0.40, contribRiesgo: 0.25, banda: 0.05 }),
      objetivo: { variable: 0.35, soberana: 0.20, privada: 0.30, liquidez: 0.15, cripto: 0 }
    },
    renta_usd: {
      nombre: 'Renta en dólares',
      descripcion: 'Busca ingresos en dólares: sobre todo ON y bonos en dólares, con poca renta variable.',
      riesgos: 'Riesgo de crédito de las empresas y del soberano; el precio cae si sube el riesgo país.',
      limites: limitesDe(LIMITES_MODERADO, { soberana: 0.30, liquidezMin: 0.08, emisor: 0.12, sector: 0.30, contribRiesgo: 0.25, banda: 0.05 }),
      objetivo: { variable: 0.10, soberana: 0.25, privada: 0.55, liquidez: 0.10, cripto: 0 }
    },
    crecimiento: {
      nombre: 'Crecimiento',
      descripcion: 'Apunta a la mayor suba a largo plazo: renta variable y cripto, con una base de renta fija.',
      riesgos: 'Volatilidad alta: tolera caídas profundas. No es para plazos cortos.',
      limites: limitesDe(LIMITES_MODERADO, { emisor: 0.25, soberana: 0.20, liquidezMin: 0.05, gananciaReducir: 0.40, pesoReducir: 0.15, perdidaRevisar: -0.20, perdidaEscenario: 0.05, sector: 0.45, contribRiesgo: 0.30, banda: 0.07 }),
      objetivo: { variable: 0.60, soberana: 0.10, privada: 0.10, liquidez: 0.10, cripto: 0.10 }
    }
  };

  // Los 14 agentes, en el orden en que trabajan.
  var NODOS = [
    { id: 'fuentes',    nombre: 'AI Fuentes',    rol: 'Recolecta los datos de las fuentes activas y avisa si alguno puede estar viejo.', motor: 'Código' },
    { id: 'dolar',      nombre: 'AI Dólar',      rol: 'MEP, CCL y brecha. Valúa la cartera en pesos y en dólares.', motor: 'Código' },
    { id: 'acciones',   nombre: 'AI Acciones',   rol: 'Acciones y CEDEAR: ganancia, peso y señales de reducir o revisar.', motor: 'Reglas' },
    { id: 'rentafija',  nombre: 'AI Renta Fija', rol: 'Bonos, letras, ON y caución contra la tasa de referencia de su moneda.', motor: 'Código' },
    { id: 'macro',      nombre: 'AI Macro',      rol: 'Inflación esperada y tasas como contexto.', motor: 'Código' },
    { id: 'noticias',   nombre: 'AI Noticias',   rol: 'Hechos relevantes que afectan una posición.', motor: 'Reglas; con Claude en el backend' },
    { id: 'liquidez',   nombre: 'AI Liquidez',   rol: 'Caja, vencimientos próximos y liquidez mínima.', motor: 'Código' },
    { id: 'guardian',   nombre: 'AI Guardián',   rol: 'Límite por emisor. Puede vetar una compra.', motor: 'Código', veta: true },
    { id: 'escenarios', nombre: 'AI Escenarios', rol: 'Pérdida ante devaluación, suba de tasas y caída del Merval.', motor: 'Código' },
    { id: 'compliance', nombre: 'AI Compliance', rol: 'Límite de renta fija soberana y listas restringidas. Puede vetar.', motor: 'Código', veta: true },
    { id: 'tamano',     nombre: 'AI Tamaño',     rol: 'Si hay veto, calcula cuánto sí se puede comprar.', motor: 'Código' },
    { id: 'comite',     nombre: 'AI Comité',     rol: 'Decide y explica el motivo. Redacta los informes.', motor: 'Reglas; redacción con Claude' },
    { id: 'fiscal',     nombre: 'AI Fiscal',     rol: 'Estima la ganancia realizada de una venta. Orientativo.', motor: 'Reglas' },
    { id: 'memoria',    nombre: 'AI Memoria',    rol: 'Registra cada decisión y la mide a 30, 90 y 365 días.', motor: 'Código' }
  ];

  // spread: suba del riesgo país en fracción (0.04 = 400 puntos básicos); afecta a los bonos y ON en dólares por su duration.
  var ESCENARIOS = [
    { id: 'devaluacion', nombre: 'Devaluación',          descripcion: 'El dólar MEP sube 30 %',                          mep: 0.30, tasas: 0,    merval: 0,     cedear: 0.30, spread: 0 },
    { id: 'tasas',       nombre: 'Suba de tasas',        descripcion: 'Las tasas en pesos suben 10 puntos',              mep: 0,    tasas: 0.10, merval: -0.05, cedear: 0,    spread: 0 },
    { id: 'merval',      nombre: 'Caída del Merval',     descripcion: 'Las acciones locales caen 25 %',                  mep: 0,    tasas: 0,    merval: -0.25, cedear: -0.05, spread: 0 },
    { id: 'riesgo_pais', nombre: 'Salto del riesgo país', descripcion: 'El riesgo país sube 400 puntos y el MEP 10 %',   mep: 0.10, tasas: 0.05, merval: -0.15, cedear: 0.10, spread: 0.04 },
    { id: 'crisis',      nombre: 'Crisis combinada',     descripcion: 'Devaluación, suba de tasas, riesgo país y Merval', mep: 0.30, tasas: 0.10, merval: -0.25, cedear: 0.25, spread: 0.06 }
  ];

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Utilidades

  function suma(lista, f) {
    return lista.reduce(function (s, x) { return s + f(x); }, 0);
  }

  function valorARS(p) { return p.valorARS; }

  // Acepta "1234.5", "1234,5" y "1.234,5".
  function toNum(v) {
    var s = String(v == null ? '' : v).replace(/\s/g, '');
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }

  function pct(x) {
    return (x * 100).toFixed(1).replace('.', ',') + ' %';
  }

  function pctSigno(x) {
    return (x > 0 ? '+' : x < 0 ? '−' : '') + pct(Math.abs(x));
  }

  function miles(n) {
    return Math.round(n).toLocaleString('es-AR');
  }

  function fechaCorta(iso) {
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }

  function sumarDias(iso, dias) {
    return new Date(Date.parse(iso + 'T00:00:00Z') + dias * 864e5).toISOString().slice(0, 10);
  }

  function diasEntre(desde, hasta) {
    return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 864e5);
  }

  function aARS(monto, moneda, fx) {
    return moneda === 'USD' ? monto * fx.mep : monto;
  }

  // "de" + nombre de referencia, contrayendo "de el" en "del".
  function de(nombre) {
    return /^el /.test(nombre) ? 'del ' + nombre.slice(3) : 'de ' + nombre;
  }

  function concentrable(grupo) {
    return grupo === 'variable' || grupo === 'privada';
  }

  function sinAcentos(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  // Cartera

  // Completa una tenencia con los datos del instrumento y la valúa en su moneda y en pesos.
  function armarPosicion(t, instrumentos, fx) {
    var ins = instrumentos[t.simbolo] || {};
    var tipo = t.tipo || ins.tipo;
    var info = TIPOS[tipo];
    if (!info) return null;
    if (t.valorDirecto != null) return armarDirecta(t, info, fx);
    var precio = t.precioManual != null ? t.precioManual : (ins.precio != null ? ins.precio : t.precio);
    var p = {
      simbolo: t.simbolo,
      tipo: tipo,
      tipoNombre: info.nombre,
      grupo: info.grupo,
      moneda: t.moneda || ins.moneda || 'ARS',
      emisor: t.emisor || ins.emisor || t.simbolo,
      sector: t.sector || ins.sector || 'Sin dato',
      cantidad: t.cantidad,
      costo: t.costo == null ? null : t.costo,
      precio: precio,
      precioDeOperacion: ins.precio == null && t.precioManual == null,
      varDia: 'varDia' in t ? t.varDia : (ins.varDia == null ? null : ins.varDia),
      rend: t.rend != null ? t.rend : (ins.rend == null ? null : ins.rend),
      duration: t.duration != null ? t.duration : (ins.duration == null ? null : ins.duration),
      vence: ins.vence || null,
      flujos: ins.flujos || [],
      rendEnUsd: !!(t.rendEnUsd || ins.rendEnUsd),
      rendReal: !!(t.rendReal || ins.rendReal)
    };
    p.valor = p.cantidad * p.precio / info.cotizaPor;
    p.valorARS = aARS(p.valor, p.moneda, fx);
    p.costoARS = p.costo == null ? null : aARS(p.cantidad * p.costo / info.cotizaPor, p.moneda, fx);
    p.ganancia = p.costo ? p.precio / p.costo - 1 : null;
    return p;
  }

  // Tenencia cargada solo con su valor de mercado (como la muestra el broker): sin cantidad ni costo.
  function armarDirecta(t, info, fx) {
    var p = {
      simbolo: t.simbolo,
      tipo: t.tipo,
      tipoNombre: info.nombre,
      grupo: info.grupo,
      moneda: t.moneda || 'ARS',
      emisor: t.emisor || t.simbolo,
      sector: t.sector || 'Sin dato',
      cantidad: 1,
      costo: null,
      precio: t.valorDirecto,
      precioDeOperacion: false,
      varDia: null,
      rend: t.rend != null ? t.rend : null,
      duration: null,
      vence: t.vence || null,
      flujos: [],
      sinDetalle: true
    };
    p.valor = p.precio;
    p.valorARS = aARS(p.valor, p.moneda, fx);
    p.costoARS = null;
    p.ganancia = null;
    return p;
  }

  function armarCartera(tenencias, instrumentos, fx) {
    return tenencias.map(function (t) { return armarPosicion(t, instrumentos, fx); }).filter(Boolean);
  }

  function resumen(cartera) {
    var total = suma(cartera, valorARS);
    var conCosto = cartera.filter(function (p) { return p.costoARS != null; });
    var valorCon = suma(conCosto, valorARS);
    var costoCon = suma(conCosto, function (p) { return p.costoARS; });
    var grupos = {};
    var emisores = {};
    cartera.forEach(function (p) {
      grupos[p.grupo] = (grupos[p.grupo] || 0) + p.valorARS;
      if (concentrable(p.grupo)) emisores[p.emisor] = (emisores[p.emisor] || 0) + p.valorARS;
    });
    return {
      total: total,
      resultado: costoCon ? valorCon / costoCon - 1 : null,
      grupos: grupos,
      emisores: emisores,
      liquidez: total ? (grupos.liquidez || 0) / total : 0
    };
  }

  // AI Escenarios

  // Cambio de valor en pesos de una posición ante un escenario.
  function factorEscenario(p, esc) {
    var precio = 0;
    if (p.grupo === 'variable') precio = p.tipo === 'cedear' ? esc.cedear : esc.merval;
    else if (p.duration) precio = -p.duration * ((p.moneda === 'USD' || p.rendEnUsd) ? (esc.spread || 0) : esc.tasas);
    return p.moneda === 'USD' ? (1 + esc.mep) * (1 + precio) - 1 : precio;
  }

  function escenarios(cartera, fx, lista) {
    var total = suma(cartera, valorARS);
    return (lista || ESCENARIOS).map(function (esc) {
      var porPosicion = cartera.map(function (p) {
        return { simbolo: p.simbolo, deltaARS: p.valorARS * factorEscenario(p, esc) };
      });
      var delta = suma(porPosicion, function (x) { return x.deltaARS; });
      var usdAntes = total / fx.mep;
      var usdDespues = (total + delta) / (fx.mep * (1 + esc.mep));
      return {
        id: esc.id,
        nombre: esc.nombre,
        descripcion: esc.descripcion,
        deltaARS: delta,
        pctARS: total ? delta / total : 0,
        pctUSD: usdAntes ? usdDespues / usdAntes - 1 : 0,
        porPosicion: porPosicion
      };
    });
  }

  var CONSENSO = {
    strong_buy: ['compra fuerte', 2], buy: ['compra', 1], hold: ['mantener', 0],
    underperform: ['bajo rendimiento', -1], sell: ['venta', -1], strong_sell: ['venta fuerte', -2]
  };

  var VEREDICTO = {
    comprar: 'Comprar', comprar_parcial: 'Comprar', comprar_mas: 'Comprar', no_comprar: 'No comprar',
    vender: 'Vender', vender_todo: 'Vender', reducir: 'Vender', reducir_limite: 'Vender', reducir_grupo: 'Vender',
    reducir_sector: 'Vender', reducir_riesgo: 'Vender', rotar: 'Vender', revisar: 'Vender', reinvertir: 'Mantener', mantener: 'Mantener', sin_datos: 'Mantener'
  };

  // AI Acciones: suma señales de fuentes externas (analistas, precio objetivo, tendencia) y de tu resultado.
  // Puntaje >= 2 comprar más, <= -2 vender, <= -3 vender todo; en una compra nueva alcanza con >= 1.
  function puntuar(pos, a, g, peso, L, esCompra) {
    var puntos = 0;
    var senales = [];
    function sumar(p, texto) {
      puntos += p;
      senales.push(texto + ' (' + (p > 0 ? '+' : '') + p + ')');
    }
    if (a) {
      var c = a.consenso && CONSENSO[a.consenso];
      if (c) sumar(c[1], 'Analistas: ' + c[0] + (a.analistas ? ', ' + a.analistas + ' opiniones sobre ' + a.tickerAnalistas : ''));
      if (a.upside != null) sumar(a.upside > 0.15 ? 1 : a.upside < -0.05 ? -1 : 0, 'Precio objetivo ' + pctSigno(a.upside) + ' sobre el actual');
      var tendencia = a.var6m != null ? a.var6m : a.var30d;
      if (tendencia != null) sumar(tendencia > 0.10 ? 1 : tendencia < -0.15 ? -1 : 0, 'Tendencia a ' + (a.var6m != null ? '6 meses' : '30 días') + ': ' + pctSigno(tendencia));
    }
    if (!esCompra && g != null) {
      if (g < L.perdidaRevisar) sumar(-1, 'Pérdida de ' + pct(-g) + ' contra tu PPC, mayor al límite de ' + pct(-L.perdidaRevisar));
      else if (g > L.gananciaReducir && peso > L.pesoReducir) sumar(-1, 'Ganancia de ' + pct(g) + ' con un peso de ' + pct(peso) + ': tomar parte');
      else sumar(0, 'Resultado de ' + pctSigno(g) + ' contra tu PPC');
    }
    var fuente = a ? ' Fuente: ' + a.fuente + ' (' + a.ticker + ').' : ' Sin información externa para este activo.';
    var motivo = (senales.length ? senales.join('; ') + '. Puntaje ' + (puntos > 0 ? '+' : '') + puntos + '.' : 'Sin señales.') + fuente;
    if (esCompra) {
      return puntos >= 1 ? { accion: 'comprar', motivo: motivo, voto: 'ok' } : { accion: 'no_comprar', motivo: motivo, voto: 'alerta' };
    }
    if (!a && g == null) return { accion: 'sin_datos', motivo: motivo, voto: 'neutral' };
    if (puntos >= 2) return { accion: 'comprar_mas', motivo: motivo, voto: 'ok' };
    if (puntos <= -3) return { accion: 'vender_todo', motivo: motivo, voto: 'alerta' };
    if (puntos <= -2) return { accion: 'vender', motivo: motivo, voto: 'alerta' };
    return { accion: 'mantener', motivo: motivo, voto: 'neutral' };
  }

  // El comité: recorre los 14 agentes para una posición o una compra.
  // ctx: { cartera, fx, ref, limites, fuentes, noticias, hoy, compra, restringidos }
  function evaluar(pos, ctx) {
    var L = ctx.limites;
    var ref = ctx.ref;
    var fx = ctx.fx;
    var cartera = ctx.cartera;
    var esCompra = !!ctx.compra;

    var tot = suma(cartera, valorARS);
    var valorNuevo = esCompra ? pos.valorARS : 0;
    var totPost = tot + valorNuevo;
    var emisorActual = suma(cartera.filter(function (p) { return concentrable(p.grupo) && p.emisor === pos.emisor; }), valorARS);
    var grupoActual = suma(cartera.filter(function (p) { return p.grupo === pos.grupo; }), valorARS);
    var liquidezActual = suma(cartera.filter(function (p) { return p.grupo === 'liquidez'; }), valorARS);
    var peso = tot && !esCompra ? pos.valorARS / tot : 0;
    var emisorPost = totPost ? (emisorActual + valorNuevo) / totPost : 0;
    var grupoPost = totPost ? (grupoActual + valorNuevo) / totPost : 0;
    var liquidezPost = totPost ? (liquidezActual + (pos.grupo === 'liquidez' ? valorNuevo : 0)) / totPost : 0;
    var g = esCompra ? null : pos.ganancia;

    var trail = [];
    var motivos = [];
    var vetos = [];
    var votos = {};
    function paso(nodo, salida, voto) {
      trail.push({ nodo: nodo, salida: salida, voto: voto });
      votos[nodo] = voto;
    }

    // AI Fuentes
    var activas = (ctx.fuentes || []).filter(function (f) { return f.activa; });
    var conErrores = activas.filter(function (f) { return f.estado && f.estado.errores; });
    if (!activas.length) {
      paso('fuentes', 'Sin fuentes activas: se usan datos de ejemplo.', 'alerta');
      motivos.push('No hay fuentes activas: el análisis usa datos de ejemplo.');
    } else if (!activas.some(function (f) { return f.estado; })) {
      // Ninguna fuente se leyó todavía: los datos son los cargados a mano.
      paso('fuentes', activas.length + ' fuentes activas, todavía sin lectura en vivo: se usan los datos cargados a mano.', 'neutral');
    } else if (!conErrores.length) {
      var vivas = activas.filter(function (f) { return f.estado; });
      paso('fuentes', vivas.length + ' de ' + activas.length + ' fuentes leídas en vivo (' + vivas.map(function (f) { return f.nombre; }).join(', ') + '); el resto, datos cargados a mano.', 'ok');
    } else if (conErrores.length) {
      paso('fuentes', activas.length + ' fuentes activas; ' + conErrores.map(function (f) { return f.nombre; }).join(', ') + ' con errores.', 'alerta');
    } else {
      paso('fuentes', activas.length + ' fuentes activas, sin errores.', 'ok');
    }

    // AI Dólar
    var brecha = fx.ccl / fx.mep - 1;
    paso('dolar', 'MEP ' + miles(fx.mep) + ' · CCL ' + miles(fx.ccl) + ' · brecha ' + pct(brecha) +
      (pos.moneda === 'USD' ? ' · se valúa al MEP' : ''), 'neutral');

    // AI Acciones o AI Renta Fija
    var rama = pos.grupo === 'variable' || pos.grupo === 'cripto' ? 'acciones' : 'rentafija';
    var sug;
    if (rama === 'acciones') {
      sug = puntuar(pos, (ctx.analisis || {})[pos.simbolo], g, peso, L, esCompra);
    } else {
      // Una ON en dólares que cotiza en pesos se compara con la referencia en dólares.
      var usd = pos.moneda === 'USD' || pos.rendEnUsd;
      var tasaRef = usd ? ref.tasaUsd : ref.tasaCaucion;
      // Un bono CER rinde en términos reales: se compara con el plazo fijo descontada la inflación.
      if (pos.rendReal) tasaRef = (1 + ref.tasaCaucion) / (1 + ref.inflacionEsperada) - 1;
      var nombreRef = pos.rendReal ? 'el plazo fijo en términos reales (' + pct(tasaRef) + ')'
        : usd ? 'la referencia en dólares (' + pct(tasaRef) + ')' : (ref.nombreTasa || 'la caución') + ' (' + pct(tasaRef) + (ref.tasaEsEfectiva ? ' efectiva anual)' : ' TNA)');
      if (pos.tipo === 'fci') sug = { accion: 'mantener', motivo: 'Fondo de liquidez: se mantiene como colchón.', voto: 'ok' };
      else if (pos.tipo === 'caucion' && !esCompra && pos.vence && diasEntre(ctx.hoy, pos.vence) <= 7) {
        sug = { accion: 'reinvertir', motivo: 'Vence el ' + fechaCorta(pos.vence) + ': definir dónde reinvertir.', voto: 'alerta' };
      } else if (pos.tipo === 'caja') {
        sug = { accion: 'mantener', motivo: 'Dólares en caja: reserva de liquidez que no rinde. Si no los vas a usar, una caución o un FCI en dólares les daría rendimiento.', voto: 'neutral' };
      } else if (pos.rend == null && g != null) {
        // Sin TIR se decide por el resultado contra el PPC y se avisa qué falta.
        sug = g < L.perdidaRevisar
          ? { accion: 'revisar', motivo: 'Pérdida de ' + pct(-g) + ' contra tu PPC. Falta su TIR para compararla con ' + nombreRef + '.', voto: 'alerta' }
          : { accion: 'mantener', motivo: 'Resultado de ' + pctSigno(g) + ' contra tu PPC. Falta su TIR para compararla con ' + nombreRef + ': cargala para una evaluación completa.', voto: 'neutral' };
      } else if (pos.rend == null && esCompra) {
        sug = { accion: 'no_comprar', motivo: 'No hay TIR en vivo para este título: el comité no recomienda comprar sin poder compararlo con ' + nombreRef + '.', voto: 'neutral' };
      } else if (pos.rend == null) sug = { accion: 'sin_datos', motivo: 'Sin rendimiento de referencia ni costo de compra: cargá la TIR o tu PPC.', voto: 'neutral' };
      else if (esCompra) {
        sug = pos.rend >= tasaRef - 0.02
          ? { accion: 'comprar', motivo: 'Rinde ' + pct(pos.rend) + ', igual o mejor que ' + nombreRef + '.', voto: 'ok' }
          : { accion: 'no_comprar', motivo: 'Rinde ' + pct(pos.rend) + ', por debajo ' + de(nombreRef) + '.', voto: 'alerta' };
      } else if (pos.rend < tasaRef - 0.02) sug = { accion: 'rotar', motivo: 'Rinde ' + pct(pos.rend) + ', por debajo ' + de(nombreRef) + '.', voto: 'alerta' };
      else sug = { accion: 'mantener', motivo: 'TIR de ' + pct(pos.rend) + (pos.rend >= tasaRef ? ', por encima ' : ', apenas por debajo (dentro del margen de 2 puntos) ') + de(nombreRef) + '.', voto: 'ok' };
    }
    paso(rama, sug.motivo, sug.voto);
    motivos.push(sug.motivo);

    // AI Macro
    if (pos.grupo !== 'variable' && pos.moneda === 'ARS' && pos.rend != null && pos.rend < ref.inflacionEsperada) {
      var m = 'Rinde menos que la inflación de referencia (' + pct(ref.inflacionEsperada) + ').';
      paso('macro', m, 'alerta');
      motivos.push(m);
    } else {
      paso('macro', 'Inflación de referencia: ' + pct(ref.inflacionEsperada) + ' anual (' + (ref.fuenteInflacion || 'valor de ejemplo') + ').', 'neutral');
    }

    // AI Noticias
    var fuenteHechos = activas.some(function (f) { return f.tipo === 'Hechos relevantes'; });
    var noticia = (ctx.noticias || {})[pos.simbolo];
    if (!fuenteHechos) paso('noticias', 'La fuente de hechos relevantes está inactiva.', 'neutral');
    else if (noticia) {
      paso('noticias', noticia.texto, noticia.tono === 'alerta' ? 'alerta' : 'neutral');
      if (noticia.tono === 'alerta') motivos.push('AI Noticias: ' + noticia.texto);
    } else paso('noticias', 'Sin novedades en las fuentes.', 'neutral');

    // AI Liquidez
    if (liquidezPost < L.liquidezMin) {
      var liq = 'Liquidez en ' + pct(liquidezPost) + ', debajo del mínimo de ' + pct(L.liquidezMin) + '.';
      paso('liquidez', liq, 'alerta');
      motivos.push(liq);
    } else if (pos.vence && !esCompra && diasEntre(ctx.hoy, pos.vence) <= 7) {
      paso('liquidez', 'Vence en ' + diasEntre(ctx.hoy, pos.vence) + ' días.', 'alerta');
    } else {
      paso('liquidez', 'Liquidez en ' + pct(liquidezPost) + '.', 'ok');
    }

    // AI Guardián: emisor, sector y aporte al riesgo de la cartera
    var excesoEmisor = concentrable(pos.grupo) && emisorPost > L.emisor;
    var limiteSector = L.sector || 0.40;
    var conSector = !!(pos.sector && pos.sector !== 'Sin dato' && concentrable(pos.grupo));
    var sectorActual = conSector
      ? suma(cartera.filter(function (p) { return concentrable(p.grupo) && p.sector === pos.sector; }), valorARS) : 0;
    var sectorPost = totPost ? (sectorActual + valorNuevo) / totPost : 0;
    var excesoSector = conSector && sectorPost > limiteSector;
    var infoRiesgo = (ctx.riesgo || {})[pos.simbolo];
    var capRiesgo = L.contribRiesgo || 0.25;
    var excesoRiesgo = !esCompra && !!infoRiesgo && infoRiesgo.contribucionRiesgo > capRiesgo;
    var partesGuardian = [];
    var votoGuardian = 'ok';
    function avisoGuardian(texto) {
      partesGuardian.push(texto);
      if (esCompra) { vetos.push({ quien: 'AI Guardián', motivo: texto }); votoGuardian = 'veto'; }
      else { motivos.push(texto); if (votoGuardian !== 'veto') votoGuardian = 'alerta'; }
    }
    if (excesoEmisor) {
      avisoGuardian((esCompra ? 'El emisor pasaría a ' : 'El emisor pesa ') + pct(emisorPost) + ', por encima del límite de ' + pct(L.emisor) + '.');
    }
    if (excesoSector) {
      avisoGuardian('El sector ' + pos.sector + (esCompra ? ' pasaría a ' : ' pesa ') + pct(sectorPost) + ', por encima del límite de ' + pct(limiteSector) + '.');
    }
    if (excesoRiesgo) {
      partesGuardian.push('Aporta ' + pct(infoRiesgo.contribucionRiesgo) + ' del riesgo de la cartera (volatilidad ' + pct(infoRiesgo.volatilidad) + '), por encima del límite de ' + pct(capRiesgo) + '.');
      motivos.push(partesGuardian[partesGuardian.length - 1]);
      if (votoGuardian !== 'veto') votoGuardian = 'alerta';
    }
    if (!partesGuardian.length) {
      partesGuardian.push((concentrable(pos.grupo) ? 'Emisor en ' + pct(emisorPost) + ', dentro del límite' : 'Sin límite por emisor para este tipo') +
        (infoRiesgo ? '; aporta ' + pct(infoRiesgo.contribucionRiesgo) + ' del riesgo de la cartera' : '') + '.');
    }
    paso('guardian', partesGuardian.join(' '), votoGuardian);

    // AI Escenarios
    var base = esCompra ? valorNuevo : pos.valorARS;
    var peor = null;
    ESCENARIOS.forEach(function (esc) {
      var delta = base * factorEscenario(pos, esc);
      if (!peor || delta < peor.delta) peor = { nombre: esc.nombre, delta: delta };
    });
    var perdida = totPost && peor.delta < 0 ? -peor.delta / totPost : 0;
    if (perdida > L.perdidaEscenario) {
      var pe = 'En ' + peor.nombre.toLowerCase() + ' restaría ' + pct(perdida) + ' a la cartera.';
      paso('escenarios', pe, 'alerta');
      motivos.push('AI Escenarios: ' + pe);
    } else {
      paso('escenarios', perdida ? 'Peor caso: ' + peor.nombre.toLowerCase() + ', resta ' + pct(perdida) + '.' : 'Ningún escenario le resta valor.', 'ok');
    }

    // AI Compliance
    var excesoGrupo = pos.grupo === 'soberana' && grupoPost > L.soberana;
    var comp = 'Sin observaciones.';
    var votoComp = 'ok';
    if (excesoGrupo) {
      comp = 'Renta fija soberana en ' + pct(grupoPost) + ', por encima del límite de ' + pct(L.soberana) + '.';
      if (esCompra) {
        votoComp = 'veto';
        vetos.push({ quien: 'AI Compliance', motivo: comp });
      } else {
        votoComp = 'alerta';
        motivos.push(comp);
      }
    }
    if ((ctx.restringidos || []).indexOf(pos.simbolo) >= 0) {
      comp = 'Símbolo en lista restringida.';
      votoComp = esCompra ? 'veto' : 'alerta';
      if (esCompra) vetos.push({ quien: 'AI Compliance', motivo: comp });
    }
    paso('compliance', comp, votoComp);

    var res = {
      simbolo: pos.simbolo,
      tipo: pos.tipoNombre,
      tipoId: pos.tipo,
      grupo: pos.grupo,
      moneda: pos.moneda,
      precio: pos.precio,
      valorARS: pos.valorARS,
      compra: esCompra,
      accion: '',
      decision: '',
      nivel: 'neutral',
      cantidad: null,
      motivos: motivos,
      vetos: vetos,
      fiscal: null,
      trail: trail,
      votos: votos
    };
    var valorUnitario = pos.cantidad ? pos.valorARS / pos.cantidad : 0;

    // AI Tamaño (solo con veto) y AI Comité
    if (esCompra) {
      if (vetos.length && sug.accion === 'comprar') {
        var techo = Infinity;
        if (concentrable(pos.grupo)) techo = Math.min(techo, (L.emisor * tot - emisorActual) / (1 - L.emisor));
        if (excesoSector) techo = Math.min(techo, (limiteSector * tot - sectorActual) / (1 - limiteSector));
        if (pos.grupo === 'soberana') techo = Math.min(techo, (L.soberana * tot - grupoActual) / (1 - L.soberana));
        var maxCant = isFinite(techo) && valorUnitario ? Math.max(0, Math.floor(techo / valorUnitario)) : 0;
        paso('tamano', maxCant ? 'Tamaño máximo: ' + miles(maxCant) + ' unidades.' : 'Ninguna cantidad entra en los límites.', maxCant ? 'alerta' : 'veto');
        res.cantidad = maxCant;
        res.accion = maxCant ? 'comprar_parcial' : 'no_comprar';
        res.decision = maxCant ? 'Comprar hasta ' + miles(maxCant) : 'No comprar';
        res.nivel = maxCant ? 'warn' : 'no';
      } else if (sug.accion === 'comprar') {
        res.accion = 'comprar';
        res.decision = 'Comprar ' + miles(pos.cantidad);
        res.cantidad = pos.cantidad;
        res.nivel = 'ok';
      } else if (sug.accion === 'no_comprar') {
        res.accion = 'no_comprar';
        res.decision = 'No comprar';
        res.nivel = 'no';
      } else {
        res.accion = 'sin_datos';
        res.decision = 'Sin datos suficientes';
      }
    } else {
      var acc = sug.accion;
      var soberanas = cartera.filter(function (p) { return p.grupo === 'soberana'; })
        .sort(function (a, b) { return b.valorARS - a.valorARS; });
      if (acc === 'mantener' && excesoEmisor) acc = 'reducir_limite';
      else if (acc === 'mantener' && excesoGrupo && soberanas.length && soberanas[0].simbolo === pos.simbolo) acc = 'reducir_grupo';
      else if (acc === 'mantener' && excesoSector && cartera.filter(function (p) { return concentrable(p.grupo) && p.sector === pos.sector; })
        .sort(function (x, y) { return y.valorARS - x.valorARS; })[0].simbolo === pos.simbolo) acc = 'reducir_sector';
      else if (acc === 'mantener' && excesoRiesgo) acc = 'reducir_riesgo';
      if (acc === 'comprar_mas' && (excesoSector || excesoRiesgo)) {
        acc = 'mantener';
        motivos.push('El comité compraría más, pero ' + (excesoSector ? 'el sector ' + pos.sector + ' ya supera su límite.' : 'la posición ya aporta demasiado al riesgo de la cartera.'));
      }
      if (acc === 'comprar_mas' && concentrable(pos.grupo) && emisorPost > L.emisor * 0.9) {
        acc = 'mantener';
        motivos.push('El comité compraría más, pero el emisor ya pesa ' + pct(emisorPost) + ' y el límite es ' + pct(L.emisor) + '.');
      } else if (acc === 'comprar_mas' && liquidezPost < L.liquidezMin) {
        acc = 'mantener';
        motivos.push('El comité compraría más, pero la liquidez está debajo del mínimo.');
      }
      var parte = function (q) { return pos.tipo === 'cripto' ? Number(q.toFixed(8)) : Math.max(1, Math.round(q)); };
      res.accion = acc;
      if (acc === 'comprar_mas') {
        res.decision = 'Comprar más (+10 %)';
        res.cantidad = parte(pos.cantidad * 0.10);
        res.nivel = 'ok';
      } else if (acc === 'vender') {
        res.decision = 'Vender ' + Math.round(L.recorte * 100) + ' %';
        res.cantidad = parte(pos.cantidad * L.recorte);
        res.nivel = 'warn';
      } else if (acc === 'vender_todo') {
        res.decision = 'Vender todo';
        res.cantidad = pos.cantidad;
        res.nivel = 'no';
      } else if (acc === 'reducir') {
        res.decision = 'Reducir ' + Math.round(L.recorte * 100) + ' %';
        res.cantidad = Math.floor(pos.cantidad * L.recorte);
        res.nivel = 'warn';
      } else if (acc === 'reducir_limite') {
        res.decision = 'Reducir al límite por emisor';
        res.cantidad = Math.min(pos.cantidad, Math.ceil((emisorActual - L.emisor * tot) / (1 - L.emisor) / valorUnitario));
        res.nivel = 'warn';
      } else if (acc === 'reducir_grupo') {
        res.decision = 'Reducir hasta el límite de renta fija';
        res.cantidad = Math.min(pos.cantidad, Math.ceil((grupoActual - L.soberana * tot) / (1 - L.soberana) / valorUnitario));
        res.nivel = 'warn';
      } else if (acc === 'reducir_sector') {
        res.decision = 'Reducir por concentración en ' + pos.sector;
        res.cantidad = Math.min(pos.cantidad, Math.ceil((sectorActual - limiteSector * tot) / (1 - limiteSector) / valorUnitario));
        res.nivel = 'warn';
      } else if (acc === 'reducir_riesgo') {
        res.decision = 'Reducir por aporte al riesgo';
        res.cantidad = parte(pos.cantidad * L.recorte);
        res.nivel = 'warn';
      } else if (acc === 'revisar') {
        res.decision = 'Revisar tesis';
        res.nivel = 'warn';
      } else if (acc === 'rotar') {
        res.decision = 'Rotar a una opción que rinda más';
        res.nivel = 'warn';
      } else if (acc === 'reinvertir') {
        res.decision = 'Reinvertir al vencimiento';
        res.nivel = 'warn';
      } else if (acc === 'mantener') {
        res.decision = 'Mantener';
        res.nivel = 'ok';
      } else {
        res.decision = 'Sin datos suficientes';
      }
    }
    res.veredicto = VEREDICTO[res.accion] || 'Mantener';
    paso('comite', res.veredicto + ': ' + res.decision, res.nivel === 'ok' ? 'ok' : res.nivel === 'no' ? 'veto' : res.nivel === 'warn' ? 'alerta' : 'neutral');

    // AI Fiscal: solo cuando la decisión es vender
    if (!esCompra && /^(reducir|vender)/.test(res.accion) && res.cantidad && pos.costo != null) {
      var info = TIPOS[pos.tipo];
      var ganancia = res.cantidad * (pos.precio - pos.costo) / info.cotizaPor;
      var gananciaARS = aARS(ganancia, pos.moneda, fx);
      res.fiscal = { gananciaARS: gananciaARS };
      paso('fiscal', 'Ganancia realizada estimada: ARS ' + miles(gananciaARS) + '. La alícuota depende de tu situación: consultalo con tu contador.', 'neutral');
    }

    // AI Memoria
    paso('memoria', 'Se registra cuando la aprobás o la rechazás.', 'neutral');
    return res;
  }

  function accionable(r) {
    return ['reducir', 'reducir_limite', 'reducir_grupo', 'rotar', 'reinvertir', 'comprar', 'comprar_parcial', 'comprar_mas', 'vender', 'vender_todo', 'reducir_sector', 'reducir_riesgo'].indexOf(r.accion) >= 0;
  }

  // Activos nuevos

  // Arma una posición hipotética para evaluar una compra. Devuelve { pos } o { error }.
  function armarCandidato(item, instrumentos, fx) {
    var sym = String(item.simbolo || '').trim().toUpperCase();
    if (!sym) return { error: 'Ingresá un símbolo.' };
    var ins = instrumentos[sym] || {};
    var tipo = item.tipo || ins.tipo;
    if (!TIPOS[tipo]) return { simbolo: sym, error: 'Elegí el tipo de instrumento: el símbolo no está en el catálogo.' };
    var precio = toNum(item.precio);
    if (!(precio > 0)) precio = ins.precio;
    if (!(precio > 0)) return { simbolo: sym, error: 'Falta el precio: el símbolo no está en el catálogo.' };
    var cantidad = toNum(item.cantidad);
    if (!(cantidad > 0)) return { simbolo: sym, error: 'La cantidad tiene que ser mayor a cero.' };
    var t = {
      simbolo: sym,
      tipo: tipo,
      moneda: item.moneda || ins.moneda || 'ARS',
      cantidad: cantidad,
      costo: null,
      precio: precio,
      precioManual: toNum(item.precio) > 0 ? precio : null,
      rend: item.rend != null ? item.rend : null
    };
    return { pos: armarPosicion(t, instrumentos, fx) };
  }

  function evaluarCandidato(item, ctx) {
    var c = armarCandidato(item, ctx.instrumentos, ctx.fx);
    if (c.error) return { simbolo: c.simbolo || '', error: c.error };
    var o = {};
    Object.keys(ctx).forEach(function (k) { o[k] = ctx[k]; });
    o.compra = true;
    return evaluar(c.pos, o);
  }

  // Impacto de una compra antes de mandarla al comité.
  function previewImpacto(item, ctx) {
    var c = armarCandidato(item, ctx.instrumentos, ctx.fx);
    if (c.error) return { error: c.error };
    var pos = c.pos;
    var L = ctx.limites;
    var cartera = ctx.cartera;
    var tot = suma(cartera, valorARS);
    var totPost = tot + pos.valorARS;
    var emisor = concentrable(pos.grupo)
      ? suma(cartera.filter(function (p) { return concentrable(p.grupo) && p.emisor === pos.emisor; }), valorARS)
      : null;
    var grupo = suma(cartera.filter(function (p) { return p.grupo === pos.grupo; }), valorARS);
    var toca = [];
    if (emisor != null && (emisor + pos.valorARS) / totPost > L.emisor) toca.push('Límite por emisor (' + pct(L.emisor) + ')');
    if (pos.grupo === 'soberana' && (grupo + pos.valorARS) / totPost > L.soberana) toca.push('Límite de renta fija soberana (' + pct(L.soberana) + ')');
    return {
      pos: pos,
      valorARS: pos.valorARS,
      emisorAntes: emisor == null ? null : (tot ? emisor / tot : 0),
      emisorDespues: emisor == null ? null : (emisor + pos.valorARS) / totPost,
      grupoAntes: tot ? grupo / tot : 0,
      grupoDespues: (grupo + pos.valorARS) / totPost,
      toca: toca
    };
  }

  // Rebalanceo

  // Rebalanceo por bandas: solo se opera un grupo que se salió de su objetivo por más de `banda` puntos.
  // Dentro de un grupo se vende primero lo que está en pérdida (realiza la pérdida) y después lo más grande.
  function rebalanceo(cartera, objetivo, comision, banda, aportacion) {
    var tolerancia = banda == null ? 0.05 : banda;
    var total = suma(cartera, valorARS);
    var filas = Object.keys(GRUPOS).map(function (gr) {
      var actual = suma(cartera.filter(function (p) { return p.grupo === gr; }), valorARS);
      var meta = (objetivo[gr] || 0) * total;
      var actualPct = total ? actual / total : 0;
      return {
        grupo: gr, nombre: GRUPOS[gr], actualPct: actualPct, objetivoPct: objetivo[gr] || 0,
        diferencia: meta - actual, fueraBanda: Math.abs(actualPct - (objetivo[gr] || 0)) > tolerancia
      };
    });
    var ventas = [];
    filas.filter(function (f) { return f.diferencia < 0 && f.fueraBanda; }).forEach(function (f) {
      var resta = -f.diferencia;
      cartera.filter(function (p) { return p.grupo === f.grupo; })
        .sort(function (a, b) {
          var ga = a.ganancia == null ? 1 : a.ganancia;
          var gb = b.ganancia == null ? 1 : b.ganancia;
          return ga - gb || b.valorARS - a.valorARS;
        })
        .forEach(function (p) {
          if (resta <= 0) return;
          var monto = Math.min(resta, p.valorARS);
          // Cripto se opera en fracciones (hasta 8 decimales); el resto, en unidades enteras.
          var cripto = p.tipo === 'cripto';
          var exacta = monto / (p.valorARS / p.cantidad);
          var cantidad = cripto ? Number(Math.min(p.cantidad, Math.ceil(exacta * 1e8) / 1e8).toFixed(8)) : Math.min(p.cantidad, Math.ceil(exacta));
          ventas.push({ simbolo: p.simbolo, montoARS: monto, cantidad: cantidad, decimales: cripto ? 8 : 0, ganancia: p.ganancia });
          resta -= monto;
        });
    });
    return {
      total: total,
      filas: filas,
      ventas: ventas,
      compras: compras(filas, total, objetivo, aportacion),
      banda: tolerancia,
      sumaObjetivo: suma(Object.keys(GRUPOS), function (gr) { return objetivo[gr] || 0; }),
      comisionARS: suma(filas.filter(function (f) { return f.fueraBanda; }), function (f) { return Math.abs(f.diferencia); }) * comision
    };
  }

  // Aportar sin vender: la plata nueva va a los grupos por debajo de su objetivo, en proporción a lo que les falta
  // (el total pasa a ser el actual más la aportación). Si el objetivo suma 100 %, se reparte todo.
  function compras(filas, total, objetivo, aportacion) {
    if (!(aportacion > 0)) return [];
    var nuevoTotal = total + aportacion;
    var faltas = filas.map(function (f) {
      return { grupo: f.grupo, nombre: f.nombre, falta: (objetivo[f.grupo] || 0) * nuevoTotal - (f.actualPct * total) };
    }).filter(function (x) { return x.falta > 0; });
    var necesidad = suma(faltas, function (x) { return x.falta; });
    if (!(necesidad > 0)) return [];
    return faltas.map(function (x) {
      return { grupo: x.grupo, nombre: x.nombre, montoARS: aportacion * x.falta / necesidad };
    });
  }

  // Calendario de flujos

  function calendario(cartera, fx, hoy, dias) {
    var hasta = sumarDias(hoy, dias);
    var items = [];
    cartera.forEach(function (p) {
      p.flujos.forEach(function (f) {
        if (f.fecha < hoy || f.fecha > hasta) return;
        var monto = p.cantidad * f.monto / TIPOS[p.tipo].cotizaPor;
        items.push({ fecha: f.fecha, simbolo: p.simbolo, concepto: f.concepto, moneda: p.moneda, monto: monto, montoARS: aARS(monto, p.moneda, fx) });
      });
    });
    return items.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  }

  // Importación del broker

  var COLUMNAS = ['fecha', 'simbolo', 'tipo', 'operacion', 'cantidad', 'precio', 'moneda'];
  var CSV_EJEMPLO = [
    'fecha,simbolo,tipo,operacion,cantidad,precio,moneda',
    '2026-03-02,GGAL,accion,compra,1500,4800,ARS',
    '2026-06-10,GGAL,accion,venta,300,5600,ARS',
    '2026-04-15,AL30D,bono,compra,15000,57.8,USD',
    '2026-08-20,KO,cedear,compra,400,9100,ARS',
    '2026-10-01,CAUCION,caucion,compra,2500000,1,ARS'
  ].join('\n');

  function leerTipo(s) {
    var t = sinAcentos(s);
    if (TIPOS[t]) return t;
    if (/^accion/.test(t)) return 'accion';
    if (/^cedear/.test(t)) return 'cedear';
    if (/^bono/.test(t)) return 'bono';
    if (/^(letra|lecap|lede)/.test(t)) return 'letra';
    if (/^(on|obligacion)/.test(t)) return 'on';
    if (/^caucion/.test(t)) return 'caucion';
    if (/^(fci|fondo)/.test(t)) return 'fci';
    return null;
  }

  function leerFecha(s) {
    var t = String(s || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    var m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return null;
  }

  // Convierte un extracto CSV en tenencias con costo promedio ponderado.
  function importarCSV(texto, instrumentos) {
    var lineas = String(texto || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (lineas.length < 2) return { tenencias: [], errores: ['El archivo no tiene operaciones.'], operaciones: 0 };
    var sep = lineas[0].indexOf(';') >= 0 ? ';' : ',';
    var cab = lineas[0].split(sep).map(sinAcentos);
    var idx = {};
    COLUMNAS.forEach(function (c) { idx[c] = cab.indexOf(c); });
    var faltan = ['fecha', 'simbolo', 'operacion', 'cantidad', 'precio'].filter(function (c) { return idx[c] < 0; });
    if (faltan.length) return { tenencias: [], errores: ['Faltan columnas: ' + faltan.join(', ') + '.'], operaciones: 0 };

    var ops = [];
    var errores = [];
    lineas.slice(1).forEach(function (l, i) {
      var c = l.split(sep).map(function (x) { return x.trim(); });
      var linea = 'Línea ' + (i + 2) + ': ';
      var sym = String(c[idx.simbolo] || '').toUpperCase();
      var ins = instrumentos[sym] || {};
      var tipo = idx.tipo >= 0 && c[idx.tipo] ? leerTipo(c[idx.tipo]) : ins.tipo;
      var op = sinAcentos(c[idx.operacion]);
      var cantidad = toNum(c[idx.cantidad]);
      var precio = toNum(c[idx.precio]);
      var fecha = leerFecha(c[idx.fecha]);
      var monedaTxt = idx.moneda >= 0 ? String(c[idx.moneda] || '').toUpperCase() : '';
      var moneda = /USD|US\$|DOLAR|MEP|CCL/.test(monedaTxt) ? 'USD' : (monedaTxt ? 'ARS' : (ins.moneda || 'ARS'));
      if (!sym) return errores.push(linea + 'falta el símbolo.');
      if (!fecha) return errores.push(linea + 'la fecha tiene que ser AAAA-MM-DD o DD/MM/AAAA.');
      if (!tipo) return errores.push(linea + 'tipo desconocido para ' + sym + '.');
      if (op !== 'compra' && op !== 'venta') return errores.push(linea + 'la operación tiene que ser compra o venta.');
      if (!(cantidad > 0)) return errores.push(linea + 'la cantidad tiene que ser mayor a cero.');
      if (!(precio > 0)) return errores.push(linea + 'el precio tiene que ser mayor a cero.');
      ops.push({ fecha: fecha, simbolo: sym, tipo: tipo, op: op, cantidad: cantidad, precio: precio, moneda: moneda, linea: i + 2 });
    });

    ops.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.linea - b.linea; });
    var pos = {};
    ops.forEach(function (o) {
      var p = pos[o.simbolo] || (pos[o.simbolo] = { simbolo: o.simbolo, tipo: o.tipo, moneda: o.moneda, cantidad: 0, costoTotal: 0, precio: o.precio });
      if (o.op === 'compra') {
        p.cantidad += o.cantidad;
        p.costoTotal += o.cantidad * o.precio;
      } else if (p.cantidad <= 0) {
        errores.push('Línea ' + o.linea + ': venta de ' + o.simbolo + ' sin tenencia previa.');
      } else {
        var vendida = Math.min(o.cantidad, p.cantidad);
        p.costoTotal -= p.costoTotal / p.cantidad * vendida;
        p.cantidad -= vendida;
      }
      p.precio = o.precio;
    });

    var tenencias = Object.keys(pos).map(function (k) { return pos[k]; })
      .filter(function (p) { return p.cantidad > 1e-9; })
      .map(function (p) {
        return { simbolo: p.simbolo, tipo: p.tipo, moneda: p.moneda, cantidad: p.cantidad, costo: p.costoTotal / p.cantidad, precio: p.precio };
      });
    return { tenencias: tenencias, errores: errores, operaciones: ops.length };
  }

  // Alertas: lo que el backend enviaría por correo o Telegram.

  function alertas(d) {
    var L = d.limites;
    var lista = [];
    calendario(d.cartera, d.fx, d.hoy, 7).forEach(function (f) {
      lista.push({ evento: 'vencimientos', nivel: 'warn', texto: f.concepto + ' de ' + f.simbolo + ' el ' + fechaCorta(f.fecha) + '.' });
    });
    var r = resumen(d.cartera);
    if (r.total) {
      var sob = (r.grupos.soberana || 0) / r.total;
      if (sob > L.soberana) lista.push({ evento: 'limites', nivel: 'warn', texto: 'Renta fija soberana en ' + pct(sob) + ', por encima del límite de ' + pct(L.soberana) + '.' });
      Object.keys(r.emisores).forEach(function (e) {
        var w = r.emisores[e] / r.total;
        if (w > L.emisor) lista.push({ evento: 'limites', nivel: 'warn', texto: e + ' pesa ' + pct(w) + ', por encima del límite por emisor.' });
      });
      if (r.liquidez < L.liquidezMin) lista.push({ evento: 'limites', nivel: 'warn', texto: 'Liquidez en ' + pct(r.liquidez) + ', debajo del mínimo.' });
    }
    (d.fuentes || []).forEach(function (f) {
      if (f.activa && f.estado && f.estado.errores) lista.push({ evento: 'fuentes', nivel: 'warn', texto: f.nombre + ': ' + f.estado.errores + ' errores en la última lectura.' });
    });
    (d.resultados || []).forEach(function (x) {
      if (x.vetos && x.vetos.length) lista.push({ evento: 'vetos', nivel: 'no', texto: x.simbolo + ': veto de ' + x.vetos[0].quien + '.' });
    });
    return lista;
  }

  // Informes

  function puntoEn(historia, fecha) {
    var p = historia[0];
    for (var i = 0; i < historia.length && historia[i].fecha <= fecha; i += 1) p = historia[i];
    return p;
  }

  function periodoInforme(tipo, hoy) {
    var anio = Number(hoy.slice(0, 4));
    var mes = Number(hoy.slice(5, 7));
    if (tipo === 'diario') {
      return { desde: sumarDias(hoy, -1), hasta: hoy, etiqueta: 'Diario · ' + fechaCorta(hoy) };
    }
    if (tipo === 'mensual') {
      var finMes = sumarDias(hoy.slice(0, 8) + '01', -1);
      var finAnterior = sumarDias(finMes.slice(0, 8) + '01', -1);
      return { desde: finAnterior, hasta: finMes, etiqueta: 'Mensual · ' + MESES[Number(finMes.slice(5, 7)) - 1] + ' ' + finMes.slice(0, 4) };
    }
    var a = mes === 12 ? anio : anio - 1;
    return { desde: (a - 1) + '-12-31', hasta: a + '-12-31', etiqueta: 'Anual · ' + a };
  }

  // ctx: { cartera, historia, hoy, benchmarks }
  function metricasInforme(tipo, ctx) {
    var per = periodoInforme(tipo, ctx.hoy);
    var r = resumen(ctx.cartera);
    var a = puntoEn(ctx.historia, per.desde);
    var b = puntoEn(ctx.historia, per.hasta);
    var valorFin = r.total * b.indice;
    var m = {
      tipo: tipo,
      etiqueta: per.etiqueta,
      desde: a.fecha,
      hasta: b.fecha,
      valorFinARS: valorFin,
      valorFinUSD: valorFin / b.mep,
      rendimientoARS: b.indice / a.indice - 1,
      rendimientoUSD: (b.indice / b.mep) / (a.indice / a.mep) - 1,
      variacionMEP: b.mep / a.mep - 1,
      inflacion: null,
      merval: null,
      plazoFijo: null,
      mejor: null,
      peor: null,
      advertencias: ['Datos de ejemplo.']
    };
    if (tipo === 'mensual') {
      var k = (Number(b.fecha.slice(0, 4)) - 2025) * 12 + Number(b.fecha.slice(5, 7)) - 12;
      if (k >= 0 && k < 12) {
        m.inflacion = ctx.benchmarks.inflacion[k] / 100;
        m.merval = ctx.benchmarks.merval[k] / 100;
        m.plazoFijo = ctx.benchmarks.plazoFijo[k] / 100;
      }
    }
    var campo = tipo === 'diario' ? 'varDia' : 'ganancia';
    var conDato = ctx.cartera.filter(function (p) { return p[campo] != null; })
      .map(function (p) { return { simbolo: p.simbolo, valor: tipo === 'diario' ? p.varDia / 100 : p.ganancia }; })
      .sort(function (x, y) { return y.valor - x.valor; });
    if (conDato.length) {
      m.mejor = conDato[0];
      m.peor = conDato[conDato.length - 1];
    }
    if (tipo !== 'diario') m.advertencias.push('Mejor y peor posición: resultado acumulado al día de hoy, no del período.');
    return m;
  }

  function textoInforme(m) {
    var lineas = [];
    lineas.push(m.etiqueta + ' (' + fechaCorta(m.desde) + ' al ' + fechaCorta(m.hasta) + ')');
    lineas.push('');
    lineas.push('La cartera cerró en ARS ' + miles(m.valorFinARS) + ', equivalente a USD ' + miles(m.valorFinUSD) + ' al MEP. ' +
      'Rindió ' + pctSigno(m.rendimientoARS) + ' en pesos y ' + pctSigno(m.rendimientoUSD) + ' en dólares; el MEP varió ' + pctSigno(m.variacionMEP) + '.');
    if (m.inflacion != null) {
      var contra = [
        ['a la inflación', 'de la inflación', m.inflacion],
        ['al Merval', 'del Merval', m.merval],
        ['al plazo fijo', 'del plazo fijo', m.plazoFijo]
      ].map(function (c) {
        return (m.rendimientoARS >= c[2] ? 'le ganó ' + c[0] : 'quedó debajo ' + c[1]) + ' (' + pctSigno(c[2]) + ')';
      });
      lineas.push('En el mes ' + contra.join(', ') + '.');
    }
    if (m.mejor && m.peor && m.mejor.simbolo !== m.peor.simbolo) {
      lineas.push('Mejor posición: ' + m.mejor.simbolo + ' (' + pctSigno(m.mejor.valor) + '). Peor: ' + m.peor.simbolo + ' (' + pctSigno(m.peor.valor) + ').');
    }
    m.advertencias.forEach(function (a) { lineas.push('Nota: ' + a); });
    return lineas.join('\n');
  }

  // Rendimiento acumulado en pesos de los últimos 12 meses, contra cuatro alternativas.
  function serieBenchmarks(historia, benchmarks, mepMensual, mesesBench, hoy) {
    var base = puntoEn(historia, '2025-11-30');
    var etiquetas = ['nov 25'].concat(mesesBench.slice(0, 11)).concat(['nov 26']);
    var cartera = [0];
    for (var k = 0; k < 12; k += 1) {
      var anio = 2025 + Math.floor((11 + k) / 12);
      var mes = (11 + k) % 12 + 1;
      var fin = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
      if (fin > hoy) fin = hoy;
      cartera.push(puntoEn(historia, fin).indice / base.indice - 1);
    }
    function acumulado(vals) {
      var out = [0];
      var nivel = 1;
      vals.forEach(function (v) { nivel *= 1 + v / 100; out.push(nivel - 1); });
      return out;
    }
    return {
      etiquetas: etiquetas,
      series: [
        { nombre: 'Cartera', valores: cartera },
        { nombre: 'Merval', valores: acumulado(benchmarks.merval) },
        { nombre: 'Inflación', valores: acumulado(benchmarks.inflacion) },
        { nombre: 'Plazo fijo', valores: acumulado(benchmarks.plazoFijo) },
        { nombre: 'Dólar MEP', valores: acumulado(mepMensual.slice(-12)) }
      ]
    };
  }

  // Lo que AI Comité le pasa a Claude para responder preguntas: solo datos, sin el DOM.
  function datosParaClaude(d) {
    var r = resumen(d.cartera);
    return {
      fecha: d.hoy,
      aclaracion: 'Datos de ejemplo salvo que el usuario haya importado su cartera.',
      tipoDeCambio: d.fx,
      totalARS: Math.round(r.total),
      totalUSD_MEP: Math.round(r.total / d.fx.mep),
      resultadoContraCosto: r.resultado == null ? null : Number(r.resultado.toFixed(4)),
      posiciones: d.cartera.map(function (p) {
        return {
          simbolo: p.simbolo, tipo: p.tipoNombre, moneda: p.moneda, cantidad: p.cantidad, precio: p.precio,
          valorARS: Math.round(p.valorARS), peso: r.total ? Number((p.valorARS / r.total).toFixed(4)) : 0,
          resultado: p.ganancia == null ? null : Number(p.ganancia.toFixed(4)),
          rendimientoAnual: p.rend, vence: p.vence
        };
      }),
      composicion: Object.keys(r.grupos).map(function (g) {
        return { grupo: GRUPOS[g], peso: Number((r.grupos[g] / r.total).toFixed(4)) };
      }),
      limites: d.limites,
      flujosProximos90Dias: calendario(d.cartera, d.fx, d.hoy, 90).map(function (f) {
        return { fecha: f.fecha, simbolo: f.simbolo, concepto: f.concepto, moneda: f.moneda, monto: Math.round(f.monto) };
      }),
      escenarios: escenarios(d.cartera, d.fx).map(function (e) {
        return { escenario: e.nombre, impactoPesos: Number(e.pctARS.toFixed(4)), impactoDolares: Number(e.pctUSD.toFixed(4)) };
      }),
      ultimasDecisiones: (d.decisiones || []).slice(0, 8).map(function (x) {
        return { fecha: x.fecha.slice(0, 10), simbolo: x.simbolo, decision: x.decision, estado: x.estado };
      })
    };
  }

  function validarUrl(u) {
    try {
      return new URL(u).protocol === 'https:' ? null : 'La URL tiene que empezar con https://';
    } catch (e) {
      return 'La URL no es válida.';
    }
  }

  global.Quórum = {
    TIPOS: TIPOS,
    GRUPOS: GRUPOS,
    PERFILES: PERFILES,
    NODOS: NODOS,
    ESCENARIOS: ESCENARIOS,
    CSV_EJEMPLO: CSV_EJEMPLO,
    toNum: toNum,
    pct: pct,
    pctSigno: pctSigno,
    miles: miles,
    fechaCorta: fechaCorta,
    sumarDias: sumarDias,
    armarCartera: armarCartera,
    resumen: resumen,
    evaluar: evaluar,
    accionable: accionable,
    evaluarCandidato: evaluarCandidato,
    previewImpacto: previewImpacto,
    escenarios: escenarios,
    rebalanceo: rebalanceo,
    calendario: calendario,
    importarCSV: importarCSV,
    alertas: alertas,
    metricasInforme: metricasInforme,
    textoInforme: textoInforme,
    serieBenchmarks: serieBenchmarks,
    datosParaClaude: datosParaClaude,
    validarUrl: validarUrl
  };
})(window);
