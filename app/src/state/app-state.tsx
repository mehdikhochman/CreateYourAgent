import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { buildMockConversations } from '@/data/mock-conversations';
import type { BusinessProfile, Conversation } from '@/state/types';

// Prototype: everything lives in memory. The real app will load and save
// through the backend (Supabase), keeping this same context API.

export const EMPTY_PROFILE: BusinessProfile = {
  ownerPhone: '',
  category: null,
  name: '',
  location: '',
  hours: '',
  deliveryFee: '',
  tiktok: '',
  instagram: '',
  facebook: '',
  salesChannels: [],
  serviceModes: [],
  deliveryZones: [],
  payments: [],
  tone: ['amical'],
  catalog: [],
  faqs: [],
  whatsappConnected: false,
};

type AppState = {
  profile: BusinessProfile;
  updateProfile: (patch: Partial<BusinessProfile>) => void;
  conversations: Conversation[];
  updateConversation: (id: string, update: (c: Conversation) => Conversation) => void;
  goLive: () => void;
  reset: () => void;
  /** Short confirmation shown once on the next screen (e.g. « Adresse mise à jour »). */
  flash: string | null;
  setFlash: (message: string | null) => void;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  const updateProfile = useCallback((patch: Partial<BusinessProfile>) => {
    setProfile((p) => ({ ...p, ...patch }));
  }, []);

  const updateConversation = useCallback(
    (id: string, update: (c: Conversation) => Conversation) => {
      setConversations((list) => list.map((c) => (c.id === id ? update(c) : c)));
    },
    [],
  );

  const goLive = useCallback(() => {
    const live = { ...profile, whatsappConnected: true };
    setProfile(live);
    setConversations(buildMockConversations(live));
  }, [profile]);

  const reset = useCallback(() => {
    setProfile(EMPTY_PROFILE);
    setConversations([]);
  }, []);

  const value = useMemo(
    () => ({ profile, updateProfile, conversations, updateConversation, goLive, reset, flash, setFlash }),
    [profile, updateProfile, conversations, updateConversation, goLive, reset, flash],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
