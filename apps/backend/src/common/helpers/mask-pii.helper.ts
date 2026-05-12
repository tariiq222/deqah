export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return local[0] + '***' + domain;
}

export function maskIdentifier(identifier: string): string {
  if (identifier.includes('@')) return maskEmail(identifier);
  if (identifier.startsWith('+') && identifier.length >= 8) {
    return identifier.slice(0, 5) + 'XXXXX' + identifier.slice(-2);
  }
  if (identifier.length <= 4) return '***';
  return identifier[0] + '***' + identifier.slice(-2);
}
