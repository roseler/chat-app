export const setUser = (user) =>
  sessionStorage.setItem("user", JSON.stringify(user));
export const getUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem("user"));
  } catch {
    return null;
  }
};
export const clearAuth = () => {
  sessionStorage.removeItem("user");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  Object.keys(localStorage)
    .filter(
      (k) => k.startsWith("shared_key_") || k.startsWith("encryption_key_"),
    )
    .forEach((k) => localStorage.removeItem(k));
};
export const isAuthenticated = () => !!getUser();
