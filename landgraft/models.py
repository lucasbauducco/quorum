from django.conf import settings
from django.db import models


class Documento(models.Model):
    """Un dato del usuario en la app: carteras, lista de seguimiento, decisiones, ajustes.

    Replica las claves que el front guarda (por ejemplo 'carteras' o 'c-lucas-decisiones'), así la app
    funciona igual desde cualquier navegador una vez que el usuario ingresa.
    """
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='documentos_landgraft')
    clave = models.CharField(max_length=120)
    valor = models.JSONField()
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['usuario', 'clave'], name='documento_unico_por_usuario')]

    def __str__(self):
        return f'{self.usuario} · {self.clave}'


class PrecioDiario(models.Model):
    """Cierre diario de una especie, con su fuente: la base del riesgo, el backtesting y AI Memoria."""
    simbolo = models.CharField(max_length=20, db_index=True)
    tipo = models.CharField(max_length=10, blank=True)
    fecha = models.DateField(db_index=True)
    cierre = models.FloatField()
    moneda = models.CharField(max_length=5, default='ARS')
    volumen = models.FloatField(null=True, blank=True)
    fuente = models.CharField(max_length=40)
    leido = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['simbolo', 'fecha']
        constraints = [models.UniqueConstraint(fields=['simbolo', 'fecha', 'fuente'], name='precio_unico_por_dia_y_fuente')]

    def __str__(self):
        return f'{self.simbolo} {self.fecha}: {self.cierre} ({self.fuente})'


class Indicador(models.Model):
    """Serie diaria de un indicador: MEP, CCL, oficial, riesgo país, UVA, inflación mensual, plazo fijo."""
    nombre = models.CharField(max_length=30, db_index=True)
    fecha = models.DateField(db_index=True)
    valor = models.FloatField()
    fuente = models.CharField(max_length=40)
    leido = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nombre', 'fecha']
        constraints = [models.UniqueConstraint(fields=['nombre', 'fecha'], name='indicador_unico_por_dia')]

    def __str__(self):
        return f'{self.nombre} {self.fecha}: {self.valor}'


class SeleccionHistorica(models.Model):
    """Cada resultado del screener: sirve de caché y para medir después cómo le fue a lo elegido."""
    calculada = models.DateTimeField(auto_now_add=True, db_index=True)
    resultado = models.JSONField()

    class Meta:
        ordering = ['-calculada']
        get_latest_by = 'calculada'

    def __str__(self):
        return f'Selección del {self.calculada:%d/%m/%Y %H:%M}'
