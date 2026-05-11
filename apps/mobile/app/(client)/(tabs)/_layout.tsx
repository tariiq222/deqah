import React from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Calendar, FileText, Home, MessageCircle, type LucideIcon } from 'lucide-react-native';

import { Glass } from '@/theme';
import { sawaaTokens, sawaaColors } from '@/theme/sawaa/tokens';
import { useDir } from '@/hooks/useDir';
import { getFontName } from '@/theme/fonts';

export default function ClientTabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
      tabBar={(props) => <GlassTabBar {...props} />}
    >
      {/* In RTL with row-reverse, routes[0] renders at the right edge. */}
      <Tabs.Screen name="home" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="chat" options={{ title: t('tabs.assistant') }} />
      <Tabs.Screen name="records" options={{ title: t('tabs.records') }} />
      <Tabs.Screen name="appointments" options={{ title: t('tabs.sessions') }} />
      {/* Hidden — still routable, absent from the bar. */}
      <Tabs.Screen name="notifications" options={{ title: t('tabs.notifications'), href: null }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), href: null }} />
    </Tabs>
  );
}

type TabBarProps = BottomTabBarProps;

function GlassTabBar({ state, descriptors, navigation }: TabBarProps) {
  const dir = useDir();
  const insets = useSafeAreaInsets();
  const isChat = state.routes[state.index]?.name === 'chat';

  return (
    <Glass
      variant="strong"
      radius={sawaaTokens.radius.pill}
      style={[
        styles.tabBar,
        { bottom: insets.bottom + 14, left: 14, right: 14 },
        isChat && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.tabBarInner, { flexDirection: dir.row }]}>
        {state.routes.map((route, index) => {
          if (!VISIBLE_TABS.has(route.name)) return null;
          const descriptor = descriptors[route.key];
          if (!descriptor) return null;
          const label = descriptor.options.title ?? route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              label={label}
              routeName={route.name}
              focused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </Glass>
  );
}

function TabItem({
  label,
  routeName,
  focused,
  onPress,
}: {
  label: string;
  routeName: string;
  focused: boolean;
  onPress: () => void;
}) {
  const dir = useDir();
  const f600 = getFontName(dir.locale, '600');
  const f700 = getFontName(dir.locale, '700');
  const color = focused ? sawaaColors.teal[700] : sawaaColors.ink[700];
  const Icon = getIcon(routeName);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={styles.tabItem}
    >
      <View style={styles.tabItemInner}>
        {focused ? <View style={styles.activePill} pointerEvents="none" /> : null}
        <View style={styles.iconRow}>
          <Icon size={22} color={color} strokeWidth={1.7} />
        </View>
        <Text
          style={[
            styles.label,
            { fontFamily: focused ? f700 : f600, color },
            { textAlign: dir.textAlign, writingDirection: dir.writingDirection },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const VISIBLE_TABS = new Set(['home', 'chat', 'records', 'appointments']);

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  chat: MessageCircle,
  records: FileText,
  appointments: Calendar,
};

function getIcon(routeName: string) {
  return ICONS[routeName] ?? Home;
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tabBarInner: {
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tabItemInner: {
    alignItems: 'center',
    gap: 3,
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -10,
    right: -10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  iconRow: {
    width: 32,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10.5,
  },
});
