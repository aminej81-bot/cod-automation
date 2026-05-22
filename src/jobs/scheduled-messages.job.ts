import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { sendTextImmediate, sendImageImmediate, sendAudioImmediate } from '../services/whatsapp.service';

export async function runScheduledMessages(): Promise<void> {
  const now = new Date();

  const due = await prisma.whatsappMessage.findMany({
    where: {
      status: { startsWith: 'SCHEDULED' },
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 100, // process in batches
  });

  if (due.length === 0) return;

  logger.info('Scheduled messages: processing', { count: due.length });

  for (const msg of due) {
    try {
      let waId: string | null = null;

      switch (msg.type) {
        case 'TEXT':
          if (msg.body) waId = await sendTextImmediate(msg.to, msg.body);
          break;
        case 'IMAGE':
          if (msg.mediaUrl) waId = await sendImageImmediate(msg.to, msg.mediaUrl);
          break;
        case 'AUDIO':
          if (msg.mediaUrl) waId = await sendAudioImmediate(msg.to, msg.mediaUrl);
          break;
        default:
          if (msg.body) waId = await sendTextImmediate(msg.to, msg.body);
      }

      await prisma.whatsappMessage.update({
        where: { id: msg.id },
        data: {
          status: waId ? 'SENT' : 'FAILED',
          waMessageId: waId ?? undefined,
        },
      });
    } catch (err) {
      logger.error('Failed to send scheduled message', { msgId: msg.id, err });
      await prisma.whatsappMessage.update({
        where: { id: msg.id },
        data: { status: 'FAILED' },
      });
    }
  }

  logger.info('Scheduled messages: done', { processed: due.length });
}
