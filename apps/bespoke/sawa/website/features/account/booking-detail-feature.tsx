'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/features/locale/locale';
import { t } from '@/features/locale/dictionary';
import { useCurrentClient } from '@/features/auth/public';
import type { ClientBookingItem } from '@deqah/shared';
import { getMyBookingsApi, cancelMyBookingApi, rescheduleMyBookingApi } from '@/features/auth/auth.api';

interface BookingDetailFeatureProps {
  bookingId: string;
  locale: Locale;
}

export function BookingDetailFeature({ bookingId, locale }: BookingDetailFeatureProps) {
  const { client } = useCurrentClient();
  const router = useRouter();
  const [booking, setBooking] = useState<ClientBookingItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);

  useEffect(() => {
    if (!client) return;
    getMyBookingsApi(1, 50)
      .then((result) => setBooking(result.items.find((b) => b.id === bookingId) ?? null))
      .catch(() => setBooking(null))
      .finally(() => setIsLoading(false));
  }, [client, bookingId]);

  if (isLoading) return <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.6 }}>Loading...</div>;
  if (!booking) return <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.6 }}>Booking not found.</div>;

  const scheduledAt = new Date(booking.scheduledAt);
  const dateStr = scheduledAt.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = scheduledAt.toLocaleTimeString(locale === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const statusKey = `booking.status.${booking.status.toLowerCase()}`;
  const canAct = booking.status === 'PENDING' || booking.status === 'CONFIRMED';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <DetailCard booking={booking} dateStr={dateStr} timeStr={timeStr} statusKey={statusKey} locale={locale} />

      {canAct && (
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => setShowReschedule(true)} style={primaryButtonStyle()}>{t(locale, 'booking.reschedule')}</button>
          <button onClick={() => setShowCancel(true)} style={destructiveButtonStyle()}>{t(locale, 'booking.cancel')}</button>
        </div>
      )}

      {showCancel && (
        <CancelModal
          locale={locale}
          onClose={() => setShowCancel(false)}
          onSuccess={(status) => { setShowCancel(false); router.refresh(); }}
          cancelApi={(reason) => cancelMyBookingApi(bookingId, reason)}
        />
      )}

      {showReschedule && (
        <RescheduleModal
          booking={booking}
          locale={locale}
          onClose={() => setShowReschedule(false)}
          onSuccess={() => { setShowReschedule(false); router.refresh(); }}
          rescheduleApi={(newScheduledAt) => rescheduleMyBookingApi(bookingId, newScheduledAt)}
        />
      )}
    </div>
  );
}

function DetailCard({ booking, dateStr, timeStr, statusKey, locale }: {
  booking: ClientBookingItem; dateStr: string; timeStr: string; statusKey: string; locale: Locale
}) {
  return (
    <div style={{ padding: '1.5rem', borderRadius: '12px', background: 'color-mix(in srgb, var(--surface) 60%, transparent)', backdropFilter: 'blur(12px)', border: '1px solid color-mix(in srgb, var(--primary) 12%, transparent)' }}>
      <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--primary-dark)' }}>{booking.serviceName}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9375rem' }}>
        <DetailRow label="Date" value={dateStr} />
        <DetailRow label="Time" value={`${timeStr} (${booking.durationMins} min)`} />
        <DetailRow label="Therapist" value={booking.employeeName} />
        <DetailRow label="Branch" value={booking.branchName} />
        <DetailRow label="Price" value={`${booking.currency} ${booking.price}`} />
        <DetailRow label="Status" value={t(locale, statusKey as never) ?? booking.status} />
        <DetailRow label="Payment" value={booking.paymentStatus} />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ opacity: 0.7 }}>{label}</span><span style={{ fontWeight: 500 }}>{value}</span></div>;
}

function CancelModal({ locale, onClose, onSuccess, cancelApi }: {
  locale: Locale; onClose: () => void;
  onSuccess: (status: 'CANCELLED' | 'CANCEL_REQUESTED') => void;
  cancelApi: (reason?: string) => Promise<{ status: string; requiresApproval: boolean }>;
}) {
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsLoading(true); setError(null);
    try {
      const result = await cancelApi(reason || undefined);
      onSuccess(result.status === 'CANCELLED' ? 'CANCELLED' : 'CANCEL_REQUESTED');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={overlayStyle()}>
      <div style={modalStyle()}>
        <h3 style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--error)' }}>{t(locale, 'booking.cancel')}</h3>
        <p style={{ fontSize: '0.9375rem', opacity: 0.85 }}>{t(locale, 'booking.cancelConfirm')}</p>
        {error && <div style={errorStyle()}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onClose} style={secondaryButtonStyle()} disabled={isLoading}>Back</button>
          <button onClick={handleConfirm} style={destructiveButtonStyle()} disabled={isLoading}>
            {isLoading ? 'Cancelling...' : t(locale, 'booking.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function RescheduleModal({ booking, locale, onClose, onSuccess, rescheduleApi }: {
  booking: ClientBookingItem; locale: Locale; onClose: () => void;
  onSuccess: () => void;
  rescheduleApi: (newScheduledAt: string) => Promise<{ booking: unknown }>;
}) {
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!newDate || !newTime) return;
    setIsLoading(true); setError(null);
    try {
      await rescheduleApi(new Date(`${newDate}T${newTime}`).toISOString());
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reschedule failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={overlayStyle()}>
      <div style={modalStyle()}>
        <h3 style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--primary)' }}>{t(locale, 'booking.reschedule')}</h3>
        <p style={{ fontSize: '0.9375rem', opacity: 0.85 }}>Select a new date and time for {booking.serviceName}.</p>
        {error && <div style={errorStyle()}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.375rem' }}>New Date</label>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} min={new Date().toISOString().split('T')[0]} style={inputStyle()} suppressHydrationWarning />
          </div>
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.375rem' }}>New Time</label>
            <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={inputStyle()} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onClose} style={secondaryButtonStyle()} disabled={isLoading}>Cancel</button>
          <button onClick={handleConfirm} style={primaryButtonStyle()} disabled={isLoading || !newDate || !newTime}>
            {isLoading ? 'Rescheduling...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

function overlayStyle(): React.CSSProperties {
  return {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem',
  };
}

function modalStyle(): React.CSSProperties {
  return {
    background: 'var(--background)', borderRadius: '16px', padding: '1.75rem', maxWidth: 400, width: '100%',
    display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  };
}

function errorStyle(): React.CSSProperties {
  return { padding: '0.75rem', background: 'color-mix(in srgb, var(--error) 10%, transparent)', borderRadius: '8px', color: 'var(--error)', fontSize: '0.875rem' };
}

function inputStyle(): React.CSSProperties {
  return {
    padding: '0.75rem 1rem', borderRadius: '8px',
    border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
    background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
    fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box', color: 'var(--foreground)',
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return { flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--muted)', color: 'var(--muted-foreground)', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.9375rem' };
}

function primaryButtonStyle(): React.CSSProperties {
  return { flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--primary)', color: 'var(--on-primary)', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.9375rem' };
}

function destructiveButtonStyle(): React.CSSProperties {
  return { flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--error)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.9375rem' };
}
