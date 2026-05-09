const CIDR_V4 = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/;
const CIDR_V6 = /^[\da-fA-F:]+(?:\/\d{1,3})?$/;
const SHORTHAND = /^\d+\/\d+$/; // e.g. 0/0

export function isValidCidr(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return CIDR_V4.test(v) || CIDR_V6.test(v) || SHORTHAND.test(v);
}

export function isValidHost(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.length > 253) return false;
  // allow hostnames or IPs
  return /^[A-Za-z0-9_.\-:]+$/.test(v);
}

export function isValidPort(value: number | string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 65535;
}
