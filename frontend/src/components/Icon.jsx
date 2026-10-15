import React from "react";
const paths = {
  menu: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  send: (
    <>
      <path d="m21 3-7 18-4-7-7-4 18-7Z" />
      <path d="m10 14 5-5" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      <path
        d="m9 3-.7 2.2-2 .9-2.1-.5-1.5 2.6 1.5 1.7-.2 2.2L2.5 14 4 16.6l2.2-.3 1.9 1.3.5 2.2h3l1-2 2.1-.8 2.1.5 1.5-2.6-1.3-1.8.1-2.2 1.7-1.7-1.5-2.6-2.2.3-1.9-1.3-.5-2.2H9Z"
        transform="translate(1 0)"
      />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H5v16h5M10 12h11m-4-4 4 4-4 4" />
    </>
  ),
  message: (
    <>
      <path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9Z" />
      <path d="M8 8h8M8 12h5" />
    </>
  ),
  back: (
    <>
      <path d="m12 5-7 7 7 7M5 12h15" />
    </>
  ),
};
export default function Icon({ name, size = 18, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
