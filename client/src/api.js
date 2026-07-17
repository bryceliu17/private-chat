export const API_URL = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:5001`
  : (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, "");

export const APK_DOWNLOAD_URL = `${API_URL}/api/downloads/android`;
