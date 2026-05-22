import logger from '../utils/logger';
import { getDailyStats, getWeeklyStats } from '../services/report.service';
import { alertOwner, tplDailyReport, tplWeeklyReport } from '../services/whatsapp.service';

export async function runDailyReport(): Promise<void> {
  logger.info('Daily report: generating');
  try {
    const stats = await getDailyStats();
    const message = tplDailyReport(stats);
    await alertOwner(message);
    logger.info('Daily report: sent');
  } catch (err) {
    logger.error('Daily report failed', { err });
  }
}

export async function runWeeklyReport(): Promise<void> {
  logger.info('Weekly report: generating');
  try {
    const stats = await getWeeklyStats();
    const message = tplWeeklyReport(stats);
    await alertOwner(message);
    logger.info('Weekly report: sent');
  } catch (err) {
    logger.error('Weekly report failed', { err });
  }
}
