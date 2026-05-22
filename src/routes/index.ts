import { Router } from 'express';
import healthRouter from './health';
import webhooksRouter from './webhooks';
import ordersRouter from './orders';

const router = Router();

router.use('/health', healthRouter);
router.use('/webhooks', webhooksRouter);
router.use('/api/orders', ordersRouter);

export default router;
