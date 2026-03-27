import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useWSListener } from '../contexts/WSContext';
import { apiGet, apiPost, apiPut } from '../api';
import { colors, fonts, fontSize } from '../theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import MatrixRain from '../components/MatrixRain';

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

interface PresenceData {
  userEmail: string;
  isOnline: boolean;
}

interface NewMessageData {
  chatId: string;
  message: { message: string; timestamp: string; user: string };
}

interface ChatUpdateData {
  chat: Chat;
}

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

function getRecipientEmail(users: string[], myEmail: string): string {
  return users.find((u) => u !== myEmail) ?? users[0] ?? '';
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<Nav>();

  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [newChatModal, setNewChatModal] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiGet<Chat[]>('/api/chats')
      .then(setChats)
      .catch(() => {})
      .finally(() => setLoading(false));
    apiPost('/api/users/presence', { isOnline: true }).catch(() => {});
  }, []);

  useWSListener('new_message', (data) => {
    const { chatId, message: msg } = data as NewMessageData;
    setChats((prev) => prev.map((c) =>
      c.id === chatId
        ? {
            ...c,
            lastMessage: msg,
            unreadCounts: {
              ...c.unreadCounts,
              [user?.email ?? '']: (c.unreadCounts?.[user?.email ?? ''] ?? 0) + 1,
            },
          }
        : c
    ).sort((a, b) => {
      const ta = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : 0;
      const tb = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : 0;
      return tb - ta;
    }));
  }, [user?.email]);

  useWSListener('presence', (data) => {
    const { userEmail, isOnline } = data as PresenceData;
    setOnlineUsers((prev) => {
      const next = new Set(prev);
      if (isOnline) next.add(userEmail); else next.delete(userEmail);
      return next;
    });
  }, []);

  useWSListener('chat_update', (data) => {
    const { chat } = data as ChatUpdateData;
    setChats((prev) => prev.map((c) => c.id === chat.id ? { ...c, ...chat } : c));
  }, []);

  const openChat = useCallback((chat: Chat) => {
    const recipientEmail = getRecipientEmail(chat.users, user?.email ?? '');
    const recipientName = recipientEmail.split('@')[0];
    apiPut(`/api/chats/${chat.id}/read`, {}).catch(() => {});
    setChats((prev) => prev.map((c) =>
      c.id === chat.id
        ? { ...c, unreadCounts: { ...c.unreadCounts, [user?.email ?? '']: 0 } }
        : c
    ));
    navigation.navigate('Chat', { chatId: chat.id, recipientEmail, recipientName });
  }, [user?.email, navigation]);

  const createChat = async () => {
    if (!newChatEmail.trim()) return;
    setCreating(true);
    try {
      const existingUser = await apiGet<{ email: string } | null>(
        `/api/users?email=${encodeURIComponent(newChatEmail.trim())}`
      );
      if (!existingUser) { Alert.alert('Error', 'User not found'); return; }
      if (newChatEmail.trim() === user?.email) { Alert.alert('Error', "You can't chat with yourself"); return; }
      const already = chats.some((c) => c.users.includes(newChatEmail.trim()));
      if (already) { Alert.alert('Error', 'Chat already exists'); return; }
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
      <MatrixRain />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>SEMAPHORE</Text>
        <TouchableOpacity onPress={() => { apiPost('/api/users/presence', { isOnline: false }).catch(() => {}); signOut(); }}>
          <Text style={styles.signOutBtn}>[EXIT]</Text>
        </TouchableOpacity>
      </View>

      {/* User info */}
      <View style={styles.userBar}>
        <Text style={styles.userEmail}>&gt; {user?.displayName || user?.email?.split('@')[0]}</Text>
        <Text style={styles.userEmailMuted}>{user?.email}</Text>
      </View>

      {/* Search + New chat */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="search chats..."
          placeholderTextColor={colors.muted}
          selectionColor={colors.amber}
        />
        <TouchableOpacity style={styles.newBtn} onPress={() => setNewChatModal(true)}>
          <Text style={styles.newBtnText}>+ NEW</Text>
        </TouchableOpacity>
      </View>

      {/* Chat list */}
      {loading ? (
        <ActivityIndicator color={colors.amber} style={{ marginTop: 40 }} />
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
            return (
              <TouchableOpacity style={styles.chatItem} onPress={() => openChat(item)}>
                <View style={styles.avatarWrap}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{recipientEmail[0]?.toUpperCase()}</Text>
                  </View>
                  {isOnline && <View style={styles.onlineDot} />}
                </View>
                <View style={styles.chatInfo}>
                  <View style={styles.chatInfoTop}>
                    <Text style={styles.chatName} numberOfLines={1}>
                      {recipientEmail.split('@')[0]}
                    </Text>
                    {lastMsg && (
                      <Text style={styles.chatTime}>{formatTime(lastMsg.timestamp)}</Text>
                    )}
                  </View>
                  <View style={styles.chatInfoBottom}>
                    <Text style={[styles.chatPreview, unread > 0 && styles.chatPreviewUnread]} numberOfLines={1}>
                      {isMine ? '> ' : ''}{lastText || 'Start chatting...'}
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
          ListEmptyComponent={
            <Text style={styles.emptyText}>{'> No chats yet. Create one with [ + NEW ]'}</Text>
          }
        />
      )}

      {/* New chat modal */}
      <Modal visible={newChatModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>NEW CHANNEL</Text>
            <Text style={styles.label}>TARGET EMAIL</Text>
            <TextInput
              style={styles.modalInput}
              value={newChatEmail}
              onChangeText={setNewChatEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={colors.muted}
              placeholder="user@domain.com"
              selectionColor={colors.amber}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setNewChatModal(false); setNewChatEmail(''); }}
              >
                <Text style={styles.modalCancelText}>[CANCEL]</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={createChat} disabled={creating}>
                {creating
                  ? <ActivityIndicator color={colors.bg} size="small" />
                  : <Text style={styles.modalConfirmText}>[OPEN]</Text>
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
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: fontSize.lg,
    color: colors.amber,
    letterSpacing: 6,
  },
  signOutBtn: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  userBar: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userEmail: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.green,
  },
  userEmailMuted: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  searchRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.amber,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  newBtn: {
    backgroundColor: colors.amberFaint,
    borderWidth: 1,
    borderColor: colors.amberDim,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  newBtnText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    color: colors.amber,
    letterSpacing: 1,
  },
  chatItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  avatarWrap: { position: 'relative', marginRight: 12 },
  avatar: {
    width: 42,
    height: 42,
    backgroundColor: colors.amberFaint,
    borderWidth: 1,
    borderColor: colors.amberDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.lg,
    color: colors.amber,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
    borderWidth: 1,
    borderColor: colors.bg,
  },
  chatInfo: { flex: 1 },
  chatInfoTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  chatName: {
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    color: colors.amber,
    flex: 1,
  },
  chatTime: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  chatInfoBottom: { flexDirection: 'row', alignItems: 'center' },
  chatPreview: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.muted,
    flex: 1,
  },
  chatPreviewUnread: { color: colors.white },
  badge: {
    backgroundColor: colors.amber,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  badgeText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    color: colors.bg,
    fontWeight: 'bold',
  },
  emptyText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 24,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
  },
  modalTitle: {
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    color: colors.amber,
    letterSpacing: 4,
    marginBottom: 20,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    color: colors.amberDim,
    letterSpacing: 2,
    marginBottom: 6,
  },
  modalInput: {
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    color: colors.amber,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  modalButtons: { flexDirection: 'row', gap: 8, marginTop: 20 },
  modalCancel: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  modalConfirm: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.amber,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.bg,
    fontWeight: 'bold',
  },
});
