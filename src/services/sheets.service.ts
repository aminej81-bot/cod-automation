import { google, sheets_v4 } from 'googleapis';
import { config } from '../config';
import logger from '../utils/logger';
import { formatMoroccoDate } from '../utils/time';

const SHEET = config.googleSheets.sheetName;

// Column indices (0-based)
const COL = {
  ORDER_NAME: 0,
  CUSTOMER_NAME: 1,
  PHONE: 2,
  PRODUCT: 3,
  AMOUNT: 4,
  STATUS: 5,
  CITY: 6,
  DATE: 7,
} as const;

type RGB = { red: number; green: number; blue: number };

const STATUS_COLORS: Record<string, RGB> = {
  'Confirmé': { red: 0.56, green: 0.93, blue: 0.56 },  // green
  'NRP':      { red: 1.00, green: 1.00, blue: 0.00 },  // yellow
  'INJ':      { red: 1.00, green: 0.65, blue: 0.00 },  // orange
  'Annulé':   { red: 1.00, green: 0.30, blue: 0.30 },  // red
  'Expédié':  { red: 0.53, green: 0.81, blue: 0.98 },  // blue
  'Livré':    { red: 0.00, green: 0.80, blue: 0.40 },  // dark green
  'Retour':   { red: 0.80, green: 0.40, blue: 0.80 },  // purple
};

let _sheets: sheets_v4.Sheets | null = null;

async function getSheets(): Promise<sheets_v4.Sheets> {
  if (_sheets) return _sheets;

  const auth = new google.auth.GoogleAuth({
    keyFile: config.googleSheets.serviceAccountKeyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

export interface SheetRow {
  rowIndex: number; // 1-based (row 1 = header, data starts at 2)
  orderName: string;
  customerName: string;
  phone: string;
  product: string;
  amount: string;
  status: string;
  city: string;
  date: string;
}

export async function readAllRows(): Promise<SheetRow[]> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheets.sheetId,
    range: `${SHEET}!A:H`,
  });

  const rows = res.data.values ?? [];
  // Skip header row (index 0 → sheet row 1)
  return rows.slice(1).map((row, i) => ({
    rowIndex: i + 2, // 1-based, offset by header
    orderName:    (row[COL.ORDER_NAME]    as string) ?? '',
    customerName: (row[COL.CUSTOMER_NAME] as string) ?? '',
    phone:        (row[COL.PHONE]         as string) ?? '',
    product:      (row[COL.PRODUCT]       as string) ?? '',
    amount:       (row[COL.AMOUNT]        as string) ?? '',
    status:       (row[COL.STATUS]        as string) ?? '',
    city:         (row[COL.CITY]          as string) ?? '',
    date:         (row[COL.DATE]          as string) ?? '',
  }));
}

export async function appendRow(params: {
  orderName: string;
  customerName: string;
  phone: string;
  product: string;
  amount: number;
  status: string;
  city: string;
}): Promise<number> {
  const sheets = await getSheets();

  const values = [
    [
      params.orderName,
      params.customerName,
      params.phone,
      params.product,
      params.amount.toString(),
      params.status,
      params.city,
      formatMoroccoDate(new Date()),
    ],
  ];

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheets.sheetId,
    range: `${SHEET}!A:H`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  // Extract the row index from the updated range (e.g. "Commandes!A5:H5")
  const updatedRange = res.data.updates?.updatedRange ?? '';
  const match = updatedRange.match(/!A(\d+)/);
  const rowIndex = match ? parseInt(match[1], 10) : -1;

  if (rowIndex > 0) {
    await colorizeRow(rowIndex, params.status);
  }

  return rowIndex;
}

export async function updateRowStatus(rowIndex: number, status: string): Promise<void> {
  const sheets = await getSheets();

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheets.sheetId,
    range: `${SHEET}!F${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[status]] },
  });

  await colorizeRow(rowIndex, status);
  logger.info('Sheet row status updated', { rowIndex, status });
}

export async function colorizeRow(rowIndex: number, status: string): Promise<void> {
  const color = STATUS_COLORS[status];
  if (!color) return;

  const sheets = await getSheets();

  // Get sheet ID (gid) for the named sheet
  const sheetMeta = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSheets.sheetId,
  });

  const sheetObj = sheetMeta.data.sheets?.find(
    (s) => s.properties?.title === SHEET,
  );
  const sheetId = sheetObj?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.googleSheets.sheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 0,
              endColumnIndex: 8,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: color,
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ],
    },
  });
}
