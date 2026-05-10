import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PLAN_LIMITS,
  FEATURE_FIELDS,
  OVERAGE_FIELDS,
  QUOTA_FIELDS,
  QUANT_FIELD_MAP,
  hydrateLimits,
  mergeLimits,
  type PlanLimits,
} from '../../../../features/plans/plan-limits';

describe('plan-limits', () => {
  describe('DEFAULT_PLAN_LIMITS', () => {
    it('has all required quota fields defined', () => {
      expect(DEFAULT_PLAN_LIMITS.maxBranches).toBe(1);
      expect(DEFAULT_PLAN_LIMITS.maxEmployees).toBe(5);
      expect(DEFAULT_PLAN_LIMITS.maxServices).toBe(-1);
      expect(DEFAULT_PLAN_LIMITS.maxBookingsPerMonth).toBe(-1);
      expect(DEFAULT_PLAN_LIMITS.maxClients).toBe(-1);
    });

    it('has overage rate fields set to 0 by default', () => {
      expect(DEFAULT_PLAN_LIMITS.overageRateBookings).toBe(0);
      expect(DEFAULT_PLAN_LIMITS.overageRateClients).toBe(0);
    });

    it('has all boolean feature flags set to false', () => {
      const booleanKeys = [
        'recurring_bookings',
        'waitlist',
        'group_sessions',
        'ai_chatbot',
        'email_templates',
        'coupons',
        'advanced_reports',
        'intake_forms',
        'custom_roles',
        'activity_log',
        'zoom_integration',
        'walk_in_bookings',
        'bank_transfer_payments',
        'multi_branch',
        'departments',
        'client_ratings',
        'data_export',
        'sms_provider_per_tenant',
        'white_label_mobile',
        'custom_domain',
        'api_access',
        'webhooks',
        'priority_support',
        'audit_export',
        'multi_currency',
      ] as const;

      for (const key of booleanKeys) {
        expect(DEFAULT_PLAN_LIMITS[key]).toBe(false);
      }
    });

    it('has email_fallback_monthly set to 500', () => {
      expect(DEFAULT_PLAN_LIMITS.email_fallback_monthly).toBe(500);
    });

    it('has sms_fallback_monthly set to 100', () => {
      expect(DEFAULT_PLAN_LIMITS.sms_fallback_monthly).toBe(100);
    });
  });

  describe('QUOTA_FIELDS', () => {
    it('contains exactly 5 entries', () => {
      expect(QUOTA_FIELDS).toHaveLength(5);
    });

    it('has correct keys for each quota field', () => {
      expect(QUOTA_FIELDS.map((f) => f.key)).toEqual([
        'maxBranches',
        'maxEmployees',
        'maxServices',
        'maxBookingsPerMonth',
        'maxClients',
      ]);
    });

    it('each entry has a label and hint', () => {
      for (const field of QUOTA_FIELDS) {
        expect(field.label).toBeTruthy();
        expect(field.hint).toBeTruthy();
      }
    });
  });

  describe('OVERAGE_FIELDS', () => {
    it('contains exactly 2 entries', () => {
      expect(OVERAGE_FIELDS).toHaveLength(2);
    });

    it('has correct keys', () => {
      expect(OVERAGE_FIELDS.map((f) => f.key)).toEqual([
        'overageRateBookings',
        'overageRateClients',
      ]);
    });
  });

  describe('FEATURE_FIELDS', () => {
    it('contains all boolean feature keys from DEFAULT_PLAN_LIMITS', () => {
      const booleanFeatureKeys = FEATURE_FIELDS.map((f) => f.key);
      for (const key of booleanFeatureKeys) {
        expect(key in DEFAULT_PLAN_LIMITS).toBe(true);
        expect(typeof DEFAULT_PLAN_LIMITS[key]).toBe('boolean');
      }
    });

    it('each entry has a non-empty label', () => {
      for (const field of FEATURE_FIELDS) {
        expect(field.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe('QUANT_FIELD_MAP', () => {
    it('maps catalog quantitative keys to PlanLimits fields', () => {
      expect(QUANT_FIELD_MAP.branches).toBe('maxBranches');
      expect(QUANT_FIELD_MAP.employees).toBe('maxEmployees');
      expect(QUANT_FIELD_MAP.services).toBe('maxServices');
      expect(QUANT_FIELD_MAP.monthly_bookings).toBe('maxBookingsPerMonth');
    });

    it('maps to valid PlanLimits keys', () => {
      for (const [, limitKey] of Object.entries(QUANT_FIELD_MAP)) {
        expect(limitKey in DEFAULT_PLAN_LIMITS).toBe(true);
      }
    });
  });

  describe('hydrateLimits', () => {
    it('returns DEFAULT_PLAN_LIMITS when raw is undefined', () => {
      const result = hydrateLimits(undefined);
      expect(result).toEqual(DEFAULT_PLAN_LIMITS);
    });

    it('returns DEFAULT_PLAN_LIMITS when raw is empty object', () => {
      const result = hydrateLimits({});
      expect(result).toEqual(DEFAULT_PLAN_LIMITS);
    });

    it('overrides boolean values from raw', () => {
      const raw = { recurring_bookings: true, coupons: true };
      const result = hydrateLimits(raw);

      expect(result.recurring_bookings).toBe(true);
      expect(result.coupons).toBe(true);
      expect(result.advanced_reports).toBe(false); // unchanged
    });

    it('overrides numeric values from raw', () => {
      const raw = { maxBranches: 3, maxEmployees: 10 };
      const result = hydrateLimits(raw);

      expect(result.maxBranches).toBe(3);
      expect(result.maxEmployees).toBe(10);
    });

    it('preserves DEFAULT_PLAN_LIMITS for missing keys', () => {
      const raw = { maxBranches: 99 };
      const result = hydrateLimits(raw);

      expect(result.maxEmployees).toBe(DEFAULT_PLAN_LIMITS.maxEmployees);
      expect(result.maxServices).toBe(DEFAULT_PLAN_LIMITS.maxServices);
    });

    it('drops unknown keys and warns via console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const raw = { maxBranches: 5, totallyUnknownField: 'oops', anotherBadKey: 123 };

      hydrateLimits(raw);

      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('totallyUnknownField'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('anotherBadKey'),
      );
      warnSpy.mockRestore();
    });

    it('does not warn for known keys', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const raw = { maxBranches: 5, recurring_bookings: true };

      hydrateLimits(raw);

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('does NOT coerce boolean into number or vice versa', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const raw = {
        maxBranches: true as unknown as number,
        recurring_bookings: 1 as unknown as boolean,
      };

      const result = hydrateLimits(raw);

      expect(result.maxBranches).toBe(DEFAULT_PLAN_LIMITS.maxBranches);
      expect(result.recurring_bookings).toBe(DEFAULT_PLAN_LIMITS.recurring_bookings);
      warnSpy.mockRestore();
    });

    it('handles partial raw with mixed types', () => {
      const raw = {
        recurring_bookings: true,
        maxBranches: 10,
        email_fallback_monthly: 1000,
        sms_fallback_monthly: 200,
      };

      const result = hydrateLimits(raw);

      expect(result.recurring_bookings).toBe(true);
      expect(result.maxBranches).toBe(10);
      expect(result.email_fallback_monthly).toBe(1000);
      expect(result.sms_fallback_monthly).toBe(200);
    });
  });

  describe('mergeLimits', () => {
    it('returns empty object when both args are undefined', () => {
      expect(mergeLimits(undefined, undefined as unknown as PlanLimits)).toEqual({});
    });

    it('returns raw when edited is undefined', () => {
      const raw = { maxBranches: 5, recurring_bookings: true };
      expect(mergeLimits(raw, undefined as unknown as PlanLimits)).toEqual(raw);
    });

    it('returns edited PlanLimits when raw is undefined', () => {
      const edited = { ...DEFAULT_PLAN_LIMITS, maxBranches: 99 };
      expect(mergeLimits(undefined, edited)).toEqual(edited);
    });

    it('edited values override raw values', () => {
      const raw = { maxBranches: 5, maxEmployees: 10 };
      const edited = { ...DEFAULT_PLAN_LIMITS, maxBranches: 99 };

      const result = mergeLimits(raw, edited);

      expect(result.maxBranches).toBe(99); // edited wins
      expect(result.maxEmployees).toBe(5); // edited (DEFAULT_PLAN_LIMITS) wins over raw
    });

    it('returns a new object (does not mutate inputs)', () => {
      const raw = { maxBranches: 5 };
      const edited = { ...DEFAULT_PLAN_LIMITS };
      const result = mergeLimits(raw, edited);

      expect(result).not.toBe(raw);
      expect(result).not.toBe(edited);
    });

    it('preserves all keys from raw that are not in edited', () => {
      const raw = { maxBranches: 5, customField: 'hello' } as Record<string, unknown>;
      const edited = { ...DEFAULT_PLAN_LIMITS, maxEmployees: 20 };

      const result = mergeLimits(raw, edited);

      expect(result.maxBranches).toBe(1); // edited default wins over raw
      expect(result.customField).toBe('hello'); // preserved from raw
    });
  });
});
