from django.contrib.auth import views as auth_views
from django.urls import path

from .views import ComiteView, analisis, datos, estrategia_view, medicion_view, mercado, riesgo_view, seleccion_view, sesion

urlpatterns = [
    path('', ComiteView.as_view(), name='quorum'),
    path('ingresar/', auth_views.LoginView.as_view(template_name='quorum/ingresar.html'), name='quorum-ingresar'),
    path('salir/', auth_views.LogoutView.as_view(), name='quorum-salir'),
    path('api/mercado/', mercado, name='quorum-mercado'),
    path('api/analisis/', analisis, name='quorum-analisis'),
    path('api/seleccion/', seleccion_view, name='quorum-seleccion'),
    path('api/sesion/', sesion, name='quorum-sesion'),
    path('api/riesgo/', riesgo_view, name='quorum-riesgo'),
    path('api/estrategia/', estrategia_view, name='quorum-estrategia'),
    path('api/medicion/', medicion_view, name='quorum-medicion'),
    path('api/datos/<str:clave>/', datos, name='quorum-datos'),
]
