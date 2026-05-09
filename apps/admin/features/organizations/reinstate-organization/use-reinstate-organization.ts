import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { reinstateOrganization } from './reinstate-organization.api';
import { organizationDetailKey } from '../get-organization/use-get-organization';
import { withSentryMutation } from '@/lib/sentry-mutation';

export function useReinstateOrganization(organizationId: string) {
  const qc = useQueryClient();
  return useMutation(withSentryMutation({
    context: 'admin:organization:reinstate',
    mutationFn: () => reinstateOrganization({ organizationId }),
    onSuccess: () => {
      toast.success('Organization reinstated.');
      void qc.invalidateQueries({ queryKey: organizationDetailKey(organizationId) });
      void qc.invalidateQueries({ queryKey: ['organizations', 'list'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Reinstate failed');
    },
  }));
}
