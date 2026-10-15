import React, { useState } from "react";
import api, { errorText } from "../utils/api";
import { passwordKeyUpdate } from "../utils/encryption";
import PasswordField from "./PasswordField";
import Icon from "./Icon";
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
      const keyUpdate = await passwordKeyUpdate(
        user.id,
        currentPassword,
        newPassword,
      );
      const { data } = await api.put("/auth/password", {
        ...keyUpdate,
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
        <h2 id="profile-heading">Account settings</h2>
        <button onClick={onClose} className="text-button">
          <Icon name="back" size={16} /> Back to chat
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
          Use at least 8 characters, with an uppercase letter, a lowercase
          letter, and a number.
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
        <h3>Message access</h3>
        <p>
          Sign in with your account password to open messages on another browser
          or device. Your messaging key is backed up encrypted. History is kept
          for 24 hours.
        </p>
      </div>
    </section>
  );
}
