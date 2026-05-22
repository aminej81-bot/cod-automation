import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';
import logger from '../utils/logger';
import { TrackingStatus } from '@prisma/client';

const STATUS_MAP: Record<string, TrackingStatus> = {
  created:          TrackingStatus.CREATED,
  picked_up:        TrackingStatus.PICKED_UP,
  in_transit:       TrackingStatus.IN_TRANSIT,
  out_for_delivery: TrackingStatus.OUT_FOR_DELIVERY,
  delivered:        TrackingStatus.DELIVERED,
  no_answer:        TrackingStatus.NO_ANSWER,
  returned:         TrackingStatus.RETURNED,
  failed:           TrackingStatus.FAILED,
};

export interface OzonShipmentPayload {
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerCity: string;
  productTitle: string;
  totalPrice: number;
  currency: string;
}

export interface OzonTrackingEvent {
  status: TrackingStatus;
  description: string;
  location: string;
  occurredAt: Date;
}

export interface OzonTrackingResponse {
  trackingNumber: string;
  currentStatus: TrackingStatus;
  events: OzonTrackingEvent[];
}

function buildHeaders(): Record<string, string> {
  const ts = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', config.ozon.apiSecret)
    .update(`${config.ozon.apiKey}:${ts}`)
    .digest('hex');

  return {
    'X-Api-Key': config.ozon.apiKey,
    'X-Timestamp': ts,
    'X-Signature': signature,
    'Content-Type': 'application/json',
  };
}

export async function createShipment(payload: OzonShipmentPayload): Promise<string> {
  try {
    const res = await axios.post(
      `${config.ozon.apiUrl}/shipments`,
      {
        reference_id: payload.orderId,
        recipient: {
          name: payload.customerName,
          phone: payload.customerPhone,
          city: payload.customerCity,
        },
        parcel: {
          description: payload.productTitle,
          value: payload.totalPrice,
          currency: payload.currency,
          weight: 1000, // grams, default
        },
        cod_amount: payload.totalPrice,
      },
      { headers: buildHeaders() },
    );

    const trackingNumber = res.data?.tracking_number ?? res.data?.shipment_id;
    if (!trackingNumber) throw new Error('No tracking number in response');

    logger.info('OzonExpress shipment created', { orderId: payload.orderId, trackingNumber });
    return trackingNumber as string;
  } catch (err: unknown) {
    const e = err as { response?: { data?: unknown }; message?: string };
    logger.error('OzonExpress createShipment failed', {
      error: e.response?.data ?? e.message,
      orderId: payload.orderId,
    });
    throw err;
  }
}

export async function getTracking(trackingNumber: string): Promise<OzonTrackingResponse> {
  try {
    const res = await axios.get(
      `${config.ozon.apiUrl}/tracking/${trackingNumber}`,
      { headers: buildHeaders() },
    );

    const data = res.data;
    const rawStatus: string = data?.status ?? 'created';
    const currentStatus = STATUS_MAP[rawStatus] ?? TrackingStatus.CREATED;

    const events: OzonTrackingEvent[] = (data?.events ?? []).map(
      (e: { status?: string; description?: string; location?: string; timestamp?: string | number }) => ({
        status: STATUS_MAP[e.status ?? ''] ?? TrackingStatus.CREATED,
        description: e.description ?? '',
        location: e.location ?? '',
        occurredAt: new Date(e.timestamp ?? Date.now()),
      }),
    );

    return { trackingNumber, currentStatus, events };
  } catch (err: unknown) {
    const e = err as { response?: { data?: unknown }; message?: string };
    logger.error('OzonExpress getTracking failed', {
      error: e.response?.data ?? e.message,
      trackingNumber,
    });
    throw err;
  }
}
