/* Front de Quórum: pinta las vistas y conecta los controles.
   No decide nada: los cálculos y el comité están en funciones.js (window.Quórum). */
(function () {
  'use strict';

  var D = window.QuorumDatos;
  var F = window.Quórum;
  var G = window.QuorumGraficos;
  var A = window.QuorumAlmacen;

  var VISTAS = ['cartera', 'recomendaciones', 'evaluar', 'lista', 'decisiones', 'informes', 'escenarios', 'riesgo', 'estrategia', 'rebalanceo', 'preguntar', 'comite', 'fuentes', 'ajustes'];
  var MENOS_MOVIMIENTO = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MS_PASO = MENOS_MOVIMIENTO ? 0 : 60;
  var COLUMNAS_VOTO = ['fuentes', 'dolar', 'acciones', 'rentafija', 'macro', 'noticias', 'liquidez', 'guardian', 'escenarios', 'compliance', 'tamano', 'comite', 'fiscal'];
  var TEXTO_VOTO = { ok: 'OK', alerta: '!', veto: 'VETO', neutral: '·' };
  var AGENTE_POR_TIPO = { 'Precios': 'AI Fuentes', 'Tipo de cambio': 'AI Dólar', 'Tasas': 'AI Macro', 'Balances': 'AI Acciones', 'Noticias': 'AI Noticias', 'Hechos relevantes': 'AI Noticias', 'Portafolio': 'AI Fuentes', 'Cripto': 'AI Fuentes', 'Valor de cuotapartes': 'AI Fuentes' };
  var PERMANENTES = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
  var NOMBRE = {};
  F.NODOS.forEach(function (n) { NOMBRE[n.id] = n.nombre; });

  function copia(x) { return JSON.parse(JSON.stringify(x)); }

  function configInicial() {
    return {
      perfil: 'moderado',
      limites: copia(F.PERFILES.moderado.limites),
      objetivo: copia(F.PERFILES.moderado.objetivo),
      alertas: { canal: 'correo', destino: '', eventos: { vencimientos: true, limites: true, vetos: true, fuentes: false } },
      vista: 'ARS'
    };
  }

  var estado = {
    tenencias: copia(D.CARTERA_IOL),
    origen: 'importada',
    instrumentos: copia(D.INSTRUMENTOS),
    config: configInicial(),
    fuentes: copia(D.FUENTES_EJEMPLO),
    lista: [],
    decisiones: [],
    resultadosCartera: null,
    resultadosLista: null,
    ultimo: null,
    ocupado: false,
    filtroRec: 'todos',
    filtroDec: 'todas',
    rango: '90',
    informe: 'diario',
    textosInforme: {},
    shocks: copia(F.ESCENARIOS),
    escDetalle: 'crisis',
    importacion: null,
    chat: [],
    riesgo: null,
    riesgoMapa: null,
    estrategia: null,
    carteraId: 'lucas',
    carteras: [{ id: 'lucas', nombre: 'Lucas' }],
    analisis: {},
    promesaAnalisis: null,
    sample: null,
    downloads: null
  };

  // Utilidades de DOM y formato

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function vaciar(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }

  function el(tag, props, hijos) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = props[k];
      else if (k === 'clase') n.className = props[k];
      else n.setAttribute(k, props[k]);
    });
    (hijos || []).forEach(function (h) {
      if (h != null) n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
    });
    return n;
  }

  function num(n, dec) { return Number(n).toLocaleString('es-AR', { maximumFractionDigits: dec == null ? 2 : dec }); }
  function cotizacionVista() { var v = estado.config.vista; return v === 'ARS' ? 1 : (v === 'CCL' ? D.FX.ccl : D.FX.mep); }
  function enVista(ars) { return ars / cotizacionVista(); }
  function dinero(ars) { return (estado.config.vista === 'ARS' ? 'ARS ' : 'USD ') + F.miles(enVista(ars)); }
  function dineroSigno(ars) { return (ars > 0 ? '+' : ars < 0 ? '−' : '') + dinero(Math.abs(ars)); }
  function compacto(v) {
    var a = Math.abs(v);
    var s = a >= 1e6 ? num(v / 1e6, 1) + ' M' : a >= 1e3 ? num(v / 1e3, 0) + ' mil' : num(v, 0);
    return (estado.config.vista === 'ARS' ? 'ARS ' : 'USD ') + s;
  }
  function claseSigno(x) { return x > 0 ? 'pos' : x < 0 ? 'neg' : ''; }

  function cartera() { return F.armarCartera(estado.tenencias, estado.instrumentos, D.FX); }
  function ctx(c) {
    return {
      cartera: c || cartera(), fx: D.FX, ref: D.REFERENCIAS, limites: estado.config.limites,
      fuentes: estado.fuentes, noticias: D.NOTICIAS, hoy: D.HOY, instrumentos: estado.instrumentos, restringidos: [],
      analisis: estado.analisis,
      riesgo: estado.riesgoMapa
    };
  }

  // Cada cartera guarda sus datos con su propio prefijo; las fuentes son compartidas.
  function clave(nombre) { return 'c-' + estado.carteraId + '-' + nombre; }
  function guardarC(nombre, valor) { A.guardar(clave(nombre), valor); }
  function guardarConfig() { guardarC('config', estado.config); }
  function nombreActiva() {
    var c = estado.carteras.filter(function (x) { return x.id === estado.carteraId; })[0];
    return c ? c.nombre : '';
  }

  function textoError(code) {
    return {
      not_granted: 'No diste permiso para usar Claude desde esta página.',
      sampling_disabled: 'Claude no está disponible para tu cuenta.',
      rate_limited: 'Demasiadas consultas seguidas. Probá en un rato.',
      session_expired: 'Tu sesión venció: volvé a iniciar sesión en claude.ai.',
      refused: 'Claude no respondió esta consulta. Probá reformularla.',
      prompt_too_large: 'La consulta es demasiado larga.',
      empty_completion: 'No hubo respuesta. Probá con una pregunta más concreta.'
    }[code] || 'No se pudo completar la consulta. Probá de nuevo.';
  }

  // Encabezado

  function aplicarVista() {
    $$('#vista-moneda button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-vista') === estado.config.vista));
    });
    $('#banner-ejemplo').hidden = estado.origen !== 'ejemplo';
  }

  $$('#vista-moneda button').forEach(function (b) {
    b.addEventListener('click', function () {
      estado.config.vista = b.getAttribute('data-vista');
      guardarConfig();
      aplicarVista();
      mostrar();
    });
  });

  $('#btn-ir-importar').addEventListener('click', function () {
    setTimeout(function () {
      $('#importar').open = true;
      $('#importar').scrollIntoView({ behavior: MENOS_MOVIMIENTO ? 'auto' : 'smooth' });
    }, 0);
  });

  // Mi cartera

  function barra(etiqueta, parte) {
    return el('div', { clase: 'bar-row' }, [
      el('span', { texto: etiqueta }),
      el('div', { clase: 'bar-track' }, [el('div', { clase: 'bar-fill', style: 'width:' + Math.min(100, parte * 100).toFixed(1) + '%' })]),
      el('output', { texto: F.pct(parte) })
    ]);
  }

  function renderCartera() {
    var c = cartera();
    var r = F.resumen(c);
    $('#k-valor').textContent = dinero(r.total);
    $('#k-valor-alt').textContent = estado.config.vista === 'ARS'
      ? 'USD ' + F.miles(r.total / D.FX.mep) + ' al MEP'
      : 'ARS ' + F.miles(r.total);
    $('#k-resultado').textContent = r.resultado == null ? '—' : F.pctSigno(r.resultado);
    $('#k-resultado').className = r.resultado == null ? '' : claseSigno(r.resultado);
    $('#k-liquidez').textContent = F.pct(r.liquidez);
    $('#k-posiciones').textContent = String(c.length);

    var cuerpo = vaciar($('#cuerpo-cartera'));
    var hayPrecioOperacion = false;
    c.forEach(function (p) {
      if (p.precioDeOperacion) hayPrecioOperacion = true;
      cuerpo.appendChild(el('tr', null, [
        el('td', { clase: 'txt' }, [el('b', { texto: p.simbolo })]),
        el('td', { clase: 'txt', texto: p.tipoNombre }),
        el('td', { clase: 'txt', texto: p.moneda }),
        el('td', { texto: p.sinDetalle ? '—' : (estado.tenencias.some(function (t) { return t.simbolo === p.simbolo && t.cantidadEstimada; }) ? '≈ ' : '') + num(p.cantidad, p.tipo === 'cripto' ? 8 : 0) }),
        el('td', { texto: p.sinDetalle ? '—' : num(p.precio) + (p.precioDeOperacion ? ' *' : '') }),
        el('td', { texto: dinero(p.valorARS) }),
        el('td', { texto: r.total ? F.pct(p.valorARS / r.total) : '—' }),
        el('td', { clase: p.ganancia == null ? '' : claseSigno(p.ganancia), texto: p.ganancia == null ? '—' : F.pctSigno(p.ganancia) }),
        el('td', { clase: p.varDia == null ? '' : claseSigno(p.varDia), texto: p.varDia == null ? '—' : F.pctSigno(p.varDia / 100) })
      ]));
    });
    if (!c.length) cuerpo.appendChild(el('tr', null, [el('td', { clase: 'txt', colspan: '9', texto: 'No hay posiciones. Importá tus operaciones o volvé a la cartera de ejemplo desde Ajustes.' })]));
    if (hayPrecioOperacion) cuerpo.appendChild(el('tr', null, [el('td', { clase: 'txt envuelve', colspan: '9', texto: '* Precio de tu última operación: la fuente de precios lo actualiza en el backend.' })]));

    var grupos = vaciar($('#barras-grupos'));
    Object.keys(F.GRUPOS).forEach(function (g) { grupos.appendChild(barra(F.GRUPOS[g], r.total ? (r.grupos[g] || 0) / r.total : 0)); });
    var emisores = vaciar($('#barras-emisores'));
    Object.keys(r.emisores).sort(function (a, b) { return r.emisores[b] - r.emisores[a]; }).slice(0, 8).forEach(function (e) {
      emisores.appendChild(barra(e, r.emisores[e] / r.total));
    });

    var flujos = vaciar($('#cuerpo-flujos'));
    var cal = F.calendario(c, D.FX, D.HOY, 90);
    cal.forEach(function (f) {
      flujos.appendChild(el('tr', null, [
        el('td', { clase: 'txt', texto: F.fechaCorta(f.fecha) }),
        el('td', { clase: 'txt', texto: f.simbolo }),
        el('td', { clase: 'txt', texto: f.concepto }),
        el('td', { texto: f.moneda + ' ' + F.miles(f.monto) }),
        el('td', { texto: dinero(f.montoARS) })
      ]));
    });
    if (!cal.length) flujos.appendChild(el('tr', null, [el('td', { clase: 'txt', colspan: '5', texto: 'No hay cobros ni vencimientos en los próximos 90 días.' })]));

    renderEvolucion(r.total);
  }

  function renderEvolucion(total) {
    var graf = $('#graf-evolucion');
    var chips = $('#rango-evolucion');
    if (estado.origen !== 'ejemplo') {
      vaciar(graf);
      chips.hidden = true;
      $('#nota-evolucion').textContent = 'La evolución diaria se arma con los snapshots que guarda el backend cada día. Con tu cartera importada todavía no hay historia.';
      return;
    }
    chips.hidden = false;
    $$('#rango-evolucion button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-rango') === estado.rango)); });
    var h = D.HISTORIA;
    if (estado.rango !== 'todo') h = h.slice(-Number(estado.rango));
    var vista = estado.config.vista;
    var ratioCcl = D.FX.ccl / D.FX.mep;
    var valores = h.map(function (p) {
      var ars = p.indice * total;
      return vista === 'ARS' ? ars : vista === 'MEP' ? ars / p.mep : ars / (p.mep * ratioCcl);
    });
    G.lineas(graf, {
      titulo: 'Evolución del valor de la cartera',
      etiquetas: h.map(function (p) { return F.fechaCorta(p.fecha).slice(0, 5) + (estado.rango === '90' ? '' : '/' + p.fecha.slice(2, 4)); }),
      series: [{ nombre: 'Cartera', valores: valores }],
      formato: function (v) { return compacto(v); },
      formatoEje: function (v) { return compacto(v); },
      marcasX: 6
    });
    $('#nota-evolucion').textContent = 'Historia de ejemplo. En dólares se usa el MEP de cada día.';
  }

  $$('#rango-evolucion button').forEach(function (b) {
    b.addEventListener('click', function () {
      estado.rango = b.getAttribute('data-rango');
      renderEvolucion(F.resumen(cartera()).total);
    });
  });

  // Importación

  $('#btn-csv-ejemplo').addEventListener('click', function () { $('#csv-texto').value = F.CSV_EJEMPLO; });

  $('#csv-archivo').addEventListener('change', function () {
    var archivo = this.files && this.files[0];
    if (!archivo) return;
    var lector = new FileReader();
    lector.onload = function () { $('#csv-texto').value = String(lector.result || ''); };
    lector.onerror = function () { vaciar($('#csv-resultado')).appendChild(el('p', { clase: 'status neg', texto: 'No se pudo leer el archivo.' })); };
    lector.readAsText(archivo);
  });

  $('#btn-csv-importar').addEventListener('click', function () {
    var res = F.importarCSV($('#csv-texto').value, estado.instrumentos);
    estado.importacion = res;
    var out = vaciar($('#csv-resultado'));
    out.appendChild(el('p', { clase: 'status', texto: res.operaciones + ' operaciones leídas · ' + res.tenencias.length + ' posiciones abiertas' + (res.errores.length ? ' · ' + res.errores.length + ' con problemas' : '') + '.' }));
    if (res.errores.length) out.appendChild(el('ul', { clase: 'lista neg' }, res.errores.slice(0, 10).map(function (e) { return el('li', { texto: e }); })));
    if (res.tenencias.length) {
      out.appendChild(el('div', { clase: 'scroll' }, [el('table', { clase: 'tbl' }, [
        el('thead', null, [el('tr', null, [el('th', { clase: 'txt', texto: 'Símbolo' }), el('th', { clase: 'txt', texto: 'Tipo' }), el('th', { clase: 'txt', texto: 'Moneda' }), el('th', { texto: 'Cantidad' }), el('th', { texto: 'Costo promedio' })])]),
        el('tbody', null, res.tenencias.map(function (t) {
          return el('tr', null, [el('td', { clase: 'txt', texto: t.simbolo }), el('td', { clase: 'txt', texto: F.TIPOS[t.tipo].nombre }), el('td', { clase: 'txt', texto: t.moneda }), el('td', { texto: num(t.cantidad, 0) }), el('td', { texto: num(t.costo) })]);
        }))
      ])]));
    }
    $('#btn-csv-usar').hidden = !res.tenencias.length;
  });

  $('#btn-csv-usar').addEventListener('click', function () {
    if (!estado.importacion || !estado.importacion.tenencias.length) return;
    estado.tenencias = estado.importacion.tenencias;
    estado.origen = 'importada';
    estado.resultadosCartera = null;
    guardarC('cartera', { tenencias: estado.tenencias, origen: 'importada', importado: new Date().toISOString() });
    $('#btn-csv-usar').hidden = true;
    vaciar($('#csv-resultado')).appendChild(el('p', { clase: 'status pos', texto: 'Listo: ya estás viendo tu cartera. Generá una recomendación para que el comité la evalúe.' }));
    aplicarVista();
    renderCartera();
  });

  // Tarjetas, matriz y decisiones

  function registrarDecision(r, est, motivo, origen) {
    var fecha = new Date().toISOString();
    var hoy = fecha.slice(0, 10);
    estado.decisiones.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      fecha: fecha,
      simbolo: r.simbolo,
      tipo: r.tipo,
      decision: r.decision,
      cantidad: r.cantidad,
      estado: est,
      motivo: motivo || '',
      motivoComite: r.motivos[0] || '',
      origen: origen,
      precio: r.precio,
      moneda: r.moneda,
      mediciones: [30, 90, 365].map(function (d) { return F.sumarDias(hoy, d); })
    });
    estado.decisiones = estado.decisiones.slice(0, 300);
    guardarC('decisiones', estado.decisiones);
  }

  function recorrido(trail) {
    return el('ol', { clase: 'trail' }, trail.map(function (t) {
      return el('li', null, [el('b', { texto: NOMBRE[t.nodo] || t.nodo }), ' ' + t.salida]);
    }));
  }

  function tarjeta(r, origen) {
    if (r.error) {
      return el('article', { clase: 'card nivel-no' }, [
        el('h4', { texto: r.simbolo || 'Sin símbolo' }),
        el('p', { clase: 'muted', texto: r.error })
      ]);
    }
    var nivel = { ok: 'badge ok', warn: 'badge warn', no: 'badge no', neutral: 'badge' }[r.nivel];
    var hijos = [
      el('div', { clase: 'card-cab' }, [
        el('h4', { texto: r.simbolo + ' · ' + r.tipo }),
        el('span', {
          clase: { Comprar: 'badge ok', Vender: 'badge no', 'No comprar': 'badge warn', Mantener: 'badge' }[r.veredicto] || nivel,
          texto: !r.veredicto || r.decision.indexOf(r.veredicto) === 0 ? r.decision : r.veredicto + ' · ' + r.decision
        })
      ])
    ];
    if (r.cantidad) {
      var unitario = r.valorARS / (r.compra ? (r.accion === 'comprar' ? r.cantidad : r.valorARS ? r.valorARS / (r.valorARS / 1) : 1) : 1);
      hijos.push(el('p', { clase: 'muted', texto: 'Cantidad: ' + num(r.cantidad, 0) + (r.compra && r.accion === 'comprar' ? ' · ' + dinero(r.valorARS) : '') }));
      void unitario;
    }
    if (r.vetos.length) {
      hijos.push(el('ul', { clase: 'lista' }, r.vetos.map(function (v) { return el('li', { clase: 'neg', texto: 'Veto de ' + v.quien + ': ' + v.motivo }); })));
    }
    if (r.motivos.length) hijos.push(el('ul', { clase: 'lista' }, r.motivos.map(function (m) { return el('li', { texto: m }); })));
    if (r.fiscal) hijos.push(el('p', { clase: 'muted', texto: 'AI Fiscal: ganancia realizada estimada de ' + dinero(r.fiscal.gananciaARS) + '. La alícuota depende de tu situación: consultalo con tu contador.' }));

    var detalle = el('details', null, [el('summary', { texto: 'Ver el recorrido del comité' }), recorrido(r.trail)]);
    hijos.push(detalle);

    var ver = el('button', { type: 'button', clase: 'btn ghost chico', texto: 'Ver en el grafo' });
    ver.addEventListener('click', function () {
      estado.ultimo = { nombre: r.simbolo, trail: r.trail, resultados: [r] };
      location.hash = '#comite';
    });

    var nodo = el('article', { clase: 'card nivel-' + r.nivel }, hijos);
    if (F.accionable(r)) {
      if (r.registro) {
        nodo.appendChild(el('div', { clase: 'acciones' }, [
          el('span', { clase: r.registro === 'aprobada' ? 'badge ok' : 'badge', texto: r.registro === 'aprobada' ? 'Aprobada · en Decisiones' : 'Rechazada · en Decisiones' }),
          ver
        ]));
      } else {
        var motivo = el('input', { clase: 'motivo', maxlength: '140', placeholder: 'Tu motivo (opcional)', 'aria-label': 'Tu motivo para ' + r.simbolo });
        var aprobar = el('button', { type: 'button', clase: 'btn chico', texto: 'Aprobar' });
        var rechazar = el('button', { type: 'button', clase: 'btn ghost chico', texto: 'Rechazar' });
        var decidir = function (est) {
          registrarDecision(r, est, motivo.value.trim(), origen);
          r.registro = est;
          nodo.replaceWith(tarjeta(r, origen));
        };
        aprobar.addEventListener('click', function () { decidir('aprobada'); });
        rechazar.addEventListener('click', function () { decidir('rechazada'); });
        nodo.appendChild(el('div', { clase: 'decidir' }, [motivo, aprobar, rechazar]));
        nodo.appendChild(el('div', { clase: 'acciones' }, [ver]));
      }
    } else {
      nodo.appendChild(el('div', { clase: 'acciones' }, [ver]));
    }
    return nodo;
  }

  function matriz(resultados) {
    var cols = COLUMNAS_VOTO.filter(function (id) { return resultados.some(function (r) { return r.votos && r.votos[id]; }); });
    var cab = el('tr', null, [el('th', { clase: 'txt', texto: 'Activo' })].concat(cols.map(function (id) {
      return el('th', { title: NOMBRE[id], texto: NOMBRE[id].replace('AI ', '') });
    })));
    var filas = resultados.filter(function (r) { return !r.error; }).map(function (r) {
      var salidas = {};
      r.trail.forEach(function (t) { salidas[t.nodo] = t.salida; });
      return el('tr', null, [el('td', { clase: 'txt' }, [el('b', { texto: r.simbolo })])].concat(cols.map(function (id) {
        var v = r.votos[id];
        return el('td', null, v ? [el('span', { clase: 'voto ' + v, title: NOMBRE[id] + ': ' + salidas[id], texto: TEXTO_VOTO[v] })] : []);
      })));
    });
    return el('table', { clase: 'tbl matriz' }, [el('thead', null, [cab]), el('tbody', null, filas)]);
  }

  function chipsResumen(resultados, contenedor) {
    var cuenta = {};
    resultados.forEach(function (r) { var k = r.error ? 'Con error' : (r.veredicto || r.decision); cuenta[k] = (cuenta[k] || 0) + 1; });
    vaciar(contenedor);
    Object.keys(cuenta).forEach(function (k) { contenedor.appendChild(el('span', { clase: 'chip', texto: k + ': ' + cuenta[k] })); });
  }

  // Recomendaciones

  var grafoRec = null;

  function pasaFiltro(r) {
    var f = estado.filtroRec;
    if (f === 'todos') return true;
    if (f === 'variable') return r.grupo === 'variable';
    if (f === 'renta') return r.grupo === 'soberana' || r.grupo === 'privada';
    return r.grupo === 'liquidez';
  }

  function renderRecomendaciones() {
    var res = estado.resultadosCartera;
    var acc = vaciar($('#rec-accion'));
    var sin = vaciar($('#rec-sin-cambios'));
    $('#rec-filtros').hidden = !res;
    $('#rec-matriz-bloque').hidden = !res;
    if (!res) { vaciar($('#rec-resumen')); return; }
    chipsResumen(res, $('#rec-resumen'));
    $$('#rec-filtros button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filtro') === estado.filtroRec)); });
    var visibles = res.filter(pasaFiltro);
    var conAccion = visibles.filter(function (r) { return F.accionable(r) || r.nivel === 'warn' || r.nivel === 'no'; });
    var resto = visibles.filter(function (r) { return conAccion.indexOf(r) < 0; });
    if (conAccion.length) {
      acc.appendChild(el('h3', { texto: 'Requieren tu decisión (' + conAccion.length + ')' }));
      conAccion.forEach(function (r) { acc.appendChild(tarjeta(r, 'cartera')); });
    }
    if (resto.length) {
      sin.appendChild(el('h3', { texto: 'Sin cambios (' + resto.length + ')' }));
      resto.forEach(function (r) { sin.appendChild(tarjeta(r, 'cartera')); });
    }
    if (!visibles.length) acc.appendChild(el('p', { clase: 'muted', texto: 'No hay posiciones de este tipo.' }));
    vaciar($('#matriz-rec')).appendChild(matriz(res));
  }

  $$('#rec-filtros button').forEach(function (b) {
    b.addEventListener('click', function () { estado.filtroRec = b.getAttribute('data-filtro'); renderRecomendaciones(); });
  });

  function ocupar(si, boton) {
    estado.ocupado = si;
    if (boton) boton.disabled = si;
  }

  $('#btn-recomendar').addEventListener('click', function () {
    if (estado.ocupado) return;
    var boton = this;
    var c = cartera();
    if (!c.length) { $('#rec-progreso').textContent = 'Tu cartera está vacía.'; return; }
    ocupar(true, boton);
    if (estado.promesaAnalisis) {
      $('#rec-progreso').textContent = 'Buscando información financiera de tus activos…';
      estado.promesaAnalisis.then(function () { ocupar(false, boton); boton.click(); });
      return;
    }
    estado.resultadosCartera = null;
    renderRecomendaciones();
    $('#rec-grafo-caja').hidden = false;
    if (!grafoRec) grafoRec = G.grafo($('#grafo-rec'), F.NODOS);
    var cx = ctx(c);
    var res = [];
    var i = 0;
    (function siguiente() {
      if (i >= c.length) {
        estado.resultadosCartera = res;
        estado.ultimo = { nombre: 'Recomendación de cartera (última posición: ' + res[res.length - 1].simbolo + ')', trail: res[res.length - 1].trail, resultados: res };
        var n = res.filter(F.accionable).length;
        $('#rec-progreso').textContent = 'Listo: ' + res.length + ' posiciones evaluadas; ' + n + (n === 1 ? ' requiere' : ' requieren') + ' tu decisión.';
        renderRecomendaciones();
        ocupar(false, boton);
        return;
      }
      var p = c[i];
      $('#rec-progreso').textContent = 'El comité evalúa ' + (i + 1) + ' de ' + c.length + ': ' + p.simbolo + '…';
      var r = F.evaluar(p, cx);
      res.push(r);
      i += 1;
      grafoRec.animar(r.trail, MS_PASO, siguiente);
    })();
  });

  // Evaluar un activo

  var grafoEval = null;

  function leerFormularioEvaluar() {
    var rend = parseFloat($('#ev-rend').value);
    return {
      simbolo: $('#ev-simbolo').value,
      tipo: $('#ev-tipo').value,
      moneda: $('#ev-moneda').value,
      cantidad: $('#ev-cantidad').value,
      precio: $('#ev-precio').value,
      rend: isFinite(rend) ? rend / 100 : null
    };
  }

  function actualizarPreview() {
    var caja = vaciar($('#eval-preview'));
    var item = leerFormularioEvaluar();
    if (!item.simbolo.trim()) { caja.appendChild(el('p', { clase: 'muted', texto: 'Escribí un símbolo para ver el impacto.' })); return; }
    var pv = F.previewImpacto(item, ctx());
    if (pv.error) { caja.appendChild(el('p', { clase: 'muted', texto: pv.error })); return; }
    var p = pv.pos;
    caja.appendChild(el('div', { clase: 'card-cab' }, [
      el('h4', { texto: p.simbolo + ' · ' + p.tipoNombre + ' · ' + p.moneda }),
      pv.toca.length ? el('span', { clase: 'badge warn', texto: 'Toca un límite' }) : el('span', { clase: 'badge ok', texto: 'Dentro de los límites' })
    ]));
    var lineas = ['Valor de la compra: ' + dinero(pv.valorARS) + ' (precio ' + num(p.precio) + ' ' + p.moneda + ').'];
    if (pv.emisorAntes != null) lineas.push('Peso del emisor ' + p.emisor + ': ' + F.pct(pv.emisorAntes) + ' → ' + F.pct(pv.emisorDespues) + '.');
    lineas.push(F.GRUPOS[p.grupo] + ': ' + F.pct(pv.grupoAntes) + ' → ' + F.pct(pv.grupoDespues) + '.');
    pv.toca.forEach(function (t) { lineas.push('Toca: ' + t + '.'); });
    caja.appendChild(el('ul', { clase: 'lista' }, lineas.map(function (l) { return el('li', { texto: l }); })));
  }

  ['ev-simbolo', 'ev-tipo', 'ev-moneda', 'ev-cantidad', 'ev-precio', 'ev-rend'].forEach(function (id) {
    $('#' + id).addEventListener('input', actualizarPreview);
  });

  $('#form-evaluar').addEventListener('submit', function (e) {
    e.preventDefault();
    if (estado.ocupado) return;
    var r = F.evaluarCandidato(leerFormularioEvaluar(), ctx());
    var salida = vaciar($('#eval-resultado'));
    if (r.error) { salida.appendChild(tarjeta(r, 'evaluar')); return; }
    $('#eval-grafo-caja').hidden = false;
    if (!grafoEval) grafoEval = G.grafo($('#grafo-eval'), F.NODOS);
    ocupar(true, null);
    salida.appendChild(el('p', { clase: 'muted', texto: 'El comité evalúa ' + r.simbolo + '…' }));
    grafoEval.animar(r.trail, MS_PASO, function () {
      estado.ultimo = { nombre: r.simbolo + ' (compra)', trail: r.trail, resultados: [r] };
      vaciar(salida).appendChild(tarjeta(r, 'evaluar'));
      ocupar(false, null);
    });
  });

  // Lista de seguimiento

  function renderLista() {
    var ul = vaciar($('#lista-items'));
    if (!estado.lista.length) ul.appendChild(el('li', { clase: 'muted', texto: 'Todavía no agregaste activos. Probá con PAMP, ALUA, KO, AL35D o GD30D del catálogo de ejemplo.' }));
    estado.lista.forEach(function (it, i) {
      var ins = estado.instrumentos[it.simbolo];
      var tipo = it.tipo ? F.TIPOS[it.tipo].nombre : (ins ? F.TIPOS[ins.tipo].nombre : 'tipo sin definir');
      var detalle = tipo + ' · ' + num(it.cantidad, 0) + ' u.';
      if (ins) detalle += ' · ' + num(ins.precio) + ' ' + ins.moneda + (ins.varDia != null ? ' · hoy ' + F.pctSigno(ins.varDia / 100) : '');
      if (it.nota) detalle += ' · ' + it.nota;
      var quitar = el('button', { type: 'button', clase: 'btn ghost chico', texto: 'Quitar' });
      quitar.addEventListener('click', function () {
        estado.lista.splice(i, 1);
        guardarC('lista', estado.lista);
        renderLista();
      });
      var nivel = it.ultima ? ({ ok: 'badge ok', warn: 'badge warn', no: 'badge no' }[it.ultima.nivel] || 'badge') : null;
      ul.appendChild(el('li', { clase: 'item' }, [
        el('div', { clase: 'item-texto' }, [el('b', { texto: it.simbolo }), el('small', { texto: detalle })]),
        el('div', { clase: 'acciones' }, [it.ultima ? el('span', { clase: nivel, title: 'Última evaluación: ' + F.fechaCorta(it.ultima.fecha), texto: it.ultima.decision }) : null, quitar])
      ]));
    });
  }

  $('#form-lista').addEventListener('submit', function (e) {
    e.preventDefault();
    var sym = $('#li-simbolo').value.trim().toUpperCase();
    var cant = F.toNum($('#li-cantidad').value);
    if (!sym) { $('#lista-msg').textContent = 'Ingresá un símbolo.'; return; }
    if (!(cant > 0)) { $('#lista-msg').textContent = 'La cantidad tiene que ser mayor a cero.'; return; }
    estado.lista.push({ simbolo: sym, tipo: $('#li-tipo').value, cantidad: cant, nota: $('#li-nota').value.trim() });
    guardarC('lista', estado.lista);
    this.reset();
    $('#lista-msg').textContent = sym + ' agregado.';
    renderLista();
  });

  var NOMBRE_TIPO_LISTA = { accion: 'Acción', cedear: 'CEDEAR', bono: 'Bono', letra: 'Letra', on: 'ON' };

  var seleccionPendiente = null;

  function fechaHora(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  // Pide la selección; si el backend la está calculando, informa el progreso y vuelve a preguntar.
  function esperarSeleccion(recalcular, alTerminar, intentos) {
    var msg = $('#seleccion-msg');
    fetch('api/seleccion/' + (recalcular ? '?recalcular=1' : ''))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.calculando) {
          var p = j.progreso;
          msg.textContent = p ? 'Paso ' + p.paso + ' de ' + p.total + ': ' + p.texto + '…' : 'El comité está recorriendo BYMA y Yahoo Finance…';
          if ((intentos || 0) > 150) { msg.textContent = 'El cálculo está tardando demasiado. Probá de nuevo en unos minutos.'; alTerminar(null); return; }
          setTimeout(function () { esperarSeleccion(false, alTerminar, (intentos || 0) + 1); }, 2000);
          return;
        }
        alTerminar(j.tipos ? j : null);
      })
      .catch(function () { msg.textContent = 'No se pudo consultar la selección: revisá la conexión.'; alTerminar(null); });
  }

  function mostrarDiferencias(sel) {
    var msg = $('#seleccion-msg');
    var nuevos = [];
    Object.keys(sel.tipos).forEach(function (t) { sel.tipos[t].forEach(function (x) { nuevos.push(x.simbolo); }); });
    var actuales = estado.lista.filter(function (it) { return it.seleccion; }).map(function (it) { return it.simbolo; });
    var entran = nuevos.filter(function (x) { return actuales.indexOf(x) < 0; });
    var salen = actuales.filter(function (x) { return nuevos.indexOf(x) < 0; });
    seleccionPendiente = sel;
    vaciar(msg);
    msg.appendChild(el('span', { texto: 'Selección calculada el ' + fechaHora(sel.calculada) + '. ' +
      (entran.length ? 'Entran ' + entran.length + ' (' + entran.slice(0, 8).join(', ') + (entran.length > 8 ? '…' : '') + '). ' : 'No entra ninguno nuevo. ') +
      (salen.length ? 'Salen ' + salen.length + ' (' + salen.slice(0, 8).join(', ') + (salen.length > 8 ? '…' : '') + '). ' : '') }));
    var aplicar = el('button', { type: 'button', clase: 'btn chico', texto: 'Aplicar a la lista' });
    aplicar.addEventListener('click', aplicarSeleccion);
    var recalcular = el('button', { type: 'button', clase: 'btn ghost chico', texto: 'Recalcular ahora' });
    recalcular.addEventListener('click', function () {
      recalcular.disabled = true;
      esperarSeleccion(true, function (j) { if (j) mostrarDiferencias(j); });
    });
    msg.appendChild(el('span', { clase: 'acciones' }, [aplicar, recalcular]));
  }

  function aplicarSeleccion() {
    var sel = seleccionPendiente;
    if (!sel) return;
    // Se reemplaza la selección anterior del comité; lo agregado a mano queda.
    estado.lista = estado.lista.filter(function (it) { return !it.seleccion; });
    var cuenta = [];
    Object.keys(sel.tipos).forEach(function (tipo) {
      var n = 0;
      sel.tipos[tipo].forEach(function (x, i) {
        if (estado.lista.some(function (it) { return it.simbolo === x.simbolo; })) return;
        estado.lista.push({ simbolo: x.simbolo, tipo: x.tipo, cantidad: x.cantidad, seleccion: true,
          nota: '#' + (i + 1) + ' ' + NOMBRE_TIPO_LISTA[tipo] + ' · ' + x.proyeccion });
        if (!estado.instrumentos[x.simbolo]) {
          estado.instrumentos[x.simbolo] = { tipo: x.tipo, moneda: 'ARS', emisor: x.simbolo, precio: x.precio, rend: x.tir != null ? x.tir : null,
            rendEnUsd: !!x.tirEnDolares, rendReal: !!x.tirReal, duration: x.duration };
        }
        n += 1;
      });
      cuenta.push(n + ' ' + { accion: 'acciones', cedear: 'CEDEAR', bono: 'bonos', letra: 'letras', on: 'ON' }[tipo]);
    });
    seleccionPendiente = null;
    guardarC('lista', estado.lista);
    $('#seleccion-msg').textContent = 'Listo: ' + cuenta.join(', ') + '. Ahora tocá "Evaluar lista con el comité" para ver qué comprar.';
    renderLista();
    cargarAnalisis();
  }

  $('#btn-seleccion').addEventListener('click', function () {
    var boton = this;
    boton.disabled = true;
    $('#seleccion-msg').textContent = 'Buscando la última selección del comité…';
    esperarSeleccion(false, function (j) {
      boton.disabled = false;
      if (j) mostrarDiferencias(j);
    });
  });

  $('#btn-evaluar-lista').addEventListener('click', function () {
    if (estado.ocupado) return;
    if (!estado.lista.length) { $('#lista-progreso').textContent = 'Agregá al menos un activo.'; return; }
    var boton = this;
    ocupar(true, boton);
    var salida = vaciar($('#lista-resultado'));
    var cx = ctx();
    var res = [];
    var i = 0;
    (function siguiente() {
      if (i >= estado.lista.length) {
        estado.resultadosLista = res;
        guardarC('lista', estado.lista);
        $('#lista-progreso').textContent = 'Listo: ' + res.length + ' activos evaluados contra tu cartera actual.';
        var ok = res.filter(function (r) { return !r.error; });
        if (ok.length) estado.ultimo = { nombre: 'Lista de seguimiento', trail: ok[ok.length - 1].trail, resultados: ok };
        renderLista();
        ocupar(false, boton);
        return;
      }
      var it = estado.lista[i];
      $('#lista-progreso').textContent = 'El comité evalúa ' + (i + 1) + ' de ' + estado.lista.length + ': ' + it.simbolo + '…';
      var r = F.evaluarCandidato(it, cx);
      res.push(r);
      if (!r.error) it.ultima = { decision: r.decision, nivel: r.nivel, fecha: D.HOY };
      salida.appendChild(tarjeta(r, 'lista'));
      i += 1;
      setTimeout(siguiente, MENOS_MOVIMIENTO ? 0 : 250);
    })();
  });

  // Decisiones y AI Memoria

  function renderDecisiones() {
    $$('#dec-filtros button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-estado') === estado.filtroDec)); });
    var hoy = new Date().toISOString().slice(0, 10);
    var lista = estado.decisiones.filter(function (d) { return estado.filtroDec === 'todas' || d.estado === estado.filtroDec; });
    var cuerpo = vaciar($('#cuerpo-decisiones'));
    lista.forEach(function (d) {
      var proxima = (d.mediciones || []).filter(function (m) { return m > hoy; })[0];
      var accion = null;
      if (d.estado === 'aprobada') {
        accion = el('button', { type: 'button', clase: 'btn ghost chico', texto: 'Marcar ejecutada' });
        accion.addEventListener('click', function () {
          d.estado = 'ejecutada';
          d.ejecutada = new Date().toISOString();
          guardarC('decisiones', estado.decisiones);
          renderDecisiones();
        });
      }
      var clase = { aprobada: 'badge ok', ejecutada: 'badge ok', rechazada: 'badge' }[d.estado] || 'badge';
      cuerpo.appendChild(el('tr', null, [
        el('td', { clase: 'txt', texto: F.fechaCorta(d.fecha.slice(0, 10)) }),
        el('td', { clase: 'txt' }, [el('b', { texto: d.simbolo })]),
        el('td', { clase: 'txt', texto: d.decision }),
        el('td', { texto: d.cantidad ? num(d.cantidad, 0) : '—' }),
        el('td', { clase: 'txt' }, [el('span', { clase: clase, texto: d.estado })]),
        el('td', { clase: 'envuelve', texto: d.motivo || '—' }),
        el('td', { clase: 'txt', texto: proxima ? F.fechaCorta(proxima) : 'Completa' }),
        el('td', null, accion ? [accion] : [])
      ]));
    });
    $('#dec-vacio').hidden = lista.length > 0;

    var cuenta = { aprobada: 0, ejecutada: 0, rechazada: 0 };
    estado.decisiones.forEach(function (d) { cuenta[d.estado] = (cuenta[d.estado] || 0) + 1; });
    var proximas = estado.decisiones.map(function (d) { return (d.mediciones || []).filter(function (m) { return m > hoy; })[0]; }).filter(Boolean).sort();
    var res = vaciar($('#memoria-resumen'));
    [['Registradas', String(estado.decisiones.length)], ['Aprobadas', String(cuenta.aprobada)], ['Ejecutadas', String(cuenta.ejecutada)], ['Rechazadas', String(cuenta.rechazada)],
      ['Próxima medición', proximas.length ? F.fechaCorta(proximas[0]) : '—']].forEach(function (k) {
      res.appendChild(el('div', { clase: 'kpi' }, [el('span', { texto: k[0] }), el('b', { texto: k[1] })]));
    });

    var mem = vaciar($('#cuerpo-memoria'));
    D.MEMORIA_EJEMPLO.forEach(function (m) {
      mem.appendChild(el('tr', null, [
        el('td', { clase: 'txt', texto: m.agente }),
        el('td', { texto: String(m.decisiones) }),
        el('td', { texto: String(m.aciertos) }),
        el('td', { texto: F.pct(m.aciertos / m.decisiones) })
      ]));
    });
  }

  $$('#dec-filtros button').forEach(function (b) {
    b.addEventListener('click', function () { estado.filtroDec = b.getAttribute('data-estado'); renderDecisiones(); });
  });

  // Informes

  var ctlInforme = null;

  function metricasActuales() {
    var m = F.metricasInforme(estado.informe, { cartera: cartera(), historia: D.HISTORIA, hoy: D.HOY, benchmarks: D.BENCHMARKS });
    if (estado.origen !== 'ejemplo') m.advertencias.push('La historia del período es de ejemplo hasta que el backend guarde tus snapshots diarios.');
    return m;
  }

  function renderInforme() {
    $$('#inf-lista button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-informe') === estado.informe)); });
    var m = metricasActuales();
    $('#inf-titulo').textContent = m.etiqueta;
    var k = vaciar($('#inf-kpis'));
    [
      ['Valor al cierre', 'ARS ' + F.miles(m.valorFinARS), 'USD ' + F.miles(m.valorFinUSD) + ' al MEP'],
      ['En pesos', F.pctSigno(m.rendimientoARS), null, m.rendimientoARS],
      ['En dólares MEP', F.pctSigno(m.rendimientoUSD), null, m.rendimientoUSD],
      ['Dólar MEP', F.pctSigno(m.variacionMEP), null]
    ].forEach(function (x) {
      k.appendChild(el('div', { clase: 'kpi' }, [el('span', { texto: x[0] }), el('b', { clase: x[3] != null ? claseSigno(x[3]) : '', texto: x[1] }), x[2] ? el('small', { texto: x[2] }) : null]));
    });
    $('#inf-texto').textContent = estado.textosInforme[estado.informe] || F.textoInforme(m);
    $('#inf-msg').textContent = estado.textosInforme[estado.informe] ? 'Texto redactado por AI Comité con Claude.' : '';

    var sb = F.serieBenchmarks(D.HISTORIA, D.BENCHMARKS, D.MEP_MENSUAL, D.MESES_BENCH, D.HOY);
    G.lineas($('#graf-bench'), {
      titulo: 'Rendimiento acumulado de la cartera contra alternativas',
      etiquetas: sb.etiquetas,
      series: sb.series,
      formato: function (v) { return F.pctSigno(v); },
      formatoEje: function (v) { return Math.round(v * 100) + ' %'; },
      marcasX: 7,
      puntos: true
    });
  }

  $$('#inf-lista button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (ctlInforme) ctlInforme.abort();
      estado.informe = b.getAttribute('data-informe');
      renderInforme();
    });
  });

  $('#btn-inf-redactar').addEventListener('click', function () {
    if (!estado.sample) return;
    var m = metricasActuales();
    var tipo = estado.informe;
    var boton = this;
    var prompt = 'Sos AI Comité, el agente que redacta los informes de Quórum, una herramienta personal para una cartera en el mercado argentino.\n' +
      'Redactá el informe "' + m.etiqueta + '" en español rioplatense, en 120 a 180 palabras: un título corto y dos o tres párrafos.\n' +
      'Reglas: usá SOLO las cifras del JSON, sin calcular ni inventar otras; no recomiendes comprar ni vender; si hay notas en "advertencias", mencionalas al final.\n' +
      'Los rendimientos están en fracción (0.024 = 2,4 %).\n\nDatos:\n' + JSON.stringify(m);
    ctlInforme = new AbortController();
    boton.disabled = true;
    $('#btn-inf-detener').hidden = false;
    $('#inf-msg').textContent = 'AI Comité está pensando…';
    estado.sample(prompt, {
      signal: ctlInforme.signal,
      onText: function (u) { if (estado.informe === tipo) $('#inf-texto').textContent = u.text; }
    }).then(function (r) {
      estado.textosInforme[tipo] = r.text;
      if (estado.informe === tipo) $('#inf-msg').textContent = r.truncated ? 'El texto quedó cortado: probá de nuevo.' : 'Texto redactado por AI Comité con Claude.';
    }).catch(function (e) {
      if (e.code === 'cancelled') {
        $('#inf-msg').textContent = 'Redacción detenida.';
        if (estado.informe === tipo) $('#inf-texto').textContent = e.text || F.textoInforme(m);
      } else {
        $('#inf-msg').textContent = textoError(e.code);
        if (estado.informe === tipo) $('#inf-texto').textContent = F.textoInforme(m);
        if (PERMANENTES.indexOf(e.code) >= 0) { estado.sample = null; boton.hidden = true; }
      }
    }).then(function () {
      boton.disabled = false;
      $('#btn-inf-detener').hidden = true;
      ctlInforme = null;
    });
  });

  $('#btn-inf-detener').addEventListener('click', function () { if (ctlInforme) ctlInforme.abort(); });

  $('#btn-inf-copiar').addEventListener('click', function () {
    var texto = $('#inf-texto').textContent;
    var seleccionar = function () {
      var rango = document.createRange();
      rango.selectNodeContents($('#inf-texto'));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(rango);
      $('#inf-msg').textContent = 'Texto seleccionado: copialo con Ctrl+C.';
    };
    try {
      navigator.clipboard.writeText(texto).then(function () { $('#inf-msg').textContent = 'Texto copiado.'; }, seleccionar);
    } catch (e) { seleccionar(); }
  });

  $('#btn-inf-pdf').addEventListener('click', function () {
    if (!estado.downloads || !window.jspdf) return;
    // Las fuentes estándar del PDF no tienen el signo menos tipográfico.
    var texto = $('#inf-texto').textContent.replace(/−/g, '-').replace(/→/g, '->');
    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Quórum', 48, 64);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    var y = 96;
    doc.splitTextToSize(texto, 500).forEach(function (linea) {
      if (y > 790) { doc.addPage(); y = 64; }
      doc.text(linea, 48, y);
      y += 16;
    });
    estado.downloads.save({ filename: 'quorum-informe-' + estado.informe + '.pdf', data: doc.output('arraybuffer') })
      .then(function () { $('#inf-msg').textContent = 'PDF descargado.'; })
      .catch(function (e) {
        if (e.code === 'declined') { $('#inf-msg').textContent = 'Descarga cancelada.'; return; }
        $('#inf-msg').textContent = 'No se pudo descargar el PDF en esta vista.';
        if (['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].indexOf(e.code) >= 0) $('#btn-inf-pdf').hidden = true;
      });
  });

  // Escenarios

  function renderEscenarios() {
    var c = cartera();
    var total = F.resumen(c).total;
    var cuerpo = $('#cuerpo-shocks');
    if (!cuerpo.firstChild) {
      estado.shocks.forEach(function (esc, i) {
        var celda = function (campo, factor, etiqueta) {
          var input = el('input', { type: 'number', step: '1', value: String(Math.round(esc[campo] * factor)), 'aria-label': etiqueta + ' en ' + esc.nombre });
          input.addEventListener('input', function () {
            var v = F.toNum(input.value);
            if (isFinite(v)) { estado.shocks[i][campo] = v / factor; dibujarEscenarios(); }
          });
          return el('td', null, [input]);
        };
        cuerpo.appendChild(el('tr', null, [
          el('td', { clase: 'txt' }, [el('b', { texto: esc.nombre }), el('br'), el('small', { clase: 'muted', texto: esc.descripcion })]),
          celda('mep', 100, 'Variación del MEP en %'),
          celda('tasas', 100, 'Suba de tasas en puntos'),
          celda('merval', 100, 'Variación del Merval en %'),
          celda('cedear', 100, 'Variación de los CEDEAR en %'),
          celda('spread', 10000, 'Suba del riesgo país en puntos básicos')
        ]));
      });
      var sel = $('#esc-detalle-select');
      estado.shocks.forEach(function (esc) { sel.appendChild(el('option', { value: esc.id, texto: esc.nombre })); });
      sel.value = estado.escDetalle;
      sel.addEventListener('change', function () { estado.escDetalle = sel.value; dibujarEscenarios(); });
    }
    dibujarEscenarios();

    function dibujarEscenarios() {
      var res = F.escenarios(c, D.FX, estado.shocks);
      G.barras($('#graf-escenarios'), {
        titulo: 'Impacto de cada escenario en la cartera',
        filas: res.map(function (r) { return { etiqueta: r.nombre, valores: [r.pctARS, r.pctUSD] }; }),
        series: ['En pesos', 'En dólares MEP'],
        formato: function (v) { return F.pctSigno(v); }
      });
      var elegido = res.filter(function (r) { return r.id === estado.escDetalle; })[0] || res[0];
      var det = vaciar($('#cuerpo-esc-detalle'));
      elegido.porPosicion.slice().sort(function (a, b) { return a.deltaARS - b.deltaARS; }).forEach(function (p) {
        det.appendChild(el('tr', null, [
          el('td', { clase: 'txt', texto: p.simbolo }),
          el('td', { clase: claseSigno(p.deltaARS), texto: dineroSigno(p.deltaARS) }),
          el('td', { clase: claseSigno(p.deltaARS), texto: total ? F.pctSigno(p.deltaARS / total) : '—' })
        ]));
      });
    }
  }

  // Rebalanceo

  function renderRebalanceo() {
    var c = cartera();
    var cuerpo = $('#cuerpo-rebalanceo');
    var objetivo = estado.config.objetivo;
    if (!cuerpo.firstChild) {
      Object.keys(F.GRUPOS).forEach(function (g) {
        var input = el('input', { type: 'number', step: '1', min: '0', max: '100', 'data-grupo': g, 'aria-label': 'Objetivo para ' + F.GRUPOS[g] });
        input.addEventListener('input', function () {
          var v = F.toNum(input.value);
          if (isFinite(v)) { estado.config.objetivo[g] = v / 100; calcular(); }
        });
        input.addEventListener('change', guardarConfig);
        cuerpo.appendChild(el('tr', { 'data-fila': g }, [
          el('td', { clase: 'txt', texto: F.GRUPOS[g] }), el('td'), el('td', null, [input]), el('td'), el('td', { clase: 'txt' })
        ]));
      });
    }
    $$('#cuerpo-rebalanceo input').forEach(function (i) { i.value = String(Math.round((objetivo[i.getAttribute('data-grupo')] || 0) * 1000) / 10); });
    calcular();

    function calcular() {
      var banda = estado.config.limites.banda || 0.05;
      var aporte = F.toNum($('#reb-aporte').value);
      var rb = F.rebalanceo(c, estado.config.objetivo, estado.config.limites.comision, banda, isFinite(aporte) ? aporte : 0);
      var umbral = rb.total * 0.005;
      rb.filas.forEach(function (f) {
        var fila = $('#cuerpo-rebalanceo tr[data-fila="' + f.grupo + '"]');
        fila.children[1].textContent = F.pct(f.actualPct);
        fila.children[3].textContent = dineroSigno(f.diferencia);
        fila.children[3].className = claseSigno(f.diferencia);
        fila.children[4].textContent = !f.fueraBanda ? 'Dentro de la banda (±' + Math.round(banda * 100) + ' puntos)' : f.diferencia > 0 ? 'Comprar' : 'Vender';
      });
      var ok = Math.abs(rb.sumaObjetivo - 1) < 0.001;
      $('#reb-total').textContent = ok ? 'El objetivo suma 100 %.' : 'El objetivo suma ' + F.pct(rb.sumaObjetivo) + ': tiene que sumar 100 %.';
      var ventas = vaciar($('#reb-ventas'));
      if (!ok) {
        ventas.appendChild(el('li', { clase: 'muted', texto: 'Ajustá el objetivo para ver las ventas sugeridas.' }));
        $('#reb-comision').textContent = '';
        vaciar($('#reb-compras'));
        return;
      }
      rb.ventas.filter(function (v) { return v.montoARS >= umbral; }).forEach(function (v) {
        ventas.appendChild(el('li', { clase: 'item' }, [el('span', { texto: 'Vender ' + num(v.cantidad, 0) + ' de ' + v.simbolo }), el('b', { texto: dinero(v.montoARS) + (v.ganancia != null && v.ganancia < 0 ? ' · realiza pérdida' : '') })]));
      });
      if (!ventas.firstChild) ventas.appendChild(el('li', { clase: 'muted', texto: 'No hace falta vender: ningún grupo se salió de la banda de ±' + Math.round(banda * 100) + ' puntos.' }));
      $('#reb-comision').textContent = 'Comisión estimada de todo el rebalanceo: ' + dinero(rb.comisionARS) + '. Para comprar, elegí instrumentos en Evaluar activo.';
      var compras = vaciar($('#reb-compras'));
      rb.compras.forEach(function (c) {
        compras.appendChild(el('li', { clase: 'item' }, [el('span', { texto: 'Aportar a ' + c.nombre }), el('b', { texto: dinero(c.montoARS) })]));
      });
      if (!compras.firstChild) compras.appendChild(el('li', { clase: 'muted', texto: 'Escribí cuánto vas a aportar para ver a qué grupo conviene destinarlo.' }));
    }
  }

  $('#btn-reb-perfil').addEventListener('click', function () {
    var p = F.PERFILES[estado.config.perfil] || F.PERFILES.moderado;
    estado.config.objetivo = copia(p.objetivo);
    guardarConfig();
    renderRebalanceo();
  });
  $('#reb-aporte').addEventListener('input', renderRebalanceo);

  // Preguntar

  var ctlChat = null;

  function renderChat() {
    var log = vaciar($('#chat-log'));
    estado.chat.forEach(function (t) { log.appendChild(el('div', { clase: 'msg' + (t.role === 'user' ? ' yo' : '') }, [t.content])); });
    if (!estado.sample) {
      $('#chat-estado').textContent = window.claude ? 'Conectando con Claude… Si no aparece, abrí esta página en claude.ai.' : 'Para preguntar, abrí esta página en claude.ai.';
    }
  }

  $$('#chat-sugerencias button').forEach(function (b) {
    b.addEventListener('click', function () { $('#pregunta').value = b.getAttribute('data-pregunta'); $('#pregunta').focus(); });
  });

  $('#form-pregunta').addEventListener('submit', function (e) {
    e.preventDefault();
    var pregunta = $('#pregunta').value.trim();
    if (!pregunta) { $('#chat-estado').textContent = 'Escribí una pregunta.'; return; }
    if (!estado.sample) { renderChat(); return; }
    if (ctlChat) return;
    var datos = F.datosParaClaude({ cartera: cartera(), fx: D.FX, hoy: D.HOY, limites: estado.config.limites, decisiones: estado.decisiones });
    var instrucciones = 'Sos AI Comité de Quórum, una herramienta personal de cartera en el mercado argentino. ' +
      'Respondé en español rioplatense, en no más de 150 palabras, usando solo los datos de abajo. Si el dato no está, decilo. ' +
      'No recomiendes comprar ni vender: explicá qué muestran los números. Montos en pesos salvo que pregunten en dólares. ' +
      'Los pesos y rendimientos están en fracción (0.25 = 25 %).\n\nDatos de la cartera (JSON):\n' + JSON.stringify(datos);
    estado.chat.push({ role: 'user', content: pregunta });
    var previos = estado.chat.slice(-7);
    var turnos = [{ role: 'user', content: instrucciones }].concat(previos);
    $('#pregunta').value = '';
    renderChat();
    var burbuja = el('div', { clase: 'msg' }, ['Pensando…']);
    $('#chat-log').appendChild(burbuja);
    ctlChat = new AbortController();
    $('#btn-preguntar').disabled = true;
    $('#btn-detener').hidden = false;
    $('#chat-estado').textContent = '';
    estado.sample(turnos, { cache: false, signal: ctlChat.signal, onText: function (u) { burbuja.textContent = u.text; } })
      .then(function (r) {
        estado.chat.push({ role: 'assistant', content: r.text });
        if (r.truncated) $('#chat-estado').textContent = 'La respuesta quedó cortada: preguntá algo más concreto.';
      })
      .catch(function (err) {
        if (err.text) estado.chat.push({ role: 'assistant', content: err.text });
        else burbuja.remove();
        if (err.code !== 'cancelled') $('#chat-estado').textContent = textoError(err.code);
        if (PERMANENTES.indexOf(err.code) >= 0) estado.sample = null;
      })
      .then(function () {
        ctlChat = null;
        $('#btn-preguntar').disabled = false;
        $('#btn-detener').hidden = true;
      });
  });

  $('#btn-detener').addEventListener('click', function () { if (ctlChat) ctlChat.abort(); });

  // Comité

  var grafoComite = null;

  function renderComite() {
    if (!grafoComite) grafoComite = G.grafo($('#grafo-comite'), F.NODOS);
    var rec = vaciar($('#comite-recorrido'));
    if (estado.ultimo) {
      grafoComite.mostrar(estado.ultimo.trail);
      rec.appendChild(el('p', { clase: 'muted', texto: 'Última evaluación: ' + estado.ultimo.nombre }));
      rec.appendChild(recorrido(estado.ultimo.trail));
    } else {
      grafoComite.limpiar();
      rec.appendChild(el('p', { clase: 'muted', texto: 'Todavía no hubo evaluaciones. Generá una recomendación o evaluá un activo.' }));
    }
    var res = estado.ultimo && estado.ultimo.resultados;
    $('#comite-matriz-bloque').hidden = !res;
    if (res) vaciar($('#matriz-comite')).appendChild(matriz(res));

    var cuerpo = $('#cuerpo-agentes');
    if (!cuerpo.firstChild) {
      F.NODOS.forEach(function (n) {
        cuerpo.appendChild(el('tr', null, [
          el('td', { clase: 'txt' }, [el('b', { texto: n.nombre })]),
          el('td', { clase: 'envuelve', texto: n.rol }),
          el('td', { clase: 'txt', texto: n.motor }),
          el('td', { clase: 'txt', texto: n.veta ? 'Sí' : 'No' })
        ]));
      });
    }
  }

  // Fuentes

  function renderFuentes() {
    var ul = vaciar($('#fuentes-lista'));
    if (!estado.fuentes.length) ul.appendChild(el('li', { clase: 'muted', texto: 'No hay fuentes. Sin fuentes activas, el comité trabaja con datos de ejemplo.' }));
    estado.fuentes.forEach(function (f, i) {
      var check = el('input', { type: 'checkbox', 'aria-label': 'Fuente activa: ' + f.nombre });
      check.checked = !!f.activa;
      check.addEventListener('change', function () { f.activa = check.checked; A.guardar('fuentes', estado.fuentes); });
      var quitar = el('button', { type: 'button', clase: 'btn ghost chico', texto: 'Quitar' });
      quitar.addEventListener('click', function () { estado.fuentes.splice(i, 1); A.guardar('fuentes', estado.fuentes); renderFuentes(); });
      var lectura = f.estado
        ? (f.estado.errores ? 'La lectura de las ' + f.estado.hace + ' falló: se usan los datos cargados a mano' : 'Leída en vivo a las ' + f.estado.hace)
        : 'Sin lecturas todavía: la consulta en vivo la hace el backend';
      ul.appendChild(el('li', { clase: 'item' }, [
        el('label', { clase: 'check' }, [check, 'Activa']),
        el('div', { clase: 'item-texto', style: 'flex:1' }, [
          el('b', { texto: f.nombre }),
          el('small', { texto: f.tipo + ' · la usa ' + (AGENTE_POR_TIPO[f.tipo] || 'AI Fuentes') + ' · ' + f.url }),
          el('small', { clase: f.estado && f.estado.errores ? 'neg' : '', texto: lectura })
        ]),
        quitar
      ]));
    });
  }

  $('#form-fuente').addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = $('#fu-nombre').value.trim();
    var url = $('#fu-url').value.trim();
    var msg = $('#fuente-msg');
    if (!nombre) { msg.textContent = 'Ponele un nombre a la fuente.'; return; }
    var error = F.validarUrl(url);
    if (error) { msg.textContent = error; return; }
    estado.fuentes.push({ id: Date.now().toString(36), nombre: nombre, url: url, tipo: $('#fu-tipo').value, activa: true, estado: null });
    A.guardar('fuentes', estado.fuentes);
    this.reset();
    msg.textContent = 'Fuente guardada. La usa ' + (AGENTE_POR_TIPO[estado.fuentes[estado.fuentes.length - 1].tipo] || 'AI Fuentes') + '.';
    renderFuentes();
  });

  // Ajustes

  var CAMPOS_PCT = ['emisor', 'soberana', 'liquidezMin', 'gananciaReducir', 'pesoReducir', 'perdidaRevisar', 'recorte', 'perdidaEscenario', 'comision', 'sector', 'contribRiesgo', 'banda'];

  function llenarLimites(limites) {
    $$('#form-limites [data-limite]').forEach(function (i) {
      i.value = String(Math.round(limites[i.getAttribute('data-limite')] * 1000) / 10);
    });
  }

  function renderAjustes() {
    var selPerfil = vaciar($('#aj-perfil'));
    Object.keys(F.PERFILES).forEach(function (k) { selPerfil.appendChild(el('option', { value: k, texto: F.PERFILES[k].nombre })); });
    selPerfil.appendChild(el('option', { value: 'personalizado', texto: 'Personalizado' }));
    selPerfil.value = estado.config.perfil;
    pintarPerfil(estado.config.perfil);
    llenarLimites(estado.config.limites);
    var al = estado.config.alertas;
    $('#al-canal').value = al.canal;
    $('#al-destino').value = al.destino;
    $$('#form-alertas [data-evento]').forEach(function (i) { i.checked = !!al.eventos[i.getAttribute('data-evento')]; });
    renderAlertasHoy();
    renderCarteras();
    $('#datos-modo').textContent = A.modo() === 'servidor'
      ? 'Tus datos se guardan en el servidor con tu usuario (' + A.usuario() + '): los ves igual desde cualquier navegador.'
      : A.modo() === 'db'
      ? 'Tus datos se guardan en tu espacio privado de este artifact: solo vos podés verlos. También queda una copia en este navegador.'
      : 'Tus datos se guardan solo en este navegador. Abrí la página en claude.ai para guardarlos en tu espacio privado.';
  }

  function pintarPerfil(clave) {
    var caja = vaciar($('#aj-perfil-desc'));
    var p = F.PERFILES[clave];
    if (!p) { caja.hidden = true; return; }
    caja.hidden = false;
    var o = p.objetivo;
    caja.appendChild(el('h4', { texto: p.nombre }));
    caja.appendChild(el('p', { texto: p.descripcion }));
    caja.appendChild(el('p', { clase: 'muted', texto: 'Asignación objetivo: ' + Object.keys(F.GRUPOS).map(function (g) { return F.GRUPOS[g] + ' ' + F.pct(o[g] || 0); }).join(' · ') + '.' }));
    caja.appendChild(el('p', { clase: 'muted', texto: 'Riesgos: ' + p.riesgos }));
  }

  function renderAlertasHoy() {
    var ev = estado.config.alertas.eventos;
    var lista = F.alertas({ cartera: cartera(), fx: D.FX, limites: estado.config.limites, fuentes: estado.fuentes, hoy: D.HOY, resultados: estado.resultadosCartera || [] })
      .filter(function (a) { return ev[a.evento]; });
    var ul = vaciar($('#alertas-hoy'));
    if (!lista.length) ul.appendChild(el('li', { clase: 'muted', texto: 'Hoy no hay alertas para los eventos elegidos.' }));
    lista.forEach(function (a) {
      ul.appendChild(el('li', { clase: 'item' }, [el('span', { texto: a.texto }), el('span', { clase: a.nivel === 'no' ? 'badge no' : 'badge warn', texto: a.evento })]));
    });
  }

  $('#aj-perfil').addEventListener('change', function () {
    var p = F.PERFILES[this.value];
    if (p) llenarLimites(p.limites);
    pintarPerfil(this.value);
  });

  $$('#form-limites [data-limite]').forEach(function (i) {
    i.addEventListener('input', function () { $('#aj-perfil').value = 'personalizado'; });
  });

  $('#form-limites').addEventListener('submit', function (e) {
    e.preventDefault();
    var limites = {};
    var malo = null;
    $$('#form-limites [data-limite]').forEach(function (i) {
      var v = F.toNum(i.value);
      if (!isFinite(v)) malo = i;
      limites[i.getAttribute('data-limite')] = v / 100;
    });
    if (malo) { $('#limites-msg').textContent = 'Revisá los valores: todos tienen que ser números.'; malo.focus(); return; }
    CAMPOS_PCT.forEach(function (k) { if (limites[k] == null) limites[k] = estado.config.limites[k]; });
    if (limites.perdidaRevisar > 0) limites.perdidaRevisar = -limites.perdidaRevisar;
    var perfil = $('#aj-perfil').value;
    if (perfil !== estado.config.perfil && F.PERFILES[perfil]) estado.config.objetivo = copia(F.PERFILES[perfil].objetivo);
    estado.config.perfil = perfil;
    estado.config.limites = limites;
    estado.resultadosCartera = null;
    guardarConfig();
    $('#limites-msg').textContent = 'Límites guardados. Volvé a generar la recomendación para aplicarlos.';
    renderAlertasHoy();
  });

  $('#form-alertas').addEventListener('submit', function (e) {
    e.preventDefault();
    var eventos = {};
    $$('#form-alertas [data-evento]').forEach(function (i) { eventos[i.getAttribute('data-evento')] = i.checked; });
    estado.config.alertas = { canal: $('#al-canal').value, destino: $('#al-destino').value.trim(), eventos: eventos };
    guardarConfig();
    $('#alertas-msg').textContent = 'Alertas guardadas. El envío lo hace el backend cuando esté conectado.';
    renderAlertasHoy();
  });

  $('#btn-reset-cartera').addEventListener('click', function () {
    estado.tenencias = copia(D.CARTERA_EJEMPLO);
    estado.origen = 'ejemplo';
    estado.resultadosCartera = null;
    A.borrar(clave('cartera'));
    aplicarVista();
    $('#datos-msg').textContent = 'Volviste a la cartera de ejemplo. Tu lista, decisiones y ajustes siguen guardados.';
  });

  $('#btn-borrar-datos').addEventListener('click', function () {
    $('#btn-borrar-confirmar').hidden = false;
    $('#datos-msg').textContent = 'Se borran los activos, la lista, las decisiones y los ajustes de la cartera ' + nombreActiva() + ', y las fuentes. No se puede deshacer.';
  });

  $('#btn-borrar-confirmar').addEventListener('click', function () {
    NOMBRES_C.forEach(function (n) {
      A.borrar(clave(n));
      if (estado.carteraId === 'lucas') A.borrar(n);
    });
    A.borrar('fuentes');
    estado.tenencias = copia(D.CARTERA_EJEMPLO);
    estado.origen = 'ejemplo';
    estado.config = configInicial();
    estado.fuentes = copia(D.FUENTES_EJEMPLO);
    estado.lista = [];
    estado.decisiones = [];
    estado.resultadosCartera = null;
    this.hidden = true;
    $('#datos-msg').textContent = 'Tus datos se borraron.';
    aplicarVista();
    renderAjustes();
  });

  // Riesgo de la cartera (backend: riesgo.py, con la historia guardada en la base)

  function posicionesParaRiesgo() {
    return cartera().map(function (p) {
      return { simbolo: p.simbolo, tipo: p.tipo, moneda: p.moneda, valorARS: p.valorARS, rend: p.rend, rendEnUsd: p.rendEnUsd, rendReal: p.rendReal, duration: p.duration };
    });
  }

  function cargarRiesgo() {
    if (!window.fetch || !estado.tenencias.length) return Promise.resolve();
    return fetch('api/riesgo/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posiciones: posicionesParaRiesgo() }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        estado.riesgo = j;
        estado.riesgoMapa = null;
        if (!j.error) {
          estado.riesgoMapa = {};
          j.posiciones.forEach(function (x) { estado.riesgoMapa[x.simbolo] = x; });
        }
        estado.resultadosCartera = null;
      })
      .catch(function () { estado.riesgo = { error: 'No se pudo calcular el riesgo: revisá la conexión con el servidor.' }; });
  }

  function renderRiesgo() {
    var caja = vaciar($('#riesgo-contenido'));
    if (!estado.riesgo) {
      caja.appendChild(el('p', { clase: 'muted', texto: 'Calculando el riesgo con la historia guardada…' }));
      cargarRiesgo().then(function () { if (location.hash === '#riesgo') renderRiesgo(); });
      return;
    }
    var r = estado.riesgo;
    if (r.error) { caja.appendChild(el('p', { clase: 'status neg', texto: r.error })); return; }
    var c = r.cartera;
    var total = F.resumen(cartera()).total;
    function k(titulo, valor, ayuda) { return el('div', { clase: 'kpi' }, [el('span', { texto: titulo }), el('b', { texto: valor }), ayuda ? el('small', { texto: ayuda }) : null]); }
    caja.appendChild(el('div', { clase: 'kpis' }, [
      k('Volatilidad anual', F.pct(c.volatilidad), 'cuánto se mueve en un año'),
      k('VaR 10 ruedas, 95 %', '−' + F.pct(c.var10d95), 'unos ' + dinero(total * c.var10d95)),
      k('CVaR 10 ruedas, 95 %', '−' + F.pct(c.cvar10d95), 'el promedio de los peores casos'),
      k('Máxima caída', F.pctSigno(c.maxDrawdown), 'de pico a valle en el período'),
      k('Sharpe', String(c.sharpe).replace('.', ','), 'retorno por unidad de riesgo'),
      k('Sortino', String(c.sortino).replace('.', ','), 'igual, mirando solo las caídas')
    ]));
    caja.appendChild(el('p', { clase: 'muted', texto: 'El VaR dice que en 19 de cada 20 períodos de 10 ruedas la cartera no perdió más que eso. Período medido: ' + F.fechaCorta(r.desde) + ' al ' + F.fechaCorta(r.hasta) + ' (' + r.dias + ' días).' }));

    var filas = r.posiciones.map(function (p) {
      var exceso = p.contribucionRiesgo > (estado.config.limites.contribRiesgo || 0.25);
      return el('tr', null, [
        el('td', { clase: 'txt' }, [el('b', { texto: p.simbolo })]),
        el('td', { texto: F.pct(p.peso) }),
        el('td', { texto: F.pct(p.volatilidad) }),
        el('td', { clase: 'neg', texto: F.pctSigno(p.maxDrawdown) }),
        el('td', { clase: claseSigno(p.retornoUsd), texto: F.pctSigno(p.retornoUsd) }),
        el('td', { clase: exceso ? 'neg' : '', texto: F.pct(p.contribucionRiesgo) + (exceso ? ' · supera el límite' : '') }),
        el('td', { clase: 'txt muted', texto: p.metodo })
      ]);
    });
    caja.appendChild(el('div', { clase: 'bloque' }, [
      el('h3', { texto: 'Qué posición aporta más riesgo' }),
      el('div', { clase: 'scroll' }, [el('table', { clase: 'tbl' }, [
        el('thead', null, [el('tr', null, ['Posición', 'Peso', 'Volatilidad', 'Máx. caída', 'Retorno 1 año (USD)', 'Aporte al riesgo', 'Cómo se mide'].map(function (t, i) { return el('th', { clase: i === 0 || i === 6 ? 'txt' : '', texto: t }); }))]),
        el('tbody', null, filas)
      ])])
    ]));
    if (r.correlacionAlta.length) {
      caja.appendChild(el('div', { clase: 'bloque' }, [
        el('h3', { texto: 'Posiciones que se mueven juntas' }),
        el('ul', { clase: 'lista' }, r.correlacionAlta.map(function (x) {
          return el('li', { texto: x.a + ' y ' + x.b + ': correlación de ' + String(x.correlacion).replace('.', ',') + '. Tener las dos diversifica poco.' });
        }))
      ]));
    }
    if (r.sinMedir.length) {
      caja.appendChild(el('p', { clase: 'muted', texto: 'Sin medir por falta de historia: ' + r.sinMedir.map(function (x) { return x.simbolo; }).join(', ') + '. No entran en las cifras de arriba.' }));
    }
    caja.appendChild(el('ul', { clase: 'lista muted' }, r.notas.map(function (n) { return el('li', { texto: n }); })));
  }

  // Pesos contra dólar y tasa fija contra CER (backend: estrategia.py)

  function renderEstrategia() {
    var caja = vaciar($('#estrategia-contenido'));
    var vigente = estado.estrategia && Date.now() - estado.estrategia.hora < 10 * 60 * 1000;
    if (!vigente) {
      caja.appendChild(el('p', { clase: 'muted', texto: 'Consultando la curva de letras, los dollar linked y los bonos CER…' }));
      fetch('api/estrategia/').then(function (r) { return r.json(); }).then(function (e) {
        estado.estrategia = { datos: e, hora: Date.now() };
        if (location.hash === '#estrategia') renderEstrategia();
      }).catch(function () {
        estado.estrategia = { datos: { error: 'No se pudo consultar el servidor.' }, hora: Date.now() };
        if (location.hash === '#estrategia') renderEstrategia();
      });
      return;
    }
    var e = estado.estrategia.datos;
    if (e.error) {
      caja.appendChild(el('p', { clase: 'status neg', texto: e.error + ' Si el mercado todavía no abrió (BYMA publica los precios desde las 11), probá más tarde.' }));
      return;
    }
    caja.appendChild(el('div', { clase: 'bloque' }, [
      el('h3', { texto: 'Qué dicen las señales' }),
      el('ul', { clase: 'lista' }, e.conclusiones.map(function (t) { return el('li', { texto: t }); }))
    ]));
    var c = e.carry;
    function k(t, v, a) { return el('div', { clase: 'kpi' }, [el('span', { texto: t }), el('b', { texto: v }), a ? el('small', { texto: a }) : null]); }
    caja.appendChild(el('div', { clase: 'kpis' }, [
      k('Letra de referencia', c.lecap, c.dias + ' días'),
      k('Rinde (TEA)', F.pct(c.tea)),
      k('MEP hoy', num(c.mepHoy, 0)),
      k('MEP de equilibrio', num(c.mepEquilibrio, 0), 'sube ' + F.pct(c.subaEquilibrio) + ' para igualar'),
      k('Inflación esperada', F.pct(e.inflacionEsperada), 'últimos 3 meses anualizados')
    ]));
    function tabla(titulo, ayuda, cols, filas, vacio) {
      var bloque = el('div', { clase: 'bloque' }, [el('h3', { texto: titulo }), el('p', { clase: 'muted', texto: ayuda })]);
      if (!filas.length) { bloque.appendChild(el('p', { clase: 'muted', texto: vacio })); return bloque; }
      bloque.appendChild(el('div', { clase: 'scroll' }, [el('table', { clase: 'tbl' }, [
        el('thead', null, [el('tr', null, cols.map(function (t, i) { return el('th', { clase: i === 0 ? 'txt' : '', texto: t }); }))]),
        el('tbody', null, filas)
      ])]));
      return bloque;
    }
    caja.appendChild(tabla('Dólar que descuentan los dollar linked', 'Lo que el mercado espera que suba el oficial hasta cada vencimiento, comparando con las LECAP del mismo plazo.',
      ['Letra', 'Vence', 'Días', 'Dólar implícito', 'Suba total', 'Anualizada'],
      e.devaluacionImplicita.map(function (x) { return el('tr', null, [el('td', { clase: 'txt', texto: x.simbolo }), el('td', { texto: F.fechaCorta(x.vence) }), el('td', { texto: String(x.dias) }), el('td', { texto: num(x.tipoCambio, 0) }), el('td', { texto: F.pctSigno(x.devaluacion) }), el('td', { texto: F.pctSigno(x.anual) })]); }),
      'No hay dollar linked con precio ahora.'));
    caja.appendChild(tabla('Tasa fija contra CER', 'El breakeven es la inflación anual a partir de la cual el bono CER rinde más que la tasa fija del mismo plazo.',
      ['Bono CER', 'Vence', 'Días', 'TIR real', 'Tasa fija (TEA)', 'Breakeven'],
      e.breakevenInflacion.map(function (x) { return el('tr', null, [el('td', { clase: 'txt', texto: x.simbolo }), el('td', { texto: F.fechaCorta(x.vence) }), el('td', { texto: String(x.dias) }), el('td', { texto: F.pct(x.tirReal) }), el('td', { texto: F.pct(x.tasaFija) }), el('td', { texto: F.pct(x.breakeven) })]); }),
      'No hay bonos CER con precio ahora.'));
    caja.appendChild(el('p', { clase: 'muted', texto: e.notas.join(' ') }));
  }

  // Rutas

  function mostrar() {
    var v = location.hash.slice(1);
    if (VISTAS.indexOf(v) < 0) v = 'cartera';
    VISTAS.forEach(function (n) { $('#v-' + n).hidden = n !== v; });
    $$('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var activo = $('[data-nav="' + v + '"]');
    if (activo && $('#titulo-pagina')) {
      $('#titulo-pagina').textContent = activo.getAttribute('data-titulo') || activo.textContent.trim();
      $('#ruta-grupo').textContent = activo.getAttribute('data-grupo') || '';
      window.scrollTo(0, 0);
    }
    ({
      cartera: renderCartera,
      recomendaciones: renderRecomendaciones,
      evaluar: actualizarPreview,
      lista: renderLista,
      decisiones: renderDecisiones,
      informes: renderInforme,
      escenarios: renderEscenarios,
      riesgo: renderRiesgo,
      estrategia: renderEstrategia,
      rebalanceo: renderRebalanceo,
      preguntar: renderChat,
      comite: renderComite,
      fuentes: renderFuentes,
      ajustes: renderAjustes
    })[v]();
  }

  window.addEventListener('hashchange', mostrar);

  // Arranque: se pinta con los datos de ejemplo y se actualiza cuando llega lo guardado.

  var datalist = $('#lista-simbolos');
  Object.keys(D.INSTRUMENTOS).forEach(function (s) { datalist.appendChild(el('option', { value: s })); });

  function mezclarConfig(c) {
    var base = configInicial();
    if (!c || typeof c !== 'object') return base;
    if (F.PERFILES[c.perfil] || c.perfil === 'personalizado') base.perfil = c.perfil;
    Object.keys(base.limites).forEach(function (k) { if (c.limites && isFinite(c.limites[k])) base.limites[k] = c.limites[k]; });
    Object.keys(base.objetivo).forEach(function (k) { if (c.objetivo && isFinite(c.objetivo[k])) base.objetivo[k] = c.objetivo[k]; });
    if (c.alertas) {
      base.alertas.canal = c.alertas.canal || base.alertas.canal;
      base.alertas.destino = c.alertas.destino || '';
      Object.keys(base.alertas.eventos).forEach(function (k) { if (c.alertas.eventos && k in c.alertas.eventos) base.alertas.eventos[k] = !!c.alertas.eventos[k]; });
    }
    if (['ARS', 'MEP', 'CCL'].indexOf(c.vista) >= 0) base.vista = c.vista;
    return base;
  }

  A.alFallar(function (e, op) {
    if (op === 'guardar') $('#estado-guardado').textContent = e && e.code === 'quota_exceeded' ? 'Espacio lleno: se guarda solo en este navegador' : 'No se pudo guardar en tu espacio privado';
  });

  aplicarVista();
  mostrar();

  A.conectar().then(function (modo) {
    $('#estado-guardado').textContent = modo === 'servidor' ? 'Guardado en el servidor (' + A.usuario() + ')'
      : modo === 'db' ? 'Guardado en tu espacio privado' : 'Guardado en este navegador';
    renderSesion();
    return Promise.all([A.leer('carteras'), A.leer('carteraActiva'), A.leer('fuentes')]);
  }).then(function (v) {
    if (Array.isArray(v[0]) && v[0].length) estado.carteras = v[0];
    else A.guardar('carteras', estado.carteras);
    if (Array.isArray(v[2]) && v[2].length) {
      // Las lecturas guardadas antes eran de ejemplo: hasta que el backend lea las fuentes, no hay estado real.
      var base = {};
      D.FUENTES_EJEMPLO.forEach(function (f) { base[f.id] = f; });
      estado.fuentes = v[2].map(function (f) {
        var c = copia(f);
        c.estado = null;
        // Las fuentes predefinidas toman el nombre y la URL actuales; las agregadas por vos quedan igual.
        if (base[c.id]) { c.nombre = base[c.id].nombre; c.url = base[c.id].url; c.tipo = base[c.id].tipo; }
        return c;
      });
      D.FUENTES_EJEMPLO.forEach(function (f) { if (!estado.fuentes.some(function (x) { return x.id === f.id; })) estado.fuentes.push(copia(f)); });
    }
    var activa = estado.carteras.some(function (c) { return c.id === v[1]; }) ? v[1] : estado.carteras[0].id;
    return abrirCartera(activa);
  }).then(cargarMercado);

  // Sesión: con sesión iniciada los datos se guardan en el servidor.
  function renderSesion() {
    var enlace = $('#enlace-sesion');
    if (!enlace) return;
    if (A.modo() === 'servidor') {
      enlace.textContent = 'Salir';
      enlace.setAttribute('href', '#');
      enlace.onclick = function (e) {
        e.preventDefault();
        // Django cierra la sesión solo por POST, con el token CSRF.
        var f = el('form', { method: 'post', action: 'salir/' }, [el('input', { type: 'hidden', name: 'csrfmiddlewaretoken', value: A.csrf() })]);
        document.body.appendChild(f);
        f.submit();
      };
    } else if (A.modo() === 'local') {
      enlace.textContent = 'Ingresar para guardar en el servidor';
      enlace.setAttribute('href', 'ingresar/');
      enlace.onclick = null;
    } else {
      enlace.hidden = true;
    }
  }

  // Carteras

  var NOMBRES_C = ['config', 'lista', 'decisiones', 'cartera'];

  // Carga los datos de una cartera y la muestra.
  function abrirCartera(id) {
    estado.carteraId = id;
    A.guardar('carteraActiva', id);
    renderSelector();
    return Promise.all(NOMBRES_C.map(function (n) {
      return A.leer(clave(n)).then(function (x) {
        // La cartera de Lucas existía antes de que hubiera varias: toma lo guardado sin prefijo.
        return x == null && id === 'lucas' ? A.leer(n) : x;
      });
    })).then(function (v) {
      if (estado.carteraId !== id) return;
      var principal = id === 'lucas';
      estado.config = v[0] ? mezclarConfig(v[0]) : configInicial();
      if (v[1] == null) {
        estado.lista = principal ? copia(D.LISTA_SUGERIDA) : [];
        guardarC('lista', estado.lista);
      } else {
        estado.lista = (Array.isArray(v[1]) ? v[1] : []).filter(function (x) { return x && x.simbolo; });
      }
      estado.decisiones = Array.isArray(v[2]) ? v[2] : [];
      if (v[3] && Array.isArray(v[3].tenencias) && v[3].tenencias.length) {
        estado.tenencias = v[3].tenencias;
        estado.origen = v[3].origen || 'importada';
      } else {
        estado.tenencias = principal ? copia(D.CARTERA_IOL) : [];
        estado.origen = principal ? 'importada' : 'vacia';
      }
      estado.resultadosCartera = null;
      estado.resultadosLista = null;
      estado.riesgo = null;
      estado.riesgoMapa = null;
      estado.ultimo = null;
      estado.textosInforme = {};
      vaciar($('#lista-resultado'));
      vaciar($('#eval-resultado'));
      aplicarVista();
      if (!estado.ocupado) mostrar();
    });
  }

  function renderSelector() {
    var sel = vaciar($('#sel-cartera'));
    estado.carteras.forEach(function (c) { sel.appendChild(el('option', { value: c.id, texto: c.nombre })); });
    sel.value = estado.carteraId;
    $('#perfil-nombre').textContent = nombreActiva();
  }

  $('#sel-cartera').addEventListener('change', function () {
    if (estado.ocupado) { this.value = estado.carteraId; return; }
    abrirCartera(this.value).then(cargarMercado);
  });

  $('#btn-nueva-cartera').addEventListener('click', function () {
    $('#form-nueva-cartera').hidden = false;
    $('#nc-nombre').focus();
  });

  $('#btn-nc-cancelar').addEventListener('click', function () { $('#form-nueva-cartera').hidden = true; });

  $('#form-nueva-cartera').addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = $('#nc-nombre').value.trim();
    if (!nombre) { $('#nc-nombre').focus(); return; }
    // El id va en la ruta de guardado: solo letras, números y guiones.
    var base = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cartera';
    var id = base;
    for (var n = 2; estado.carteras.some(function (c) { return c.id === id; }); n += 1) id = base + '-' + n;
    estado.carteras.push({ id: id, nombre: nombre });
    A.guardar('carteras', estado.carteras);
    this.reset();
    this.hidden = true;
    location.hash = '#cartera';
    abrirCartera(id).then(cargarMercado);
  });

  function renderCarteras() {
    var ul = vaciar($('#lista-carteras'));
    estado.carteras.forEach(function (c, i) {
      var nombre = el('input', { clase: 'motivo', maxlength: '40', value: c.nombre, 'aria-label': 'Nombre de la cartera ' + c.nombre });
      var renombrar = el('button', { type: 'button', clase: 'btn ghost chico', texto: 'Renombrar' });
      renombrar.addEventListener('click', function () {
        var nuevo = nombre.value.trim();
        if (!nuevo) return;
        c.nombre = nuevo;
        A.guardar('carteras', estado.carteras);
        renderSelector();
        $('#carteras-msg').textContent = 'Cartera renombrada a ' + nuevo + '.';
      });
      var eliminar = el('button', { type: 'button', clase: 'btn peligro chico', texto: 'Eliminar' });
      eliminar.disabled = estado.carteras.length === 1;
      eliminar.addEventListener('click', function () {
        if (!eliminar.getAttribute('data-confirmar')) {
          eliminar.setAttribute('data-confirmar', '1');
          eliminar.textContent = 'Sí, eliminar ' + c.nombre;
          $('#carteras-msg').textContent = 'Se borran sus activos, lista, decisiones y ajustes. No se puede deshacer.';
          return;
        }
        NOMBRES_C.forEach(function (n) { A.borrar('c-' + c.id + '-' + n); });
        estado.carteras.splice(i, 1);
        A.guardar('carteras', estado.carteras);
        $('#carteras-msg').textContent = 'Cartera ' + c.nombre + ' eliminada.';
        if (c.id === estado.carteraId) abrirCartera(estado.carteras[0].id).then(cargarMercado);
        else renderSelector();
        renderCarteras();
      });
      ul.appendChild(el('li', { clase: 'item' }, [
        el('div', { clase: 'acciones', style: 'flex:1' }, [nombre, c.id === estado.carteraId ? el('span', { clase: 'badge ok', texto: 'Activa' }) : null]),
        el('div', { clase: 'acciones' }, [renombrar, eliminar])
      ]));
    });
  }

  // Datos de mercado en vivo desde el backend: dólar (dolarapi) y criptos (CoinGecko).
  function marcarFuente(id, hora, errores) {
    estado.fuentes.forEach(function (f) { if (f.id === id) f.estado = { hace: hora, errores: errores || 0 }; });
  }

  function cargarMercado() {
    if (!window.fetch) return;
    fetch('api/mercado/', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        if (!m) return;
        var hora = new Date(m.leido).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        var vivo = [];
        if (m.dolar) {
          D.FX.oficial = m.dolar.oficial;
          D.FX.mep = m.dolar.mep;
          D.FX.ccl = m.dolar.ccl;
          marcarFuente('dolar', hora);
          vivo.push('MEP ' + F.miles(m.dolar.mep) + ' · CCL ' + F.miles(m.dolar.ccl));
        } else marcarFuente('dolar', hora, 1);
        if (m.cripto) {
          estado.tenencias.forEach(function (t) {
            var c = m.cripto[t.simbolo];
            if (t.tipo === 'cripto' && c) { t.precio = c.precio; t.varDia = c.varDia; }
          });
          marcarFuente('cripto', hora);
          vivo.push('criptos');
        } else marcarFuente('cripto', hora, 1);
        if (m.tasas) {
          // La TIR es una tasa efectiva anual: el plazo fijo (TNA, a 30 días) se lleva a TEA para comparar igual con igual.
          D.REFERENCIAS.tasaCaucion = Math.pow(1 + m.tasas.plazoFijo * 30 / 365, 365 / 30) - 1;
          D.REFERENCIAS.tasaEsEfectiva = true;
          D.REFERENCIAS.nombreTasa = 'el plazo fijo promedio';
          D.REFERENCIAS.inflacionEsperada = m.tasas.inflacionEsperada != null ? m.tasas.inflacionEsperada : m.tasas.inflacion12m;
          D.REFERENCIAS.fuenteInflacion = 'INDEC, últimos 3 meses anualizados';
          marcarFuente('tasas', hora);
          vivo.push('plazo fijo ' + F.pct(m.tasas.plazoFijo));
        } else marcarFuente('tasas', hora, 1);
        $('#estado-guardado').textContent = vivo.length ? 'En vivo ' + hora + ': ' + vivo.join(' · ') : 'Fuentes en vivo sin respuesta: se usan los datos cargados a mano';
        estado.resultadosCartera = null;
        if (!estado.ocupado) mostrar();
      })
      .catch(function () { $('#estado-guardado').textContent = 'Sin conexión con las fuentes en vivo'; })
      .then(cargarAnalisis);
  }

  // Información financiera por activo (Yahoo Finance y CoinGecko): precio local, tendencia y analistas.
  function cargarAnalisis() {
    var simbolos = {};
    estado.tenencias.forEach(function (t) { if (['fci', 'caja', 'caucion'].indexOf(t.tipo) < 0) simbolos[t.simbolo] = 1; });
    estado.lista.forEach(function (it) { simbolos[String(it.simbolo).toUpperCase()] = 1; });
    var lista = Object.keys(simbolos);
    if (!lista.length || !window.fetch) return;
    var previo = $('#estado-guardado').textContent;
    $('#estado-guardado').textContent = previo + ' · buscando información de ' + lista.length + ' activos…';
    estado.promesaAnalisis = fetch('api/analisis/?simbolos=' + encodeURIComponent(lista.join(',')))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) {
        if (!a) return;
        estado.analisis = a.activos || {};
        var hora = new Date(a.leido).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        // Precio de hoy (BYMA o Yahoo) y, en renta fija, la TIR calculada con la ficha técnica de BYMA.
        estado.tenencias.forEach(function (t) {
          var x = estado.analisis[t.simbolo];
          if (!x || !x.precioLocal || t.tipo === 'cripto') return;
          t.precioManual = x.precioLocal;
          t.varDia = x.varDia;
          if (['bono', 'letra', 'on'].indexOf(t.tipo) >= 0) {
            t.rend = x.tir;
            t.rendEnUsd = !!x.tirEnDolares;
            t.rendReal = !!x.tirReal;
            t.duration = x.duration;
          }
        });
        // Catálogo: precio y TIR en vivo; lo que no tiene fuente deja de usar los rendimientos de ejemplo.
        Object.keys(estado.instrumentos).forEach(function (s) {
          var ins = estado.instrumentos[s];
          var x = estado.analisis[s];
          if (x && x.precioLocal) {
            ins.precio = x.precioLocal;
            ins.varDia = x.varDia;
            if (['bono', 'letra', 'on'].indexOf(ins.tipo) >= 0) { ins.rend = x.tir; ins.rendEnUsd = !!x.tirEnDolares; ins.rendReal = !!x.tirReal; ins.duration = x.duration; }
          } else if ((a.sinFuente || []).indexOf(s) >= 0) {
            ins.rend = null;
          }
        });
        estado.lista.forEach(function (it) {
          var s = String(it.simbolo).toUpperCase();
          var x = estado.analisis[s];
          if (!estado.instrumentos[s] && x && x.precioLocal && it.tipo) {
            estado.instrumentos[s] = { tipo: it.tipo, moneda: 'ARS', emisor: s, precio: x.precioLocal, varDia: x.varDia, rend: x.tir != null ? x.tir : null, rendEnUsd: !!x.tirEnDolares };
          }
        });
        var n = Object.keys(estado.analisis).length;
        marcarFuente('precios', hora, n ? 0 : 1);
        $('#estado-guardado').textContent = previo + ' · información de ' + n + ' de ' + lista.length + ' activos';
        estado.resultadosCartera = null;
      })
      .catch(function () { $('#estado-guardado').textContent = previo + ' · sin información financiera'; })
      .then(cargarRiesgo)
      .then(function () {
        estado.promesaAnalisis = null;
        if (!estado.ocupado) mostrar();
      });
  }

  if (window.claude && window.claude.use) {
    window.claude.use('sample').then(function (s) {
      estado.sample = s;
      $('#btn-inf-redactar').hidden = !s;
      if (s) $('#chat-estado').textContent = '';
      else if (location.hash === '#preguntar') renderChat();
    });
    window.claude.use('downloads').then(function (d) {
      estado.downloads = d;
      $('#btn-inf-pdf').hidden = !(d && window.jspdf);
    });
  }
})();
