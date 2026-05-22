export function normalizePhone(raw: string): string {
  // Strip all non-digit characters
  let digits = raw.replace(/\D/g, '');

  // 00212XXXXXXXXX → 212XXXXXXXXX
  if (digits.startsWith('00212')) {
    digits = digits.slice(2);
  }

  // 0XXXXXXXXX (10 digits, Morocco local) → 212XXXXXXXXX
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '212' + digits.slice(1);
  }

  // +212 already stripped to 212XXXXXXXXX (12 digits)
  return digits;
}

export function isValidMoroccanPhone(phone: string): boolean {
  const n = normalizePhone(phone);
  // 212 + (5|6|7) + 8 digits = 12 total
  return /^212[5-7]\d{8}$/.test(n);
}
