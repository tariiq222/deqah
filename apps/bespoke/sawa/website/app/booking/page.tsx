'use client';

import { useReducer, useState, useEffect } from 'react';
import { reduce, INITIAL_WIZARD_STATE, WizardStep } from '@deqah/shared';
import type { Service, EmployeeWithUser, AvailableSlot } from '@deqah/shared';
import { ServicePicker } from '@/features/booking/service-picker';
import { TherapistPicker } from '@/features/booking/therapist-picker';
import { SlotPicker } from '@/features/booking/slot-picker';
import { BookingSummary } from '@/features/booking/booking-summary';
import { BranchStep } from '@/features/booking/branch-step';
import { ClientInfoStep } from '@/features/booking/client-info-step';
import { useOtpSession } from '@/features/otp/use-otp-session';
import { publicFetch } from '@/lib/public-fetch';
import {
  getPublicAvailability,
  getPublicBranches,
  createGuestBooking,
  initGuestPayment,
  type PublicBranch,
} from '@/features/booking/booking.api';
import { PaymentRedirect } from '@/features/payment/payment-redirect';

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={`progress-${i}`}
          style={{
            flex: 1,
            height: '4px',
            borderRadius: '2px',
            background:
              i <= current
                ? 'var(--primary)'
                : 'color-mix(in srgb, var(--primary) 15%, transparent)',
          }}
        />
      ))}
    </div>
  );
}

export default function BookingWizardPage() {
  const [state, dispatch] = useReducer(reduce, INITIAL_WIZARD_STATE);
  // Whether we are on the intermediate branch-selection step (between THERAPIST and SLOT).
  const [awaitingBranch, setAwaitingBranch] = useState(false);
  const [pendingEmployee, setPendingEmployee] = useState<EmployeeWithUser | null>(null);

  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithUser[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [branches, setBranches] = useState<PublicBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<PublicBranch | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const { token } = useOtpSession();

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    publicFetch<{ data?: EmployeeWithUser[] } | EmployeeWithUser[]>('/public/employees')
      .then((json) => {
        const list = Array.isArray(json) ? json : (json.data ?? []);
        setEmployees(list);
      })
      .catch((err) => {
        console.error('Failed to load employees', err);
        setLoadError('Failed to load therapists. Please try again later.');
      });
    publicFetch<{ data?: { services: Service[] } } | { services: Service[] }>('/public/services')
      .then((json) => {
        const payload = 'data' in json && json.data ? json.data : (json as { services: Service[] });
        setServices(payload.services ?? []);
      })
      .catch((err) => {
        console.error('Failed to load catalog', err);
        setLoadError('Failed to load services. Please try again later.');
      });
    getPublicBranches().then((bs) => {
      setBranches(bs);
      if (bs.length === 1) setSelectedBranch(bs[0]);
    });
  }, []);

  const service =
    state.step === WizardStep.THERAPIST ||
    state.step === WizardStep.SLOT ||
    state.step === WizardStep.INFO_OTP ||
    state.step === WizardStep.PAYMENT
      ? state.service
      : null;
  const employee =
    state.step === WizardStep.SLOT ||
    state.step === WizardStep.INFO_OTP ||
    state.step === WizardStep.PAYMENT
      ? state.employee
      : null;
  const slot =
    state.step === WizardStep.INFO_OTP || state.step === WizardStep.PAYMENT
      ? state.slot
      : null;

  const hasBranchStep = branches.length > 1;
  const totalSteps = hasBranchStep ? 6 : 5;

  const stepIndex = (() => {
    if (awaitingBranch) return 2;
    switch (state.step) {
      case WizardStep.SERVICE: return 0;
      case WizardStep.THERAPIST: return 1;
      case WizardStep.SLOT: return hasBranchStep ? 3 : 2;
      case WizardStep.INFO_OTP: return hasBranchStep ? 4 : 3;
      case WizardStep.PAYMENT: return hasBranchStep ? 5 : 4;
      default: return totalSteps - 1;
    }
  })();

  const employeeId = employee?.id;
  const serviceId = service?.id;

  useEffect(() => {
    if (state.step !== WizardStep.SLOT || !employeeId) {
      return;
    }

    let cancelled = false;
    void Promise.resolve().then(async () => {
      setLoadingSlots(true);
      try {
        const availableSlots = await getPublicAvailability(employeeId, selectedDate, serviceId);
        if (!cancelled) {
          setSlots(availableSlots);
        }
      } catch {
        if (!cancelled) {
          setSlots([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [state.step, employeeId, selectedDate, serviceId]);

  if (redirectUrl && bookingId) {
    return <PaymentRedirect redirectUrl={redirectUrl} bookingId={bookingId} />;
  }

  const handleEmployeeSelect = (emp: EmployeeWithUser) => {
    if (hasBranchStep) {
      setPendingEmployee(emp);
      setAwaitingBranch(true);
    } else {
      dispatch({ type: 'SELECT_EMPLOYEE', employee: emp });
    }
  };

  const handleBranchSelect = (branch: PublicBranch) => {
    setSelectedBranch(branch);
    setAwaitingBranch(false);
    dispatch({ type: 'SELECT_EMPLOYEE', employee: pendingEmployee! });
  };

  const backBtn = (onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
        borderRadius: 'var(--radius)',
        padding: '0.5rem 1rem',
        cursor: 'pointer',
        alignSelf: 'start',
      }}
    >
      Back
    </button>
  );

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem' }}>
      <ProgressBar current={stepIndex} total={totalSteps} />

      {(loadError || submitError) && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            background: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
            borderRadius: 'var(--radius)',
            color: 'var(--destructive)',
            fontSize: '0.875rem',
          }}
        >
          {loadError || submitError}
        </div>
      )}

      {state.step === WizardStep.SERVICE && (
        <ServicePicker
          services={services}
          selected={null}
          onSelect={(svc) => dispatch({ type: 'SELECT_SERVICE', service: svc })}
        />
      )}

      {state.step === WizardStep.THERAPIST && !awaitingBranch && service && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {backBtn(() => dispatch({ type: 'RESET' }))}
          <TherapistPicker therapists={employees} selected={null} onSelect={handleEmployeeSelect} />
        </div>
      )}

      {awaitingBranch && (
        <BranchStep
          branches={branches}
          onSelect={handleBranchSelect}
          onBack={() => {
            setAwaitingBranch(false);
            setPendingEmployee(null);
          }}
        />
      )}

      {state.step === WizardStep.SLOT && !awaitingBranch && service && employee && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {backBtn(() => {
            if (hasBranchStep) {
              setPendingEmployee(employee);
              setAwaitingBranch(true);
            } else {
              dispatch({ type: 'SELECT_EMPLOYEE', employee });
            }
          })}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              suppressHydrationWarning
              style={{
                padding: '0.5rem',
                border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                borderRadius: 'var(--radius)',
              }}
            />
          </div>
          <SlotPicker
            slots={slots}
            selected={null}
            onSelect={(s) => dispatch({ type: 'SELECT_SLOT', slot: s })}
            isLoading={loadingSlots}
          />
        </div>
      )}

      {state.step === WizardStep.INFO_OTP && service && employee && slot && (
        <ClientInfoStep
          slot={slot}
          onBack={() => dispatch({ type: 'SELECT_SLOT', slot })}
          onSubmitInfo={async (client) => {
            if (!token) return;
            setIsSubmitting(true);
            setSubmitError(null);
            try {
              const booking = await createGuestBooking(
                {
                  serviceId: service.id,
                  employeeId: employee.id,
                  branchId: selectedBranch?.id ?? '',
                  startsAt: slot.startTime,
                  client,
                },
                token,
              );
              const payment = await initGuestPayment(booking.bookingId, token);
              setBookingId(booking.bookingId);
              setRedirectUrl(payment.redirectUrl);
            } catch (err) {
              setSubmitError(err instanceof Error ? err.message : 'Booking failed');
            } finally {
              setIsSubmitting(false);
            }
          }}
          isSubmitting={isSubmitting}
        />
      )}

      {state.step === WizardStep.PAYMENT && service && employee && slot && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {backBtn(() => dispatch({ type: 'SELECT_SLOT', slot }))}
          <BookingSummary
            service={service}
            employee={employee}
            slot={slot}
            totalHalalat={Number(service.price)}
            onConfirm={() => {}}
            isSubmitting={false}
          />
        </div>
      )}

      {state.step === WizardStep.CONFIRMATION && (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          {state.status === 'success' ? (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
                Booking Confirmed!
              </h2>
              <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
                You will receive a confirmation email shortly.
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
                Payment Failed
              </h2>
              <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
                Your booking was not confirmed. Please try again.
              </p>
            </>
          )}
          <button
            onClick={() => dispatch({ type: 'RESET' })}
            style={{
              padding: '0.875rem 2rem',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {state.status === 'success' ? 'Book Another' : 'Try Again'}
          </button>
        </div>
      )}
    </div>
  );
}
