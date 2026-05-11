import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Calendar, ChevronLeft, ChevronRight, Clock, Video } from 'lucide-react-native';

import { AquaBackground, sawaaColors, sawaaRadius } from '@/theme/sawaa';
import { Glass } from '@/theme/components/Glass';
import { useDir } from '@/hooks/useDir';
import { getFontName } from '@/theme/fonts';
import {
  publicCatalogService,
  type PublicService,
} from '@/services/client/catalog';

const VAT_RATE = 0.15;

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTime(d: Date, isRTL: boolean): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h < 12 ? (isRTL ? 'ص' : 'AM') : (isRTL ? 'م' : 'PM');
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatDate(d: Date, isRTL: boolean): string {
  const month = isRTL ? MONTHS_AR[d.getMonth()] : MONTHS_EN[d.getMonth()];
  const day = isRTL ? d.getDate().toLocaleString('ar-SA') : d.getDate();
  const year = isRTL ? d.getFullYear().toLocaleString('ar-SA') : d.getFullYear();
  return isRTL ? `${day} ${month} ${year}` : `${month} ${day}, ${year}`;
}

export default function BookingConfirmScreen() {
  const { serviceId, employeeId, branchId, type, scheduledAt, durationOptionId } = useLocalSearchParams<{
    serviceId?: string;
    employeeId?: string;
    branchId?: string;
    type?: string;
    scheduledAt?: string;
    durationOptionId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dir = useDir();
  const f400 = getFontName(dir.locale, '400');
  const f500 = getFontName(dir.locale, '500');
  const f600 = getFontName(dir.locale, '600');
  const f700 = getFontName(dir.locale, '700');
  const BackIcon = dir.isRTL ? ChevronRight : ChevronLeft;
  const GoIcon = dir.isRTL ? ChevronLeft : ChevronRight;

  const [service, setService] = useState<PublicService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const departments = await publicCatalogService.listDepartments();
        if (cancelled) return;
        const found = departments
          .flatMap((d) => d.services)
          .find((s) => s.id === serviceId);
        setService(found ?? null);
        if (!found) setError(dir.isRTL ? 'الخدمة غير متوفرة' : 'Service unavailable');
      } catch {
        if (!cancelled) setError(dir.isRTL ? 'تعذّر تحميل الخدمة' : 'Failed to load service');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [serviceId, dir.isRTL]);

  const scheduledDate = useMemo(
    () => (scheduledAt ? new Date(scheduledAt) : null),
    [scheduledAt],
  );

  const isOnline = type === 'online';
  const kindAr = isOnline ? 'استشارة عن بُعد' : 'موعد عيادة';
  const kindEn = isOnline ? 'Remote consultation' : 'In-clinic visit';

  const subtotal = service ? Number(service.price) : 0;
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = subtotal + vat;
  const formatMoney = (n: number) =>
    `${n.toLocaleString(dir.isRTL ? 'ar-SA' : 'en-US')} ⃁`;

  const rows = [
    {
      icon: <Video size={18} color={sawaaColors.accent.violet} strokeWidth={1.75} />,
      labelAr: 'نوع الزيارة',
      labelEn: 'Visit type',
      valueAr: kindAr,
      valueEn: kindEn,
      color: sawaaColors.accent.violet,
    },
    {
      icon: <Calendar size={18} color={sawaaColors.teal[600]} strokeWidth={1.75} />,
      labelAr: 'التاريخ',
      labelEn: 'Date',
      valueAr: scheduledDate ? formatDate(scheduledDate, true) : '—',
      valueEn: scheduledDate ? formatDate(scheduledDate, false) : '—',
      color: sawaaColors.teal[600],
    },
    {
      icon: <Clock size={18} color={sawaaColors.accent.amber} strokeWidth={1.75} />,
      labelAr: 'الوقت',
      labelEn: 'Time',
      valueAr: scheduledDate ? formatTime(scheduledDate, true) : '—',
      valueEn: scheduledDate ? formatTime(scheduledDate, false) : '—',
      color: sawaaColors.accent.amber,
    },
  ];

  const handleConfirm = () => {
    if (!service || !scheduledAt || !branchId || !employeeId || !serviceId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push({
      pathname: '/(client)/booking/payment',
      params: {
        serviceId,
        employeeId,
        branchId,
        type,
        scheduledAt,
        durationOptionId,
        amount: String(total),
        currency: service?.currency,
      },
    });
  };

  const canContinue = service != null && scheduledDate != null && !!branchId;

  return (
    <AquaBackground>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(500)}>
          <View style={[styles.topRow, { flexDirection: dir.row }]}>
            <Glass variant="strong" radius={22} onPress={() => router.back()} interactive style={styles.backBtn}>
              <BackIcon size={22} color={sawaaColors.ink[700]} strokeWidth={1.75} />
            </Glass>
            <Text style={[styles.step, { fontFamily: f600 }]}>
              {dir.isRTL ? 'الخطوة ٣ من ٣' : 'Step 3 of 3'}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '100%' }]} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(600).easing(Easing.out(Easing.cubic))}>
          <Text style={[styles.title, { fontFamily: f700, textAlign: dir.textAlign }]}>
            {dir.isRTL ? 'تأكيد الحجز' : 'Confirm booking'}
          </Text>
          <Text style={[styles.subtitle, { fontFamily: f400, textAlign: dir.textAlign }]}>
            {dir.isRTL ? 'راجعي التفاصيل قبل التأكيد' : 'Review your details before confirming'}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(700).easing(Easing.out(Easing.cubic))}>
          <Glass variant="strong" radius={sawaaRadius.xl} style={styles.card}>
            {rows.map((r, i) => (
              <View
                key={r.labelEn}
                style={[
                  styles.row,
                  { flexDirection: dir.row },
                  i < rows.length - 1 && styles.rowDivider,
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: `${r.color}1e` }]}>{r.icon}</View>
                <View style={styles.rowMid}>
                  <Text style={[styles.rowLabel, { fontFamily: f400, textAlign: dir.textAlign }]}>
                    {dir.isRTL ? r.labelAr : r.labelEn}
                  </Text>
                  <Text style={[styles.rowValue, { fontFamily: f700, textAlign: dir.textAlign }]}>
                    {dir.isRTL ? r.valueAr : r.valueEn}
                  </Text>
                </View>
              </View>
            ))}
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(700).easing(Easing.out(Easing.cubic))}>
          <Glass variant="strong" radius={sawaaRadius.xl} style={styles.card}>
            {loading ? (
              <View style={styles.statusBlock}>
                <ActivityIndicator color={sawaaColors.teal[600]} />
              </View>
            ) : error ? (
              <View style={styles.statusBlock}>
                <Text style={[styles.statusText, { fontFamily: f500 }]}>{error}</Text>
              </View>
            ) : service ? (
              <>
                <View style={[styles.priceRow, { flexDirection: dir.row }]}>
                  <Text style={[styles.priceLabel, { fontFamily: f500 }]}>
                    {dir.isRTL ? service.nameAr : (service.nameEn ?? service.nameAr)}
                  </Text>
                  <Text style={[styles.priceValue, { fontFamily: f600 }]}>{formatMoney(subtotal)}</Text>
                </View>
                <View style={[styles.priceRow, { flexDirection: dir.row }]}>
                  <Text style={[styles.priceLabel, { fontFamily: f500 }]}>
                    {dir.isRTL ? 'ضريبة القيمة المضافة (١٥٪)' : 'VAT (15%)'}
                  </Text>
                  <Text style={[styles.priceValue, { fontFamily: f600 }]}>{formatMoney(vat)}</Text>
                </View>
                <View style={styles.priceDivider} />
                <View style={[styles.priceRow, { flexDirection: dir.row }]}>
                  <Text style={[styles.priceLabelBold, { fontFamily: f700 }]}>
                    {dir.isRTL ? 'الإجمالي' : 'Total'}
                  </Text>
                  <Text style={[styles.priceTotal, { fontFamily: f700 }]}>{formatMoney(total)}</Text>
                </View>
              </>
            ) : null}
          </Glass>
        </Animated.View>
      </ScrollView>

      <Animated.View
        entering={FadeInDown.delay(360).duration(800).easing(Easing.out(Easing.cubic))}
        style={[styles.ctaWrap, { bottom: insets.bottom + 20 }]}
      >
        <Pressable onPress={handleConfirm} disabled={!canContinue} style={styles.ctaBtnPress}>
          <LinearGradient
            colors={[sawaaColors.teal[500], sawaaColors.teal[700]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.ctaBtn, !canContinue && { opacity: 0.5 }]}
          >
            <Text style={[styles.ctaBtnText, { fontFamily: f700 }]}>
              {dir.isRTL ? 'متابعة الدفع' : 'Continue to payment'}
            </Text>
            <GoIcon size={16} color="#fff" strokeWidth={2} />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </AquaBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 14 },
  topRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  step: { fontSize: 12, color: sawaaColors.ink[500] },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.4)' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: sawaaColors.teal[600] },
  title: { fontSize: 24, color: sawaaColors.ink[900], marginTop: 8, paddingHorizontal: 4 },
  subtitle: { fontSize: 12.5, color: sawaaColors.ink[500], marginTop: 4, paddingHorizontal: 4 },
  card: { padding: 0 },
  row: { alignItems: 'center', gap: 14, padding: 14 },
  rowDivider: { borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.5)' },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowMid: { flex: 1 },
  rowLabel: { fontSize: 11, color: sawaaColors.ink[500] },
  rowValue: { fontSize: 13.5, color: sawaaColors.ink[900], marginTop: 2 },
  priceRow: { justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  priceLabel: { fontSize: 13, color: sawaaColors.ink[700] },
  priceLabelBold: { fontSize: 14, color: sawaaColors.ink[900] },
  priceValue: { fontSize: 13, color: sawaaColors.ink[900] },
  priceTotal: { fontSize: 16, color: sawaaColors.teal[700] },
  priceDivider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.5)', marginHorizontal: 16 },
  statusBlock: { paddingVertical: 32, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: 13, color: sawaaColors.ink[500] },
  ctaWrap: { position: 'absolute', left: 16, right: 16 },
  ctaBtnPress: {},
  ctaBtn: {
    borderRadius: 999, height: 52,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    shadowColor: sawaaColors.teal[600], shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  ctaBtnText: { color: '#fff', fontSize: 14 },
});
