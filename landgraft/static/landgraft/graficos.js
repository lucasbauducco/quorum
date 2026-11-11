/* Gráficos de Landgraft: el grafo del comité, líneas y barras. SVG a escala, colores por clases CSS. */
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

  function marcador(s, id) {
    var defs = svg('defs');
    var m = svg('marker', { id: id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    m.appendChild(svg('path', { d: 'M0 0L10 5L0 10z', 'class': 'flecha' }));
    defs.appendChild(m);
    s.appendChild(defs);
  }

  // Grafo del comité

  var POS = {
    inicio:     { x: 350, y: 16,  w: 120 },
    fuentes:    { x: 330, y: 84,  w: 160 },
    dolar:      { x: 330, y: 152, w: 160 },
    acciones:   { x: 28,  y: 236, w: 140 },
    rentafija:  { x: 184, y: 236, w: 140 },
    macro:      { x: 340, y: 236, w: 140 },
    noticias:   { x: 496, y: 236, w: 140 },
    liquidez:   { x: 652, y: 236, w: 140 },
    guardian:   { x: 130, y: 336, w: 160 },
    escenarios: { x: 330, y: 336, w: 160 },
    compliance: { x: 530, y: 336, w: 160 },
    tamano:     { x: 90,  y: 426, w: 150 },
    comite:     { x: 320, y: 510, w: 180 },
    fiscal:     { x: 600, y: 590, w: 150 },
    vos:        { x: 320, y: 670, w: 180 },
    memoria:    { x: 320, y: 750, w: 180 }
  };

  var ARISTAS = [
    'M410 60V84', 'M410 128V152',
    'M410 196V214', 'M98 214H722',
    'M98 214V236', 'M254 214V236', 'M410 214V236', 'M566 214V236', 'M722 214V236',
    'M98 280V312', 'M254 280V312', 'M410 280V312', 'M566 280V312', 'M722 280V312', 'M98 312H722',
    'M210 312V336', 'M410 312V336', 'M610 312V336',
    'M210 380V400', 'M410 380V400', 'M610 380V400', 'M210 400H610', 'M410 400V422',
    'M346 448H240', 'M410 474V510', 'M165 470V532H320',
    'M410 554V670', 'M500 532H675V590', 'M675 634V692H500', 'M410 714V750'
  ];
  // Las aristas que terminan en un nodo llevan flecha; los tramos de bus, no.
  var SIN_FLECHA = { 'M410 196V214': 1, 'M98 214H722': 1, 'M98 280V312': 1, 'M254 280V312': 1, 'M410 280V312': 1, 'M566 280V312': 1, 'M722 280V312': 1, 'M98 312H722': 1, 'M210 380V400': 1, 'M410 380V400': 1, 'M610 380V400': 1, 'M210 400H610': 1 };

  function grafo(contenedor, nodos) {
    var nombres = { inicio: 'Inicio', vos: 'Tu aprobación', veto: '¿Hay veto?' };
    var descripciones = { inicio: 'Un botón, la lista o una tarea programada', vos: 'Ninguna orden sale sin tu firma', veto: 'Si AI Guardián o AI Compliance vetan, decide AI Tamaño' };
    nodos.forEach(function (n) { nombres[n.id] = n.nombre; descripciones[n.id] = n.rol; });

    var s = svg('svg', { viewBox: '0 0 820 810', role: 'img', 'aria-label': 'Grafo del comité: 14 agentes, un veto posible y tu aprobación' });
    marcador(s, 'grafo-flecha-' + Math.random().toString(36).slice(2, 7));
    var idFlecha = s.querySelector('marker').getAttribute('id');
    var aristas = svg('g', { 'class': 'aristas' });
    ARISTAS.forEach(function (d) {
      var a = { d: d, 'class': 'arista' };
      if (!SIN_FLECHA[d]) a['marker-end'] = 'url(#' + idFlecha + ')';
      aristas.appendChild(svg('path', a));
    });
    s.appendChild(aristas);
    s.appendChild(svg('text', { x: 293, y: 440, 'class': 'etiqueta-arista', 'text-anchor': 'middle' }, 'sí'));
    s.appendChild(svg('text', { x: 418, y: 496, 'class': 'etiqueta-arista' }, 'no'));
    s.appendChild(svg('text', { x: 588, y: 524, 'class': 'etiqueta-arista', 'text-anchor': 'middle' }, 'si es una venta'));

    var elementos = {};
    function nodo(id, forma) {
      var g = svg('g', { 'class': 'nodo' + (id === 'vos' ? ' humano' : ''), 'data-nodo': id });
      var titulo = svg('title', {}, nombres[id] + ': ' + descripciones[id]);
      g.appendChild(titulo);
      g.appendChild(forma);
      elementos[id] = { g: g, titulo: titulo };
      return g;
    }
    Object.keys(POS).forEach(function (id) {
      var p = POS[id];
      var g = nodo(id, svg('rect', { x: p.x, y: p.y, width: p.w, height: 44, rx: 8 }));
      g.appendChild(svg('text', { x: p.x + p.w / 2, y: p.y + 27, 'text-anchor': 'middle' }, nombres[id]));
      s.appendChild(g);
    });
    var rombo = nodo('veto', svg('polygon', { points: '346,448 410,422 474,448 410,474' }));
    rombo.appendChild(svg('text', { x: 410, y: 452, 'text-anchor': 'middle', 'class': 'chico' }, nombres.veto));
    s.appendChild(rombo);

    vaciar(contenedor).appendChild(s);

    var temporizador = null;
    var api = {
      limpiar: function () {
        if (temporizador) clearTimeout(temporizador);
        Object.keys(elementos).forEach(function (id) {
          elementos[id].g.setAttribute('class', 'nodo' + (id === 'vos' ? ' humano' : ''));
          elementos[id].titulo.textContent = nombres[id] + ': ' + descripciones[id];
        });
      },
      marcar: function (id, voto, salida, activo) {
        var e = elementos[id];
        if (!e) return;
        e.g.setAttribute('class', 'nodo visitado' + (voto ? ' voto-' + voto : '') + (activo ? ' activo' : '') + (id === 'vos' ? ' humano' : ''));
        if (salida) e.titulo.textContent = nombres[id] + ': ' + salida;
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

  global.LandgraftGraficos = { grafo: grafo, lineas: lineas, barras: barras };
})(window);
