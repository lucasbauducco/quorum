/* Interacción de la cáscara de Quórum: menú plegable, búsqueda de secciones (Ctrl+K),
   cajón lateral en móvil y cambio de tema. No toca los datos ni las vistas. */
(function () {
  'use strict';

  var CLAVE_TEMA = 'quorum-tema';
  var CLAVE_GRUPOS = 'quorum-menu-cerrados';
  var body = document.body;
  var raiz = document.documentElement;

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  // Almacenamiento local: si el navegador lo bloquea, la interfaz sigue funcionando.
  function leer(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }
  function escribir(clave, valor) { try { localStorage.setItem(clave, valor); } catch (e) { /* sin persistencia */ } }

  function normalizar(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  // ---------- Tema ----------
  var botonTema = $('#btn-tema');
  function pintarTema() {
    var claro = raiz.getAttribute('data-theme') === 'light';
    if (botonTema) {
      var texto = claro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
      botonTema.setAttribute('aria-label', texto);
      botonTema.setAttribute('title', texto);
    }
  }
  if (botonTema) {
    botonTema.addEventListener('click', function () {
      var claro = raiz.getAttribute('data-theme') === 'light';
      if (claro) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', 'light');
      escribir(CLAVE_TEMA, claro ? 'dark' : 'light');
      pintarTema();
    });
  }
  pintarTema();

  // ---------- Estado de datos: la barra muestra una línea; el detalle completo va en el tooltip ----------
  var estadoDatos = $('#estado-guardado');
  if (estadoDatos && window.MutationObserver) {
    var copiar = function () { estadoDatos.setAttribute('title', estadoDatos.textContent); };
    copiar();
    new MutationObserver(copiar).observe(estadoDatos, { childList: true, characterData: true, subtree: true });
  }

  // ---------- Grupos plegables ----------
  var cerrados = [];
  try { cerrados = JSON.parse(leer(CLAVE_GRUPOS) || '[]'); } catch (e) { cerrados = []; }

  function nombreGrupo(grupo) {
    var b = grupo.querySelector('.grupo-cab span');
    return b ? b.textContent.trim() : '';
  }
  function fijarGrupo(grupo, abierto) {
    var boton = grupo.querySelector('.grupo-cab');
    if (!boton) return;
    boton.setAttribute('aria-expanded', String(abierto));
    if (abierto) grupo.removeAttribute('data-cerrado'); else grupo.setAttribute('data-cerrado', '');
  }
  function guardarGrupos() {
    var lista = $$('[data-grupo-menu]').filter(function (g) { return g.hasAttribute('data-cerrado'); })
      .map(nombreGrupo);
    cerrados = lista;
    escribir(CLAVE_GRUPOS, JSON.stringify(lista));
  }

  $$('[data-grupo-menu]').forEach(function (grupo) {
    fijarGrupo(grupo, cerrados.indexOf(nombreGrupo(grupo)) < 0);
    var boton = grupo.querySelector('.grupo-cab');
    if (!boton) return;
    boton.addEventListener('click', function () {
      var abierto = boton.getAttribute('aria-expanded') !== 'true';
      fijarGrupo(grupo, abierto);
      guardarGrupos();
    });
  });

  // Si la sección activa está dentro de un grupo cerrado, ese grupo se abre.
  function abrirGrupoActivo() {
    var activo = document.querySelector('[data-nav][aria-current="page"]');
    if (!activo) return;
    var grupo = activo.closest('[data-grupo-menu]');
    if (grupo && grupo.hasAttribute('data-cerrado')) { fijarGrupo(grupo, true); guardarGrupos(); }
  }

  // ---------- Búsqueda de secciones ----------
  var buscar = $('#buscar-menu');
  var sinResultados = $('#sin-resultados');

  function enlacesVisibles() {
    return $$('.menu a[data-nav]').filter(function (a) { return !a.hidden; });
  }

  function filtrar() {
    var q = normalizar(buscar.value);
    var hayCoincidencias = false;
    $$('.menu a[data-nav]').forEach(function (a) {
      var coincide = !q || normalizar(a.textContent).indexOf(q) >= 0;
      a.hidden = !coincide;
      if (coincide) hayCoincidencias = true;
    });
    $$('[data-grupo-menu]').forEach(function (grupo) {
      var hay = grupo.querySelector('a[data-nav]:not([hidden])');
      grupo.hidden = !hay;
      // Mientras se busca, los grupos con resultados se muestran abiertos.
      if (q && hay) fijarGrupo(grupo, true);
      if (!q) abrirGrupoActivo();
    });
    sinResultados.hidden = hayCoincidencias || !q;
  }

  if (buscar) {
    buscar.addEventListener('input', filtrar);
    buscar.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var primero = enlacesVisibles()[0];
        if (primero) { e.preventDefault(); irA(primero); }
      } else if (e.key === 'Escape') {
        buscar.value = ''; filtrar(); buscar.blur();
      }
    });
  }

  // ---------- Cajón en móvil ----------
  var botonMenu = $('#btn-menu');
  var velo = $('#velo-menu');

  function abrirMenu(abrir) {
    body.classList.toggle('menu-abierto', abrir);
    if (botonMenu) {
      botonMenu.setAttribute('aria-expanded', String(abrir));
      botonMenu.setAttribute('aria-label', abrir ? 'Cerrar el menú' : 'Abrir el menú');
    }
    if (abrir) { var s = $('#menu-lateral'); if (s) s.scrollTop = 0; }
  }
  if (botonMenu) botonMenu.addEventListener('click', function () { abrirMenu(!body.classList.contains('menu-abierto')); });
  if (velo) velo.addEventListener('click', function () { abrirMenu(false); });

  function irA(a) {
    location.hash = a.getAttribute('href');
    abrirMenu(false);
    if (buscar && buscar.value) { buscar.value = ''; filtrar(); }
  }

  // Un clic en una sección cierra el cajón en móvil; el enlace sigue siendo un enlace normal.
  $$('.menu a[data-nav]').forEach(function (a) {
    a.addEventListener('click', function () {
      abrirMenu(false);
      if (buscar && buscar.value) { buscar.value = ''; filtrar(); }
    });
  });

  window.addEventListener('hashchange', function () {
    abrirGrupoActivo();
  });

  // ---------- Teclado ----------
  document.addEventListener('keydown', function (e) {
    var escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (window.innerWidth <= 900) abrirMenu(true);
      if (buscar) buscar.focus();
      return;
    }
    if (e.key === '/' && !escribiendo) {
      e.preventDefault();
      if (window.innerWidth <= 900) abrirMenu(true);
      if (buscar) buscar.focus();
      return;
    }
    if (e.key === 'Escape') {
      if (body.classList.contains('menu-abierto')) { abrirMenu(false); if (botonMenu) botonMenu.focus(); }
    }
  });

  // Si se pasa a escritorio con el cajón abierto, se cierra.
  window.addEventListener('resize', function () {
    if (window.innerWidth > 900 && body.classList.contains('menu-abierto')) abrirMenu(false);
  });

  abrirGrupoActivo();
})();
