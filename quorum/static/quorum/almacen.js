/* Dónde se guardan tus datos:
   - 'servidor': con sesión iniciada en Quórum, en la base de Django (cualquier navegador ve lo mismo).
   - 'db': dentro de claude.ai, en tu espacio privado del artifact.
   - 'local': sin sesión, solo en este navegador.
   En todos los modos queda además una copia en el navegador. */
(function (global) {
  'use strict';

  var PREFIJO = 'quorum:';
  // Prefijo anterior (cuando el proyecto se llamaba Landgraft): se lee si no hay datos con el nuevo.
  var PREFIJO_ANTERIOR = 'landgraft:';
  var modo = 'local';
  var db = null;
  var uid = null;
  var csrf = null;
  var usuario = null;
  var pendiente = {};
  var escribiendo = {};
  var alFallar = function () {};

  function leerLocal(clave) {
    try {
      var v = global.localStorage.getItem(PREFIJO + clave);
      if (v == null) v = global.localStorage.getItem(PREFIJO_ANTERIOR + clave);
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  }

  function guardarLocal(clave, valor) {
    try { global.localStorage.setItem(PREFIJO + clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
  }

  function borrarLocal(clave) {
    try { global.localStorage.removeItem(PREFIJO + clave); } catch (e) { /* sin almacenamiento */ }
  }

  function conTiempo(promesa, ms) {
    return Promise.race([
      promesa,
      new Promise(function (_, rechazar) { setTimeout(function () { rechazar({ code: 'timeout' }); }, ms); })
    ]);
  }

  // Servidor (Django)

  function pedir(metodo, clave, cuerpo) {
    var opciones = { method: metodo, credentials: 'same-origin', headers: { 'X-CSRFToken': csrf, Accept: 'application/json' } };
    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify({ valor: cuerpo });
    }
    return global.fetch('api/datos/' + encodeURIComponent(clave) + '/', opciones);
  }

  function conectarServidor() {
    if (!global.fetch) return Promise.resolve(false);
    return conTiempo(global.fetch('api/sesion/', { credentials: 'same-origin' }), 8000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s || !s.autenticado) return false;
        csrf = s.csrf;
        usuario = s.usuario;
        modo = 'servidor';
        return true;
      })
      .catch(function () { return false; });
  }

  // claude.ai (artifact)

  function conectarClaude() {
    if (!global.claude || !global.claude.use) return Promise.resolve(false);
    return Promise.all([global.claude.use('db'), global.claude.use('user')])
      .then(function (r) {
        if (!r[0] || !r[1]) return false;
        return r[1].id().then(function (id) {
          if (!id) return false;
          db = r[0];
          uid = id;
          modo = 'db';
          return true;
        });
      })
      .catch(function () { return false; });
  }

  function ref(clave) {
    return db.doc('data/users/' + uid + '/' + clave);
  }

  // Resuelve 'servidor', 'db' o 'local'. Nunca rechaza.
  function conectar() {
    return conectarServidor().then(function (ok) {
      if (ok) return modo;
      return conectarClaude().then(function () { return modo; });
    });
  }

  function leer(clave) {
    if (modo === 'servidor') {
      return conTiempo(pedir('GET', clave), 10000)
        .then(function (r) {
          if (r.status === 404) {
            // Primera vez con sesión: se sube lo que había en este navegador.
            var local = leerLocal(clave);
            if (local != null) guardar(clave, local);
            return local;
          }
          if (!r.ok) throw { code: 'http_' + r.status };
          return r.json().then(function (j) { guardarLocal(clave, j.valor); return j.valor; });
        })
        .catch(function (e) { alFallar(e, 'leer'); return leerLocal(clave); });
    }
    if (modo === 'db') {
      return conTiempo(ref(clave).get(), 10000)
        .then(function (s) {
          if (!s.exists) return leerLocal(clave);
          var v = JSON.parse(JSON.stringify(s.data().valor));
          guardarLocal(clave, v);
          return v;
        })
        .catch(function (e) { alFallar(e, 'leer'); return leerLocal(clave); });
    }
    return Promise.resolve(leerLocal(clave));
  }

  function escribirRemoto(clave, v) {
    if (modo === 'servidor') {
      return pedir('PUT', clave, v).then(function (r) { if (!r.ok) throw { code: 'http_' + r.status }; });
    }
    return ref(clave).set({ valor: v, actualizado: new Date().toISOString() });
  }

  // Guarda siempre en el navegador; con servidor o db, además, una escritura por vez y solo el último valor.
  function guardar(clave, valor) {
    guardarLocal(clave, valor);
    if (modo === 'local') return;
    pendiente[clave] = valor;
    if (escribiendo[clave]) return;
    escribiendo[clave] = true;
    (function siguiente() {
      if (!(clave in pendiente)) { escribiendo[clave] = false; return; }
      var v = pendiente[clave];
      delete pendiente[clave];
      escribirRemoto(clave, v)
        .catch(function (e) {
          alFallar(e, 'guardar');
          if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted' || e.code === 'http_403')) modo = 'local';
        })
        .then(siguiente);
    })();
  }

  function borrar(clave) {
    borrarLocal(clave);
    delete pendiente[clave];
    if (modo === 'servidor') pedir('DELETE', clave).catch(function (e) { alFallar(e, 'borrar'); });
    else if (modo === 'db') ref(clave).delete().catch(function (e) { alFallar(e, 'borrar'); });
  }

  global.QuorumAlmacen = {
    conectar: conectar,
    leer: leer,
    guardar: guardar,
    borrar: borrar,
    modo: function () { return modo; },
    usuario: function () { return usuario; },
    csrf: function () { return csrf; },
    alFallar: function (f) { alFallar = f; }
  };
})(window);
