import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
// eslint 참고: TypingDots 의 훅은 고정 3개 점에만 쓰여 순서가 안정적이다
import { useState, useRef, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { CATEGORIES } from '@/constants/categories';
import { useColorScheme } from '@/components/useColorScheme';
import { useMapStore } from '@/stores/useMapStore';
import { sendChat, type ChatPlaceCard, type ChatCourseCard, type ChatTurn } from '@/lib/api/chat';
import { formatDistance, formatDuration } from '@/constants/course';
import type { PlaceCategory } from '@/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  places?: ChatPlaceCard[];
  courses?: ChatCourseCard[];
  /** 최초 도착 시에만 점진 표시 — FlatList 재마운트로 다시 타이핑되지 않게 완료 후 false */
  animate?: boolean;
}

// 타이핑 인디케이터 — 점 3개가 번갈아 튀어오른다
function TypingDots({ color }: { color: string }) {
  const dots = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  useEffect(() => {
    dots.forEach((v, i) => {
      v.value = withDelay(
        i * 140,
        withRepeat(
          withSequence(withTiming(-4, { duration: 260 }), withTiming(0, { duration: 260 })),
          -1,
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.typingDots}>
      {dots.map((v, i) => {
        // 점 3개 고정이라 훅 순서는 안정적
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const style = useAnimatedStyle(() => ({ transform: [{ translateY: v.value }] }));
        return (
          <Animated.View key={i} style={[styles.typingDot, { backgroundColor: color }, style]} />
        );
      })}
    </View>
  );
}

// 어시스턴트 응답 — 글자 수를 rAF 로 점진 확장(남은 길이에 비례해 감속)하고,
// 새로 나타나는 단어만 페이드인한다. 위치 기반 key 라 이미 나온 단어는 다시 페이드되지 않는다.
function AssistantText({
  content,
  animate,
  textColor,
  onDone,
}: {
  content: string;
  animate: boolean;
  textColor: string;
  onDone: () => void;
}) {
  const [shown, setShown] = useState(animate ? 0 : content.length);

  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    let displayed = 0;
    const pump = () => {
      if (displayed < content.length) {
        const remaining = content.length - displayed;
        displayed += Math.max(1, Math.ceil(remaining / 40));
        setShown(Math.min(displayed, content.length));
        raf = requestAnimationFrame(pump);
      } else {
        onDone();
      }
    };
    raf = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = content.slice(0, shown);
  if (!animate) {
    return <Text style={[styles.bubbleText, { color: textColor }]}>{content}</Text>;
  }
  return (
    <Text style={[styles.bubbleText, { color: textColor }]}>
      {visible.split(/(\s+)/).map((part, i) =>
        part.trim() === '' ? (
          part
        ) : (
          <Animated.Text key={i} entering={FadeIn.duration(280)}>
            {part}
          </Animated.Text>
        ),
      )}
    </Text>
  );
}

const SUGGESTIONS = [
  '근처 라이더 카페 추천해줘',
  '서울 근교 반나절 코스 알려줘',
  '이번 주말 1박 모토캠핑 계획 짜줘',
];

// AI 추천 챗 — 앱에 등록된 장소·코스 안에서만 추천. 카드 탭 → 지도 포커스/코스 상세.
export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const userLocation = useMapStore((s) => s.userLocation);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const idRef = useRef(0);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMsg: ChatMessage = { id: `m${++idRef.current}`, role: 'user', content: trimmed };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput('');
      setSending(true);

      try {
        const history: ChatTurn[] = nextMessages.map((m) => ({ role: m.role, content: m.content }));
        const res = await sendChat(history, userLocation);
        setMessages((cur) => [
          ...cur,
          {
            id: `m${++idRef.current}`,
            role: 'assistant',
            content: res.reply,
            places: res.places,
            courses: res.courses,
            animate: true,
          },
        ]);
      } catch (e: any) {
        setMessages((cur) => [
          ...cur,
          {
            id: `m${++idRef.current}`,
            role: 'assistant',
            content: e.message ?? '추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
            animate: true,
          },
        ]);
      } finally {
        setSending(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [messages, sending, userLocation],
  );

  const goToPlace = (card: ChatPlaceCard) => {
    router.navigate({
      pathname: '/',
      params: { focusPlaceId: card.id, focusTs: String(Date.now()) },
    });
  };

  // 점진 표시가 끝나면 animate 를 내려 재마운트 시 다시 타이핑되지 않게 한다
  const markAnimated = useCallback((id: string) => {
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, animate: false } : m)));
  }, []);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <Animated.View
        entering={FadeInDown.duration(250)}
        style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
        <View
          style={[
            styles.bubble,
            isUser
              ? { backgroundColor: colors.tint }
              : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
          ]}>
          {isUser ? (
            <Text style={[styles.bubbleText, { color: colors.background }]}>{item.content}</Text>
          ) : (
            <AssistantText
              content={item.content}
              animate={!!item.animate}
              textColor={colors.text}
              onDone={() => markAnimated(item.id)}
            />
          )}
        </View>

        {!isUser && !item.animate && (item.places?.length || item.courses?.length) ? (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.cards}>
            {item.places?.map((p) => {
              const cat = CATEGORIES[p.category as PlaceCategory];
              return (
                <Pressable
                  key={p.id}
                  onPress={() => goToPlace(p)}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <Text style={styles.cardIcon}>{cat?.icon ?? '📍'}</Text>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={[styles.cardSub, { color: colors.textSecondary }]} numberOfLines={1}>
                      {p.address}
                    </Text>
                  </View>
                  <Text style={[styles.cardBadge, { color: colors.tint }]}>
                    {p.distanceKm !== null ? `${p.distanceKm}km` : (cat?.label ?? '')}
                  </Text>
                </Pressable>
              );
            })}
            {item.courses?.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/course/${c.id}`)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <Text style={styles.cardIcon}>🛣️</Text>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                    {formatDistance(c.distance)} · {formatDuration(c.duration)}
                  </Text>
                </View>
                <Text style={[styles.cardBadge, { color: colors.tint }]}>코스</Text>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Text style={[styles.backIcon, { color: colors.text }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>AI 추천</Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        {messages.length === 0 ? (
          // 시작 화면 — 인사 + 예시 질문
          <View style={styles.welcome}>
            <Text style={styles.welcomeIcon}>🏍️</Text>
            <Text style={[styles.welcomeTitle, { color: colors.text }]}>
              어디로 달려볼까요?
            </Text>
            <Text style={[styles.welcomeSub, { color: colors.textSecondary }]}>
              모토맵에 등록된 장소와 코스 중에서{'\n'}딱 맞는 곳을 추천해 드려요.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  style={({ pressed }) => [
                    styles.suggestionChip,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <Text style={[styles.suggestionText, { color: colors.text }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            keyboardDismissMode="on-drag"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={
              sending ? (
                <Animated.View
                  entering={FadeInDown.duration(250)}
                  style={[styles.messageRow, styles.assistantRow]}>
                  <View
                    style={[
                      styles.bubble,
                      { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                    ]}>
                    <TypingDots color={colors.textSecondary} />
                  </View>
                </Animated.View>
              ) : null
            }
          />
        )}

        {/* 입력 바 */}
        <View
          style={[
            styles.inputBar,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
            placeholder="예: 근처 라이더 카페 추천해줘"
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            editable={!sending}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor: sending || !input.trim() ? colors.surfaceMuted : colors.tint,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Text
              style={[
                styles.sendText,
                { color: sending || !input.trim() ? colors.textSecondary : colors.background },
              ]}>
              ↑
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    padding: 6,
  },
  backIcon: {
    fontSize: 22,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  welcome: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  welcomeIcon: {
    fontSize: 44,
    marginBottom: 14,
  },
  welcomeTitle: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 8,
  },
  welcomeSub: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
  },
  suggestions: {
    gap: 10,
    alignSelf: 'stretch',
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  messageList: {
    padding: 16,
    gap: 12,
  },
  messageRow: {
    maxWidth: '92%',
  },
  userRow: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  cards: {
    marginTop: 8,
    gap: 8,
    alignSelf: 'stretch',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardSub: {
    fontSize: 12,
  },
  cardBadge: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    fontSize: 18,
    fontWeight: '700',
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
