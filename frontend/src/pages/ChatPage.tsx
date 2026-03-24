import Sidebar from "../components/Sidebar";
import ChatScreen from "../components/ChatScreen";
import { useNavigate, useParams } from "react-router-dom";
import getRecipientEmail from "../utils/getRecipientEmail";
import { useChats } from "../utils/ChatsContext";
import { useAuth } from "../utils/AuthContext";
import { useEffect } from "react";
import styles from "./ChatPage.module.css";

function ChatPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const chats = useChats();
  const navigate = useNavigate();

  const chat = chats.find((c) => c.id === id);

  useEffect(() => {
    if (chat) {
      document.title = `Chat with ${getRecipientEmail(chat.users, user)}`;
    }
    return () => { document.title = "Semaphore"; };
  }, [chat, user]);

  if (!chat) {
    return (
      <div className={styles.container}>
        <div className={styles.sidebarWrapper}>
          <Sidebar />
        </div>
        <div className={styles.accessDenied}>
          <h2>Access Denied</h2>
          <p>You don&apos;t have access to this chat.</p>
          <span className={styles.backLink} onClick={() => navigate("/")}>← Go back</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.sidebarWrapper}>
        <Sidebar />
      </div>
      <div>
        <ChatScreen chat={chat} />
      </div>
    </div>
  );
}

export default ChatPage;
