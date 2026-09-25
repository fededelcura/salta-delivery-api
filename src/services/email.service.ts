/**
 * Envío de OTP por email (Resend). Sin API key → log en consola.
 */
import { env } from '../config/env.js';

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendVerificationEmail(
  to: string,
  code: string,
): Promise<void> {
  const subject = 'Tu código de verificación — Salta Delivery';
  const text = `Tu código de verificación es ${code}. Válido por 10 minutos.`;
  const html = `
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto">
      <h2 style="color:#0f766e">Salta Delivery</h2>
      <p>Tu código de verificación:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>
      <p style="color:#64748b;font-size:14px">Válido por 10 minutos. Si no pediste este código, ignorá este correo.</p>
    </div>
  `;

  if (!env.RESEND_API_KEY) {
    console.info(`[email] OTP para ${to}: ${code} (RESEND_API_KEY no configurada)`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[email] Resend error', res.status, body);
    throw new Error('No se pudo enviar el email de verificación');
  }
}
