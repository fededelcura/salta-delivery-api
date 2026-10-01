import { viajeModel } from '../models/viaje.model.js';
import { emitViajeEstado } from '../sockets/index.js';
import { pushService } from '../services/push.service.js';

const INTERVAL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;

async function cancelarVencidos() {
  const cancelados = await viajeModel.cancelarVencidos();
  for (const v of cancelados) {
    emitViajeEstado(v.id, 'cancelado');
    void pushService
      .enviarAUsuario(v.cliente_id, {
        titulo: 'Pedido cancelado',
        cuerpo: 'No encontramos cadete en 30 minutos. Podés volver a pedir cuando quieras.',
        tag: `viaje-${v.id}`,
        url: '/#/app',
        viaje_id: v.id,
      })
      .catch(() => undefined);
  }
  if (cancelados.length) console.info(`[worker] vencidos cancelados=${cancelados.length}`);
}

/** Escanea viajes buscando_cadete: > 5 min escala alarma al admin, > 30 min los cancela. */
export function startViajeAlertaWorker(): void {
  if (timer) return;
  const tick = () => {
    void cancelarVencidos().catch((err) => {
      console.error('[worker] vencidos', err);
    });
    void viajeModel.procesarViajesSinAceptacion().then((r) => {
      if (r.escalados > 0) {
        console.info(`[worker] sin_aceptacion escalados=${r.escalados} revisados=${r.revisados}`);
      }
    }).catch((err) => {
      console.error('[worker] sin_aceptacion', err);
    });
    void viajeModel.notificarAnillosPendientes().catch((err) => {
      console.error('[worker] avisos anillo', err);
    });
  };
  // Primera pasada tras 15s (dejar que arranque la DB)
  setTimeout(tick, 15_000);
  timer = setInterval(tick, INTERVAL_MS);
  console.info('[worker] alerta viajes sin accept cada 30s (timeout 5 min, vence 30 min)');
}

export function stopViajeAlertaWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
