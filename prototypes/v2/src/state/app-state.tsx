import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { DEMO_PROFILE } from '@/data/demo-profile';
import { buildMockConversations } from '@/data/mock-conversations';
import type { BusinessProfile, Conversation } from '@/state/types';

// Prototype: everything lives in memory. The real app will load and save
// through the backend (Supabase), keeping this same context API.

export const EMPTY_PROFILE: BusinessProfile = {
  ownerPhone: '',
  ownerName: '',
  logoUri: null,
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
  whatsappPhone: '',
  announceAssistant: true,
};

type AppState = {
  profile: BusinessProfile;
  updateProfile: (patch: Partial<BusinessProfile>) => void;
  conversations: Conversation[];
  updateConversation: (id: string, update: (c: Conversation) => Conversation) => void;
  /** WhatsApp connected: the assistant starts answering (demo conversations appear). */
  goLive: (patch?: Partial<BusinessProfile>) => void;
  /** « J’ai déjà un compte » in the prototype: opens a ready-made shop. */
  loadDemo: (ownerPhone: string) => void;
  reset: () => void;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const updateProfile = useCallback((patch: Partial<BusinessProfile>) => {
    setProfile((p) => ({ ...p, ...patch }));
  }, []);

  const updateConversation = useCallback((id: string, update: (c: Conversation) => Conversation) => {
    setConversations((list) => list.map((c) => (c.id === id ? update(c) : c)));
  }, []);

  const goLive = useCallback(
    (patch: Partial<BusinessProfile> = {}) => {
      const live = { ...profile, ...patch, whatsappConnected: true };
      setProfile(live);
      setConversations(buildMockConversations(live));
    },
    [profile],
  );

  const loadDemo = useCallback((ownerPhone: string) => {
    const demo = { ...DEMO_PROFILE, ownerPhone: ownerPhone || DEMO_PROFILE.ownerPhone };
    setProfile(demo);
    setConversations(buildMockConversations(demo));
  }, []);

  const reset = useCallback(() => {
    setProfile(EMPTY_PROFILE);
    setConversations([]);
  }, []);

  const value = useMemo(
    () => ({ profile, updateProfile, conversations, updateConversation, goLive, loadDemo, reset }),
    [profile, updateProfile, conversations, updateConversation, goLive, loadDemo, reset],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
