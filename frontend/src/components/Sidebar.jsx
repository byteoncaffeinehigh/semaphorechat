import styled from "styled-components";
import { Avatar, IconButton } from "@mui/material";
import * as EmailValidator from "email-validator";
import { useAuth } from "../utils/AuthContext";
import { apiGet, apiPost, apiPut } from "../utils/api";
import Chat from "../components/Chat";
import LogoutIcon from "@mui/icons-material/Logout";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import SearchIcon from "@mui/icons-material/Search";
import { useSignOut } from "../utils/ChatsContext";
import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { ChatsContext } from "../utils/ChatsContext";

function Sidebar() {
  const { user } = useAuth();
  const { chats, setChats } = useContext(ChatsContext);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || user?.email?.split("@")[0] || "");
  const [search, setSearch] = useState("");
  const signOut = useSignOut();
  const navigate = useNavigate();

  const createChat = async () => {
    const input = prompt("Please enter an email address for the user you wish to chat with");
    if (!input) return;

    if (!EmailValidator.validate(input)) { alert("Invalid email address"); return; }
    if (input === user.email) { alert("You can't chat with yourself"); return; }

    try {
      const userCheck = await apiGet(`/api/users?email=${encodeURIComponent(input)}`);
      if (!userCheck) { alert("This user is not registered"); return; }

      const alreadyExists = chats.some((c) => c.users.includes(input));
      if (alreadyExists) { alert("Chat already exists"); return; }

      const chat = await apiPost("/api/chats", { email: input });
      setChats((prev) => {
        if (prev.find((c) => c.id === chat.id)) return prev;
        return [chat, ...prev];
      });
    } catch (err) {
      alert("Error: " + (err.message || "unknown error"));
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
    <Container>
      <Header>
        <SearchWrapper>
          <SearchIcon style={{ color: "#1a5a1a", fontSize: 18 }} />
          <SearchInput
            placeholder="Search chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </SearchWrapper>
        <NewChatButton onClick={createChat}>+ New</NewChatButton>
      </Header>

      <ChatList>
        {filteredChats.map((chat) => (
          <Chat
            key={chat.id}
            id={chat.id}
            users={chat.users}
            unreadCount={chat.unreadCounts?.[user?.email] ?? 0}
          />
        ))}
      </ChatList>

      <Footer>
        <FooterAvatar src={user?.photoURL}>{user?.email?.[0]?.toUpperCase()}</FooterAvatar>
        <FooterInfo>
          {editingName ? (
            <NameInput
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              placeholder={displayName}
            />
          ) : (
            <FooterName>{displayName}</FooterName>
          )}
          <FooterEmail>{emailText}</FooterEmail>
        </FooterInfo>
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
        <HelpBtn onClick={() => navigate("/features")} title="Features & keybindings">[?]</HelpBtn>
        <IconButton size="small" onClick={signOut}>
          <LogoutIcon style={{ color: "#1a7a1a", fontSize: 18 }} />
        </IconButton>
      </Footer>
    </Container>
  );
}

export default Sidebar;

const Container = styled.div`
  min-width: 340px;
  background-color: #0d150d;
  color: #00ff41;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  border-right: 1px solid #1a3a1a;
  box-shadow: 4px 0 20px rgba(0, 255, 65, 0.04);

  @media (max-width: 1240px) {
    grid-column-start: 1;
    grid-column-end: 4;
    grid-row-start: 1;
    grid-row-end: 3;
    max-width: 100%;
  }
`;

const ChatList = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
  ::-webkit-scrollbar { display: none; }
  -ms-overflow-style: none;
  scrollbar-width: none;
`;

const Header = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background-color: #0d150d;
  border-bottom: 1px solid #1a3a1a;
`;

const SearchWrapper = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
  background-color: #0a150a;
  border: 1px solid #1a3a1a;
  border-radius: 4px;
  padding: 6px 10px;
  gap: 6px;
  :focus-within { border-color: #00ff41; }
`;

const SearchInput = styled.input`
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #00ff41;
  font-size: 16px;
  font-family: 'Share Tech Mono', 'Courier New', Courier, monospace;
  ::placeholder { color: #1a5a1a; }
`;

const NewChatButton = styled.button`
  background: none;
  border: 1px solid #1a5a1a;
  color: #00ff41;
  font-family: 'Share Tech Mono', 'Courier New', Courier, monospace;
  font-size: 13px;
  padding: 0 12px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 1px;
  align-self: stretch;
  transition: border-color 0.15s, box-shadow 0.15s;
  :hover { border-color: #00ff41; box-shadow: 0 0 8px rgba(0, 255, 65, 0.2); }
`;

const Footer = styled.div`
  flex-shrink: 0;
  padding: 10px 12px;
  border-top: 1px solid #1a3a1a;
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: #0d150d;
`;

const FooterAvatar = styled(Avatar)`
  width: 36px !important;
  height: 36px !important;
  font-size: 0.9rem !important;
  flex-shrink: 0;
`;

const FooterInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const FooterName = styled.div`
  color: #00ff41;
  font-size: 0.85em;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FooterEmail = styled.div`
  color: #1a5a1a;
  font-size: 0.7em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HelpBtn = styled.button`
  background: none;
  border: none;
  color: #1a7a1a;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: color 0.15s;
  &:hover { color: #00ff41; }
`;

const NameInput = styled.input`
  background: none;
  border: none;
  border-bottom: 1px solid #00ff41;
  color: #00ff41;
  font-family: 'Share Tech Mono', 'Courier New', Courier, monospace;
  font-size: 0.85em;
  outline: none;
  width: 100%;
  padding: 0;
`;
