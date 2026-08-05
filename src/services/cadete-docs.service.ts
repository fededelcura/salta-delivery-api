/**
 * Guarda documentos (PDF/imagen) en disco desde data URL base64.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

export const DOC_TIPOS = ['dni', 'carnet', 'seguro', 'afip', 'rentas'] as const;
export type DocTipo = (typeof DOC_TIPOS)[number];

const DOC_JSON_KEY: Record<DocTipo, keyof import('../types/domain.js').FotosDocumentos> = {
  dni: 'dni_pdf',
  carnet: 'carnet_pdf',
  seguro: 'seguro_pdf',
  afip: 'afip_pdf',
  rentas: 'rentas_pdf',
};

const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export function docJsonKey(tipo: DocTipo) {
  return DOC_JSON_KEY[tipo];
}

export function isDocTipo(v: string): v is DocTipo {
  return (DOC_TIPOS as readonly string[]).includes(v);
}

function ensureDir(...parts: string[]): string {
  const dir = path.join(UPLOADS_ROOT, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveDoc(
  folder: 'cadetes' | 'clientes',
  userId: string,
  tipo: string,
  dataUrl: string,
): { relativeUrl: string; absolutePath: string; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) throw new AppError(`Documento ${tipo}: formato inválido (esperaba data URL)`, 400);
  const mime = m[1].toLowerCase();
  const ext = ALLOWED_MIME[mime];
  if (!ext) throw new AppError(`Documento ${tipo}: solo PDF o imagen JPG/PNG/WEBP`, 400);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 32) throw new AppError(`Documento ${tipo}: archivo vacío`, 400);
  if (buf.length > 8 * 1024 * 1024) {
    throw new AppError(`Documento ${tipo}: máximo 8 MB`, 400);
  }

  const dir = ensureDir(folder, userId);
  const destName = `${tipo}${ext}`;
  const dest = path.join(dir, destName);
  fs.writeFileSync(dest, buf);
  return {
    relativeUrl: `/uploads/${folder}/${userId}/${destName}`,
    absolutePath: dest,
    mime,
  };
}

export function ensureCadeteUploadDir(cadeteId: string): string {
  return ensureDir('cadetes', cadeteId);
}

export function saveCadeteDocFromDataUrl(
  cadeteId: string,
  tipo: DocTipo,
  dataUrl: string,
): { relativeUrl: string; absolutePath: string; mime: string } {
  return saveDoc('cadetes', cadeteId, tipo, dataUrl);
}

/** Solo DNI para validar identidad del cliente */
export function saveClienteDniFromDataUrl(
  clienteId: string,
  dataUrl: string,
): { relativeUrl: string; absolutePath: string; mime: string } {
  return saveDoc('clientes', clienteId, 'dni', dataUrl);
}

export function resolveCadeteDocPath(cadeteId: string, filename: string): string | null {
  const safe = path.basename(filename);
  const full = path.join(UPLOADS_ROOT, 'cadetes', cadeteId, safe);
  if (!full.startsWith(path.join(UPLOADS_ROOT, 'cadetes'))) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}
