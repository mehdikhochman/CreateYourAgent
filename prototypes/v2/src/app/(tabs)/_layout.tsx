import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { House, MessageCircle, Sparkles, User, type LucideIcon } from '@/components/icons';
import type { ColorValue } from 'react-native';

import { Colors, Font } from '@/constants/theme';
import { useAppState } from '@/state/app-state';

function tabIcon(Icon: LucideIcon) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon size={26} color={color as string} strokeWidth={focused ? 2.4 : 2} />;
  };
}

// Created once at module level so the icons are stable components.
const ICONS = { home: tabIcon(House), conversations: tabIcon(MessageCircle), assistant: tabIcon(Sparkles), account: tabIcon(User) };

/** The four tabs once the assistant is live: Accueil · Conversations · Assistant · Compte. */
export default function TabsLayout() {
  const { profile, conversations } = useAppState();
  // Opening a tab link directly (web) before any setup: start at the welcome screen.
  if (!profile.category) return <Redirect href="/" />;

  const toHandle = conversations.filter((c) => c.needsAttention).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.muted,
        tabBarLabelStyle: { fontFamily: Font.bold, fontSize: 12 },
        tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: '#EBEBEE', minHeight: 64 },
        tabBarItemStyle: { paddingTop: 6 },
        tabBarBadgeStyle: { backgroundColor: Colors.primary, color: Colors.onPrimary, fontFamily: Font.extrabold, fontSize: 11 },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Accueil', tabBarIcon: ICONS.home }} />
      <Tabs.Screen
        name="conversations"
        options={{ title: 'Conversations', tabBarIcon: ICONS.conversations, tabBarBadge: toHandle || undefined }}
      />
      <Tabs.Screen name="assistant" options={{ title: 'Assistant', tabBarIcon: ICONS.assistant }} />
      <Tabs.Screen name="account" options={{ title: 'Compte', tabBarIcon: ICONS.account }} />
    </Tabs>
  );
}
