import { Avatar } from "@mui/material";
import styles from "./Chat.module.css";
import getRecipientEmail from "../utils/getRecipientEmail";
import { useAuth } from "../utils/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { apiGet } from "../utils/api";
import { useWSListener } from "../utils/WSContext";

interface Recipient {
  email: string;
  displayName?: string;
  photoURL?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

interface PresenceData {
  userEmail: string;
  isOnline: boolean;
  lastSeen?: string;
}

interface ChatProps {
  id: string;
  users: string[];
  unreadCount?: number;
}

function Chat({ id, users, unreadCount = 0 }: ChatProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const recipientEmail = user ? getRecipientEmail(users, user) : undefined;
  const [recipient, setRecipient] = useState<Recipient | null>(null);

  useEffect(() => {
    if (!recipientEmail) return;
    apiGet<Recipient>(`/api/users?email=${encodeURIComponent(recipientEmail)}`)
      .then(setRecipient)
      .catch(() => {});
  }, [recipientEmail]);

  useWSListener("presence", (data) => {
    const { userEmail, isOnline, lastSeen } = data as PresenceData;
    if (userEmail === recipientEmail) {
      setRecipient((r) => r ? { ...r, isOnline, lastSeen } : r);
    }
  }, [recipientEmail]);

  const displayName = recipient?.displayName || recipientEmail?.split("@")[0];

  return (
    <div className={styles.container} onClick={() => navigate(`/chat/${id}`)}>
      <div className={styles.avatarWrapper}>
        <Avatar src={recipient?.photoURL}>{recipientEmail?.[0]?.toUpperCase()}</Avatar>
        {recipient?.isOnline && <div className={styles.onlineDot} />}
      </div>

      <div className={styles.chatInfo}>
        <p>{displayName}</p>
        {unreadCount > 0 && (
          <span className={styles.unreadBadge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </div>
    </div>
  );
}

export default Chat;
