import React, { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Heart,
  Leaf,
  Lock,
  Moon,
  Phone as PhoneIcon,
  Settings,
} from 'lucide-react-native';

import { AquaBackground, sawaaColors, sawaaRadius } from '@/theme/sawaa';
import { Glass } from '@/theme/components/Glass';
import { useDir } from '@/hooks/useDir';
import { useAppSelector, useAppDispatch } from '@/hooks/use-redux';
import { logout } from '@/stores/slices/auth-slice';
import { unregisterPushAsync } from '@/services/push';
import { getFontName } from '@/theme/fonts';
import { useSummary } from '@/hooks/queries';
import { PRIVACY_POLICY_URL } from '@/constants/config';

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatLastVisit(iso: string | null, isRTL: boolean): string {
  if (!iso) return isRTL ? '—' : '—';
  const d = new Date(iso);
  const month = isRTL ? MONTHS_AR[d.getMonth()] : MONTHS_EN[d.getMonth()];
  const day = isRTL ? d.getDate().toLocaleString('ar-SA') : d.getDate();
  return `${day} ${month}`;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const dir = useDir();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const f400 = getFontName(dir.locale, '400');
  const f600 = getFontName(dir.locale, '600');
  const f700 = getFontName(dir.locale, '700');
  const [darkMode, setDarkMode] = useState(false);
  const summaryQuery = useSummary();
  const summary = summaryQuery.data ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const Chevron = dir.isRTL ? ChevronLeft : ChevronRight;

  const displayName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
    : '—';
  const email = user?.email ?? '';
  const initial = (user?.firstName ?? '·').charAt(0);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await summaryQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const stats: Array<{ value: string; ar: string; en: string }> = [
    {
      value: summary
        ? (dir.isRTL ? summary.totalBookings.toLocaleString('ar-SA') : String(summary.totalBookings))
        : '—',
      ar: 'جلسة',
      en: 'Sessions',
    },
    {
      value: summary ? formatLastVisit(summary.lastVisit, dir.isRTL) : '—',
      ar: 'آخر زيارة',
      en: 'Last visit',
    },
    {
      value: summary
        ? `${summary.outstandingBalance.toLocaleString(dir.isRTL ? 'ar-SA' : 'en-US')} ⃁`
        : '—',
      ar: 'مبلغ مستحق',
      en: 'Outstanding',
    },
  ];

  type SettingItem = {
    icon: React.ReactNode;
    label: { ar: string; en: string };
    color: string;
    meta?: { ar: string; en: string };
    toggle?: boolean;
    onToggle?: () => void;
    onPress?: () => void;
  };

  const settingsItems: SettingItem[] = [
    { icon: <Lock size={18} color={sawaaColors.teal[600]} strokeWidth={1.75} />, label: { ar: 'الخصوصية والأمان', en: 'Privacy & Security' }, color: sawaaColors.teal[600], onPress: () => Linking.openURL(PRIVACY_POLICY_URL) },
    { icon: <Bell size={18} color={sawaaColors.accent.violet} strokeWidth={1.75} />, label: { ar: 'الإشعارات', en: 'Notifications' }, color: sawaaColors.accent.violet, meta: { ar: 'مفعّلة', en: 'On' } },
    { icon: <Moon size={18} color={sawaaColors.ink[700]} strokeWidth={1.75} />, label: { ar: 'الوضع الليلي', en: 'Dark mode' }, color: sawaaColors.ink[700], toggle: darkMode, onToggle: () => setDarkMode((v) => !v) },
    { icon: <Heart size={18} color={sawaaColors.accent.rose} strokeWidth={1.75} />, label: { ar: 'الصحة النفسية', en: 'Wellness' }, color: sawaaColors.accent.rose },
    { icon: <Settings size={18} color={sawaaColors.ink[500]} strokeWidth={1.75} />, label: { ar: 'الإعدادات العامة', en: 'General' }, color: sawaaColors.ink[500], onPress: () => router.push('/(client)/settings') },
  ];

  return (
    <AquaBackground>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 140 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={sawaaColors.teal[600]} />}
      >
        <Animated.View entering={FadeInDown.duration(600).easing(Easing.out(Easing.cubic))}>
          <Text style={[styles.pageTitle, { fontFamily: f700, textAlign: dir.textAlign }]}>
            {dir.isRTL ? 'حسابي' : 'My Account'}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(700).easing(Easing.out(Easing.cubic))}>
          <Glass variant="strong" radius={sawaaRadius.xl} style={styles.profileCard}>
            <View style={[styles.profileRow, { flexDirection: dir.row }]}>
              <LinearGradient
                colors={[sawaaColors.teal[400], sawaaColors.teal[700]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={[styles.avatarText, { fontFamily: f700 }]}>{initial}</Text>
              </LinearGradient>
              <View style={styles.profileMid}>
                <Text style={[styles.profileName, { fontFamily: f700, textAlign: dir.textAlign }]}>
                  {displayName}
                </Text>
                <Text style={[styles.profileEmail, { fontFamily: f400, textAlign: dir.textAlign }]}>
                  {email}
                </Text>
                {summary && summary.totalBookings > 0 ? (
                  <View style={[styles.membership, { flexDirection: dir.row }]}>
                    <Leaf size={11} color={sawaaColors.teal[700]} strokeWidth={2} />
                    <Text style={[styles.membershipText, { fontFamily: f600 }]}>
                      {dir.isRTL
                        ? `${summary.totalBookings.toLocaleString('ar-SA')} جلسة سابقة`
                        : `${summary.totalBookings} past session${summary.totalBookings === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Glass variant="regular" radius={14} onPress={() => router.push('/(client)/settings')} interactive style={styles.editBtn}>
                <Text style={[styles.editText, { fontFamily: f600 }]}>
                  {dir.isRTL ? 'تعديل' : 'Edit'}
                </Text>
              </Glass>
            </View>

            <View style={[styles.statsRow, { flexDirection: dir.row }]}>
              {stats.map((s) => (
                <View key={s.en} style={styles.statBox}>
                  <Text style={[styles.statN, { fontFamily: f700 }]} numberOfLines={1}>
                    {s.value}
                  </Text>
                  <Text style={[styles.statL, { fontFamily: f400 }]}>
                    {dir.isRTL ? s.ar : s.en}
                  </Text>
                </View>
              ))}
            </View>
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(700).easing(Easing.out(Easing.cubic))}>
          <Glass variant="strong" radius={sawaaRadius.xl} style={styles.settingsCard}>
            {settingsItems.map((it, i) => (
              <Pressable
                key={it.label.en}
                onPress={it.onToggle ?? it.onPress}
                style={[
                  styles.settingRow,
                  { flexDirection: dir.row },
                  i < settingsItems.length - 1 && styles.settingDivider,
                ]}
              >
                <View style={[styles.settingIcon, { backgroundColor: `${it.color}1e` }]}>
                  {it.icon}
                </View>
                <Text style={[styles.settingLabel, { fontFamily: f600, textAlign: dir.textAlign }]}>
                  {dir.isRTL ? it.label.ar : it.label.en}
                </Text>
                {it.meta && (
                  <Text style={[styles.settingMeta, { fontFamily: f400 }]}>
                    {dir.isRTL ? it.meta.ar : it.meta.en}
                  </Text>
                )}
                {it.toggle !== undefined ? (
                  <View style={[
                    styles.toggle,
                    { backgroundColor: it.toggle ? sawaaColors.teal[500] : 'rgba(10,40,40,0.15)' },
                  ]}>
                    <View style={[
                      styles.toggleKnob,
                      it.toggle ? styles.toggleKnobOn : styles.toggleKnobOff,
                    ]} />
                  </View>
                ) : (
                  <Chevron size={14} color={sawaaColors.ink[400]} strokeWidth={2} />
                )}
              </Pressable>
            ))}
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(340).duration(700).easing(Easing.out(Easing.cubic))}>
          <Glass variant="strong" radius={sawaaRadius.xl} style={styles.sosCard}>
            <View style={[styles.sosRow, { flexDirection: dir.row }]}>
              <View style={styles.sosIcon}>
                <PhoneIcon size={16} color="#fff" strokeWidth={2} />
              </View>
              <View style={styles.sosMid}>
                <Text style={[styles.sosTitle, { fontFamily: f700, textAlign: dir.textAlign }]}>
                  {dir.isRTL ? 'دعم الأزمات · ٢٤/٧' : 'Crisis support · 24/7'}
                </Text>
                <Text style={[styles.sosSub, { fontFamily: f400, textAlign: dir.textAlign }]}>
                  {dir.isRTL ? 'اتصال فوري بمختص' : 'Instant expert call'}
                </Text>
              </View>
              <Text style={[styles.sosPhone, { fontFamily: f700 }]}>920 00 00</Text>
            </View>
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(420).duration(700).easing(Easing.out(Easing.cubic))}>
          <Glass variant="regular" radius={sawaaRadius.pill} onPress={async () => {
            try { await unregisterPushAsync(); } catch { /* best-effort */ }
            dispatch(logout());
          }} interactive style={styles.logoutBtn}>
            <Text style={[styles.logoutText, { fontFamily: f700 }]}>
              {dir.isRTL ? 'تسجيل الخروج' : 'Sign out'}
            </Text>
          </Glass>
        </Animated.View>
      </ScrollView>
    </AquaBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 14 },
  pageTitle: { fontSize: 22, color: sawaaColors.ink[900], paddingHorizontal: 4 },
  profileCard: { padding: 18 },
  profileRow: { alignItems: 'center', gap: 14 },
  avatar: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: sawaaColors.teal[600], shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
  },
  avatarText: { fontSize: 26, color: '#fff' },
  profileMid: { flex: 1 },
  profileName: { fontSize: 17, color: sawaaColors.ink[900] },
  profileEmail: { fontSize: 12, color: sawaaColors.ink[500], marginTop: 2 },
  membership: { alignItems: 'center', gap: 4, marginTop: 6 },
  membershipText: { fontSize: 11, color: sawaaColors.teal[700] },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  editText: { fontSize: 11.5, color: sawaaColors.teal[700] },
  statsRow: { marginTop: 16, gap: 8 },
  statBox: {
    flex: 1, paddingVertical: 10, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
  },
  statN: { fontSize: 18, color: sawaaColors.teal[700] },
  statL: { fontSize: 10.5, color: sawaaColors.ink[500], marginTop: 2 },
  settingsCard: { padding: 0 },
  settingRow: { alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  settingDivider: { borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.5)' },
  settingIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { flex: 1, fontSize: 13.5, color: sawaaColors.ink[900] },
  settingMeta: { fontSize: 11, color: sawaaColors.ink[500] },
  toggle: { width: 38, height: 22, borderRadius: 12, padding: 2, justifyContent: 'center' },
  toggleKnob: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  toggleKnobOn: { alignSelf: 'flex-end' },
  toggleKnobOff: { alignSelf: 'flex-start' },
  sosCard: { padding: 14, backgroundColor: 'rgba(239, 122, 107, 0.15)' },
  sosRow: { alignItems: 'center', gap: 12 },
  sosIcon: {
    width: 36, height: 36, borderRadius: 999,
    backgroundColor: sawaaColors.accent.coral,
    alignItems: 'center', justifyContent: 'center',
  },
  sosMid: { flex: 1 },
  sosTitle: { fontSize: 13.5, color: sawaaColors.ink[900] },
  sosSub: { fontSize: 11, color: sawaaColors.ink[500], marginTop: 2 },
  sosPhone: { fontSize: 12, color: sawaaColors.accent.coral },
  logoutBtn: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  logoutText: { fontSize: 14, color: sawaaColors.accent.coral },
});
