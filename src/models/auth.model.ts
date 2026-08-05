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

    fecha_registro: new Date(row.fecha_registro).toISOString(),

  };

}



const USER_COLS = `

  id, numero_usuario, email, telefono, nombre, password_hash, rol, estado,

  telefono_verificado, fecha_registro

`;



export class AuthModel {

  async findByEmail(email: string) {

    const pool = await getPool();

    const result = await pool

      .request()

      .input('email', sql.NVarChar(255), email)

      .query<UsuarioRow>(`

        SELECT ${USER_COLS}

        FROM dbo.usuarios WHERE email = @email

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

        FROM dbo.usuarios WHERE id = @id

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

        FROM dbo.usuarios WHERE telefono = @telefono

      `);

    const row = result.recordset[0];

    return row ? mapUsuario(row) : null;

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

        .query(`SELECT 1 AS x FROM dbo.clientes WHERE dni = @dni`);

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

          INSERT INTO dbo.usuarios (email, telefono, nombre, password_hash, rol, estado)

          OUTPUT INSERTED.id, INSERTED.numero_usuario

          VALUES (@email, @telefono, @nombre, @password_hash, @rol, N'pendiente_verificacion')

        `);



      const userId = insertUser.recordset[0]?.id;

      if (!userId) throw new Error('No se pudo crear usuario');



      if (input.rol === 'cliente') {

        await new sql.Request(tx)

          .input('id', sql.UniqueIdentifier, userId)

          .input('dni', sql.NVarChar(20), input.dni!.trim())

          .query(`

            INSERT INTO dbo.clientes (usuario_id, dni) VALUES (@id, @dni)

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

            INSERT INTO dbo.cadetes (usuario_id, dni, licencia, patente, fecha_nacimiento)

            VALUES (@id, @dni, @licencia, @patente, @fn)

          `);

      }



      await tx.commit();

      const user = await this.findById(userId);

      if (!user) throw new NotFoundError('Usuario creado no encontrado');

      return user;

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

      .query(`

        UPDATE dbo.usuarios

        SET telefono_verificado = 1,

            estado = CASE WHEN estado = N'pendiente_verificacion' THEN N'activo' ELSE estado END

        WHERE telefono = @telefono;

        SELECT @@ROWCOUNT AS affected;

      `);

    const affected = (result.recordset[0] as { affected: number } | undefined)?.affected ?? 0;

    if (!affected) throw new NotFoundError('Teléfono no encontrado');

    return { telefono, verificado: true };

  }

}



export const authModel = new AuthModel();

