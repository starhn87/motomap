import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { LEGAL_DOCS, type LegalDocType } from '@/constants/legal';

export default function LegalScreen() {
  const { type } = useLocalSearchParams<{ type: LegalDocType }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const doc = LEGAL_DOCS[type as LegalDocType];

  if (!doc) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.error, { color: colors.textSecondary }]}>
          문서를 찾을 수 없습니다.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: doc.title }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}>
        <Text style={[styles.body, { color: colors.text }]}>{doc.content}</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  body: {
    fontSize: 14,
    lineHeight: 22,
  },
  error: {
    marginTop: 40,
    textAlign: 'center',
    fontSize: 14,
  },
});
