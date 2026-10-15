import React, { useState } from "react";
import api, { errorText } from "../utils/api";
import PasswordField from "./PasswordField";
export default function Profile({ user, onClose, onPasswordChanged }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword !== confirm) return setError("New passwords do not match.");
    setBusy(true);
    try {
      const { data } = await api.put("/auth/password", {
        currentPassword,
        newPassword,
      });
      setSuccess(data.message);
      setCurrent("");
      setNew("");
      setConfirm("");
      onPasswordChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-panel" aria-labelledby="profile-heading">
      <div className="panel-heading">
        <h2 id="profile-heading">Your account</h2>
        <button onClick={onClose} className="text-button">
          Back to chat
        </button>
      </div>
      <div className="profile-details">
        <span className="avatar large">
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <h3>{user.username}</h3>
        <p>{user.email}</p>
        <p className="muted">Your email is only visible to you.</p>
      </div>
      <form className="auth-form profile-form" onSubmit={submit}>
        <h3>Change password</h3>
        <p className="muted">
          Use 8+ characters with uppercase, lowercase, and a number. Maximum 72
          bytes.
        </p>
        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
        />
        <PasswordField
          id="confirm-new"
          label="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="notice success" role="status">
            {success}
          </div>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
      <div className="privacy-note">
        <h3>Your messaging key stays here</h3>
        <p>
          Encrypted messaging is tied to this browser. Clearing site data
          removes your private key. Other browsers cannot unlock your
          conversations. Messages are removed from the server after 24 hours.
        </p>
      </div>
    </section>
  );
}
