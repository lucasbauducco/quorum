/* Gráficos de Quórum: el grafo del comité, líneas y barras. SVG a escala, colores por clases CSS. */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs, texto) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (texto != null) n.textContent = texto;
    return n;
  }

  function vaciar(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
    return n;
  }

  // Grafo del comité
  // Lienzo de 1000 × 1000. Cada banda agrupa a los agentes por etapa. Las flechas son curvas entre bordes.
  var UID = 0;
  var BANDAS = [
    { id: 'entrada',  titulo: 'ENTRADA',           y: 22,  h: 262 },
    { id: 'analisis', titulo: 'ANÁLISIS',          y: 300, h: 108 },
    { id: 'riesgo',   titulo: 'CONTROL DE RIESGO', y: 428, h: 220 },
    { id: 'decision', titulo: 'DECISIÓN',          y: 668, h: 214 },
    { id: 'registro', titulo: 'REGISTRO',          y: 900, h: 86 }
  ];
  // c: centro horizontal; y: borde superior; w y h: tamaño. grupo define el color.
  var POS = {
    inicio:     { c: 500, y: 40,  w: 150, h: 46, forma: 'pastilla', grupo: 'inicio' },
    fuentes:    { c: 500, y: 120, w: 180, h: 62, grupo: 'datos' },
    dolar:      { c: 500, y: 200, w: 180, h: 62, grupo: 'datos' },
    acciones:   { c: 116, y: 330, w: 180, h: 62, grupo: 'analisis' },
    rentafija:  { c: 308, y: 330, w: 180, h: 62, grupo: 'analisis' },
    macro:      { c: 500, y: 330, w: 180, h: 62, grupo: 'analisis' },
    noticias:   { c: 692, y: 330, w: 180, h: 62, grupo: 'analisis' },
    liquidez:   { c: 884, y: 330, w: 180, h: 62, grupo: 'analisis' },
    guardian:   { c: 230, y: 462, w: 180, h: 62, grupo: 'riesgo', veta: true },
    escenarios: { c: 500, y: 462, w: 180, h: 62, grupo: 'riesgo' },
    compliance: { c: 770, y: 462, w: 180, h: 62, grupo: 'riesgo', veta: true },
    tamano:     { c: 190, y: 570, w: 180, h: 62, grupo: 'riesgo' },
    veto:       { c: 500, y: 566, w: 140, h: 72, forma: 'rombo', grupo: 'veto' },
    comite:     { c: 500, y: 706, w: 180, h: 62, grupo: 'decision' },
    fiscal:     { c: 800, y: 706, w: 180, h: 62, grupo: 'decision' },
    vos:        { c: 500, y: 800, w: 200, h: 62, grupo: 'humano' },
    memoria:    { c: 500, y: 918, w: 180, h: 50, grupo: 'registro' }
  };

  // [origen, lado, destino, lado, etiqueta]. El lado indica por dónde sale o entra la flecha.
  var ARISTAS = [
    ['inicio', 'abajo', 'fuentes', 'arriba'],
    ['fuentes', 'abajo', 'dolar', 'arriba'],
    ['dolar', 'abajo', 'acciones', 'arriba'], ['dolar', 'abajo', 'rentafija', 'arriba'],
    ['dolar', 'abajo', 'macro', 'arriba'], ['dolar', 'abajo', 'noticias', 'arriba'], ['dolar', 'abajo', 'liquidez', 'arriba'],
    ['acciones', 'abajo', 'guardian', 'arriba'], ['rentafija', 'abajo', 'guardian', 'arriba'],
    ['macro', 'abajo', 'escenarios', 'arriba'],
    ['noticias', 'abajo', 'compliance', 'arriba'], ['liquidez', 'abajo', 'compliance', 'arriba'],
    ['guardian', 'abajo', 'veto', 'arriba'], ['escenarios', 'abajo', 'veto', 'arriba'], ['compliance', 'abajo', 'veto', 'arriba'],
    ['veto', 'izq', 'tamano', 'der', 'sí'],
    ['veto', 'abajo', 'comite', 'arriba', 'no'],
    ['tamano', 'abajo', 'comite', 'izq'],
    ['comite', 'abajo', 'vos', 'arriba'],
    ['comite', 'der', 'fiscal', 'izq', 'si es una venta'],
    ['fiscal', 'abajo', 'vos', 'der'],
    ['vos', 'abajo', 'memoria', 'arriba']
  ];

  // Íconos en un cuadro de 24 × 24, dibujados con trazos (el color lo pone el CSS).
  var ICONOS = {
    inicio: '<path class="relleno" d="M8.5 6v12l10-6z"/>',
    fuentes: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/>',
    dolar: '<path d="M16.5 7.5c-.7-1-2-1.7-3.8-1.7-2.2 0-3.7 1-3.7 2.6s1.4 2.2 3.7 2.7c2.3.5 3.7 1.2 3.7 2.8s-1.6 2.7-3.8 2.7c-1.9 0-3.3-.7-4.1-1.8M12 4v16"/>',
    acciones: '<path d="M3.5 17l5.5-5.5 4 4 7.5-7.5M15.5 8H20v4.5"/>',
    rentafija: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
    macro: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.9 5.4 3.9 8.5s-1.3 5.9-3.9 8.5c-2.6-2.6-3.9-5.4-3.9-8.5s1.3-5.9 3.9-8.5z"/>',
    noticias: '<rect x="3.5" y="5" width="13" height="14" rx="1.5"/><path d="M16.5 9h4v8a1.8 1.8 0 0 1-3.6 0M6.5 9h7M6.5 12h7M6.5 15h4"/>',
    liquidez: '<path d="M12 3.5c3.2 4.2 5.5 7.1 5.5 10.5a5.5 5.5 0 0 1-11 0c0-3.4 2.3-6.3 5.5-10.5z"/>',
    guardian: '<path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    escenarios: '<path d="M4.5 4.5v15h15M7.5 15l3.5-3.5 3 2.5 4.5-5"/>',
    compliance: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9.5 3h5v3h-5zM9 13l2.2 2.2L15.5 11"/>',
    tamano: '<path d="M3.5 16.5l13-13 4 4-13 13zM7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l1.5 1.5"/>',
    comite: '<circle cx="9" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M3.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5M14.5 14.2c2.7-.6 5.5 1.2 5.5 4.3"/>',
    fiscal: '<path d="M6.5 3.5h11v17l-2.75-1.7-2.75 1.7-2.75-1.7-2.75 1.7z"/><path d="M9.5 8.5h5M9.5 12h5"/>',
    memoria: '<path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10.5M9 8.5h5"/>',
    vos: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>'
  };

  function acortar(motor) {
    var base = (motor || '').split(';')[0];
    return /claude/i.test(motor || '') ? base + ' + Claude' : base;
  }

  function clase(id) {
    var p = POS[id];
    return 'nodo g-' + p.grupo + (p.veta ? ' veta' : '') + (id === 'vos' ? ' humano' : '') + (id === 'inicio' ? ' inicio' : '');
  }

  // Punto de un lado de una tarjeta, con el vector que apunta hacia afuera.
  function anclaje(id, lado) {
    var p = POS[id];
    var x0 = p.c - p.w / 2, y0 = p.y;
    if (lado === 'arriba') return { x: p.c, y: y0, dx: 0, dy: -1 };
    if (lado === 'abajo') return { x: p.c, y: y0 + p.h, dx: 0, dy: 1 };
    if (lado === 'izq') return { x: x0, y: y0 + p.h / 2, dx: -1, dy: 0 };
    return { x: x0 + p.w, y: y0 + p.h / 2, dx: 1, dy: 0 };
  }

  // Curva cúbica entre dos anclajes. Devuelve el trazo y el punto medio, para poner la etiqueta.
  function curva(a, b) {
    var k = Math.max(20, Math.hypot(b.x - a.x, b.y - a.y) * 0.42);
    var c1 = { x: a.x + a.dx * k, y: a.y + a.dy * k };
    var c2 = { x: b.x + b.dx * k, y: b.y + b.dy * k };
    var f = function (v) { return Math.round(v * 10) / 10; };
    return {
      d: 'M' + f(a.x) + ' ' + f(a.y) + ' C' + f(c1.x) + ' ' + f(c1.y) + ' ' + f(c2.x) + ' ' + f(c2.y) + ' ' + f(b.x) + ' ' + f(b.y),
      medio: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 }
    };
  }

  // Vértices del rombo de veto: arriba, derecha, abajo, izquierda.
  function puntosRombo(p) {
    var cy = p.y + p.h / 2;
    return [
      p.c + ',' + p.y,
      (p.c + p.w / 2) + ',' + cy,
      p.c + ',' + (p.y + p.h),
      (p.c - p.w / 2) + ',' + cy
    ].join(' ');
  }

  function grafo(contenedor, nodos) {
    var nombres = { inicio: 'Inicio', vos: 'Tu aprobación', veto: '¿Hay veto?' };
    var descripciones = { inicio: 'Un botón, la lista o una tarea programada', vos: 'Ninguna orden sale sin tu firma', veto: 'Si AI Guardián o AI Compliance vetan, decide AI Tamaño' };
    var motores = { inicio: 'Disparador', vos: 'Tu firma', veto: 'Regla de veto' };
    nodos.forEach(function (n) { nombres[n.id] = n.nombre; descripciones[n.id] = n.rol; motores[n.id] = acortar(n.motor); });
    Object.keys(POS).forEach(function (id) { if (POS[id].veta) motores[id] = 'Puede vetar'; });

    var uid = 'g' + (++UID) + Math.random().toString(36).slice(2, 6);
    var s = svg('svg', { viewBox: '0 0 1000 1000', role: 'img', 'aria-label': 'Grafo del comité: 14 agentes, un veto posible y tu aprobación' });
    var defs = svg('defs');
    var marca = svg('marker', { id: uid + '-flecha', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    marca.appendChild(svg('path', { d: 'M0 0L10 5L0 10z', 'class': 'flecha' }));
    defs.appendChild(marca);
    s.appendChild(defs);

    BANDAS.forEach(function (b) {
      s.appendChild(svg('rect', { x: 12, y: b.y, width: 976, height: b.h, rx: 16, 'class': 'banda banda-' + b.id }));
      s.appendChild(svg('text', { x: 30, y: b.y + 22, 'class': 'banda-titulo' }, b.titulo));
    });

    var capaAristas = svg('g', { 'class': 'aristas' });
    var etiquetas = svg('g', { 'class': 'etiquetas' });
    var aristas = [];
    ARISTAS.forEach(function (e) {
      var t = curva(anclaje(e[0], e[1]), anclaje(e[2], e[3]));
      var trazo = svg('path', { d: t.d, 'class': 'arista', 'marker-end': 'url(#' + uid + '-flecha)' });
      capaAristas.appendChild(trazo);
      aristas.push({ el: trazo, de: e[0], a: e[2] });
      if (e[4]) etiquetas.appendChild(svg('text', { x: t.medio.x, y: t.medio.y - 9, 'text-anchor': 'middle', 'class': 'etiqueta-arista' }, e[4]));
    });
    s.appendChild(capaAristas);
    s.appendChild(etiquetas);

    var capaNodos = svg('g', { 'class': 'nodos' });
    var elementos = {};
    Object.keys(POS).forEach(function (id) {
      var p = POS[id];
      var g = svg('g', { 'class': clase(id), 'data-nodo': id });
      var titulo = svg('title', {}, nombres[id] + ': ' + descripciones[id]);
      g.appendChild(titulo);
      if (p.forma === 'rombo') {
        g.appendChild(svg('polygon', { points: puntosRombo(p) }));
        g.appendChild(svg('text', { x: p.c, y: p.y + p.h / 2 + 4, 'text-anchor': 'middle', 'class': 'titulo' }, nombres[id]));
      } else if (p.forma === 'pastilla') {
        g.appendChild(svg('rect', { x: p.c - p.w / 2, y: p.y, width: p.w, height: p.h, rx: p.h / 2 }));
        g.appendChild(svg('text', { x: p.c, y: p.y + p.h / 2 + 5, 'text-anchor': 'middle', 'class': 'titulo' }, nombres[id]));
      } else {
        var x = p.c - p.w / 2, cx = x + 34, cy = p.y + p.h / 2;
        g.appendChild(svg('rect', { x: x, y: p.y, width: p.w, height: p.h, rx: 14 }));
        g.appendChild(svg('circle', { cx: cx, cy: cy, r: 17, 'class': 'badge' }));
        var icono = svg('svg', { x: cx - 12, y: cy - 12, width: 24, height: 24, viewBox: '0 0 24 24', 'class': 'icono' });
        icono.innerHTML = ICONOS[id] || ICONOS.fuentes;
        g.appendChild(icono);
        g.appendChild(svg('text', { x: x + 62, y: p.y + 27, 'class': 'titulo' }, nombres[id]));
        g.appendChild(svg('text', { x: x + 62, y: p.y + 45, 'class': 'cap' }, motores[id]));
      }
      capaNodos.appendChild(g);
      elementos[id] = { g: g, titulo: titulo, base: clase(id) };
    });
    s.appendChild(capaNodos);
    vaciar(contenedor).appendChild(s);

    var temporizador = null;
    var visitados = {};
    // Una arista se ilumina si sus dos extremos se visitaron; la que llega al nodo activo se anima.
    function refrescar(activo) {
      aristas.forEach(function (x) {
        var c = 'arista';
        if (visitados[x.de] && visitados[x.a]) c += ' recorrida';
        if (activo && x.a === activo && visitados[x.de]) c += ' activa';
        x.el.setAttribute('class', c);
      });
    }
    var api = {
      limpiar: function () {
        if (temporizador) clearTimeout(temporizador);
        visitados = {};
        Object.keys(elementos).forEach(function (id) {
          elementos[id].g.setAttribute('class', elementos[id].base);
          elementos[id].titulo.textContent = nombres[id] + ': ' + descripciones[id];
        });
        refrescar(null);
      },
      marcar: function (id, voto, salida, activo) {
        var e = elementos[id];
        if (!e) return;
        visitados[id] = true;
        e.g.setAttribute('class', e.base + ' visitado' + (voto ? ' voto-' + voto : '') + (activo ? ' activo' : ''));
        if (salida) e.titulo.textContent = nombres[id] + ': ' + salida;
        refrescar(activo ? id : null);
      },
      mostrar: function (trail) {
        api.limpiar();
        api.marcar('inicio', null, null);
        (trail || []).forEach(function (t) {
          api.marcar(t.nodo, t.voto, t.salida);
          if (t.nodo === 'compliance') api.marcar('veto', null, null);
        });
      },
      // Ilumina los nodos de un recorrido uno por uno. Llama a fin cuando termina.
      animar: function (trail, msPorPaso, fin) {
        api.limpiar();
        api.marcar('inicio', null, null);
        var i = 0;
        var anterior = null;
        (function paso() {
          if (anterior) api.marcar(anterior.nodo, anterior.voto, anterior.salida, false);
          if (i >= trail.length) { temporizador = null; if (fin) fin(); return; }
          var t = trail[i];
          api.marcar(t.nodo, t.voto, t.salida, true);
          if (t.nodo === 'compliance') api.marcar('veto', null, null);
          anterior = t;
          i += 1;
          temporizador = setTimeout(paso, msPorPaso);
        })();
      }
    };
    return api;
  }

  // Líneas

  function pasoLindo(rango) {
    var bruto = rango / 4;
    var mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var n = bruto / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }

  // cfg: { etiquetas, series: [{ nombre, valores }], formato, formatoEje, alto, marcasX, puntos }
  function lineas(contenedor, cfg) {
    var W = 720;
    var H = cfg.alto || 260;
    var m = { l: 64, r: 124, t: 16, b: 32 };
    var n = cfg.etiquetas.length;
    var todos = [];
    cfg.series.forEach(function (s) { todos = todos.concat(s.valores); });
    var min = Math.min.apply(null, todos);
    var max = Math.max.apply(null, todos);
    if (min === max) { min -= 1; max += 1; }
    var paso = pasoLindo(max - min);
    var y0 = Math.floor(min / paso) * paso;
    var y1 = Math.ceil(max / paso) * paso;
    var X = function (i) { return m.l + (n > 1 ? i * (W - m.l - m.r) / (n - 1) : 0); };
    var Y = function (v) { return H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b); };

    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cfg.titulo || 'Gráfico de líneas' });
    var grilla = svg('g', { 'class': 'grilla' });
    for (var v = y0; v <= y1 + paso / 2; v += paso) {
      grilla.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), 'class': Math.abs(v) < paso / 2 ? 'cero' : '' }));
      grilla.appendChild(svg('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, cfg.formatoEje(v)));
    }
    var marcas = cfg.marcasX || 6;
    var vistas = {};
    for (var k = 0; k < marcas; k += 1) {
      var i = Math.round(k * (n - 1) / Math.max(1, marcas - 1));
      if (vistas[i]) continue;
      vistas[i] = 1;
      grilla.appendChild(svg('text', { x: X(i), y: H - 10, 'text-anchor': k === 0 ? 'start' : k === marcas - 1 ? 'end' : 'middle' }, cfg.etiquetas[i]));
    }
    s.appendChild(grilla);

    var finales = [];
    cfg.series.forEach(function (serie, si) {
      var clase = 'serie serie-' + (si + 1);
      var d = serie.valores.map(function (val, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(val).toFixed(1); }).join('');
      if (si === 0) {
        // Área suave bajo la serie principal.
        var piso = Y(Math.max(y0, Math.min(0, y1)));
        s.appendChild(svg('path', { d: d + 'L' + X(n - 1).toFixed(1) + ' ' + piso.toFixed(1) + 'L' + X(0).toFixed(1) + ' ' + piso.toFixed(1) + 'Z', 'class': 'area' }));
      }
      var linea = svg('path', { d: d, 'class': clase + (si === 0 ? ' principal' : '') });
      linea.appendChild(svg('title', {}, serie.nombre));
      s.appendChild(linea);
      if (cfg.puntos) {
        serie.valores.forEach(function (val, i) {
          var c = svg('circle', { cx: X(i), cy: Y(val), r: 3, 'class': clase + ' punto' });
          c.appendChild(svg('title', {}, serie.nombre + ' · ' + cfg.etiquetas[i] + ': ' + cfg.formato(val)));
          s.appendChild(c);
        });
      }
      var ult = serie.valores[serie.valores.length - 1];
      s.appendChild(svg('circle', { cx: X(n - 1), cy: Y(ult), r: 4, 'class': clase + ' final' }));
      finales.push({ y: Y(ult), texto: serie.nombre + ' ' + cfg.formato(ult), clase: clase });
    });
    // Etiquetas finales sin superponerse.
    finales.sort(function (a, b) { return a.y - b.y; });
    for (var j = 1; j < finales.length; j += 1) {
      if (finales[j].y - finales[j - 1].y < 15) finales[j].y = finales[j - 1].y + 15;
    }
    finales.forEach(function (f) {
      s.appendChild(svg('text', { x: W - m.r + 10, y: f.y + 4, 'class': f.clase + ' etiqueta-final' }, f.texto));
    });
    vaciar(contenedor).appendChild(s);
  }

  // Barras agrupadas alrededor de cero. cfg: { filas: [{ etiqueta, valores }], series, formato }
  function barras(contenedor, cfg) {
    var W = 720;
    var alto = 22;
    var fila = cfg.series.length * alto + 18;
    var H = 40 + cfg.filas.length * fila;
    var x0 = 180;
    var x1 = W - 70;
    var maxAbs = 0;
    cfg.filas.forEach(function (f) { f.valores.forEach(function (v) { maxAbs = Math.max(maxAbs, Math.abs(v)); }); });
    // Margen para que la cifra al final de la barra no pise las etiquetas.
    maxAbs = (maxAbs || 1) * 1.3;
    var cero = x0 + (x1 - x0) / 2;
    var X = function (v) { return cero + v / maxAbs * (x1 - x0) / 2; };

    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cfg.titulo || 'Gráfico de barras' });
    cfg.series.forEach(function (nombre, si) {
      var lx = x0 + si * 150;
      s.appendChild(svg('rect', { x: lx, y: 8, width: 12, height: 12, rx: 2, 'class': 'barra serie-' + (si + 1) }));
      s.appendChild(svg('text', { x: lx + 18, y: 18, 'class': 'leyenda' }, nombre));
    });
    s.appendChild(svg('line', { x1: cero, x2: cero, y1: 32, y2: H - 4, 'class': 'eje-cero' }));
    cfg.filas.forEach(function (f, fi) {
      var top = 36 + fi * fila;
      s.appendChild(svg('text', { x: x0 - 12, y: top + fila / 2, 'text-anchor': 'end', 'class': 'etiqueta-fila' }, f.etiqueta));
      f.valores.forEach(function (v, si) {
        var y = top + si * alto;
        var xa = Math.min(X(0), X(v));
        var r = svg('rect', { x: xa, y: y, width: Math.max(1, Math.abs(X(v) - X(0))), height: alto - 6, rx: 3, 'class': 'barra serie-' + (si + 1) });
        r.appendChild(svg('title', {}, f.etiqueta + ' · ' + cfg.series[si] + ': ' + cfg.formato(v)));
        s.appendChild(r);
        s.appendChild(svg('text', { x: v >= 0 ? X(v) + 6 : X(v) - 6, y: y + alto - 10, 'text-anchor': v >= 0 ? 'start' : 'end', 'class': 'valor' }, cfg.formato(v)));
      });
    });
    vaciar(contenedor).appendChild(s);
  }

  global.QuorumGraficos = { grafo: grafo, lineas: lineas, barras: barras };
})(window);
