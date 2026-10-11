import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { LEGAL_DOCS, LEGAL_RELAUNCH_DOCS, LEGAL_RELAUNCH_READY, LEGAL_DRAFT_NOTICE,
  LEGAL_CHANGE_SUMMARY, type LegalDocType } from '@/constants/legal';

export default function LegalScreen() {
  const { type, revision } = useLocalSearchParams<{ type: LegalDocType; revision?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const preview = revision === 'relaunch' && !LEGAL_RELAUNCH_READY;
  const documents = preview ? LEGAL_RELAUNCH_DOCS : LEGAL_DOCS;
  const doc = Object.hasOwn(documents, type) ? documents[type] : undefined;

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
      <Stack.Screen options={{ title: doc.title + (preview ? ' (개정안)' : '') }} />
      <ScrollView
        key={`${type}:${preview ? 'relaunch' : 'current'}`}
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}>
        {preview && (
          <View style={styles.notice}>
            <Text style={[styles.body, { color: colors.text }]}>{LEGAL_DRAFT_NOTICE}</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {'\n'}주요 변경 사항{'\n'}{LEGAL_CHANGE_SUMMARY.map((item) => `· ${item}`).join('\n')}
            </Text>
          </View>
        )}
        <Text style={[styles.body, { color: colors.text }]}>{doc.content}</Text>
        {!LEGAL_RELAUNCH_READY && (
          <Text accessibilityRole="link" style={[styles.revisionLink, { color: colors.text }]}
            onPress={() => router.replace({ pathname: '/legal/[type]',
              params: { type, revision: preview ? 'current' : 'relaunch' } })}>
            {preview ? '현재 적용 중인 문서 보기' : '운영 재개 개정안과 변경 사항 보기'}
          </Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  notice: { marginBottom: 24, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#8E8E93' },
  revisionLink: { marginTop: 24, paddingVertical: 14, textDecorationLine: 'underline', fontSize: 14 },
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
