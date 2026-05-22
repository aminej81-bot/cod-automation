import prisma from '../lib/prisma';
import { startOfToday, startOfDaysAgo, formatMoroccoDate } from '../utils/time';
import { DailyStats, WeeklyStats } from './whatsapp.service';

export async function getDailyStats(): Promise<DailyStats> {
  const start = startOfToday();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const [orders, reminders] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { createdAt: { gte: start, lt: end } },
      _count: { status: true },
    }),
    prisma.reminder.groupBy({
      by: ['status'],
      where: { createdAt: { gte: start, lt: end } },
      _count: { status: true },
    }),
  ]);

  const byStatus = (status: string) =>
    orders.find((o) => o.status === status)?._count.status ?? 0;
  const reminderByStatus = (status: string) =>
    reminders.find((r) => r.status === status)?._count.status ?? 0;

  const total = orders.reduce((sum, o) => sum + o._count.status, 0);

  return {
    date: formatMoroccoDate(start),
    total,
    confirmed: byStatus('CONFIRMED'),
    nrp: byStatus('NRP'),
    inj: byStatus('INJ'),
    cancelled: byStatus('CANCELLED'),
    shipped: byStatus('SHIPPED'),
    delivered: byStatus('DELIVERED'),
    remindersSent: reminderByStatus('SENT'),
    remindersPending: reminderByStatus('PENDING'),
    remindersFailed: reminderByStatus('FAILED'),
  };
}

export async function getWeeklyStats(): Promise<WeeklyStats> {
  const start = startOfDaysAgo(7);
  const end = new Date(); // now

  const [orders, reminders] = await Promise.all([
    prisma.order.groupBy({
      by: ['status'],
      where: { createdAt: { gte: start, lt: end } },
      _count: { status: true },
    }),
    prisma.reminder.groupBy({
      by: ['status'],
      where: { createdAt: { gte: start, lt: end } },
      _count: { status: true },
    }),
  ]);

  const byStatus = (status: string) =>
    orders.find((o) => o.status === status)?._count.status ?? 0;
  const reminderByStatus = (status: string) =>
    reminders.find((r) => r.status === status)?._count.status ?? 0;

  const total = orders.reduce((sum, o) => sum + o._count.status, 0);

  return {
    date: formatMoroccoDate(new Date()),
    weekStart: formatMoroccoDate(start),
    total,
    confirmed: byStatus('CONFIRMED'),
    nrp: byStatus('NRP'),
    inj: byStatus('INJ'),
    cancelled: byStatus('CANCELLED'),
    shipped: byStatus('SHIPPED'),
    delivered: byStatus('DELIVERED'),
    returned: byStatus('RETURNED'),
    remindersSent: reminderByStatus('SENT'),
    remindersPending: reminderByStatus('PENDING'),
    remindersFailed: reminderByStatus('FAILED'),
  };
}
