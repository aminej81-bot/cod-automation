import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { getTracking } from '../services/ozon.service';
import {
  sendTextImmediate,
  sendToCustomer,
  alertOwner,
  tplTrackingUpdate,
} from '../services/whatsapp.service';
import { updateRowStatus } from '../services/sheets.service';
import { OrderStatus, TrackingStatus } from '@prisma/client';

const TERMINAL_STATUSES: TrackingStatus[] = [
  TrackingStatus.DELIVERED,
  TrackingStatus.RETURNED,
  TrackingStatus.FAILED,
];

export async function runTrackingPoll(): Promise<void> {
  logger.info('Tracking poll: starting');

  const activeTrackings = await prisma.tracking.findMany({
    where: {
      currentStatus: { notIn: TERMINAL_STATUSES },
    },
    include: { order: true },
  });

  logger.info('Tracking poll: active trackings', { count: activeTrackings.length });

  for (const tracking of activeTrackings) {
    try {
      const fresh = await getTracking(tracking.trackingNumber);

      if (fresh.currentStatus === tracking.currentStatus) continue;

      logger.info('Tracking status changed', {
        trackingNumber: tracking.trackingNumber,
        from: tracking.currentStatus,
        to: fresh.currentStatus,
      });

      // Save new events
      for (const event of fresh.events) {
        const exists = await prisma.trackingEvent.findFirst({
          where: {
            trackingId: tracking.id,
            status: event.status,
            occurredAt: event.occurredAt,
          },
        });
        if (!exists) {
          await prisma.trackingEvent.create({
            data: {
              trackingId: tracking.id,
              status: event.status,
              description: event.description,
              location: event.location,
              occurredAt: event.occurredAt,
            },
          });
        }
      }

      // Update tracking status
      await prisma.tracking.update({
        where: { id: tracking.id },
        data: { currentStatus: fresh.currentStatus, lastCheckedAt: new Date() },
      });

      // Update order status when applicable
      const order = tracking.order;
      let newOrderStatus: OrderStatus | null = null;
      if (fresh.currentStatus === TrackingStatus.DELIVERED) {
        newOrderStatus = OrderStatus.DELIVERED;
      } else if (fresh.currentStatus === TrackingStatus.RETURNED) {
        newOrderStatus = OrderStatus.RETURNED;
      }

      if (newOrderStatus) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: newOrderStatus },
        });

        if (order.sheetRowIndex) {
          const sheetStatus = newOrderStatus === OrderStatus.DELIVERED ? 'Livré' : 'Retour';
          await updateRowStatus(order.sheetRowIndex, sheetStatus).catch((e) =>
            logger.error('Sheet update failed during tracking', { e }),
          );
        }
      }

      // Notify owner (always immediate)
      await alertOwner(
        `📦 *Mise à jour livraison*\n` +
        `📋 ${order.shopifyOrderName}\n` +
        `👤 ${order.customerName}\n` +
        `🔖 ${tracking.trackingNumber}\n` +
        `📍 Statut: ${fresh.currentStatus}`,
      );

      // Notify customer (respects time window)
      const customerMsg = tplTrackingUpdate(
        order.customerName,
        order.shopifyOrderName,
        tracking.trackingNumber,
        fresh.currentStatus,
      );
      await sendToCustomer(order.customerPhone, customerMsg, order.id);
    } catch (err) {
      logger.error('Tracking poll error for tracking', {
        trackingNumber: tracking.trackingNumber,
        err,
      });
    }
  }

  logger.info('Tracking poll: done');
}
