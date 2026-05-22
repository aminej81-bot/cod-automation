import cron from 'node-cron';
import logger from '../utils/logger';
import { moroccoHour } from '../utils/time';
import { runSheetSync } from './sheets-sync.job';
import { runTrackingPoll } from './tracking.job';
import { runScheduledMessages } from './scheduled-messages.job';
import { runReminders } from './reminders.job';
import { runDailyReport, runWeeklyReport } from './reports.job';

function safe(name: string, fn: () => Promise<void>): () => void {
  return () => {
    fn().catch((err) => logger.error(`Job "${name}" crashed`, { err }));
  };
}

export function startJobs(): void {
  // ── Feature 3: Google Sheets sync — every 5 minutes ─────────────────────
  cron.schedule('*/5 * * * *', safe('sheets-sync', runSheetSync), {
    timezone: 'Africa/Casablanca',
  });

  // ── Feature 5: OzonExpress tracking — every 30 minutes ──────────────────
  cron.schedule('*/30 * * * *', safe('tracking-poll', runTrackingPoll), {
    timezone: 'Africa/Casablanca',
  });

  // ── Feature 6: Scheduled messages — every 5 min, 09:00–20:00 ───────────
  cron.schedule('*/5 9-19 * * *', safe('scheduled-messages', runScheduledMessages), {
    timezone: 'Africa/Casablanca',
  });

  // ── Feature 4: NRP/INJ reminders — 10:00, 14:00, 20:00 ─────────────────
  cron.schedule('0 10 * * *', safe('reminders-10h', runReminders), {
    timezone: 'Africa/Casablanca',
  });
  cron.schedule('0 14 * * *', safe('reminders-14h', runReminders), {
    timezone: 'Africa/Casablanca',
  });
  cron.schedule('0 20 * * *', safe('reminders-20h', runReminders), {
    timezone: 'Africa/Casablanca',
  });

  // ── Feature 7: Daily report — 21:00 ─────────────────────────────────────
  cron.schedule('0 21 * * *', safe('daily-report', runDailyReport), {
    timezone: 'Africa/Casablanca',
  });

  // ── Feature 7: Weekly report — Monday 08:00 ──────────────────────────────
  cron.schedule('0 8 * * 1', safe('weekly-report', runWeeklyReport), {
    timezone: 'Africa/Casablanca',
  });

  logger.info('All cron jobs scheduled');
}
