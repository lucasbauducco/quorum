from celery import shared_task

from .api import ActualizarCEDEARsAPI


@shared_task
def actualizar_cedears_task():
    # Llama a la lógica directamente: antes pedía su propio endpoint por HTTP y fallaba si el servidor web no estaba levantado.
    respuesta = ActualizarCEDEARsAPI().get(None)
    return {'status': respuesta.status_code}
