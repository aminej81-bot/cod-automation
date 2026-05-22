import prisma from '../lib/prisma';
import logger from '../utils/logger';
import {
  getDueReminders,
  markReminderSent,
  markReminderFailed,
} from '../services/reminder.service';
import {
  sendTextImmediate,
  alertOwner,
  tplNrpReminder,
  tplInjReminder,
} from '../services/whatsapp.service';
import { ReminderType } from '@prisma/client';

export async function runReminders(): Promise<void> {
  const due = await getDueReminders();
  if (due.length === 0) return;

  logger.info('Reminders: processing', { count: due.length });

  for (const reminder of due) {
    const { order } = reminder;
    const attempt = reminder.attempt as 1 | 2 | 3;

    try {
      let message: string;

      if (reminder.type === ReminderType.NRP) {
        message = tplNrpReminder(order.customerName, order.shopifyOrderName, attempt);
      } else {
        message = tplInjReminder(order.customerName, order.shopifyOrderName, attempt);
      }

      const waId = await sendTextImmediate(order.customerPhone, message);

      if (waId) {
        await markReminderSent(reminder.id);
        logger.info('Reminder sent', {
          orderId: order.id,
          type: reminder.type,
          attempt,
        });
      } else {
        await markReminderFailed(reminder.id);
      }

      // After 3rd attempt, alert owner
      if (attempt === 3) {
        await alertOwner(
          `⚠️ *3ème rappel envoyé sans réponse*\n` +
          `📋 ${order.shopifyOrderName} — ${reminder.type}\n` +
          `👤 ${order.customerName}\n` +
          `📞 ${order.customerPhone}`,
        );
      }
    } catch (err) {
      logger.error('Reminder send error', { reminderId: reminder.id, err });
      await markReminderFailed(reminder.id);
    }
  }

  logger.info('Reminders: done', { processed: due.length });
}
