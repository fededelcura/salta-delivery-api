import { ConflictError } from './errors.js';

/** Traduce violaciones UNIQUE de SQL Server a mensajes claros. */
export function rethrowSqlConflict(e: unknown): never {
  const err = e as { number?: number; message?: string };
  const msg = (err.message ?? '').toLowerCase();
  const isUnique = err.number === 2627 || err.number === 2601 || msg.includes('unique');

  if (isUnique) {
    if (msg.includes('email') || msg.includes('uq_usuarios_email')) {
      throw new ConflictError('El email ya está registrado');
    }
    if (msg.includes('telefono') || msg.includes('uq_usuarios_telefono')) {
      throw new ConflictError('El teléfono ya está registrado');
    }
    if (msg.includes('numero_usuario') || msg.includes('uq_usuarios_numero')) {
      throw new ConflictError('El número de usuario ya existe');
    }
    if (msg.includes('uq_clientes_dni') || (msg.includes('clientes') && msg.includes('dni'))) {
      throw new ConflictError('El DNI del cliente ya está registrado');
    }
    if (msg.includes('uq_cadetes_dni') || (msg.includes('cadetes') && msg.includes('dni'))) {
      throw new ConflictError('El DNI del cadete ya está registrado');
    }
    if (msg.includes('licencia') || msg.includes('uq_cadetes_licencia')) {
      throw new ConflictError('El carnet de conducir ya está registrado');
    }
    if (msg.includes('patente') || msg.includes('uq_cadetes_patente')) {
      throw new ConflictError('La patente ya está registrada');
    }
    throw new ConflictError('Ya existe un registro con esos datos únicos');
  }

  throw e;
}
