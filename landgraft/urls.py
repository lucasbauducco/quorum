from django.contrib.auth import views as auth_views
from django.urls import path

from .views import ComiteView, analisis, datos, mercado, seleccion_view, sesion

urlpatterns = [
    path('', ComiteView.as_view(), name='landgraft'),
    path('ingresar/', auth_views.LoginView.as_view(template_name='landgraft/ingresar.html'), name='landgraft-ingresar'),
    path('salir/', auth_views.LogoutView.as_view(), name='landgraft-salir'),
    path('api/mercado/', mercado, name='landgraft-mercado'),
    path('api/analisis/', analisis, name='landgraft-analisis'),
    path('api/seleccion/', seleccion_view, name='landgraft-seleccion'),
    path('api/sesion/', sesion, name='landgraft-sesion'),
    path('api/datos/<str:clave>/', datos, name='landgraft-datos'),
]
