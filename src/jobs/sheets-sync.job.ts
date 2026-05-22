import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { readAllRows } from '../services/sheets.service';
import { scheduleReminders, cancelReminders } from '../services/reminder.service';
import { ReminderType, OrderStatus } from '@prisma/client';

const SHEET_TO_DB_STATUS: Record<string, OrderStatus> = {
  'Confirmé':  OrderStatus.CONFIRMED,
  'Annulé':    OrderStatus.CANCELLED,
  'NRP':       OrderStatus.NRP,
  'INJ':       OrderStatus.INJ,
  'Expédié':   OrderStatus.SHIPPED,
  'Livré':     OrderStatus.DELIVERED,
  'Retour':    OrderStatus.RETURNED,
};

export async function runSheetSync(): Promise<void> {
  logger.info('Sheet sync: starting');
  const startedAt = Date.now();
  let rowsUpdated = 0;
  const errors: string[] = [];

  try {
    const rows = await readAllRows();

    for (const row of rows) {
      if (!row.orderName) continue;

      try {
        const order = await prisma.order.findFirst({
          where: { shopifyOrderName: row.orderName },
        });

        if (!order) continue;

        const newStatus = SHEET_TO_DB_STATUS[row.status];
        if (!newStatus || newStatus === order.status) continue;

        logger.info('Sheet status change detected', {
          orderName: row.orderName,
          from: order.status,
          to: newStatus,
        });

        // Update DB status
        await prisma.order.update({
          where: { id: order.id },
          data: { status: newStatus, sheetRowIndex: row.rowIndex },
        });

        // React to status
        switch (newStatus) {
          case OrderStatus.NRP:
            await scheduleReminders(order.id, ReminderType.NRP);
            break;

          case OrderStatus.INJ:
            await scheduleReminders(order.id, ReminderType.INJ);
            break;

          case OrderStatus.CONFIRMED:
          case OrderStatus.CANCELLED:
            await cancelReminders(order.id);
            break;

          default:
            break;
        }

        rowsUpdated++;
      } catch (rowErr: unknown) {
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
        errors.push(`Row ${row.rowIndex}: ${msg}`);
        logger.error('Sheet sync row error', { row: row.rowIndex, err: msg });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Global: ${msg}`);
    logger.error('Sheet sync failed', { err: msg });
  }

  // Save sync record
  await prisma.sheetSync.create({
    data: {
      lastSyncAt: new Date(),
      rowsUpdated,
      errors: errors.length ? (errors as unknown as import('@prisma/client').Prisma.JsonArray) : undefined,
    },
  });

  logger.info('Sheet sync: done', { rowsUpdated, errors: errors.length, ms: Date.now() - startedAt });
}
