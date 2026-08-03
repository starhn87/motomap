import { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

interface Props {
  label: string;
  /** "HH:MM" 또는 빈 문자열 */
  value: string;
  onChange: (value: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
// 영업시간이 5분 단위로 끊기는 가게는 없다. 10분 단위면 12:30 같은 값까지 덮인다
const MINUTES = [0, 10, 20, 30, 40, 50];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 영업 시각 입력. 직접 타이핑하면 "9", "9시", "09.00" 이 섞여 들어와 파싱이
 * 늘 새는데, 고를 수 있는 값이 30개뿐이라 목록이 더 빠르고 정확하다.
 */
export default function TimeField({ label, value, onChange }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [open, setOpen] = useState(false);

  const [h, m] = value.split(':');
  const hour = h ? Number(h) : null;
  const minute = m ? Number(m) : null;

  const pick = (nextHour: number | null, nextMinute: number | null) => {
    // 시를 먼저 고르는 게 자연스러워서, 분만 고른 상태는 값으로 치지 않는다
    if (nextHour == null) return;
    onChange(`${pad(nextHour)}:${pad(nextMinute ?? 0)}`);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={{ color: value ? colors.text : colors.textSecondary, fontSize: 15 }}>
          {value || label}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* 시트 안을 눌러도 닫히지 않게 이벤트를 끊는다 */}
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.background }]}
            onPress={() => {}}>
            <Text style={[styles.title, { color: colors.text }]}>{label}</Text>

            <Text style={[styles.section, { color: colors.textSecondary }]}>시</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.row}>
                {HOURS.map((n) => {
                  const on = hour === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => pick(n, minute)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: on ? colors.tint : 'transparent',
                          borderColor: on ? colors.tint : colors.border,
                        },
                      ]}>
                      <Text style={{ color: on ? colors.background : colors.text, fontSize: 15 }}>
                        {pad(n)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={[styles.section, { color: colors.textSecondary }]}>분</Text>
            <View style={styles.row}>
              {MINUTES.map((n) => {
                const on = minute === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => pick(hour, n)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on ? colors.tint : 'transparent',
                        borderColor: on ? colors.tint : colors.border,
                      },
                    ]}>
                    <Text style={{ color: on ? colors.background : colors.text, fontSize: 15 }}>
                      {pad(n)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  onChange('');
                  setOpen(false);
                }}
                style={[styles.action, { borderColor: colors.border }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>지우기</Text>
              </Pressable>
              <Pressable
                onPress={() => setOpen(false)}
                style={[styles.action, { backgroundColor: colors.tint, borderColor: colors.tint }]}>
                <Text style={{ color: colors.background, fontSize: 15, fontWeight: '700' }}>
                  확인
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  section: {
    fontSize: 13,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minWidth: 46,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
});
