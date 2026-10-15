import React, { useState } from "react";
export default function PasswordField({
  id = "password",
  label = "Password",
  ...props
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span className="password-control">
        <input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          required
        />
        <button
          className="password-toggle"
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </div>
  );
}
