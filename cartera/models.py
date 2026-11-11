from django.db import models
from django.utils import timezone


class Cartera(models.Model):
    MONEDAS_CHOICES = [
        ('USD', 'Dólar Estadounidense'),
        ('ARS', 'Peso Argentino'),
    ]
    nombre = models.CharField(max_length=100, unique=True)
    moneda = models.CharField(max_length=3, choices=MONEDAS_CHOICES, default='USD')
    creada = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nombre


class Transaccion(models.Model):
    COMPRA = 'COMPRA'
    VENTA = 'VENTA'
    TIPO_CHOICES = [
        (COMPRA, 'Compra'),
        (VENTA, 'Venta'),
    ]
    cartera = models.ForeignKey(Cartera, on_delete=models.CASCADE, related_name='transacciones')
    simbolo = models.CharField(max_length=20)
    tipo = models.CharField(max_length=6, choices=TIPO_CHOICES)
    cantidad = models.DecimalField(max_digits=18, decimal_places=4)
    precio = models.DecimalField(max_digits=18, decimal_places=4)
    comision = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['fecha', 'id']

    def __str__(self):
        return f"{self.get_tipo_display()} {self.cantidad} {self.simbolo} @ {self.precio}"


class SnapshotDiario(models.Model):
    """Valor de la cartera al cierre de un día, con su composición."""
    cartera = models.ForeignKey(Cartera, on_delete=models.CASCADE, related_name='snapshots')
    fecha = models.DateField()
    valor_mercado = models.DecimalField(max_digits=18, decimal_places=2)
    costo = models.DecimalField(max_digits=18, decimal_places=2)
    # Lista de {simbolo, cantidad, precio, valor, costo, sin_precio}
    detalle = models.JSONField(default=list)

    class Meta:
        ordering = ['-fecha']
        constraints = [
            models.UniqueConstraint(fields=['cartera', 'fecha'], name='snapshot_unico_por_dia'),
        ]

    def __str__(self):
        return f"{self.cartera} {self.fecha}: {self.valor_mercado}"


class Informe(models.Model):
    DIARIO = 'diario'
    MENSUAL = 'mensual'
    ANUAL = 'anual'
    TIPO_CHOICES = [
        (DIARIO, 'Diario'),
        (MENSUAL, 'Mensual'),
        (ANUAL, 'Anual'),
    ]
    cartera = models.ForeignKey(Cartera, on_delete=models.CASCADE, related_name='informes')
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    metricas = models.JSONField(default=dict)
    texto = models.TextField(blank=True)
    creado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fecha_fin', 'tipo']
        constraints = [
            models.UniqueConstraint(
                fields=['cartera', 'tipo', 'fecha_inicio'], name='informe_unico_por_periodo',
            ),
        ]

    def __str__(self):
        return f"Informe {self.get_tipo_display()} {self.cartera} {self.fecha_inicio}–{self.fecha_fin}"
