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
      return setError("This password is too long. Try a shorter one.");
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
      <header className="auth-header">
        <Link to="/login" className="brand" aria-label="quiet home">
          quiet
        </Link>
        <Link
          className="auth-header-link"
          to={register ? "/login" : "/register"}
        >
          {register ? "Sign in" : "Create account"}
        </Link>
      </header>
      <section className="auth-box" aria-labelledby="auth-title">
        <h1 id="auth-title">{register ? "Create an account" : "Sign in"}</h1>
        <p className="auth-description">
          {register
            ? "Choose a username so people can find you."
            : "Enter your username and password."}
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
              title={
                register
                  ? "3–30 letters, numbers, underscores or hyphens"
                  : undefined
              }
              placeholder="Username"
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
            placeholder={register ? "Create a password" : "Password"}
            maxLength={72}
            aria-describedby={register ? "password-rules" : undefined}
          />
          {register && (
            <>
              <div className="password-rules" id="password-rules">
                {rules.map(([met, text]) => (
                  <span key={text} className={met ? "met" : ""}>
                    {met ? "✓" : "·"} {text}
                  </span>
                ))}
              </div>
              <PasswordField
                id="confirm-password"
                label="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat password"
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
                ? "Creating account…"
                : "Signing in…"
              : register
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <p className="auth-link">
          {register ? "Already have an account?" : "No account yet?"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create one"}
          </Link>
        </p>
      </section>
      <footer className="auth-footer">Messages are kept for 24 hours.</footer>
    </main>
  );
}
