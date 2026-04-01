import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import api from "../api";
import { generateCaptchaCode } from "../helpers";

export default function LoginScreen({ onSuccess }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [pcName] = useState(
    `${Constants.deviceName || "Mobile"} | ${Platform.OS}`.slice(0, 120)
  );
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptchaCode());
  const [captchaInput, setCaptchaInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  async function doLogin(forceSession = false) {
    setLoginError("");
    if (captchaInput.trim().toUpperCase() !== captchaCode) {
      setLoginError("Codigo de verificacion incorrecto");
      setCaptchaCode(generateCaptchaCode());
      setCaptchaInput("");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", {
        usuario,
        password,
        pcName,
        forceSession,
      });
      await onSuccess({ token: data.token, user: data.user });
    } catch (error) {
      if (error.response?.status === 409 && error.response?.data?.code === "SESSION_ACTIVE") {
        Alert.alert(
          "Sesión activa",
          `El usuario está activo en ${error.response.data.activePc}.\n\n¿Forzar ingreso?`,
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Forzar", onPress: () => doLogin(true) },
          ]
        );
        return;
      }
      setLoginError(error.response?.data?.message || "No se pudo iniciar sesión");
      setCaptchaCode(generateCaptchaCode());
      setCaptchaInput("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Text style={styles.title}>Numerador</Text>
            <Text style={styles.subtitle}>Gestión y numeración de recaudos judiciales</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.h2}>Inicio de sesión</Text>
            <TextInput
              style={styles.input}
              placeholder="Usuario"
              placeholderTextColor="#6f7a82"
              autoCapitalize="none"
              value={usuario}
              onChangeText={setUsuario}
            />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="#6f7a82"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <View style={styles.captchaRow}>
              <View style={styles.captchaBox}>
                <Text style={styles.captchaText}>{captchaCode}</Text>
              </View>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => {
                  setCaptchaCode(generateCaptchaCode());
                  setCaptchaInput("");
                  setLoginError("");
                }}
              >
                <Text style={styles.btnSecondaryText}>Regenerar</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Código de verificación"
              placeholderTextColor="#6f7a82"
              autoCapitalize="characters"
              value={captchaInput}
              onChangeText={setCaptchaInput}
            />

            <TouchableOpacity
              style={[styles.btnPrimary, loading && styles.btnDisabled]}
              onPress={() => doLogin(false)}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Iniciar sesión</Text>
              )}
            </TouchableOpacity>

            {loginError ? <Text style={styles.error}>{loginError}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#e4edf4" },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "center",
  },
  brand: {
    backgroundColor: "#4a7390",
    padding: 24,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#faf9f7",
  },
  subtitle: {
    marginTop: 8,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    fontSize: 14,
  },
  form: {
    backgroundColor: "#fdfcfc",
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(74, 115, 144, 0.28)",
  },
  h2: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3d627a",
    marginBottom: 14,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#b3c9d9",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
    backgroundColor: "#faf9f7",
    color: "#243848",
  },
  captchaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  captchaBox: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#6f96b0",
    backgroundColor: "#e9f0f6",
    justifyContent: "center",
    alignItems: "center",
  },
  captchaText: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 6,
    color: "#2f4f66",
  },
  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#8cadc4",
  },
  btnSecondaryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  btnPrimary: {
    marginTop: 6,
    backgroundColor: "#5c85a0",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.7 },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  error: {
    marginTop: 10,
    color: "#943d3d",
    fontWeight: "600",
  },
});
