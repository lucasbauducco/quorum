from django.contrib import admin

from .models import Documento, Indicador, PrecioDiario, SeleccionHistorica


@admin.register(Documento)
class DocumentoAdmin(admin.ModelAdmin):
    list_display = ('usuario', 'clave', 'actualizado')
    list_filter = ('usuario',)
    search_fields = ('clave',)


@admin.register(PrecioDiario)
class PrecioDiarioAdmin(admin.ModelAdmin):
    list_display = ('simbolo', 'fecha', 'cierre', 'moneda', 'fuente')
    list_filter = ('fuente', 'tipo', 'moneda')
    search_fields = ('simbolo',)
    date_hierarchy = 'fecha'


@admin.register(Indicador)
class IndicadorAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'fecha', 'valor', 'fuente')
    list_filter = ('nombre',)
    date_hierarchy = 'fecha'


@admin.register(SeleccionHistorica)
class SeleccionHistoricaAdmin(admin.ModelAdmin):
    list_display = ('calculada',)
