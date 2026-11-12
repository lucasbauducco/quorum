# Plan para publicar Quórum

Objetivo: que alguien que llega desde GitHub entienda el proyecto en un minuto, lo pruebe en cinco y confíe en lo que ve.

Estado al momento de escribir: **hecho** (en el repositorio), **decisión tuya** (requiere elegir o contratar algo), **pendiente** (siguiente paso).

## 1. Demo en línea (mayor impacto)

| Paso | Estado |
|---|---|
| Imagen de producción: `Dockerfile` con gunicorn y WhiteNoise | Hecho |
| `docker-compose.yml` con web, worker, beat y Redis | Hecho (sin probar localmente: no hay Docker en la máquina de desarrollo; lo valida el CI) |
| Modo ejemplo sin datos personales, para que la demo no exponga una cartera real | Hecho (la app ya arranca con cartera de ejemplo) |
| Elegir hosting: Render, Railway, Fly.io o un VPS propio | **Decisión tuya.** Pide cuenta y, en algunos casos, tarjeta |
| Dominio o subdominio y HTTPS | **Decisión tuya** (dominio). Configurar `DJANGO_HTTPS=1`, `DJANGO_ALLOWED_HOSTS` y `DJANGO_CSRF_TRUSTED_ORIGINS` |
| Usuario de demo con contraseña pública y datos reseteables | Pendiente: requiere decidir si la demo es de lectura o de escritura |
| Cron de `cargar_historia` en el despliegue | Pendiente (un comando una vez por día) |

Nota: la demo necesita internet para traer precios en vivo. Si una fuente cae, la app avisa y usa los datos guardados (ya está implementado).

## 2. Inglés

| Paso | Estado |
|---|---|
| Resumen en inglés en el README (dos párrafos) y enlace a `README.en.md` | Hecho |
| `README.en.md` con qué es, qué no hace, inicio rápido y pruebas | Hecho |
| Traducir la interfaz al inglés | Pendiente, baja prioridad: la app está pensada para Argentina. Conviene hacerlo solo si hay interés real |
| Capturas con el texto en inglés | Pendiente, depende de lo anterior |

## 3. CI y Docker

| Paso | Estado |
|---|---|
| Workflow `.github/workflows/ci.yml`: `check`, pruebas de Django, sintaxis y pruebas de JavaScript, build de la imagen | Hecho |
| Badge de CI en el README | Hecho (apunta a `lucasbauducco/quorum`: verificar que coincida con el nombre real del repo) |
| Badge de tests en verde en el README | Pendiente: aparece solo cuando el primer workflow corra en GitHub |
| Publicar la imagen en GitHub Container Registry en cada tag | Pendiente (un job más, cuando haya primera versión) |

## 4. README corto arriba

| Paso | Estado |
|---|---|
| Bloque "En cinco minutos" con Docker, qué es y para quién | Hecho |
| Capturas de la interfaz | Hecho |
| Índice y estructura del repo actualizados | Hecho |
| Separar la documentación técnica en `docs/` (el README sigue siendo largo) | Pendiente, opcional |

## 5. Fuentes públicas que cambian formato

Es el punto más frágil para quien instala la app. Ya existe: cada fuente falla por separado, se informa en la línea de estado y en la pantalla Fuentes, y los errores de Yahoo se guardan cinco minutos.

Próximos pasos propuestos:
- **Pruebas con respuestas grabadas** (fixtures) de BYMA, Yahoo y ArgentinaDatos. Así un cambio de formato rompe una prueba en el CI en lugar de romper la app en producción.
- **Alerta de fuente caída**: ya existe como opción en Ajustes; falta probarla de punta a punta.
- **Versión de la fuente en el log** para diagnosticar más rápido.

Pendiente: escribir las fixtures. Requiere capturar respuestas reales una vez (con internet) y guardarlas sin datos personales.

## 6. Comunidad

| Paso | Estado |
|---|---|
| `CONTRIBUTING.md` | Hecho |
| Plantillas de issue (error y propuesta) y de pull request | Hecho |
| Etiquetas de issues `bug`, `enhancement`, `good first issue` | Pendiente (se crean en GitHub) |
| Issues iniciales marcados como `good first issue` | Pendiente, ver la lista de abajo |
| Topics del repositorio | **Decisión tuya** (se configuran en GitHub): `argentina`, `finanzas-personales`, `django`, `celery`, `bonos`, `cedears`, `rebalanceo`, `riesgo` |
| Descripción corta del repositorio | **Decisión tuya**: "Comité de inversión para carteras argentinas: screener, riesgo en USD y medición de decisiones" |
| Primer release `v1.1.0` con notas | Pendiente, después de que el CI esté verde |

Issues iniciales propuestos (todos chicos):
1. Agregar una prueba de regresión para el redondeo de ventas de cripto (ya cubierta en `tests/js`; extender a la interfaz).
2. Mostrar la fecha de última actualización de cada fuente en la pantalla Fuentes.
3. Mejorar el texto de ayuda de "Pesos contra dólar" para quien no conoce carry ni dollar linked.
4. Agregar un selector de idioma (solo la barra y el menú, como primer paso).
5. Traducir `CONTRIBUTING.md` y las plantillas al inglés.

## 7. Bugs corregidos en este trabajo

- **Rebalanceo: "Vender 0 de ETH".** Las cantidades de cripto fraccionaria se redondeaban hacia arriba a unidades enteras, y después la pantalla las mostraba sin decimales. Ahora la cripto conserva hasta 8 decimales y la pantalla los muestra. Cubierto por `tests/js/rebalanceo.test.js`.

## Qué no puedo hacer desde acá

- Crear el repositorio remoto, los issues, los topics o el release en GitHub (son acciones visibles para otros). Puedo hacerlo con `gh` si me lo pedís.
- Contratar hosting o comprar un dominio.
- Probar el `docker compose` y el workflow de CI: requieren Docker y GitHub, y acá no hay Docker.

## Orden recomendado

1. Confirmar el nombre del repo y correr el CI por primera vez.
2. Elegir hosting y dominio, y desplegar la demo.
3. Configurar topics, descripción e issues iniciales.
4. Publicar `v1.1.0` con capturas de la demo.
5. Compartir en comunidades de finanzas personales y de Django en español.
