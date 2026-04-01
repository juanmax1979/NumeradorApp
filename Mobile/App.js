import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import LoginScreen from "./src/screens/LoginScreen";
import MainScreen from "./src/screens/MainScreen";
import api, {
  loadStoredAuth,
  saveAuth,
  setAuthToken,
  setOnAuthFailure,
  setOnTokenRefreshed,
  clearAuth,
} from "./src/api";

export default function App() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { token: t, user: u } = await loadStoredAuth();
        if (t) setAuthToken(t);
        if (!alive) return;
        setToken(t || null);
        setUser(u);
      } catch (e) {
        console.error("[Numerador] loadStoredAuth", e);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setOnAuthFailure(async () => {
      await clearAuth();
      setToken(null);
      setUser(null);
    });
    setOnTokenRefreshed((nextUser) => setUser(nextUser));
  }, []);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#3d627a" />
      </View>
    );
  }

  return (
    <SafeAreaProvider style={styles.flex}>
      {token ? (
        <MainScreen
          user={user}
          onUserUpdate={setUser}
          onLogout={async () => {
            try {
              await api.post("/auth/logout");
            } catch (_) {}
            await clearAuth();
            setToken(null);
            setUser(null);
          }}
        />
      ) : (
        <LoginScreen
          onSuccess={async ({ token: tk, user: usr }) => {
            await saveAuth(tk, usr);
            setAuthToken(tk);
            setToken(tk);
            setUser(usr);
          }}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#e4edf4" },
  flex: { flex: 1 },
});
