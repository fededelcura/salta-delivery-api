/**
 * Acceso a datos usuarios / auth.
 */

import bcrypt from 'bcryptjs';
import { getPool, sql } from '../config/database.js';
import type { RolUsuario, Usuario } from '../types/domain.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors.js';
import { rethrowSqlConflict } from '../utils/sql-conflicts.js';
import {
  generateOtpCode,
  sendVerificationEmail,
} from '../services/email.service.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

interface UsuarioRow {
  id: string;
  numero_usuario: number;
  email: string;
  telefono: string;
  nombre: string;
  password_hash: string;
  rol: RolUsuario;
  estado: string;
  telefono_verificado: boolean;
  email_verificado: boolean;
  fecha_registro: Date;
}

function mapUsuario(row: UsuarioRow): Usuario & { password_hash: string } {
  return {
    id: String(row.id),
    numero_usuario: Number(row.numero_usuario),
    email: row.email,
    telefono: row.telefono,
    nombre: row.nombre,
    password_hash: row.password_hash,
    rol: row.rol,
    estado: row.estado as Usuario['estado'],
    telefono_verificado: Boolean(row.telefono_verificado),
    email_verificado: Boolean(row.email_verificado),
    fecha_registro: new Date(row.fecha_registro).toISOString(),
  };
}

const USER_COLS = `
  id, numero_usuario, email, telefono, nombre, password_hash, rol, estado,
  telefono_verificado, COALESCE(email_verificado, FALSE) AS email_verificado, fecha_registro
`;

export class AuthModel {
  async findByEmail(email: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('email', sql.NVarChar(255), email)
      .query<UsuarioRow>(`
        SELECT ${USER_COLS}
        FROM usuarios WHERE email = @email
      `);
    const row = result.recordset[0];
    return row ? mapUsuario(row) : null;
  }

  async findById(id: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .query<UsuarioRow>(`
        SELECT ${USER_COLS}
        FROM usuarios WHERE id = @id
      `);
    const row = result.recordset[0];
    return row ? mapUsuario(row) : null;
  }

  async findByTelefono(telefono: string) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('telefono', sql.NVarChar(20), telefono)
      .query<UsuarioRow>(`
        SELECT ${USER_COLS}
        FROM usuarios WHERE telefono = @telefono
      `);
    const row = result.recordset[0];
    return row ? mapUsuario(row) : null;
  }

  /** Genera OTP, guarda hash e intenta enviar email */
  async issueEmailVerification(usuarioId: string, email: string): Promise<void> {
    const pool = await getPool();
    const code = generateOtpCode();
    const codigo_hash = await bcrypt.hash(code, 10);
    const expires_at = new Date(Date.now() + OTP_TTL_MS);

    await pool
      .request()
      .input('usuario_id', sql.UniqueIdentifier, usuarioId)
      .query(`DELETE FROM email_verification_codes WHERE usuario_id = @usuario_id`);

    await pool
      .request()
      .input('usuario_id', sql.UniqueIdentifier, usuarioId)
      .input('codigo_hash', sql.NVarChar(255), codigo_hash)
      .input('expires_at', sql.DateTimeOffset, expires_at)
      .query(`
        INSERT INTO email_verification_codes (usuario_id, codigo_hash, expires_at)
        VALUES (@usuario_id, @codigo_hash, @expires_at)
      `);

    await sendVerificationEmail(email, code);
  }

  async register(input: {
    email: string;
    telefono: string;
    nombre: string;
    password: string;
    rol: 'cliente' | 'cadete';
    dni?: string;
  }) {
    if (await this.findByEmail(input.email)) {
      throw new ConflictError('El email ya está registrado');
    }
    if (await this.findByTelefono(input.telefono)) {
      throw new ConflictError('El teléfono ya está registrado');
    }

    if (input.rol === 'cliente') {
      if (!input.dni?.trim()) {
        throw new ValidationError('El DNI es obligatorio para clientes');
      }
      const poolCheck = await getPool();
      const dniExists = await poolCheck
        .request()
        .input('dni', sql.NVarChar(20), input.dni.trim())
        .query(`SELECT 1 AS x FROM clientes WHERE dni = @dni`);
      if (dniExists.recordset[0]) {
        throw new ConflictError('El DNI del cliente ya está registrado');
      }
    }

    const password_hash = await bcrypt.hash(input.password, 10);
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      const insertUser = await new sql.Request(tx)
        .input('email', sql.NVarChar(255), input.email)
        .input('telefono', sql.NVarChar(20), input.telefono)
        .input('nombre', sql.NVarChar(150), input.nombre)
        .input('password_hash', sql.NVarChar(255), password_hash)
        .input('rol', sql.NVarChar(20), input.rol)
        .query<{ id: string; numero_usuario: number }>(`
          INSERT INTO usuarios (email, telefono, nombre, password_hash, rol, estado, email_verificado)
          VALUES (@email, @telefono, @nombre, @password_hash, @rol, 'pendiente_verificacion', FALSE)
          RETURNING id, numero_usuario
        `);

      const userId = insertUser.recordset[0]?.id;
      if (!userId) throw new Error('No se pudo crear usuario');

      if (input.rol === 'cliente') {
        await new sql.Request(tx)
          .input('id', sql.UniqueIdentifier, userId)
          .input('dni', sql.NVarChar(20), input.dni!.trim())
          .query(`
            INSERT INTO clientes (usuario_id, dni) VALUES (@id, @dni)
          `);
      } else {
        const temp = `TEMP-${String(userId).replace(/-/g, '').slice(0, 8)}`;
        await new sql.Request(tx)
          .input('id', sql.UniqueIdentifier, userId)
          .input('dni', sql.NVarChar(20), temp)
          .input('licencia', sql.NVarChar(50), temp)
          .input('patente', sql.NVarChar(20), temp)
          .input('fn', sql.Date, '1990-01-01')
          .query(`
            INSERT INTO cadetes (usuario_id, dni, licencia, patente, fecha_nacimiento)
            VALUES (@id, @dni, @licencia, @patente, @fn)
          `);
      }

      await tx.commit();
      await this.issueEmailVerification(userId, input.email);
      return {
        id: userId,
        email: input.email,
        requiresEmailVerification: true as const,
      };
    } catch (e) {
      await tx.rollback();
      rethrowSqlConflict(e);
    }
  }

  async login(email: string, password: string) {
    const user = await this.findByEmail(email);
    if (!user) throw new UnauthorizedError('Credenciales inválidas');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedError('Credenciales inválidas');

    if (user.estado === 'suspendido') {
      throw new UnauthorizedError('Usuario suspendido');
    }
    if (user.estado === 'inactivo') {
      throw new UnauthorizedError('Usuario dado de baja');
    }
    if (user.estado === 'pendiente_verificacion' || !user.email_verificado) {
      throw new UnauthorizedError(
        'Debés verificar tu email antes de ingresar',
        'EMAIL_NOT_VERIFIED',
        { email: user.email },
      );
    }

    return user;
  }

  async verifyEmail(email: string, codigo: string) {
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundError('Usuario no encontrado');

    if (user.email_verificado && user.estado === 'activo') {
      return user;
    }

    const pool = await getPool();
    const codes = await pool
      .request()
      .input('usuario_id', sql.UniqueIdentifier, user.id)
      .query<{
        id: string;
        codigo_hash: string;
        expires_at: Date;
        attempts: number;
      }>(`
        SELECT id, codigo_hash, expires_at, attempts
        FROM email_verification_codes
        WHERE usuario_id = @usuario_id
        ORDER BY created_at DESC
        LIMIT 1
      `);

    const row = codes.recordset[0];
    if (!row) {
      throw new UnauthorizedError('No hay un código pendiente. Pedí uno nuevo.');
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedError('El código expiró. Pedí uno nuevo.');
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedError('Demasiados intentos. Pedí un código nuevo.');
    }

    const match = await bcrypt.compare(codigo, row.codigo_hash);
    if (!match) {
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, row.id)
        .query(`
          UPDATE email_verification_codes
          SET attempts = attempts + 1
          WHERE id = @id
        `);
      throw new UnauthorizedError('Código inválido');
    }

    await pool
      .request()
      .input('id', sql.UniqueIdentifier, user.id)
      .query(`
        UPDATE usuarios
        SET email_verificado = TRUE,
            estado = CASE
              WHEN estado = 'pendiente_verificacion' THEN 'activo'
              ELSE estado
            END
        WHERE id = @id
      `);

    await pool
      .request()
      .input('usuario_id', sql.UniqueIdentifier, user.id)
      .query(`DELETE FROM email_verification_codes WHERE usuario_id = @usuario_id`);

    const updated = await this.findById(user.id);
    if (!updated) throw new NotFoundError('Usuario no encontrado');
    return updated;
  }

  async resendVerification(email: string) {
    const user = await this.findByEmail(email);
    if (!user) {
      // No revelar si el email existe
      return { email, sent: true };
    }
    if (user.email_verificado && user.estado === 'activo') {
      throw new ValidationError('Este email ya está verificado');
    }

    const pool = await getPool();
    const latest = await pool
      .request()
      .input('usuario_id', sql.UniqueIdentifier, user.id)
      .query<{ created_at: Date }>(`
        SELECT created_at
        FROM email_verification_codes
        WHERE usuario_id = @usuario_id
        ORDER BY created_at DESC
        LIMIT 1
      `);

    const last = latest.recordset[0];
    if (last) {
      const elapsed = Date.now() - new Date(last.created_at).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        throw new ValidationError(`Esperá ${wait}s antes de pedir otro código`);
      }
    }

    await this.issueEmailVerification(user.id, user.email);
    return { email: user.email, sent: true };
  }

  async setEstado(id: string, estado: 'activo' | 'inactivo' | 'suspendido') {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, id)
      .input('estado', sql.NVarChar(30), estado)
      .query<{ id: string }>(`
        UPDATE usuarios SET estado = @estado WHERE id = @id RETURNING id
      `);
    if (!result.recordset.length) throw new NotFoundError('Usuario no encontrado');
    const user = await this.findById(id);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    return user;
  }

  async verifyPhone(telefono: string, codigo: string) {
    if (codigo !== '123456') {
      throw new UnauthorizedError('Código inválido');
    }
    const pool = await getPool();
    const result = await pool
      .request()
      .input('telefono', sql.NVarChar(20), telefono)
      .query<{ id: string }>(`
        UPDATE usuarios
        SET telefono_verificado = TRUE,
            estado = CASE WHEN estado = 'pendiente_verificacion' THEN 'activo' ELSE estado END
        WHERE telefono = @telefono
        RETURNING id
      `);
    if (!result.recordset.length) throw new NotFoundError('Teléfono no encontrado');
    return { telefono, verificado: true };
  }
}

export const authModel = new AuthModel();
