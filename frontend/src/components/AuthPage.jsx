import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { errorText } from "../utils/api";
import { clearAuth, setUser } from "../utils/auth";
import PasswordField from "./PasswordField";
export default function AuthPage({ register = false }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const rules = [
    [password.length >= 8, "8+ characters"],
    [/[A-Z]/.test(password), "Uppercase"],
    [/[a-z]/.test(password), "Lowercase"],
    [/[0-9]/.test(password), "Number"],
  ];
  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (register && password !== confirm)
      return setError("Your passwords do not match.");
    if (register && rules.some(([met]) => !met))
      return setError("Please meet all password requirements.");
    if (new TextEncoder().encode(password).length > 72)
      return setError("Please use a password of 72 bytes or fewer.");
    setLoading(true);
    try {
      const { data } = await api.post(
        `/auth/${register ? "register" : "login"}`,
        { username: username.trim(), email: email.trim(), password },
      );
      clearAuth();
      setUser(data.user);
      navigate("/chat");
    } catch (err) {
      setError(errorText(err, "Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="auth-container">
      <div className="auth-layout">
        <section className="auth-intro">
          <Link to="/login" className="brand">
            <span className="brand-mark" aria-hidden="true">
              q
            </span>
            quiet<span className="brand-period">.</span>
          </Link>
          <div className="intro-copy">
            <span className="eyebrow">A LITTLE SPACE TO CONNECT</span>
            <h1>
              Good conversations.
              <br />
              <span>Less noise.</span>
            </h1>
            <p>A simple place for the people and conversations that matter.</p>
            <div className="intro-note">
              <span aria-hidden="true">↗</span> Real-time messages. A calmer
              kind of chat.
            </div>
          </div>
          <p className="intro-footer">Make room for a conversation.</p>
        </section>
        <section className="auth-box" aria-labelledby="auth-title">
          <span className="eyebrow">
            {register ? "YOUR NEXT CONVERSATION STARTS HERE" : "WELCOME BACK"}
          </span>
          <h2 id="auth-title">
            {register ? "Find your people." : "Come on in."}
          </h2>
          <p className="auth-description">
            {register
              ? "Create an account and say hello."
              : "Sign in to pick up where you left off."}
          </p>
          <form className="auth-form" onSubmit={submit} aria-busy={loading}>
            <label className="field" htmlFor="username">
              <span>Username</span>
              <input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={register ? 3 : undefined}
                maxLength={30}
                pattern={register ? "[A-Za-z0-9_-]{3,30}" : undefined}
                placeholder="Your username"
                autoFocus
              />
            </label>
            {register && (
              <label className="field" htmlFor="email">
                <span>Email address</span>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={255}
                  placeholder="you@example.com"
                />
              </label>
            )}
            <PasswordField
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder={
                register ? "Create a strong password" : "Your password"
              }
              maxLength={72}
              aria-describedby={register ? "password-rules" : undefined}
            />
            {register && (
              <>
                <div className="password-rules" id="password-rules">
                  {rules.map(([met, text]) => (
                    <span key={text} className={met ? "met" : ""}>
                      {met ? "✓" : "○"} {text}
                    </span>
                  ))}
                </div>
                <PasswordField
                  id="confirm-password"
                  label="Confirm password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Once more, just to be sure"
                  maxLength={72}
                />
              </>
            )}
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button" disabled={loading} type="submit">
              {loading
                ? register
                  ? "Creating your account…"
                  : "Signing in…"
                : register
                  ? "Create account"
                  : "Sign in"}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="auth-link">
            {register ? "Already have an account?" : "New around here?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <p className="auth-footnote">A quieter corner of the internet.</p>
        </section>
      </div>
    </main>
  );
}
