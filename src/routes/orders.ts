import { Router, Request, Response } from 'express';
import { requireInternalSecret } from '../middleware/auth';
import { apiLimiter } from '../middleware/rateLimiter';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { createShipment } from '../services/ozon.service';
import { alertOwner } from '../services/whatsapp.service';
import { OrderStatus, TrackingStatus } from '@prisma/client';

const router = Router();

// All order routes require internal secret
router.use(requireInternalSecret);
router.use(apiLimiter);

// GET /api/orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string ?? '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string ?? '50', 10), 100);
    const status = req.query.status as string | undefined;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: status ? { status: status as OrderStatus } : undefined,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { tracking: true },
      }),
      prisma.order.count({
        where: status ? { status: status as OrderStatus } : undefined,
      }),
    ]);

    res.json({
      data: orders,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error('GET /api/orders failed', { err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { tracking: { include: { events: true } }, reminders: true },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json(order);
  } catch (err) {
    logger.error('GET /api/orders/:id failed', { err, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/orders/:id/ship — create shipment on OzonExpress
router.post('/:id/ship', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED) {
      res.status(400).json({ error: 'Order already shipped' });
      return;
    }

    const existingTracking = await prisma.tracking.findUnique({
      where: { orderId: order.id },
    });
    if (existingTracking) {
      res.status(400).json({ error: 'Tracking already exists', tracking: existingTracking });
      return;
    }

    const trackingNumber = await createShipment({
      orderId: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerCity: order.customerCity ?? '',
      productTitle: order.productTitle,
      totalPrice: order.totalPrice,
      currency: order.currency,
    });

    const [tracking] = await Promise.all([
      prisma.tracking.create({
        data: {
          orderId: order.id,
          trackingNumber,
          currentStatus: TrackingStatus.CREATED,
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.SHIPPED },
      }),
    ]);

    // Create initial event
    await prisma.trackingEvent.create({
      data: {
        trackingId: tracking.id,
        status: TrackingStatus.CREATED,
        description: 'Colis pris en charge par OzonExpress',
        occurredAt: new Date(),
      },
    });

    await alertOwner(
      `🚚 *Expédition créée*\n` +
      `📋 ${order.shopifyOrderName}\n` +
      `👤 ${order.customerName}\n` +
      `🔖 Suivi: ${trackingNumber}`,
    );

    res.json({ success: true, trackingNumber, trackingId: tracking.id });
  } catch (err) {
    logger.error('POST /api/orders/:id/ship failed', { err, id: req.params.id });
    res.status(500).json({ error: 'Failed to create shipment' });
  }
});

export default router;
