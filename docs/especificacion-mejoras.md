# Quórum: especificación del plan de mejoras

Fecha: 2026-11-12. Base de análisis: los cuatro repos de referencia y el código de `quorum/` en el estado actual del árbol de trabajo.

## 1. Alcance

Quórum es un comité de inversión para Argentina: screener de acciones, CEDEAR, bonos, letras y ON; riesgo de la cartera medido en dólares MEP; pesos contra dólar y tasa fija contra CER; rebalanceo. **No** es un broker ni un simulador de órdenes. Todo lo que se toma de otros proyectos tiene que servir a esa función. Las ideas que implicaban ejecutar operaciones o construir un simulador de cartera quedan fuera.

## 2. Análisis de los repos de referencia

| Repo | Qué tiene útil para Quórum | Decisión |
|---|---|---|
| **TradingAgents** (TauricResearch) | Registro de decisiones que se liquida después contra un benchmark (alfa). Ese registro es lo que el docstring de `SeleccionHistorica` promete y el cronograma de Celery nombra como "medición de decisiones", pero nadie lo calculaba. | **Aplicado** (sección 3.1). |
| | Debate entre defensor y crítico, con juez, antes de decidir. | **Planificado**, fase 3. |
| | Simulador de cartera, ejecución de órdenes, fuentes de redes sociales (Reddit, StockTwits, Polymarket). | **Descartado**: fuera de alcance o ruido. El propio repo advierte que su backtest "no debe crecer hacia un simulador de cartera". |
| **OpenBB** | Regresión CAPM: beta y alfa de la cartera frente al mercado. | **Aplicado** (sección 3.3), con el Merval en USD como mercado. |
| | Ratio Omega y métricas rodantes. | **Planificado**, fase 4. |
| | Framework de proveedores con modelos estandarizados (cientos de archivos). | **Descartado** por tamaño. Quórum ya tiene cadenas de respaldo (BYMA → respaldo local, Yahoo → caché de error). |
| **rumbo** (Dani Dominguez) | Aportar sin vender: la plata nueva va a los grupos por debajo de su objetivo. | **Aplicado** (sección 3.2). |
| | Dos umbrales de reparto: "vigilar" y "rebalancear". | **Planificado**, fase 2. |
| | Comparación con una cartera de referencia, colchón de emergencia, objetivo de reparto. | **Ya existía** en Quórum (`BENCHMARKS`, `colchon`, `rebalanceo`). No se duplica. |
| | FIFO para la Renta, traspasos entre fondos, Docker, exportación a Excel. | **No aplica ahora**: el FIFO sigue reglas fiscales de España, y los traspasos y fondos no son parte del modelo argentino de Quorum. Excel queda como prioridad baja. |
| **500-AI-Agents-Projects** | Pro y contra con juez (`20-multi-agent-debate`). Plantilla de análisis de acción: tesis, fortalezas, riesgos, valoración, veredicto (`11-stock-research-agent`). | **Planificado** junto con TradingAgents (fase 3). El resto de los 21 proyectos es genérico y no aporta a Quorum. |

## 3. Cambios ya aplicados

Todos están en el árbol de trabajo, **sin commit**, mezclados con cambios previos sin commitear. Los tests del módulo pasan: `manage.py test quorum` → 24 OK; `manage.py check` sin problemas.

### 3.1 Medición de las selecciones (`quorum/medicion.py`)

- Cada selección se liquida a 30, 90 y 180 días. Rendimiento en USD = precio ÷ MEP, de cierre a cierre.
- Referencia: Merval en USD (`^MERV` ÷ MEP) en el mismo período. El alfa es la diferencia.
- Reglas anti-anticipación: entrada = último cierre **anterior** al día del cálculo; salida = último cierre hasta el horizonte; precios con más de 7 días de diferencia no se usan.
- Alcance: acciones y CEDEAR. Bonos, letras y ON no se miden por precio (su TIR se cumple al vencimiento).
- Endpoint: `GET /quorum/api/medicion/` (404 si no hay selecciones). Caché de 30 minutos.
- Tarea nueva `quorum.tasks.preparar_medicion`, diaria 18:45 de lunes a viernes. Baja la historia del Merval y la de los elegidos que no la tienen. La ingesta diaria solo cubre los 60 más operados, y el screener puede elegir fuera de ese grupo.
- Archivos: `quorum/medicion.py` (nuevo), `quorum/historia.py` (`ingestar_indice`, `completar_historia_de_selecciones`), `quorum/tasks.py`, `quorum/views.py` (`medicion_view`), `quorum/urls.py`, `trading/settings.py` (cronograma), `quorum/management/commands/cargar_historia.py`, `quorum/test_medicion.py` (6 tests).

**Estado real:** hoy hay una sola selección (calculada el 11/11/2026 a las 13:47), así que todos los horizontes están pendientes. El primer horizonte de 30 días se cumple el 11/12/2026. Con pocas selecciones el promedio no sirve para juzgar al screener.

### 3.2 Aportar sin vender (`quorum/static/quorum/funciones.js`, `front.js`, `index.html`)

- `rebalanceo(cartera, objetivo, comision, banda, aportacion)` devuelve `compras`: la aportación se reparte entre los grupos por debajo de su objetivo, en proporción a lo que les falta, calculado sobre el total más la aportación. Si el objetivo suma 100 %, el reparto cierra exacto.
- Nuevo campo "Cuánto vas a aportar (ARS)" en la pantalla de Rebalanceo, con la lista "Aportar a …".
- Verificado con Node contra una cartera de prueba: 500 ARS se reparten 150 / 150 / 200 y, después de aportar, los tres grupos quedan exactamente en 50 / 30 / 20 %. Sin aportación, la lista queda vacía.
- Limitación: no hay tests JS en el repo. La verificación fue un script suelto, no un test del proyecto. La pantalla no se probó en navegador.

### 3.3 Beta y alfa frente al Merval (`quorum/riesgo.py`)

- `medir()` devuelve en `cartera`: `beta`, `alfaAnual` (Jensen, 252 ruedas) y `correlacionMerval`. Retornos diarios en USD. Requiere al menos 60 días solapados.
- Sin historia del Merval, los tres campos quedan en `null` y no se inventa nada.
- `quorum/test_beta.py` (2 tests): índice idéntico al activo → beta 1, alfa 0; sin Merval → `null`.

**Verificación externa:** `yfinance` devuelve la serie de `^MERV` (13 cierres en 30 días). El último cierre que trajo fue el 16/10/2026, así que Yahoo va atrasado. La ingesta completa no se corrió contra Yahoo en vivo; solo la consulta de prueba.

## 4. Plan de mejoras

Orden por valor y riesgo. Cada fase deja la app funcionando y con tests.

### Fase 1: consolidar (inmediata)
- Revisar el diff completo. Hay cambios previos sin commitear en `views.py`, `urls.py`, `front.js`, `funciones.js` e `index.html`, además de los de esta sesión. Conviene revisarlos juntos antes de commitear.
- Commit en dos partes: (a) el trabajo previo, (b) esta sesión. Commit solo si el usuario lo pide.
- **Criterio de aceptación:** `manage.py test quorum` → 24 OK; `node --check` sobre `funciones.js` y `front.js` sin errores.

### Fase 2: bandas de dos niveles en el rebalanceo (de rumbo)
- Hoy hay una sola banda (`limites.banda`, 5 puntos por defecto). Agregar "vigilar" (3 puntos) y "rebalancear" (5 puntos), con la regla de rumbo: vigilar debe ser menor que rebalancear.
- Entre ambos umbrales: aviso, sin sugerir operaciones. Por encima del de rebalancear: sugerir ventas (si sobra) o aportar (si falta).
- Archivos: `funciones.js` (`rebalanceo`), `front.js` (`renderRebalanceo`), `index.html` (campo nuevo en Ajustes, junto a `data-limite="banda"`), `almacen.py` si la configuración se guarda en el servidor.
- **Criterio de aceptación:** un grupo 4 puntos arriba del objetivo muestra aviso y ninguna orden; uno 6 puntos arriba sugiere venta.

### Fase 3: tesis contraria por grupo de elegidos (de TradingAgents y 500-AI)
- Para cada tipo (acción, CEDEAR, bono, letra, ON) y los cinco primeros del screener: un agente defensor y un agente crítico argumentan a partir de los datos del resultado (puntaje, analistas, consenso, TIR, duration, var6m, volatilidad). Un juez devuelve un veredicto en JSON: `{tesis, riesgos, veredicto, confianza}`.
- Se guarda en `SeleccionHistorica.resultado['tesisContraria']`. No bloquea el cálculo del screener: se hace en una tarea aparte, después de `calcular`.
- Modelo: `claude-haiku-5-5` para los argumentos y `claude-sonnet-5-5` para el juez, como punto de partida. **Requiere decisión del usuario** (sección 5).
- El prompt debe pedir que solo se citen datos presentes en el resultado. El texto va con la advertencia de que es informativo, no asesoramiento.
- **Criterio de aceptación:** test con cliente de Anthropic simulado (sin llamadas reales); el JSON inválido se descarta con un registro en el log y no rompe la selección.

### Fase 4: métricas de riesgo adicionales (de OpenBB)
- Ratio Omega en `riesgo.medir` (umbral 0 en USD), y Calmar (retorno anualizado ÷ máxima caída).
- Beta por posición, además del de la cartera, para ver qué papeles mueven el riesgo.
- **Criterio de aceptación:** test con serie constante → Omega indefinido (`null`), no división por cero; test con serie conocida para Calmar.

### Fase 5: medición acumulada y backtest honesto
- Mantener la medición de la sección 3.1 y mostrar en la pantalla de Selección el alfa medio por horizonte, con la cantidad de elegidos medidos.
- **Límite que hay que documentar:** el criterio de analistas (precio objetivo, consenso) no tiene histórico en Yahoo, solo el valor actual. Un backtest de ese criterio estaría sesgado por anticipación. El backtest honesto solo puede cubrir la parte de momentum y volatilidad, que sí tiene historia de precios. Para el resto, la medición hacia adelante es el único método válido.
- **Criterio de aceptación:** la pantalla rotula cada cifra con su horizonte y su cantidad de casos; no muestra promedios con menos de 10 elegidos medidos sin aviso.

### Fase 6: calidad y deuda técnica
- `historia.backfill_criptos` usa `datetime.utcfromtimestamp`, deprecado desde Python 3.12. Cambiar por `datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date()`.
- `historia.ingestar_indice` devuelve 0 en silencio si Yahoo falla. Debe devolver el error en el resultado de la tarea, como hace `ingestar_indicadores`.
- Agregar un test de JS en el repo (`node --test`) para `funciones.js`, en lugar de scripts sueltos.
- README: hoy describe una plantilla genérica (`analysisActions`, `config/`). Agregar la sección de Quórum y el cronograma completo, incluido `preparar_medicion`.
- Exportación a Excel del reparto y la medición (de rumbo). Prioridad baja.

## 5. Decisiones que necesito del usuario

1. **Modelo y presupuesto para la tesis contraria (fase 3).** Cada corrida hace unas 11 llamadas por tipo (5 elegidos × 2 argumentos, más el juez), así que unas 55 por corrida. ¿Usamos `claude-haiku-5-5` para todo, o `claude-sonnet-5-5` para el juez? ¿Hay un tope mensual?
2. **Referencia de la medición.** ¿Sigue bien el Merval en USD, o preferís el CEDEAR del S&P 500 en USD para los CEDEAR? Cambiarlo es una constante (`INDICE` en `medicion.py`) más una segunda serie.
3. **Umbrales de rebalanceo (fase 2).** ¿Vigilar 3 y rebalancear 5 puntos, como en rumbo?

## 6. Riesgos

- **Yahoo Finance** atrasa cierres y limita pedidos. La medición depende de su historia; el error se registra y no se inventan precios.
- **Muestra chica:** con pocas selecciones, cualquier promedio es ruido. La pantalla tiene que decirlo.
- **Elegidos con poca cobertura de analistas.** El screener exige un mínimo, pero la medición no corrige ese sesgo.
- **Tesis con LLM:** puede inventar cifras. Por eso se restringe a los datos del resultado y se valida el JSON.

## 7. Cómo verificar

```bash
.venv\Scripts\python.exe manage.py test quorum     # 24 tests
.venv\Scripts\python.exe manage.py check
"C:\Program Files\nodejs\node.exe" --check quorum\static\quorum\funciones.js
"C:\Program Files\nodejs\node.exe" --check quorum\static\quorum\front.js
.venv\Scripts\python.exe manage.py shell -c "from quorum import medicion; print(medicion.medir())"
```
