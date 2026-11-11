from django.contrib import admin

from .models import Cartera, Informe, SnapshotDiario, Transaccion


class TransaccionInline(admin.TabularInline):
    model = Transaccion
    extra = 0


@admin.register(Cartera)
class CarteraAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'moneda', 'creada')
    inlines = [TransaccionInline]


@admin.register(Transaccion)
class TransaccionAdmin(admin.ModelAdmin):
    list_display = ('fecha', 'cartera', 'tipo', 'simbolo', 'cantidad', 'precio', 'comision')
    list_filter = ('cartera', 'tipo')
    search_fields = ('simbolo',)


@admin.register(SnapshotDiario)
class SnapshotDiarioAdmin(admin.ModelAdmin):
    list_display = ('fecha', 'cartera', 'valor_mercado', 'costo')
    list_filter = ('cartera',)
    readonly_fields = ('detalle',)


@admin.register(Informe)
class InformeAdmin(admin.ModelAdmin):
    list_display = ('cartera', 'tipo', 'fecha_inicio', 'fecha_fin', 'creado')
    list_filter = ('cartera', 'tipo')
    readonly_fields = ('metricas', 'texto', 'creado')
