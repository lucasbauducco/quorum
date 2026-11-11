from decimal import Decimal
from rest_framework.views import APIView
from rest_framework.response import Response
from django.http import JsonResponse
from rest_framework import status
import requests
from .models import CEDEAR, Accion
from django.views.decorators.http import require_http_methods
from bs4 import BeautifulSoup
import yfinance as yf
from .functionAnalytics import recomendacion_general
class ImportarAccionesAPI(APIView):
    def get(self, request, *args, **kwargs):
        cedears_simbolos = Accion.objects.values_list('simbolo', flat=True)
        acciones_importadas = []
        errores = []
        for simbolo in cedears_simbolos:
            try:
                accion_info = yf.Ticker(simbolo)
                info = accion_info.info

                if 'currentPrice' not in info or info['currentPrice'] is None:
                    errores.append({'simbolo': simbolo, 'mensaje': "La acción no tiene datos disponibles. No se guardará."})
                    continue
                recomendacion = recomendacion_general(simbolo)
                print(f"La recomendación general para {simbolo} es: {recomendacion}")
                accion_data = {
                    'simbolo': simbolo,
                    'nombre': info.get('longName', ''),
                    'mercado': info.get('exchange', ''),
                    'ultimo_precio': info.get('currentPrice', None),
                    'cambio': info.get('regularMarketChange', None),
                    'apertura': info.get('regularMarketOpen', None),
                    'maximo': info.get('regularMarketDayHigh', None),
                    'minimo': info.get('regularMarketDayLow', None),
                    'volumen': info.get('regularMarketVolume', None),
                }

                accion, created = Accion.objects.update_or_create(
                    simbolo=accion_data['simbolo'],
                    defaults={**accion_data, 'recomendacion': recomendacion},  # Incluye 'recomendacion' aquí
                )

                acciones_importadas.append(accion_data)

            except Exception as e:
                errores.append({'simbolo': simbolo, 'error': str(e)})

        return Response({'acciones_importadas': len(acciones_importadas), 'errores': errores})
class CalcularRatioPreciosAPI(APIView):
    def get(self, request, format=None):
        valor_dolar_mep = ActualizarDolarMEPAPI.obtener_valor_dolar_mep()
        # Obtén todos los CEDEARs que son tipo peso (aquellos cuyo símbolo no termina en "D")
        cedears = CEDEAR.objects.exclude(simbolo__endswith='D')
        # Lista para almacenar los resultados
        resultados = []
        print(valor_dolar_mep)
        # Itera sobre los CEDEARs tipo peso
        for cedear_peso in cedears:
            # El símbolo del par en dólar sería el mismo símbolo del CEDEAR tipo peso con la "D" al final
            simbolo_par_dolar = cedear_peso.simbolo + 'D'
            # Intenta obtener el par en dólar
            try:
                cedear_dolar = CEDEAR.objects.get(simbolo=simbolo_par_dolar)
                # Calcula el ratio de precio venta de peso sobre precio venta dolar
                if cedear_dolar.ultimo_precio > 0:  # Asegúrate de que el precio de venta en dólares no sea cero para evitar divisiones por cero
                    ratio = cedear_peso.ultimo_precio / cedear_dolar.ultimo_precio
                    if valor_dolar_mep is not None and ratio is not None:
                        beneficio_cotizacion = ((ratio - valor_dolar_mep) / valor_dolar_mep) * 100
                    else:
                        beneficio_cotizacion = None  # O establecer un valor predeterminado
                    # Almacena el resultado en la lista
                    resultados.append({
                        'simbolo': cedear_peso.simbolo,  # Nombre del símbolo sin la "D"
                        'precio_venta_peso': cedear_peso.ultimo_precio,
                        'precio_venta_dolar': cedear_dolar.ultimo_precio,
                        'ratio': ratio,
                        'mep': valor_dolar_mep,
                        'beneficio_cotizacion': beneficio_cotizacion,
                    })
            except CEDEAR.DoesNotExist:
                # Si no existe el par en dólar, puedes decidir qué hacer, por ejemplo, omitir o registrar un error.
                pass

        return Response(resultados)
class ActualizarDolarMEPAPI(APIView):
    def obtener_valor_dolar_mep():
        url = 'https://www.infobae.com/economia/divisas/dolar-mep-hs/'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            dolar_mep_elements = soup.find_all('span', class_='cc-val')
            
            for dolar_mep_element in dolar_mep_elements:
                valor_dolar_mep = dolar_mep_element.text.strip()
                if valor_dolar_mep.startswith('$'):
                    # Elimina el símbolo de dólar
                    valor_dolar_mep = valor_dolar_mep.replace('$', '').strip()
                    valor_dolar_mep  = valor_dolar_mep.replace(".", "", 1)
                    valor_dolar_mep  = valor_dolar_mep.replace(",", ".", 1)
                    print(valor_dolar_mep)
                    try:

                            valor_decimal = Decimal(valor_dolar_mep)
                            return valor_decimal
                    except ValueError:
                        # Si hay un error en la conversión, retorna None o maneja el error como prefieras
                        return None
            return None
        else:
            return None

    def get(self, request, format=None):
        # URL actualizada a la página específica del Dólar MEP
        url = 'https://www.infobae.com/economia/divisas/dolar-mep-hs/'
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Busca todos los elementos que contienen el valor del Dólar MEP
            dolar_mep_elements = soup.find_all('span', class_='cc-val')
            
            # Podrías necesitar ajustar esta lógica si hay múltiples elementos con la clase 'cc-val'
            for dolar_mep_element in dolar_mep_elements:
                # Extrae el texto y limpia los espacios en blanco
                valor_dolar_mep = dolar_mep_element.text.strip()
                # Verifica si el valor parece ser válido
                if valor_dolar_mep.startswith('$'):
                    return Response({'valor_dolar_mep': valor_dolar_mep})
            return Response({'error': 'No se encontró el valor del Dólar MEP.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            return Response({'error': 'Error al hacer la petición a la página: HTTP ' + str(response.status_code)}, status=response.status_code)
class ActualizarCEDEARsAPI(APIView):
    """
    API para actualizar la información de los CEDEARs.
    """

    def get(self, request, *args, **kwargs):
        url = "https://www.byma.com.ar/wp-admin/admin-ajax.php?action=get_panel&panel_id=5"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
        response = requests.get(url, headers=headers, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            cotizaciones = data.get("Cotizaciones", [])
            count= 0
            for cotizacion in cotizaciones:
                print(count + 1)
                obj, created = CEDEAR.objects.update_or_create(
                    simbolo=cotizacion.get("Simbolo", ''),
                    defaults={
                        "especie": cotizacion.get("Denominacion", ''),
                        "cierre_anterior": cotizacion.get("Cierre_Anterior", 0),
                        "precio_apertura": cotizacion.get("Apertura", 0),
                        "precio_maximo": cotizacion.get("Maximo", 0),
                        "precio_minimo": cotizacion.get("Minimo", 0),
                        "ultimo_precio": cotizacion.get("Ultimo", 0),
                        "variacion_diaria": cotizacion.get("Variacion", ''),
                        "volumen_efectivo": cotizacion.get("Monto_Operado_Pesos", 0),
                        "volumen_nominal": cotizacion.get("Volumen_Nominal", 0),
                        "tipo_cotizacion": cotizacion.get("Tipo_Liquidacion", ''),
                        "cantidad_nominal_compra": cotizacion.get("Cantidad_Nominal_Compra", 0),
                        "cantidad_nominal_venta": cotizacion.get("Cantidad_Nominal_Venta", 0),
                        "cantidad_operaciones": cotizacion.get("Cantidad_Operaciones", ''),
                        # Continúa con el mapeo de los demás campos...
                    }
                )
            return Response({"message": "CEDEARs actualizados con éxito."}, status=status.HTTP_200_OK)
        else:
            return Response({"error": f"Error al realizar la solicitud a la API: {response.status_code}"}, status=status.HTTP_400_BAD_REQUEST)

@require_http_methods(["POST"])
def actualizar_ratio(request):
    try:
        data = request.POST
        simbolo = data.get('simbolo')
        nuevo_ratio = data.get('nuevo_ratio')
        cedear = CEDEAR.objects.get(simbolo=simbolo)
        cedear.ratio = nuevo_ratio
        cedear.save()
        return JsonResponse({"mensaje": "Ratio actualizado con éxito."}, status=200)
    except CEDEAR.DoesNotExist:
        return JsonResponse({"mensaje": "CEDEAR no encontrado."}, status=404)
    except Exception as e:
        return JsonResponse({"mensaje": str(e)}, status=500)
@require_http_methods(["POST"])
def guardar_accion(request):
    simbolo = request.POST.get('simbolo')
    simbolo_cedears = request.POST.get('simbolo_cedears')
    if simbolo:
        accion = guardar_accion_desde_yahoo_finance(simbolo, simbolo_cedears)
        if accion:
            # Redireccionar a donde quieras después de guardar la acción exitosamente
            return JsonResponse({"mensaje": "Accion actualizado con éxito."}, status=200)
        else:
            # Manejar el caso en que no se pueda guardar la acción
            return JsonResponse({"mensaje": "Accion no encontrado."}, status=404)
    else:
        # Manejar el caso de un símbolo vacío o inválido
        return JsonResponse({"mensaje": "Simbolo es requerido."}, status=404)
def guardar_accion_desde_yahoo_finance(simbolo, simbolo_cedears):
    # Buscar la acción en Yahoo Finance
    accion_info = yf.Ticker(simbolo)
    info = accion_info.info
    # Verificar que se haya obtenido la información necesaria
    if 'currentPrice' not in info or info['currentPrice'] is None:
        print(f"No se encontró información para el símbolo: {simbolo}")
        return None

    # Crear o actualizar la acción en la base de datos
    accion, created = Accion.objects.update_or_create(
        simbolo=simbolo,  # Asume que simbolo es el identificador único
        simbolo_cedears= simbolo_cedears,
        defaults={
            'nombre': info.get('longName', ''),
            'mercado': info.get('exchange', ''),
            'ultimo_precio': info.get('currentPrice', None),
            'cambio': info.get('regularMarketChange', None),  # Asegúrate de que este campo existe o encuentra una alternativa
            'apertura': info.get('regularMarketOpen', None),
            'maximo': info.get('regularMarketDayHigh', None),
            'minimo': info.get('regularMarketDayLow', None),
            'volumen': info.get('regularMarketVolume', None),
            # Asegúrate de manejar adecuadamente la asignación de simbolo_cedears si es necesario
        }
    )
    print(accion);
    return accion
def calcular_diferencia_precio_accion_cedear(simbolo_accion):
    # Buscar la acción por su símbolo
    try:
        accion = Accion.objects.get(simbolo=simbolo_accion)
    except Accion.DoesNotExist:
        return "Accion no encontrada"
        # Asegurarse de que el símbolo del CEDEAR termine en "D"
    simbolo_cedear = accion.simbolo_cedears
    if not simbolo_cedear.endswith("D"):
        simbolo_cedear += "D"
    # Buscar el CEDEAR asociado a la acción
    try:
        cedear = CEDEAR.objects.get(simbolo=accion.simbolo_cedears)
    except CEDEAR.DoesNotExist:
        return "CEDEAR no encontrado"
     # Ajustar según el ratio del CEDEAR
    if cedear.ratio < 0:
        precio_cedear= cedear.ultimo_precio;
        precio_accion = accion.ultimo_precio * abs(cedear.ratio);
    else:
        precio_cedear= cedear.ultimo_precio * cedear.ratio
        precio_accion = accion.ultimo_precio
    # Calcular la diferencia de precio
    diferencia_precio = precio_cedear - precio_accion



    resultado = {
        'precio_cedear': precio_cedear,
        'precio_accion':  precio_accion,
        'diferencia_precio': diferencia_precio
    }

    return resultado