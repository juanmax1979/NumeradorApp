import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

function normalizeApiUrl(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "http://localhost:4000/api";

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const withoutTrailingSlash = withProtocol.replace(/\/+$/, "");

  if (/\/api$/i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  return `${withoutTrailingSlash}/api`;
}

const baseURL = normalizeApiUrl(
  process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl
);

const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 60000,
});

const TOKEN_KEY = "numerador_token";
const USER_KEY = "numerador_user";

export async function loadStoredAuth() {
  const [token, userJson] = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
  const t = token[1];
  const userStr = userJson[1];
  let user = null;
  if (userStr) {
    try {
      user = JSON.parse(userStr);
    } catch (_) {
      await AsyncStorage.removeItem(USER_KEY);
    }
  }
  return {
    token: t || "",
    user,
  };
}

export async function saveAuth(token, user) {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user)],
  ]);
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export async function clearAuth() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  delete api.defaults.headers.common.Authorization;
}

let onAuthFailure = () => {};
let onTokenRefreshed = () => {};

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export function setOnAuthFailure(handler) {
  onAuthFailure = typeof handler === "function" ? handler : () => {};
}

/** Called after a successful /auth/refresh when the server returns `user`. */
export function setOnTokenRefreshed(handler) {
  onTokenRefreshed = typeof handler === "function" ? handler : () => {};
}

let isRefreshing = false;
let queue = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const url = String(originalRequest.url || "");
    const isAuthRoute = url.includes("/auth/login") || url.includes("/auth/refresh");

    if (status !== 401 || originalRequest._retry || isAuthRoute) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then((newToken) => {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      });
    }

    isRefreshing = true;
    try {
      const { data } = await api.post("/auth/refresh");
      setAuthToken(data.token);
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      if (data.user) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
        onTokenRefreshed(data.user);
      }
      queue.forEach((p) => p.resolve(data.token));
      queue = [];
      originalRequest.headers.Authorization = `Bearer ${data.token}`;
      return api(originalRequest);
    } catch (refreshError) {
      queue.forEach((p) => p.reject(refreshError));
      queue = [];
      onAuthFailure();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export function getApiBaseUrl() {
  return baseURL.replace(/\/api\/?$/, "");
}

export default api;
