import { ReminderType } from '@prisma/client';
import prisma from '../lib/prisma';
import { config } from '../config';
import { nowInMorocco, todayAt, tomorrowAt } from '../utils/time';
import logger from '../utils/logger';

/** Schedule 3 NRP or INJ reminders for the given order (today or tomorrow) */
export async function scheduleReminders(orderId: string, type: ReminderType): Promise<void> {
  // Cancel any existing pending reminders first
  await cancelReminders(orderId);

  const now = nowInMorocco();
  const times = config.reminders.times; // ['10:00', '14:00', '20:00']

  const scheduled: Array<{ attempt: number; scheduledAt: Date }> = [];

  for (let i = 0; i < times.length; i++) {
    const candidate = todayAt(times[i]);
    // If time has already passed today, push to tomorrow
    const at = candidate > now ? candidate : tomorrowAt(times[i]);
    scheduled.push({ attempt: i + 1, scheduledAt: at });
  }

  await prisma.reminder.createMany({
    data: scheduled.map(({ attempt, scheduledAt }) => ({
      orderId,
      type,
      attempt,
      scheduledAt,
      status: 'PENDING',
    })),
  });

  logger.info('Reminders scheduled', { orderId, type, count: scheduled.length });
}

/** Cancel all pending reminders for an order */
export async function cancelReminders(orderId: string): Promise<number> {
  const result = await prisma.reminder.updateMany({
    where: { orderId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (result.count > 0) {
    logger.info('Reminders cancelled', { orderId, count: result.count });
  }
  return result.count;
}

/** Get due pending reminders (scheduledAt <= now) */
export async function getDueReminders() {
  return prisma.reminder.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { lte: new Date() },
    },
    include: { order: true },
    orderBy: { scheduledAt: 'asc' },
  });
}

/** Mark a reminder as sent */
export async function markReminderSent(reminderId: string): Promise<void> {
  await prisma.reminder.update({
    where: { id: reminderId },
    data: { status: 'SENT', sentAt: new Date() },
  });
}

/** Mark a reminder as failed */
export async function markReminderFailed(reminderId: string): Promise<void> {
  await prisma.reminder.update({
    where: { id: reminderId },
    data: { status: 'FAILED' },
  });
}
