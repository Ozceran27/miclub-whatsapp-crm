import { useEffect, useRef, type ReactNode } from 'react';
import { useSession } from '../session';
import { queryClient } from './client';

export function TenantCacheBoundary({ children }: { children: ReactNode }) {
  const { clubId } = useSession();
  const previous = useRef(clubId);
  useEffect(() => {
    if (previous.current !== clubId) queryClient.removeClub(previous.current);
    previous.current = clubId;
  }, [clubId]);
  return children;
}
