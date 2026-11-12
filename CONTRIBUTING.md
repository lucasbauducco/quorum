# Cómo colaborar en Quórum

¡Gracias por querer ayudar! Quórum es un proyecto chico y cada aporte cuenta. Podés escribir issues y pull requests en español o en inglés.

## Antes de empezar

- Leé el [README](README.md) (en español) o el [resumen en inglés](README.en.md).
- Mirá los [issues](../../issues). Los marcados como `good first issue` son buenos para empezar.
- Si la idea es grande (una fuente de datos nueva, un cambio en un cálculo), abrí primero un issue para acordar el enfoque.

## Preparar el entorno

```bash
python -m venv .venv && source .venv/bin/activate   # en Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env    # DJANGO_DEBUG=1 alcanza para desarrollo
python manage.py migrate
python manage.py test
```

Para la interfaz no hace falta instalar nada: `node tests/js/rebalanceo.test.js` corre las pruebas de JavaScript.

## Qué esperamos de un cambio

- **Pruebas.** Si cambia un cálculo, agregá una prueba que lo fije. Las pruebas de Python usan datos fabricados y no llaman a internet; mantenelo así.
- **Criterio explicado.** Los cálculos financieros tienen que poder explicarse. En el pull request, contá qué criterio usás y por qué.
- **Sin datos personales ni claves.** No subas `.env`, bases de datos ni carteras reales.
- **Cambios chicos.** Un pull request por tema. Es más fácil de revisar y de revertir.
- **Documentación.** Si cambia el comportamiento visible, actualizá el README.

## Antes de abrir el pull request

1. `python manage.py check` y `python manage.py test` pasan.
2. `node tests/js/rebalanceo.test.js` pasa si tocaste `funciones.js` o `front.js`.
3. Si tocaste la interfaz, probala en el navegador (escritorio y, si podés, un celular).

## Reportar errores

Usá la plantilla de *Error* e incluí los pasos para reproducirlo. Antes de pegar un mensaje de error, quitá claves, tokens y cualquier dato de tu cartera.

## Seguridad

No abras issues públicos por vulnerabilidades. Escribí al autor por privado (ver el perfil del repositorio).

## Aviso

Quórum es informativo y no es asesoramiento financiero. Los aportes no deben presentarse como recomendaciones de compra o venta.
