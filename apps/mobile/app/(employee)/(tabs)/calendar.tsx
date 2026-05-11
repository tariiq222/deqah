import { useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { router } from 'expo-router';

import { ThemedText } from '@/theme/components/ThemedText';
import { ThemedButton } from '@/theme/components/ThemedButton';
import { ThemedCard } from '@/theme/components/ThemedCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { useTheme } from '@/theme/useTheme';
import { useEmployeeDayBookings } from '@/hooks/queries/useEmployeeDayBookings';
import { getStatusLabel } from '@/lib/status-helpers';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { theme, isRTL } = useTheme();

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0],
  );

  const { data: dayBookings = [] } = useEmployeeDayBookings(selectedDate);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface, paddingTop: insets.top + 16 },
      ]}
    >
      <ThemedText variant="displaySm" style={styles.title}>
        {t('employee.calendar')}
      </ThemedText>

      <ThemedCard style={styles.calCard}>
        <RNCalendar
          onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
          markedDates={{
            [selectedDate]: {
              selected: true,
              selectedColor: theme.colors.primary,
            },
          }}
          theme={{
            todayTextColor: theme.colors.primary,
            arrowColor: theme.colors.primary,
            textDayFontFamily: isRTL ? 'IBM Plex Sans Arabic' : 'Inter',
            textMonthFontFamily: isRTL ? 'IBM Plex Sans Arabic' : 'Inter',
            textDayHeaderFontFamily: isRTL ? 'IBM Plex Sans Arabic' : 'Inter',
            textDayFontSize: 14,
            textMonthFontSize: 16,
            textMonthFontWeight: '600',
          }}
        />
      </ThemedCard>

      <ThemedText variant="subheading" style={styles.dayTitle}>
        {new Date(selectedDate).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </ThemedText>

      <FlatList
        data={dayBookings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <ThemedCard style={styles.apptCard}>
            <View style={styles.apptRow}>
              <View style={styles.timeCol}>
                <Clock size={14} strokeWidth={1.5} color={theme.colors.textMuted} />
                <ThemedText variant="bodySm">{item.startTime}</ThemedText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText variant="body" style={{ fontWeight: '500' }}>
                  {item.client ? `${item.client.firstName} ${item.client.lastName}` : t('doctor.clientRecord')}
                </ThemedText>
              </View>
              <StatusPill status={item.status} label={t(getStatusLabel(item.status))} />
            </View>
          </ThemedCard>
        )}
        ListEmptyComponent={
          <ThemedText variant="bodySm" color={theme.colors.textMuted} align="center" style={{ marginTop: 20 }}>
            {t('doctor.noAppointmentsToday')}
          </ThemedText>
        }
      />

      <View style={styles.ctaWrap}>
        <ThemedButton onPress={() => router.push('/(employee)/availability')} variant="outline" size="md" full>
          {t('doctor.manageAvailability')}
        </ThemedButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  title: { marginBottom: 16 },
  calCard: { padding: 8, marginBottom: 16 },
  dayTitle: { marginBottom: 12 },
  list: { paddingBottom: 120 },
  apptCard: { padding: 12 },
  apptRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeCol: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  ctaWrap: { paddingVertical: 12 },
});
