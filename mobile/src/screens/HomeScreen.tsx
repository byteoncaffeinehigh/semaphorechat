import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useWSListener } from '../contexts/WSContext';
import { apiGet, apiPost, apiPut } from '../api';
import { colors, fontSize } from '../theme';
import { RootStackParamList } from '../navigation/AppNavigator';

interface Chat {
  id: string;
  users: string[];
  unreadCounts?: Record<string, number>;
  lastMessage?: {
    message: string;
    timestamp: string;
    user: string;
    imageURL?: string;
    audioURL?: string;
  };
}

interface PresenceData { userEmail: string; isOnline: boolean; }
interface NewMessageData { chatId: string; message: { message: string; timestamp: string; user: string }; }
interface ChatUpdateData { chat: Chat; }

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

function getRecipientEmail(users: string[], myEmail: string): string {
  return users.find((u) => u !== myEmail) ?? users[0] ?? '';
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Avatar({ email, photoURL, size = 46 }: { email: string; photoURL?: string; size?: number }) {
  const colors_list = ['#0A84FF', '#32D74B', '#FF9F0A', '#FF453A', '#BF5AF2', '#AC8E68'];
  const color = colors_list[email.charCodeAt(0) % colors_list.length];
  if (photoURL) {
    return <Image source={{ uri: photoURL }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.4, fontWeight: '600' }}>{email[0]?.toUpperCase()}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [newChatModal, setNewChatModal] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiGet<Chat[]>('/api/chats').then(setChats).catch(() => {}).finally(() => setLoading(false));
    apiPost('/api/users/presence', { isOnline: true }).catch(() => {});
  }, []);

  useWSListener('new_message', (data) => {
    const { chatId, message: msg } = data as NewMessageData;
    setChats((prev) => prev.map((c) =>
      c.id === chatId
        ? { ...c, lastMessage: msg, unreadCounts: { ...c.unreadCounts, [user?.email ?? '']: (c.unreadCounts?.[user?.email ?? ''] ?? 0) + 1 } }
        : c
    ).sort((a, b) => {
      const ta = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : 0;
      const tb = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : 0;
      return tb - ta;
    }));
  }, [user?.email]);

  useWSListener('presence', (data) => {
    const { userEmail, isOnline } = data as PresenceData;
    setOnlineUsers((prev) => { const next = new Set(prev); if (isOnline) next.add(userEmail); else next.delete(userEmail); return next; });
  }, []);

  useWSListener('chat_update', (data) => {
    const { chat } = data as ChatUpdateData;
    setChats((prev) => prev.map((c) => c.id === chat.id ? { ...c, ...chat } : c));
  }, []);

  const openChat = useCallback((chat: Chat) => {
    const recipientEmail = getRecipientEmail(chat.users, user?.email ?? '');
    const recipientName = recipientEmail.split('@')[0];
    apiPut(`/api/chats/${chat.id}/read`, {}).catch(() => {});
    setChats((prev) => prev.map((c) => c.id === chat.id ? { ...c, unreadCounts: { ...c.unreadCounts, [user?.email ?? '']: 0 } } : c));
    navigation.navigate('Chat', { chatId: chat.id, recipientEmail, recipientName });
  }, [user?.email, navigation]);

  const createChat = async () => {
    if (!newChatEmail.trim()) return;
    setCreating(true);
    try {
      const existingUser = await apiGet<{ email: string } | null>(`/api/users?email=${encodeURIComponent(newChatEmail.trim())}`);
      if (!existingUser) { Alert.alert('Not found', 'No user with that email'); return; }
      if (newChatEmail.trim() === user?.email) { Alert.alert('Error', "You can't chat with yourself"); return; }
      const already = chats.some((c) => c.users.includes(newChatEmail.trim()));
      if (already) { Alert.alert('Exists', 'Chat already exists'); return; }
      const chat = await apiPost<Chat>('/api/chats', { email: newChatEmail.trim() });
      setChats((prev) => [chat, ...prev]);
      setNewChatModal(false);
      setNewChatEmail('');
    } catch (e) {
      Alert.alert('Error', (e as Error).message || 'Failed to create chat');
    } finally {
      setCreating(false);
    }
  };

  const filteredChats = chats.filter((c) =>
    c.users.some((u) => u !== user?.email && u.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => { apiPost('/api/users/presence', { isOnline: false }).catch(() => {}); signOut(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerAction}>Sign out</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity
          onPress={() => setNewChatModal(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerAction}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.primary}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const recipientEmail = getRecipientEmail(item.users, user?.email ?? '');
            const unread = item.unreadCounts?.[user?.email ?? ''] ?? 0;
            const isOnline = onlineUsers.has(recipientEmail);
            const lastMsg = item.lastMessage;
            const lastText = lastMsg?.imageURL ? '📷 Photo'
              : lastMsg?.audioURL ? '🎤 Voice'
              : lastMsg?.message || '';
            const isMine = lastMsg?.user === user?.email;
            const name = recipientEmail.split('@')[0];
            return (
              <TouchableOpacity style={styles.chatItem} onPress={() => openChat(item)} activeOpacity={0.6}>
                <View style={styles.avatarContainer}>
                  <Avatar email={recipientEmail} size={46} />
                  {isOnline && <View style={styles.onlineDot} />}
                </View>
                <View style={styles.chatContent}>
                  <View style={styles.chatTop}>
                    <Text style={styles.chatName} numberOfLines={1}>{name}</Text>
                    {lastMsg && <Text style={[styles.chatTime, unread > 0 && styles.chatTimeUnread]}>{formatTime(lastMsg.timestamp)}</Text>}
                  </View>
                  <View style={styles.chatBottom}>
                    <Text style={[styles.chatPreview, unread > 0 && styles.chatPreviewBold]} numberOfLines={1}>
                      {isMine ? `You: ${lastText}` : lastText || 'Start chatting...'}
                    </Text>
                    {unread > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No chats yet.{'\n'}Tap New to start a conversation.</Text>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
        />
      )}

      {/* New chat modal */}
      <Modal visible={newChatModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>New Chat</Text>
            <TextInput
              style={styles.modalInput}
              value={newChatEmail}
              onChangeText={setNewChatEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={colors.textTertiary}
              placeholder="Email address"
              selectionColor={colors.primary}
              autoFocus
              onSubmitEditing={createChat}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setNewChatModal(false); setNewChatEmail(''); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={createChat} disabled={creating}>
                {creating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalConfirmText}>Start Chat</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  headerAction: { fontSize: fontSize.md, color: colors.primary },
  searchContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.text },
  searchClear: { fontSize: 14, color: colors.textSecondary, paddingHorizontal: 4 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  avatarContainer: { position: 'relative', marginRight: 12 },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.green,
    borderWidth: 2, borderColor: colors.bg,
  },
  chatContent: { flex: 1 },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  chatName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, flex: 1 },
  chatTime: { fontSize: fontSize.xs, color: colors.textSecondary, marginLeft: 8 },
  chatTimeUnread: { color: colors.primary },
  chatBottom: { flexDirection: 'row', alignItems: 'center' },
  chatPreview: { fontSize: fontSize.sm, color: colors.textSecondary, flex: 1 },
  chatPreviewBold: { color: colors.text, fontWeight: '500' },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  badgeText: { fontSize: fontSize.xs, color: '#fff', fontWeight: '700' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 74 },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 60,
    lineHeight: 24,
  },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingTop: 12,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.textTertiary,
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: 16 },
  modalInput: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 14,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: colors.bgCard, alignItems: 'center',
  },
  modalCancelText: { fontSize: fontSize.md, color: colors.text },
  modalConfirmBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  modalConfirmText: { fontSize: fontSize.md, color: '#fff', fontWeight: '600' },
});
