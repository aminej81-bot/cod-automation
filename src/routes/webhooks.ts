import { Router, Request, Response } from 'express';
import { verifyShopifyWebhook } from '../middleware/auth';
import { webhookLimiter } from '../middleware/rateLimiter';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { detectIntent } from '../utils/intent';
import { config } from '../config';
import {
  sendTextImmediate,
  sendToCustomer,
  sendImageImmediate,
  sendAudioImmediate,
  alertOwner,
  logMessage,
  tplOrderConfirmation,
} from '../services/whatsapp.service';
import { appendRow, updateRowStatus } from '../services/sheets.service';
import { scheduleReminders, cancelReminders } from '../services/reminder.service';
import { askClaudeWithContext } from '../services/claude.service';
import { MessageDirection, MessageType, OrderStatus } from '@prisma/client';

const router = Router();

// ─── Shopify Order Webhook ────────────────────────────────────────────────────

router.post(
  '/shopify/orders/create',
  webhookLimiter,
  verifyShopifyWebhook,
  async (req: Request, res: Response) => {
    // Acknowledge immediately — Shopify requires <5s response
    res.status(200).json({ received: true });

    const payload = req.body;
    logger.info('Shopify order received', { id: payload?.id, name: payload?.name });

    try {
      const shopifyId = String(payload.id);
      const orderName = payload.name ?? `#${shopifyId}`;
      const customer = payload.customer ?? {};
      const lineItem = payload.line_items?.[0] ?? {};
      const shipping = payload.shipping_address ?? payload.billing_address ?? {};

      const rawPhone =
        shipping.phone ?? customer.phone ?? payload.phone ?? '';
      const customerPhone = normalizePhone(rawPhone);
      const customerName =
        `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() ||
        shipping.name ||
        'Client';

      if (!customerPhone) {
        logger.warn('Shopify order missing phone', { orderName });
        return;
      }

      // Upsert order
      const order = await prisma.order.upsert({
        where: { shopifyId },
        update: {},
        create: {
          shopifyId,
          shopifyOrderName: orderName,
          customerName,
          customerPhone,
          customerCity: shipping.city ?? null,
          productTitle: lineItem.title ?? 'N/A',
          productVariant: lineItem.variant_title ?? null,
          productSku: lineItem.sku ?? null,
          totalPrice: parseFloat(payload.total_price ?? '0'),
          currency: payload.currency ?? 'MAD',
          status: OrderStatus.PENDING,
        },
      });

      // Send WhatsApp confirmation immediately (bypass time window)
      const confirmMsg = tplOrderConfirmation(
        customerName,
        orderName,
        order.productTitle,
        order.totalPrice,
        order.currency,
      );
      await sendTextImmediate(customerPhone, confirmMsg);

      // Sync to Google Sheets
      try {
        const rowIndex = await appendRow({
          orderName,
          customerName,
          phone: customerPhone,
          product: order.productTitle,
          amount: order.totalPrice,
          status: 'En attente',
          city: order.customerCity ?? '',
        });

        await prisma.order.update({
          where: { id: order.id },
          data: { sheetRowIndex: rowIndex },
        });
      } catch (sheetErr) {
        logger.error('Failed to append to Google Sheets', { sheetErr });
      }

      // Alert owner
      await alertOwner(
        `🆕 *Nouvelle commande* ${orderName}\n` +
        `👤 ${customerName} — ${customerPhone}\n` +
        `📦 ${order.productTitle}\n` +
        `💰 ${order.totalPrice} ${order.currency}\n` +
        `📍 ${order.customerCity ?? 'N/A'}`,
      );
    } catch (err) {
      logger.error('Error processing Shopify order', { err });
    }
  },
);

// ─── WhatsApp Webhook Verification (GET) ─────────────────────────────────────

router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: 'Verification failed' });
  }
});

// ─── WhatsApp Incoming Messages (POST) ───────────────────────────────────────

router.post('/whatsapp', webhookLimiter, async (req: Request, res: Response) => {
  // Always acknowledge first
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const value = change.value;

        for (const msg of value.messages ?? []) {
          await processIncomingMessage(msg, value.metadata);
        }
      }
    }
  } catch (err) {
    logger.error('Error processing WhatsApp webhook', { err });
  }
});

// ─── Internal message processor ──────────────────────────────────────────────

interface WaMessage {
  id: string;
  from: string;
  type: string;
  timestamp: string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  audio?: { id: string };
}

interface WaMetadata {
  phone_number_id: string;
  display_phone_number: string;
}

async function processIncomingMessage(msg: WaMessage, metadata: WaMetadata): Promise<void> {
  const fromPhone = normalizePhone(msg.from);
  const messageText =
    msg.type === 'text' ? (msg.text?.body ?? '') : `[${msg.type}]`;
  const waMessageId = msg.id;

  // Find the most recent active order for this customer
  const order = await prisma.order.findFirst({
    where: {
      customerPhone: fromPhone,
      status: {
        notIn: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Log inbound message
  await logMessage({
    direction: 'INBOUND',
    from: fromPhone,
    to: metadata.phone_number_id,
    type: 'TEXT',
    body: messageText,
    waId: waMessageId,
    status: 'RECEIVED',
    orderId: order?.id ?? null,
  });

  if (!order) {
    await sendToCustomer(
      fromPhone,
      'Bonjour! Nous n\'avons pas trouvé de commande associée à votre numéro. Merci de nous contacter au numéro du service client.',
    );
    return;
  }

  const intent = detectIntent(messageText);
  logger.info('WhatsApp intent detected', { from: fromPhone, intent, orderId: order.id });

  switch (intent) {
    case 'confirmation':
      await handleConfirmation(order, fromPhone);
      break;

    case 'cancellation':
      await handleCancellation(order, fromPhone);
      break;

    case 'image_request':
      await handleImageRequest(order, fromPhone);
      break;

    case 'delivery_question':
    case 'ingredients_question':
      await handleMediaQuestion(order, fromPhone, intent);
      break;

    case 'tracking':
      await handleTracking(order, fromPhone);
      break;

    case 'general':
    default:
      await handleGeneral(order, fromPhone, messageText);
      break;
  }
}

async function handleConfirmation(order: { id: string; shopifyOrderName: string; sheetRowIndex: number | null }, fromPhone: string): Promise<void> {
  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.CONFIRMED },
  });

  await cancelReminders(order.id);

  if (order.sheetRowIndex) {
    await updateRowStatus(order.sheetRowIndex, 'Confirmé').catch((e) =>
      logger.error('Sheet update failed', { e }),
    );
  }

  await sendToCustomer(
    fromPhone,
    `✅ Merci! Votre commande *${order.shopifyOrderName}* est confirmée. Nous vous contacterons pour la livraison.`,
    order.id,
  );
}

async function handleCancellation(order: { id: string; shopifyOrderName: string; customerName: string; sheetRowIndex: number | null }, fromPhone: string): Promise<void> {
  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.CANCELLED },
  });

  await cancelReminders(order.id);

  if (order.sheetRowIndex) {
    await updateRowStatus(order.sheetRowIndex, 'Annulé').catch((e) =>
      logger.error('Sheet update failed', { e }),
    );
  }

  await sendToCustomer(
    fromPhone,
    `✅ Votre commande *${order.shopifyOrderName}* a été annulée. Merci de nous contacter si vous souhaitez passer une nouvelle commande.`,
    order.id,
  );

  await alertOwner(
    `🚫 *Commande annulée*\n` +
    `📋 ${order.shopifyOrderName}\n` +
    `👤 ${order.customerName} — ${fromPhone}`,
  );
}

async function handleImageRequest(
  order: { id: string; productSku: string | null; productTitle: string },
  fromPhone: string,
): Promise<void> {
  const product = order.productSku
    ? await prisma.product.findUnique({ where: { sku: order.productSku } })
    : await prisma.product.findFirst({ where: { title: { contains: order.productTitle } } });

  if (product?.imageUrl) {
    await sendImageImmediate(fromPhone, product.imageUrl, product.title);
  } else {
    await sendToCustomer(
      fromPhone,
      'Désolé, l\'image de ce produit n\'est pas disponible pour le moment.',
      order.id,
    );
  }
}

async function handleMediaQuestion(
  order: { id: string; productSku: string | null; productTitle: string },
  fromPhone: string,
  intent: 'delivery_question' | 'ingredients_question',
): Promise<void> {
  const product = order.productSku
    ? await prisma.product.findUnique({ where: { sku: order.productSku } })
    : await prisma.product.findFirst({ where: { title: { contains: order.productTitle } } });

  if (product?.audioUrl) {
    await sendAudioImmediate(fromPhone, product.audioUrl);
  } else {
    const defaultMsg =
      intent === 'delivery_question'
        ? 'La livraison prend généralement 2 à 5 jours ouvrables selon votre ville.'
        : 'Pour plus d\'informations sur la composition de ce produit, contactez notre service client.';
    await sendToCustomer(fromPhone, defaultMsg, order.id);
  }
}

async function handleTracking(
  order: { id: string; shopifyOrderName: string; status: string },
  fromPhone: string,
): Promise<void> {
  const tracking = await prisma.tracking.findUnique({ where: { orderId: order.id } });

  if (!tracking) {
    await sendToCustomer(
      fromPhone,
      `Votre commande *${order.shopifyOrderName}* est actuellement en cours de préparation. Vous recevrez une notification dès l'expédition.`,
      order.id,
    );
    return;
  }

  const statusLabels: Record<string, string> = {
    CREATED: 'Prise en charge',
    PICKED_UP: 'Collectée',
    IN_TRANSIT: 'En transit',
    OUT_FOR_DELIVERY: 'En cours de livraison',
    DELIVERED: 'Livrée',
    NO_ANSWER: 'Tentative de livraison (absent)',
    RETURNED: 'Retournée',
    FAILED: 'Problème de livraison',
  };

  const label = statusLabels[tracking.currentStatus] ?? tracking.currentStatus;
  await sendToCustomer(
    fromPhone,
    `📦 Statut de votre commande *${order.shopifyOrderName}*:\n\n${label}\nN° de suivi: \`${tracking.trackingNumber}\``,
    order.id,
  );
}

async function handleGeneral(
  order: { id: string; shopifyOrderName: string; productTitle: string; productSku: string | null; status: string; totalPrice: number; currency: string; customerCity: string | null },
  fromPhone: string,
  messageText: string,
): Promise<void> {
  const product = order.productSku
    ? await prisma.product.findUnique({ where: { sku: order.productSku } })
    : null;

  const reply = await askClaudeWithContext(
    messageText,
    {
      orderName: order.shopifyOrderName,
      productTitle: order.productTitle,
      status: order.status,
      totalPrice: order.totalPrice,
      currency: order.currency,
      customerCity: order.customerCity,
    },
    product?.faq as Record<string, string> | null,
  );

  await sendToCustomer(fromPhone, reply, order.id);
}

export default router;
