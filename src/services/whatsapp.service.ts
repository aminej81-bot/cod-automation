import axios from 'axios';
import { config } from '../config';
import logger from '../utils/logger';
import prisma from '../lib/prisma';
import { isClientNotifyWindow, nextClientNotifyTime } from '../utils/time';
import { MessageDirection, MessageType } from '@prisma/client';

const BASE_URL = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}`;

const headers = () => ({
  Authorization: `Bearer ${config.whatsapp.accessToken}`,
  'Content-Type': 'application/json',
});

// ─── Core send functions ───────────────────────────────────────────────────────

async function sendPayload(payload: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await axios.post(`${BASE_URL}/messages`, payload, { headers: headers() });
    return (res.data?.messages?.[0]?.id as string) ?? null;
  } catch (err: unknown) {
    const e = err as { response?: { data?: unknown }; message?: string };
    logger.error('WhatsApp send failed', {
      error: e.response?.data ?? e.message,
      to: (payload as { to?: string }).to,
    });
    return null;
  }
}

export async function sendTextImmediate(to: string, body: string): Promise<string | null> {
  const waId = await sendPayload({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body, preview_url: false },
  });
  if (waId) {
    await logMessage({ direction: 'OUTBOUND', from: config.whatsapp.phoneNumberId, to, type: 'TEXT', body, waId, status: 'SENT' });
  }
  return waId;
}

export async function sendImageImmediate(to: string, imageUrl: string, caption?: string): Promise<string | null> {
  const waId = await sendPayload({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: { link: imageUrl, caption },
  });
  if (waId) {
    await logMessage({ direction: 'OUTBOUND', from: config.whatsapp.phoneNumberId, to, type: 'IMAGE', mediaUrl: imageUrl, waId, status: 'SENT' });
  }
  return waId;
}

export async function sendAudioImmediate(to: string, audioUrl: string): Promise<string | null> {
  const waId = await sendPayload({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'audio',
    audio: { link: audioUrl },
  });
  if (waId) {
    await logMessage({ direction: 'OUTBOUND', from: config.whatsapp.phoneNumberId, to, type: 'AUDIO', mediaUrl: audioUrl, waId, status: 'SENT' });
  }
  return waId;
}

// ─── Customer send (respects notification window) ─────────────────────────────

export async function sendToCustomer(
  to: string,
  body: string,
  orderId?: string,
): Promise<void> {
  if (isClientNotifyWindow()) {
    await sendTextImmediate(to, body);
    return;
  }

  const scheduledAt = nextClientNotifyTime();
  await prisma.whatsappMessage.create({
    data: {
      orderId: orderId ?? null,
      direction: MessageDirection.OUTBOUND,
      from: config.whatsapp.phoneNumberId,
      to,
      type: MessageType.TEXT,
      body,
      status: 'SCHEDULED',
      scheduledAt,
    },
  });
  logger.info('Message queued (outside window)', { to, scheduledAt });
}

// ─── Owner alert (always immediate, no time restriction) ──────────────────────

export async function alertOwner(message: string): Promise<void> {
  await sendTextImmediate(config.myWhatsapp, message);
}

// ─── Logging helper ──────────────────────────────────────────────────────────

interface LogParams {
  direction: 'INBOUND' | 'OUTBOUND';
  from: string;
  to: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'TEMPLATE';
  body?: string;
  mediaUrl?: string;
  waId?: string | null;
  status: string;
  orderId?: string | null;
  scheduledAt?: Date | null;
}

export async function logMessage(params: LogParams): Promise<void> {
  try {
    await prisma.whatsappMessage.create({
      data: {
        orderId: params.orderId ?? null,
        direction: params.direction as MessageDirection,
        from: params.from,
        to: params.to,
        type: params.type as MessageType,
        body: params.body ?? null,
        mediaUrl: params.mediaUrl ?? null,
        waMessageId: params.waId ?? null,
        status: params.status,
        scheduledAt: params.scheduledAt ?? null,
      },
    });
  } catch (err) {
    logger.error('Failed to log WhatsApp message', { err });
  }
}

// ─── Message templates ───────────────────────────────────────────────────────

export function tplOrderConfirmation(
  name: string,
  orderName: string,
  product: string,
  price: number,
  currency: string,
): string {
  return (
    `✅ *Bonjour ${name}!*\n\n` +
    `Merci pour votre commande *${orderName}*.\n\n` +
    `📦 Produit: ${product}\n` +
    `💰 Montant: ${price} ${currency}\n\n` +
    `Votre commande est en cours de traitement. Vous recevrez une notification dès qu'elle sera expédiée.\n\n` +
    `Répondez *OUI* pour confirmer ou *ANNULER* pour annuler votre commande.`
  );
}

export function tplNrpReminder(
  name: string,
  orderName: string,
  attempt: 1 | 2 | 3,
): string {
  const msgs: Record<1 | 2 | 3, string> = {
    1:
      `👋 *Bonjour ${name}*,\n\n` +
      `Nous avons essayé de vous joindre pour votre commande *${orderName}* mais sans réponse.\n\n` +
      `Merci de confirmer votre disponibilité pour la livraison en répondant *OUI*.`,
    2:
      `⚠️ *Rappel urgent* — Commande *${orderName}*\n\n` +
      `Bonjour ${name}, notre livreur n'arrive pas à vous contacter.\n\n` +
      `Répondez *OUI* pour confirmer la livraison ou *ANNULER* pour annuler votre commande.`,
    3:
      `🚨 *DERNIER AVERTISSEMENT* — Commande *${orderName}*\n\n` +
      `${name}, si nous ne recevons pas votre confirmation dans les 2 heures, votre commande sera *automatiquement annulée*.\n\n` +
      `Répondez *OUI* maintenant pour confirmer.`,
  };
  return msgs[attempt];
}

export function tplInjReminder(
  name: string,
  orderName: string,
  attempt: 1 | 2 | 3,
): string {
  const msgs: Record<1 | 2 | 3, string> = {
    1:
      `📍 *Bonjour ${name}*,\n\n` +
      `Votre commande *${orderName}* ne peut pas être livrée car l'adresse fournie est incorrecte.\n\n` +
      `Merci de nous envoyer votre adresse complète et correcte.`,
    2:
      `⚠️ *Important* — Commande *${orderName}*\n\n` +
      `${name}, votre commande est bloquée à cause d'une adresse incorrecte.\n\n` +
      `Envoyez-nous votre adresse complète: ville, quartier, rue, numéro.`,
    3:
      `🚨 *URGENT* — Commande *${orderName}*\n\n` +
      `${name}, c'est le dernier rappel. Envoyez votre adresse correcte maintenant, sinon votre commande sera *retournée*.`,
  };
  return msgs[attempt];
}

export function tplTrackingUpdate(
  name: string,
  orderName: string,
  trackingNumber: string,
  statusLabel: string,
): string {
  const statusMessages: Record<string, string> = {
    CREATED: `Votre commande *${orderName}* a été prise en charge. N° de suivi: \`${trackingNumber}\``,
    PICKED_UP: `Votre commande *${orderName}* a été collectée et est en route. 🚚`,
    IN_TRANSIT: `Votre commande *${orderName}* est en transit vers votre ville. 📦`,
    OUT_FOR_DELIVERY: `🛵 Votre livreur est en route avec votre commande *${orderName}*! Soyez disponible.`,
    DELIVERED: `✅ Votre commande *${orderName}* a été livrée. Merci pour votre confiance, ${name}! 🎉`,
    NO_ANSWER: `📞 Nous avons tenté de livrer votre commande *${orderName}* mais vous n'étiez pas disponible. Nous réessayerons.`,
    RETURNED: `↩️ Votre commande *${orderName}* a été retournée car impossible à livrer. Contactez-nous pour plus d'informations.`,
    FAILED: `⚠️ Un problème est survenu lors de la livraison de votre commande *${orderName}*. Nous vous contacterons bientôt.`,
  };

  const msg = statusMessages[statusLabel] ?? `Mise à jour de votre commande *${orderName}*: ${statusLabel}`;
  return `📦 *Bonjour ${name}!*\n\n${msg}`;
}

export function tplDailyReport(stats: DailyStats): string {
  const confirmRate =
    stats.total > 0 ? ((stats.confirmed / stats.total) * 100).toFixed(1) : '0.0';
  return (
    `📊 *RAPPORT JOURNALIER* — ${stats.date}\n` +
    `${'═'.repeat(30)}\n\n` +
    `📦 *Commandes:*\n` +
    `• Total: ${stats.total}\n` +
    `• Confirmées: ${stats.confirmed} (${confirmRate}%)\n` +
    `• NRP: ${stats.nrp}\n` +
    `• INJ: ${stats.inj}\n` +
    `• Annulées: ${stats.cancelled}\n` +
    `• Expédiées: ${stats.shipped}\n` +
    `• Livrées: ${stats.delivered}\n\n` +
    `📱 *Rappels:*\n` +
    `• Envoyés aujourd'hui: ${stats.remindersSent}\n` +
    `• En attente: ${stats.remindersPending}\n` +
    `• Échoués: ${stats.remindersFailed}\n` +
    `${'═'.repeat(30)}`
  );
}

export function tplWeeklyReport(stats: WeeklyStats): string {
  const confirmRate =
    stats.total > 0 ? ((stats.confirmed / stats.total) * 100).toFixed(1) : '0.0';
  const deliveryRate =
    stats.shipped > 0 ? ((stats.delivered / stats.shipped) * 100).toFixed(1) : '0.0';
  const returnRate =
    stats.shipped > 0 ? ((stats.returned / stats.shipped) * 100).toFixed(1) : '0.0';

  return (
    `📊 *RAPPORT HEBDOMADAIRE* — Semaine du ${stats.weekStart}\n` +
    `${'═'.repeat(30)}\n\n` +
    `📦 *Commandes (7 derniers jours):*\n` +
    `• Total: ${stats.total}\n` +
    `• Confirmées: ${stats.confirmed} (${confirmRate}%)\n` +
    `• NRP: ${stats.nrp}\n` +
    `• INJ: ${stats.inj}\n` +
    `• Annulées: ${stats.cancelled}\n` +
    `• Expédiées: ${stats.shipped}\n` +
    `• Livrées: ${stats.delivered} (taux: ${deliveryRate}%)\n` +
    `• Retours: ${stats.returned} (taux: ${returnRate}%)\n\n` +
    `📱 *Rappels:*\n` +
    `• Envoyés: ${stats.remindersSent}\n` +
    `• En attente: ${stats.remindersPending}\n` +
    `• Échoués: ${stats.remindersFailed}\n` +
    `${'═'.repeat(30)}`
  );
}

export interface DailyStats {
  date: string;
  total: number;
  confirmed: number;
  nrp: number;
  inj: number;
  cancelled: number;
  shipped: number;
  delivered: number;
  remindersSent: number;
  remindersPending: number;
  remindersFailed: number;
}

export interface WeeklyStats extends DailyStats {
  weekStart: string;
  returned: number;
}
