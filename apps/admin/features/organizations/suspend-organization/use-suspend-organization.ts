import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { suspendOrganization } from './suspend-organization.api';
import { organizationDetailKey } from '../get-organization/use-get-organization';
import { withSentryMutation } from '@/lib/sentry-mutation';

export function useSuspendOrganization(organizationId: string) {
  const qc = useQueryClient();
  return useMutation(withSentryMutation({
    context: 'admin:organization:suspend',
    mutationFn: () => suspendOrganization({ organizationId }),
    onSuccess: () => {
      toast.success('Organization suspended.');
      void qc.invalidateQueries({ queryKey: organizationDetailKey(organizationId) });
      void qc.invalidateQueries({ queryKey: ['organizations', 'list'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Suspend failed');
    },
  }));
}
