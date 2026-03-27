import { Avatar, IconButton, Tooltip } from "@mui/material";
import * as EmailValidator from "email-validator";
import { useAuth } from "../utils/AuthContext";
import { apiGet, apiPost, apiPut } from "../utils/api";
import Chat from "../components/Chat";
import LogoutIcon from "@mui/icons-material/Logout";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import SearchIcon from "@mui/icons-material/Search";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import { useSignOut } from "../utils/ChatsContext";
import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { ChatsContext, type Chat as ChatType } from "../utils/ChatsContext";
import styles from "./Sidebar.module.css";

interface UserData {
  id?: string;
  email: string;
}

function Sidebar() {
  const { user, regenerateAvatar } = useAuth();
  const { chats, setChats } = useContext(ChatsContext);
  const [editingName, setEditingName] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || user?.email?.split("@")[0] || "");
  const [search, setSearch] = useState("");
  const signOut = useSignOut();
  const navigate = useNavigate();

  const createChat = async () => {
    const input = prompt("Please enter an email address for the user you wish to chat with");
    if (!input) return;

    if (!EmailValidator.validate(input)) { alert("Invalid email address"); return; }
    if (input === user?.email) { alert("You can't chat with yourself"); return; }

    try {
      const userCheck = await apiGet<UserData | null>(`/api/users?email=${encodeURIComponent(input)}`);
      if (!userCheck) { alert("This user is not registered"); return; }

      const alreadyExists = chats.some((c) => c.users.includes(input));
      if (alreadyExists) { alert("Chat already exists"); return; }

      const chat = await apiPost<ChatType>("/api/chats", { email: input });
      setChats((prev) => {
        if (prev.find((c) => c.id === chat.id)) return prev;
        return [chat, ...prev];
      });
    } catch (err) {
      const e = err as Error;
      alert("Error: " + (e.message || "unknown error"));
    }
  };

  const saveName = async () => {
    if (!nameInput.trim()) return;
    await apiPut("/api/me", { displayName: nameInput.trim() }).catch(() => {});
    setDisplayName(nameInput.trim());
    setEditingName(false);
  };

  const emailText = user?.email?.split("@")[0] || "";

  const filteredChats = chats.filter((chat) =>
    chat.users.some((u) => u !== user?.email && u.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.searchWrapper}>
          <SearchIcon style={{ color: "#1a5a1a", fontSize: 18 }} />
          <input
            className={styles.searchInput}
            placeholder="Search chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className={styles.newChatButton} onClick={createChat}>+ New</button>
      </div>

      <div className={styles.chatList}>
        {filteredChats.map((chat) => (
          <Chat
            key={chat.id}
            id={chat.id}
            users={chat.users}
            unreadCount={chat.unreadCounts?.[user?.email ?? ""] ?? 0}
          />
        ))}
      </div>

      <div className={styles.footer}>
        <Tooltip title="Regenerate avatar" placement="top">
          <span style={{ position: "relative", flexShrink: 0, cursor: "pointer" }} onClick={async () => {
            if (regenerating) return;
            setRegenerating(true);
            try { await regenerateAvatar(); } finally { setRegenerating(false); }
          }}>
            <Avatar
              src={user?.photoURL}
              style={{ width: 36, height: 36, fontSize: "0.9rem", opacity: regenerating ? 0.5 : 1 }}
            >
              {user?.email?.[0]?.toUpperCase()}
            </Avatar>
            <ShuffleIcon style={{ position: "absolute", bottom: -4, right: -4, fontSize: 14, color: "#00ff41", background: "#0d1a0d", borderRadius: "50%", padding: 1 }} />
          </span>
        </Tooltip>
        <div className={styles.footerInfo}>
          {editingName ? (
            <input
              className={styles.nameInput}
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              placeholder={displayName}
            />
          ) : (
            <div className={styles.footerName}>{displayName}</div>
          )}
          <div className={styles.footerEmail}>{emailText}</div>
        </div>
        <IconButton
          size="small"
          onClick={() => {
            if (editingName) saveName();
            else { setNameInput(displayName); setEditingName(true); }
          }}
        >
          {editingName
            ? <CheckIcon style={{ color: "#00ff41", fontSize: 18 }} />
            : <EditIcon  style={{ color: "#1a7a1a", fontSize: 18 }} />
          }
        </IconButton>
        <button className={styles.helpBtn} onClick={() => navigate("/features")} title="Features & keybindings">[?]</button>
        <IconButton size="small" onClick={signOut}>
          <LogoutIcon style={{ color: "#1a7a1a", fontSize: 18 }} />
        </IconButton>
      </div>
    </div>
  );
}

export default Sidebar;
