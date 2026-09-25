import { viajeModel } from '../models/viaje.model.js';

const INTERVAL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;

/** Escanea viajes buscando_cadete > 5 min y escala alarma al admin. */
export function startViajeAlertaWorker(): void {
  if (timer) return;
  const tick = () => {
    void viajeModel.procesarViajesSinAceptacion().then((r) => {
      if (r.escalados > 0) {
        console.info(`[worker] sin_aceptacion escalados=${r.escalados} revisados=${r.revisados}`);
      }
    }).catch((err) => {
      console.error('[worker] sin_aceptacion', err);
    });
  };
  // Primera pasada tras 15s (dejar que arranque la DB)
  setTimeout(tick, 15_000);
  timer = setInterval(tick, INTERVAL_MS);
  console.info('[worker] alerta viajes sin accept cada 30s (timeout 5 min)');
}

export function stopViajeAlertaWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
