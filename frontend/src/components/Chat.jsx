import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRealtime } from "../utils/realtime";
import api, { errorText, SOCKET_URL } from "../utils/api";
import { getUser, clearAuth, setUser } from "../utils/auth";
import { initializeIdentity } from "../utils/encryption";
import ChatWindow from "./ChatWindow";
import Profile from "./Profile";
export default function Chat() {
  const [currentUser, setCurrentUser] = useState(getUser);
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [online, setOnline] = useState([]);
  const [unread, setUnread] = useState({});
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyError, setKeyError] = useState("");
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [loggingOut, setLoggingOut] = useState(false);
  const [keyReady, setKeyReady] = useState(false);
  const socketRef = useRef(null);
  const menuButton = useRef(null);
  const closeButton = useRef(null);
  const sidebarRef = useRef(null);
  const navigate = useNavigate();
  const refreshUnread = useCallback(async () => {
    try {
      const { data } = await api.get("/messages/unread");
      setUnread(
        Object.fromEntries(data.bySender.map((row) => [row.userId, row.count])),
      );
    } catch {
      /* Reconnect retries the unread request. */
    }
  }, []);
  const refreshUsers = useCallback(async () => {
    const { data } = await api.get("/auth/users");
    setUsers(data);
  }, []);
  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const { data } = await api.get("/auth/me");
        if (!active) return;
        setCurrentUser(data);
        setUser(data);
        try {
          await initializeIdentity(data.id);
          if (active) setKeyReady(true);
        } catch (err) {
          if (active) setKeyError(errorText(err, err.message));
        }
        await refreshUsers();
        await refreshUnread();
      } catch (err) {
        if (active) setError(errorText(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    initialize();
    const timer = setInterval(() => {
      refreshUsers().catch(() => {});
      refreshUnread();
    }, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshUsers, refreshUnread]);
  useEffect(() => {
    const connection = createRealtime(SOCKET_URL);
    socketRef.current = connection;
    setSocket(connection);
    const connected = () => {
      setStatus("connected");
      refreshUsers().catch(() => {});
      refreshUnread();
    };
    connection.on("connect", connected);
    connection.on("disconnect", () =>
      setStatus(navigator.onLine ? "reconnecting" : "offline"),
    );
    connection.on("connect_error", (error) =>
      setStatus(
        error.message === "Please sign in again."
          ? "session"
          : navigator.onLine
            ? "reconnecting"
            : "offline",
      ),
    );
    connection.on("online_users", (list) =>
      setOnline(list.map((user) => user.userId)),
    );
    connection.on("receive_message", (message) => {
      if (message.receiverId === currentUser?.id)
        connection.emit("message_delivered", { id: message.id });
      refreshUnread();
    });
    connection.on("unread_changed", refreshUnread);
    connection.on("users_changed", () => refreshUsers().catch(() => {}));
    const offline = () => setStatus("offline");
    const reconnect = () => {
      setStatus("reconnecting");
      connection.connect();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", reconnect);
    return () => {
      connection.disconnect();
      socketRef.current = null;
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", reconnect);
    };
  }, [currentUser?.id, refreshUnread, refreshUsers]);
  useEffect(() => {
    if (!sidebarOpen) return;
    closeButton.current?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === "Tab" && window.innerWidth <= 768) {
        const items = sidebarRef.current?.querySelectorAll("button, input");
        const first = items?.[0],
          last = items?.[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [sidebarOpen]);
  async function logout() {
    setLoggingOut(true);
    setError("");
    try {
      await api.post("/auth/logout");
      socketRef.current?.disconnect();
      clearAuth();
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("draft:"))
        .forEach((k) => sessionStorage.removeItem(k));
      navigate("/login");
    } catch (err) {
      setError(errorText(err));
      setLoggingOut(false);
    }
  }
  const selectedUser = users.find((user) => user.id === selectedId);
  const filtered = users.filter((user) =>
    user.username.toLowerCase().includes(query.toLowerCase()),
  );
  const openMenu = () => setSidebarOpen(true);
  return (
    <main className="chat-container">
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close conversations"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        className={`sidebar ${sidebarOpen ? "open" : ""}`}
        aria-label="Conversations"
      >
        <div className="sidebar-brand">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">
              q
            </span>
            quiet<span className="brand-period">.</span>
          </span>
          <button
            ref={closeButton}
            className="close-sidebar-btn text-button"
            onClick={() => {
              setSidebarOpen(false);
              menuButton.current?.focus();
            }}
            aria-label="Close conversations"
          >
            ✕
          </button>
        </div>
        <div className="conversation-heading">
          <h2>Conversations</h2>
          <span>{users.length}</span>
        </div>
        <label className="search-field">
          <span className="sr-only">Search people</span>
          <input
            type="search"
            placeholder="Search people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <nav className="user-list" aria-label="People">
          {loading ? (
            <p className="list-note" role="status">
              Finding your people…
            </p>
          ) : filtered.length ? (
            filtered.map((user) => (
              <button
                key={user.id}
                className={`user-item ${user.id === selectedId && !profile ? "active" : ""}`}
                aria-current={
                  user.id === selectedId && !profile ? "true" : undefined
                }
                onClick={() => {
                  setSelectedId(user.id);
                  setProfile(false);
                  setSidebarOpen(false);
                }}
              >
                <span className="avatar">
                  {user.username.slice(0, 1).toUpperCase()}
                  <span
                    className={`presence ${online.includes(user.id) ? "online" : ""}`}
                  />
                </span>
                <span className="user-copy">
                  <strong>{user.username}</strong>
                  <small>
                    {online.includes(user.id)
                      ? "Online now"
                      : "Start a conversation"}
                  </small>
                </span>
                {unread[user.id] > 0 && (
                  <span
                    className="unread-badge"
                    aria-label={`${unread[user.id]} unread messages`}
                  >
                    {unread[user.id]}
                  </span>
                )}
              </button>
            ))
          ) : (
            <p className="list-note">
              {query
                ? "No people match your search."
                : "No one else is here yet. Invite someone to create an account."}
            </p>
          )}
        </nav>
        <div className="sidebar-account">
          <button
            className="account-button"
            onClick={() => {
              setProfile(true);
              setSidebarOpen(false);
            }}
          >
            <span className="avatar self">
              {currentUser?.username?.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{currentUser?.username}</strong>
              <small>Your account & settings</small>
            </span>
          </button>
          <button
            className="text-button signout"
            onClick={logout}
            disabled={loggingOut}
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
      <div className="workspace">
        {status !== "connected" && (
          <div className="connection-banner" role="status">
            {status === "offline"
              ? "You’re offline. Your draft stays here until you reconnect."
              : status === "session"
                ? "Your session ended. Please sign in again."
                : "Connecting to your conversations…"}
            <button
              className="text-button"
              onClick={() =>
                status === "session"
                  ? (clearAuth(), navigate("/login"))
                  : socket?.connect()
              }
            >
              {status === "session" ? "Sign in" : "Reconnect"}
            </button>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button
              className="text-button"
              onClick={() => {
                setError("");
                setLoading(true);
                refreshUsers()
                  .catch((err) => setError(errorText(err)))
                  .finally(() => setLoading(false));
              }}
            >
              Try again
            </button>
          </div>
        )}
        {keyError && (
          <div className="notice error" role="alert">
            {keyError}
          </div>
        )}
        {profile ? (
          <Profile
            user={currentUser}
            onClose={() => setProfile(false)}
            onPasswordChanged={() => {
              socket?.disconnect();
              socket?.connect();
            }}
          />
        ) : (
          <ChatWindow
            key={selectedUser?.id || "empty"}
            selectedUser={selectedUser}
            currentUser={currentUser}
            socket={socket}
            connected={status === "connected"}
            keyReady={keyReady}
            online={online.includes(selectedId)}
            onMenuClick={openMenu}
            menuButtonRef={menuButton}
            onRead={refreshUnread}
          />
        )}
      </div>
    </main>
  );
}
