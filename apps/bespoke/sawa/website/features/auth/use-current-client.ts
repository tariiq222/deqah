'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ClientProfile } from '@deqah/shared';
import { getClient, setClient } from './auth-store';
import { getMeApi } from './auth.api';

export interface UseCurrentClientResult {
  client: ClientProfile | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCurrentClient(): UseCurrentClientResult {
  const [client, setClientState] = useState<ClientProfile | null>(getClient());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = await getMeApi();
      setClient(profile);
      setClientState(profile);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load profile';
      setError(message);
      setClient(null);
      setClientState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getClient() === null) {
      void Promise.resolve().then(refetch);
    }
  }, [refetch]);

  return { client, isLoading, error, refetch };
}
