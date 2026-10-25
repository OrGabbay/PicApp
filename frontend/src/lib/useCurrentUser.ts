'use client';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '@/src/lib/api';
import type { CurrentUser } from '@/src/types/api';

/**
 * Returns the logged-in user: `undefined` while checking, `null` for guests.
 */
export function useCurrentUser(): CurrentUser | null | undefined {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null));
    return () => {
      active = false;
    };
  }, []);

  return user;
}
