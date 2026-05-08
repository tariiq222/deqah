import { ValidationOptions, registerDecorator, ValidationArguments } from 'class-validator';
import * as ipaddr from 'ipaddr.js';

/**
 * Validates that every entry in a string[] is a parseable IPv4 / IPv6 address
 * or CIDR range. Use on a `string[]` property.
 *
 * Empty arrays are accepted (means "no allowlist active"). Empty strings inside
 * the array are rejected.
 */
export function IsCidrOrIpArray(opts?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsCidrOrIpArray',
      target: object.constructor,
      propertyName,
      options: {
        message: ({ property, value }: ValidationArguments) => {
          const arr = Array.isArray(value) ? value : [];
          const bad = arr.filter((v) => !isValidCidrOrIp(v));
          return `${property} contains invalid IP/CIDR entries: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`;
        },
        ...opts,
      },
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return false;
          return value.every(isValidCidrOrIp);
        },
      },
    });
  };
}

function isValidCidrOrIp(entry: unknown): boolean {
  if (typeof entry !== 'string' || entry.length === 0) return false;
  try {
    if (entry.includes('/')) {
      ipaddr.parseCIDR(entry);
    } else {
      ipaddr.parse(entry);
    }
    return true;
  } catch {
    return false;
  }
}
