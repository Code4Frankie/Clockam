// Prices are stored in kobo (whole numbers). People type and read naira.
export const formatNaira = (kobo) => `₦${(Number(kobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: Number(kobo) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// "12,500" or "12500.50" -> kobo. Returns null when it is not a valid amount.
export function nairaToKobo(text) {
  const s = String(text ?? '').replace(/[,\s₦]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export const koboToNairaText = (kobo) => (Number(kobo || 0) % 100 ? (Number(kobo) / 100).toFixed(2) : String(Number(kobo || 0) / 100));
