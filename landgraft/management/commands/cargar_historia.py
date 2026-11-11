from django.core.management.base import BaseCommand

from landgraft import historia


class Command(BaseCommand):
    help = 'Carga la historia de precios (BYMA, Yahoo Finance, CoinGecko) e indicadores (ArgentinaDatos) en la base.'

    def add_arguments(self, parser):
        parser.add_argument('--dias', type=int, default=365, help='Días de historia de precios a cargar.')
        parser.add_argument('--especies', type=int, default=60, help='Cuántas acciones y CEDEAR, de las más operadas.')

    def handle(self, *args, dias, especies, **opciones):
        self.stdout.write('Indicadores: %s' % historia.ingestar_indicadores())
        self.stdout.write('Precios de hoy en BYMA: %s especies' % historia.ingestar_precios_byma())
        universo = historia.universo_renta_variable(especies)
        resultado = historia.backfill_yahoo(universo, dias)
        self.stdout.write('Historia de Yahoo Finance: %s especies, %s cierres' % (len(resultado), sum(resultado.values())))
        criptos = historia.backfill_criptos(dias)
        self.stdout.write('Historia de criptos: %s' % criptos)
