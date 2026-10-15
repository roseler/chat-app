import axios from "axios";
import { clearAuth } from "./auth";
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  `${window.location.protocol}//${window.location.hostname}:3001`;
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `${SOCKET_URL}/api`,
  withCredentials: true,
  timeout: 15000,
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !/\/(login|register)$/.test(error.config?.url || "")
    ) {
      clearAuth();
      window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);
export const errorText = (
  error,
  fallback = "Unable to connect. Please try again.",
) =>
  error.response?.data?.error ||
  (error.code === "ECONNABORTED"
    ? "The request timed out. Please try again."
    : fallback);
export default api;
