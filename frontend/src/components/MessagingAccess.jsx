import React, { useEffect, useState } from "react";
import api, { errorText } from "../utils/api";
import { unlockIdentity } from "../utils/encryption";
import PasswordField from "./PasswordField";
export default function MessagingAccess({ userId, onReady }) {
  const [info, setInfo] = useState(null),
    [password, setPassword] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .get("/auth/messaging-key")
      .then(({ data }) => {
        if (active) setInfo(data);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [userId]);
  const migrating = info && !info.backup && !!info.publicKey;
  async function submit(event) {
    event.preventDefault();
    if (busy || !info || (migrating && !consent)) return;
    setBusy(true);
    setError("");
    try {
      await unlockIdentity(userId, password, {
        replaceLegacy: !!migrating && consent,
      });
      setPassword("");
      onReady();
    } catch (e) {
      setError(errorText(e, e.message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-panel" aria-labelledby="messaging-access-title">
      <h2 id="messaging-access-title">
        {info?.backup
          ? "Unlock your messages"
          : "Link messaging to your account"}
      </h2>
      <p className="muted">
        Your password unlocks an encrypted copy of your messaging key, so you
        can use the same account on other browsers and devices.
      </p>
      {migrating && (
        <p className="notice">
          Your account uses the older browser-only key. Switching creates a new
          account key. Earlier messages cannot be opened with the new key; no
          accounts or messages will be deleted.
        </p>
      )}
      <form className="auth-form profile-form" onSubmit={submit}>
        <PasswordField
          id="messaging-password"
          label="Account password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          maxLength={72}
        />
        {migrating && (
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />{" "}
            I understand that earlier messages will not open with the new key.
          </label>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={busy || !info || (migrating && !consent)}
        >
          {busy
            ? "Unlocking…"
            : info?.backup
              ? "Unlock messages"
              : "Enable account messaging"}
        </button>
      </form>
    </section>
  );
}
