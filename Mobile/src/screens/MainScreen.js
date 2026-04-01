import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import dayjs from "dayjs";
import api from "../api";
import {
  TYPES,
  TAB_KEYS,
  fmtDate,
  normalizeExpedienteInput,
  isValidExpediente,
  PAGE_SIZE_OPTIONS,
} from "../helpers";

export default function MainScreen({ user, onUserUpdate, onLogout }) {
  const [activeTab, setActiveTab] = useState(TYPES[0]);
  const [categorias, setCategorias] = useState({});
  const [tipoRows, setTipoRows] = useState([]);
  const [tipoSearch, setTipoSearch] = useState("");
  const [nextNumber, setNextNumber] = useState(null);
  const [formByType, setFormByType] = useState(
    Object.fromEntries(
      TYPES.map((t) => [t, { expediente: "", detalleSelect: "", detalleOtro: "" }])
    )
  );
  const [globalFilters, setGlobalFilters] = useState({
    q: "",
    tipo: "TODOS",
    from: dayjs().startOf("year").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
  });
  const [globalRows, setGlobalRows] = useState([]);
  const [statsYear, setStatsYear] = useState(new Date().getFullYear());
  const [stats, setStats] = useState({ totals: [], monthly: [], ranking: [], auditLog: [] });
  const [paginationByTab, setPaginationByTab] = useState(() =>
    Object.fromEntries(TAB_KEYS.map((tab) => [tab, { page: 1, pageSize: 20 }]))
  );
  const [editModal, setEditModal] = useState(null);
  const [adminDepOpen, setAdminDepOpen] = useState(false);
  const [adminDniOpen, setAdminDniOpen] = useState(false);
  const [adminDepForm, setAdminDepForm] = useState({ nombre: "", dependenciaId: "" });
  const [adminDniNombre, setAdminDniNombre] = useState("");
  const [adminDniValue, setAdminDniValue] = useState("");
  const [dependencias, setDependencias] = useState([]);
  const [exporting, setExporting] = useState(false);

  const displayName = user?.nombreCompleto || user?.nombre || "-";
  const displayUser = user?.usuario || user?.nombre || "-";

  async function refreshUser() {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const raw = await AsyncStorage.getItem("numerador_user");
    if (raw && onUserUpdate) onUserUpdate(JSON.parse(raw));
  }

  useEffect(() => {
    loadCategorias();
  }, []);

  useEffect(() => {
    if (!TYPES.includes(activeTab)) return;
    loadTipoRows(activeTab, tipoSearch);
    loadNextNumber(activeTab);
  }, [activeTab]);

  const categoryOptions = useMemo(() => {
    const catByType = categorias[activeTab];
    if (!catByType || typeof catByType !== "object") return [];
    const opts = [];
    Object.entries(catByType).forEach(([categoria, subs]) => {
      if (!subs?.length) {
        opts.push({
          value: activeTab === "OFICIO" ? `Of. ${categoria}` : categoria,
          label: categoria,
        });
      } else {
        subs.forEach((sub) => {
          opts.push({
            value:
              activeTab === "OFICIO"
                ? `Of. ${categoria} (${sub})`
                : `${categoria} (${sub})`,
            label: `${categoria} -> ${sub}`,
          });
        });
      }
    });
    opts.push({ value: "__OTROS__", label: "OTROS (especificar)" });
    return opts;
  }, [categorias, activeTab]);

  async function loadCategorias() {
    try {
      const { data } = await api.get("/meta/categorias");
      setCategorias(data);
    } catch (_) {}
  }

  async function loadNextNumber(tipo) {
    try {
      const { data } = await api.get(`/records/next-number/${encodeURIComponent(tipo)}`);
      setNextNumber(data.proximo);
    } catch (_) {}
  }

  async function loadTipoRows(tipo, q) {
    try {
      const { data } = await api.get("/records", { params: { tipo, q, limit: 150 } });
      setTipoRows(data);
      setPaginationByTab((prev) => ({
        ...prev,
        [tipo]: { ...(prev[tipo] || { page: 1, pageSize: 20 }), page: 1 },
      }));
    } catch (_) {}
  }

  async function loadGlobalRows() {
    const from = `${globalFilters.from} 00:00:00`;
    const to = `${globalFilters.to} 23:59:59`;
    try {
      const { data } = await api.get("/records", {
        params: {
          tipo: globalFilters.tipo,
          q: globalFilters.q,
          from,
          to,
          limit: 250,
        },
      });
      setGlobalRows(data);
      setPaginationByTab((prev) => ({
        ...prev,
        BUSCADOR: { ...(prev.BUSCADOR || { page: 1, pageSize: 20 }), page: 1 },
      }));
    } catch (_) {}
  }

  async function loadStats() {
    try {
      const { data } = await api.get("/stats", { params: { year: statsYear } });
      setStats(data);
    } catch (_) {}
  }

  async function exportBuscadorExcel() {
    setExporting(true);
    try {
      const from = `${globalFilters.from} 00:00:00`;
      const to = `${globalFilters.to} 23:59:59`;
      const base = api.defaults.baseURL.replace(/\/$/, "");
      const params = new URLSearchParams({
        tipo: globalFilters.tipo,
        q: globalFilters.q,
        from,
        to,
        limit: "1000",
      });
      const uri = `${base}/records/export.xlsx?${params.toString()}`;
      const auth = api.defaults.headers.common.Authorization;
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!dir) {
        Alert.alert("Exportación", "Este dispositivo no expone carpeta temporal para descargar.");
        return;
      }
      const target = `${dir}registros_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
      const result = await FileSystem.downloadAsync(uri, target, {
        headers: auth ? { Authorization: String(auth) } : {},
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      } else {
        Alert.alert("Exportación", "Archivo guardado en caché de la app.");
      }
    } catch (e) {
      Alert.alert("Exportación", e.response?.data?.message || "No se pudo exportar");
    } finally {
      setExporting(false);
    }
  }

  async function createRecord() {
    const form = formByType[activeTab];
    const detalle =
      form.detalleSelect === "__OTROS__" ? form.detalleOtro.trim() : form.detalleSelect.trim();
    if (!isValidExpediente(form.expediente)) {
      Alert.alert(
        "Validación",
        "Expediente inválido. Formato: hasta 5 dígitos / año / - dígito (ej: 12345/2026-1)"
      );
      return;
    }
    if (!detalle) {
      Alert.alert("Validación", "Debe seleccionar o ingresar detalle");
      return;
    }
    try {
      await api.post("/records", {
        tipo: activeTab,
        expediente: form.expediente.trim(),
        detalle,
      });
      setFormByType((prev) => ({
        ...prev,
        [activeTab]: { expediente: "", detalleSelect: "", detalleOtro: "" },
      }));
      await loadTipoRows(activeTab, tipoSearch);
      await loadNextNumber(activeTab);
    } catch (e) {
      Alert.alert("Error", e.response?.data?.message || "No se pudo guardar");
    }
  }

  async function actionAnnul(row) {
    Alert.alert("Anular", `¿Anular ${row.tipo} N° ${row.numero}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Anular",
        style: "destructive",
        onPress: async () => {
          try {
            await api.post(`/records/${row.id}/annul`);
            await refreshCurrentView();
          } catch (e) {
            Alert.alert("Error", e.response?.data?.message || "Falló la anulación");
          }
        },
      },
    ]);
  }

  async function actionDelete(row) {
    Alert.alert("Borrar", `¿Borrar definitivamente ${row.tipo} N° ${row.numero}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/records/${row.id}`);
            await refreshCurrentView();
          } catch (e) {
            Alert.alert("Error", e.response?.data?.message || "No se pudo borrar");
          }
        },
      },
    ]);
  }

  async function actionToggleRemitido(row) {
    try {
      await api.post(`/records/${row.id}/toggle-remitido`);
      await refreshCurrentView();
    } catch (e) {
      Alert.alert("Error", e.response?.data?.message || "Error");
    }
  }

  async function refreshCurrentView() {
    if (TYPES.includes(activeTab)) {
      await loadTipoRows(activeTab, tipoSearch);
      await loadNextNumber(activeTab);
      return;
    }
    if (activeTab === "BUSCADOR") await loadGlobalRows();
    if (activeTab === "ESTADISTICAS") await loadStats();
    await refreshUser();
  }

  async function openAdminDep() {
    try {
      const { data } = await api.get("/meta/dependencias");
      setDependencias(data.filter((d) => d.activa));
      setAdminDepForm({ nombre: "", dependenciaId: String(data.find((d) => d.activa)?.id || "") });
      setAdminDepOpen(true);
    } catch (_) {
      Alert.alert("Error", "No se pudieron cargar dependencias");
    }
  }

  async function submitAdminDep() {
    const dependenciaId = Number(adminDepForm.dependenciaId);
    if (!adminDepForm.nombre.trim() || !Number.isInteger(dependenciaId) || dependenciaId <= 0) {
      Alert.alert("Validación", "Nombre de usuario e ID de dependencia válidos requeridos");
      return;
    }
    try {
      await api.put(`/users/${encodeURIComponent(adminDepForm.nombre.trim())}/dependencia`, {
        dependenciaId,
      });
      setAdminDepOpen(false);
      Alert.alert("OK", "Dependencia actualizada");
    } catch (e) {
      Alert.alert("Error", e.response?.data?.message || "No se pudo actualizar");
    }
  }

  async function submitAdminDni() {
    if (!adminDniNombre.trim()) {
      Alert.alert("Validación", "Ingrese nombre de usuario");
      return;
    }
    const dni = adminDniValue.trim();
    if (dni && !/^\d+$/.test(dni)) {
      Alert.alert("Validación", "DNI solo números");
      return;
    }
    try {
      await api.put(`/users/${encodeURIComponent(adminDniNombre.trim())}/dni`, { dni });
      setAdminDniOpen(false);
      setAdminDniNombre("");
      setAdminDniValue("");
      Alert.alert("OK", "DNI actualizado");
    } catch (e) {
      Alert.alert("Error", e.response?.data?.message || "No se pudo actualizar");
    }
  }

  const rows = activeTab === "BUSCADOR" ? globalRows : tipoRows;
  const currentPagination = paginationByTab[activeTab] || { page: 1, pageSize: 20 };
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / currentPagination.pageSize));
  const safePage = Math.min(currentPagination.page, totalPages);
  const fromIdx = (safePage - 1) * currentPagination.pageSize;
  const paginatedRows = rows.slice(fromIdx, fromIdx + currentPagination.pageSize);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topbar}>
        <View style={styles.topbarTextWrap}>
          <Text style={styles.topbarTitle} numberOfLines={2}>
            <Text style={styles.bold}>{displayName}</Text>
            {"\n"}
            <Text style={styles.topbarSub}>
              ({displayUser}) · {user?.rol || "?"} · {user?.dependencia || "GENERAL"}
            </Text>
          </Text>
        </View>
        <View style={styles.topbarActions}>
          {user?.rol === "admin" && (
            <TouchableOpacity style={styles.topBtn} onPress={openAdminDep}>
              <Text style={styles.topBtnText}>Dep.</Text>
            </TouchableOpacity>
          )}
          {user?.rol === "admin" && (
            <TouchableOpacity style={styles.topBtn} onPress={() => setAdminDniOpen(true)}>
              <Text style={styles.topBtnText}>DNI</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.topBtn} onPress={refreshCurrentView}>
            <Text style={styles.topBtnText}>↻</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={onLogout}>
            <Text style={styles.topBtnText}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabRow}
      >
        {TAB_KEYS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabChip, tab === activeTab && styles.tabChipActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabChipText, tab === activeTab && styles.tabChipTextActive]}>
              {tab === "SENTENCIA TRAMITE" ? "S.TRAMITE" : tab === "SENTENCIA RELATORIA" ? "S.RELAT." : tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {TYPES.includes(activeTab) && (
          <View style={styles.card}>
            <Text style={styles.h2}>{activeTab}</Text>
            <Text style={styles.muted}>Próximo número: {nextNumber ?? "-"}</Text>
            <TextInput
              style={styles.input}
              placeholder="Expediente (ej: 12345/2026-1)"
              value={formByType[activeTab].expediente}
              onChangeText={(t) =>
                setFormByType((p) => ({
                  ...p,
                  [activeTab]: { ...p[activeTab], expediente: normalizeExpedienteInput(t) },
                }))
              }
              maxLength={12}
              keyboardType="default"
            />
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={formByType[activeTab].detalleSelect}
                onValueChange={(v) =>
                  setFormByType((p) => ({
                    ...p,
                    [activeTab]: { ...p[activeTab], detalleSelect: v },
                  }))
                }
              >
                <Picker.Item label="Seleccione detalle" value="" />
                {categoryOptions.map((o) => (
                  <Picker.Item key={o.label} label={o.label} value={o.value} />
                ))}
              </Picker>
            </View>
            {formByType[activeTab].detalleSelect === "__OTROS__" && (
              <TextInput
                style={styles.input}
                placeholder="Especificar detalle"
                value={formByType[activeTab].detalleOtro}
                onChangeText={(t) =>
                  setFormByType((p) => ({
                    ...p,
                    [activeTab]: { ...p[activeTab], detalleOtro: t },
                  }))
                }
              />
            )}
            <TouchableOpacity style={styles.btnPrimary} onPress={createRecord}>
              <Text style={styles.btnPrimaryText}>Guardar</Text>
            </TouchableOpacity>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Filtrar"
                value={tipoSearch}
                onChangeText={setTipoSearch}
              />
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => loadTipoRows(activeTab, tipoSearch)}
              >
                <Text style={styles.btnSecondaryText}>Buscar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === "BUSCADOR" && (
          <View style={styles.card}>
            <Text style={styles.h2}>Buscador global</Text>
            <TextInput
              style={styles.input}
              placeholder="Texto"
              value={globalFilters.q}
              onChangeText={(t) => setGlobalFilters((p) => ({ ...p, q: t }))}
            />
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={globalFilters.tipo}
                onValueChange={(v) => setGlobalFilters((p) => ({ ...p, tipo: v }))}
              >
                <Picker.Item label="TODOS" value="TODOS" />
                {TYPES.map((t) => (
                  <Picker.Item key={t} label={t} value={t} />
                ))}
              </Picker>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Desde (YYYY-MM-DD)"
              value={globalFilters.from}
              onChangeText={(t) => setGlobalFilters((p) => ({ ...p, from: t }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Hasta (YYYY-MM-DD)"
              value={globalFilters.to}
              onChangeText={(t) => setGlobalFilters((p) => ({ ...p, to: t }))}
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={loadGlobalRows}>
              <Text style={styles.btnPrimaryText}>Buscar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSecondary, exporting && { opacity: 0.6 }]}
              onPress={exportBuscadorExcel}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnSecondaryText}>Exportar Excel</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {activeTab === "ESTADISTICAS" && (
          <View style={styles.card}>
            <Text style={styles.h2}>Estadísticas</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { width: 100 }]}
                keyboardType="number-pad"
                value={String(statsYear)}
                onChangeText={(t) => setStatsYear(Number(t) || new Date().getFullYear())}
              />
              <TouchableOpacity style={styles.btnSecondary} onPress={loadStats}>
                <Text style={styles.btnSecondaryText}>Cargar</Text>
              </TouchableOpacity>
            </View>
            {TYPES.map((t) => {
              const row = stats.totals.find((x) => x.tipo === t);
              return (
                <Text key={t} style={styles.statLine}>
                  {t}: <Text style={styles.bold}>{row?.total ?? 0}</Text>
                </Text>
              );
            })}
            <Text style={[styles.h2, { marginTop: 12 }]}>Ranking de detalles</Text>
            {stats.ranking.slice(0, 30).map((r, idx) => (
              <Text key={`${r.detalle}-${idx}`} style={styles.rankingLine}>
                {idx + 1}. {r.detalle} ({r.tipo}) — {r.cantidad}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.h2}>Registros</Text>
          <FlatList
            data={paginatedRows}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
            renderItem={({ item: row }) => (
              <View style={[styles.rowCard, row.expediente === "ANULADO" && styles.anulado]}>
                <Text style={styles.rowTitle}>
                  {row.tipo} N° {row.numero}/{row.anio}
                </Text>
                <Text style={styles.rowMeta}>Exp: {row.expediente}</Text>
                <Text style={styles.rowMeta}>{row.detalle}</Text>
                <Text style={styles.rowMeta}>
                  {fmtDate(row.fecha)} · {row.usuario}
                  {row.remitido ? " · Remitido" : ""}
                </Text>
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={styles.miniBtn}
                    onPress={() =>
                      setEditModal({
                        id: row.id,
                        expediente: row.expediente,
                        detalle: row.detalle || "",
                      })
                    }
                  >
                    <Text style={styles.miniBtnText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.miniBtn} onPress={() => actionAnnul(row)}>
                    <Text style={styles.miniBtnText}>Anular</Text>
                  </TouchableOpacity>
                  {row.tipo === "OFICIO" && (
                    <TouchableOpacity style={styles.miniBtn} onPress={() => actionToggleRemitido(row)}>
                      <Text style={styles.miniBtnText}>Remitido</Text>
                    </TouchableOpacity>
                  )}
                  {user?.rol === "admin" && (
                    <TouchableOpacity style={styles.miniBtnDanger} onPress={() => actionDelete(row)}>
                      <Text style={styles.miniBtnText}>Borrar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.muted}>Sin registros en esta vista.</Text>}
          />

          <View style={styles.pagination}>
            <Text style={styles.paginationInfo}>
              {totalRows === 0
                ? "0 registros"
                : `${(safePage - 1) * currentPagination.pageSize + 1}-${Math.min(
                    safePage * currentPagination.pageSize,
                    totalRows
                  )} de ${totalRows}`}
            </Text>
            <View style={styles.pickerWrapSmall}>
              <Picker
                selectedValue={currentPagination.pageSize}
                onValueChange={(pageSize) =>
                  setPaginationByTab((prev) => ({
                    ...prev,
                    [activeTab]: {
                      ...(prev[activeTab] || { page: 1, pageSize: 20 }),
                      page: 1,
                      pageSize: Number(pageSize),
                    },
                  }))
                }
                style={{ height: Platform.OS === "ios" ? 120 : 48 }}
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <Picker.Item key={opt} label={`${opt} por página`} value={opt} />
                ))}
              </Picker>
            </View>
            <View style={styles.paginationRow}>
              <TouchableOpacity
                style={[styles.miniBtn, safePage <= 1 && styles.disabled]}
                disabled={safePage <= 1}
                onPress={() =>
                  setPaginationByTab((prev) => ({
                    ...prev,
                    [activeTab]: {
                      ...(prev[activeTab] || { page: 1, pageSize: 20 }),
                      page: Math.max(1, safePage - 1),
                    },
                  }))
                }
              >
                <Text style={styles.miniBtnText}>Anterior</Text>
              </TouchableOpacity>
              <Text style={styles.pageLabel}>
                {safePage} / {totalPages}
              </Text>
              <TouchableOpacity
                style={[styles.miniBtn, safePage >= totalPages && styles.disabled]}
                disabled={safePage >= totalPages}
                onPress={() =>
                  setPaginationByTab((prev) => ({
                    ...prev,
                    [activeTab]: {
                      ...(prev[activeTab] || { page: 1, pageSize: 20 }),
                      page: Math.min(totalPages, safePage + 1),
                    },
                  }))
                }
              >
                <Text style={styles.miniBtnText}>Siguiente</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!editModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Modificar registro</Text>
            <TextInput
              style={styles.input}
              placeholder="Expediente"
              value={editModal?.expediente || ""}
              onChangeText={(t) =>
                setEditModal((m) => (m ? { ...m, expediente: normalizeExpedienteInput(t) } : m))
              }
            />
            <TextInput
              style={styles.input}
              placeholder="Detalle"
              value={editModal?.detalle || ""}
              onChangeText={(t) => setEditModal((m) => (m ? { ...m, detalle: t } : m))}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setEditModal(null)}>
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={async () => {
                  if (!editModal) return;
                  if (!isValidExpediente(editModal.expediente)) {
                    Alert.alert("Validación", "Expediente inválido");
                    return;
                  }
                  try {
                    await api.put(`/records/${editModal.id}`, {
                      expediente: editModal.expediente.trim(),
                      detalle: editModal.detalle.trim(),
                    });
                    setEditModal(null);
                    await refreshCurrentView();
                  } catch (e) {
                    Alert.alert("Error", e.response?.data?.message || "No se pudo guardar");
                  }
                }}
              >
                <Text style={styles.btnPrimaryText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={adminDepOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Cambiar dependencia</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre de usuario (clave local)"
              value={adminDepForm.nombre}
              onChangeText={(t) => setAdminDepForm((p) => ({ ...p, nombre: t }))}
            />
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={adminDepForm.dependenciaId}
                onValueChange={(v) => setAdminDepForm((p) => ({ ...p, dependenciaId: String(v) }))}
              >
                {dependencias.map((d) => (
                  <Picker.Item key={d.id} label={`${d.id} - ${d.nombre}`} value={String(d.id)} />
                ))}
              </Picker>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setAdminDepOpen(false)}>
                <Text style={styles.btnSecondaryText}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={submitAdminDep}>
                <Text style={styles.btnPrimaryText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={adminDniOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Actualizar DNI</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre de usuario"
              value={adminDniNombre}
              onChangeText={setAdminDniNombre}
            />
            <TextInput
              style={styles.input}
              placeholder="DNI (solo números, vacío para limpiar)"
              keyboardType="number-pad"
              value={adminDniValue}
              onChangeText={setAdminDniValue}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => {
                  setAdminDniOpen(false);
                  setAdminDniNombre("");
                  setAdminDniValue("");
                }}
              >
                <Text style={styles.btnSecondaryText}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={submitAdminDni}>
                <Text style={styles.btnPrimaryText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#e4edf4" },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#3d627a",
  },
  topbarTextWrap: { flex: 1, marginRight: 8 },
  topbarTitle: { color: "#faf9f7", fontSize: 13 },
  topbarSub: { color: "rgba(255,255,255,0.9)", fontSize: 12 },
  bold: { fontWeight: "700" },
  topbarActions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  topBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  topBtnText: { color: "#fff", fontWeight: "600", fontSize: 12 },
  tabScroll: { maxHeight: 48, backgroundColor: "#d0dfe9" },
  tabRow: { paddingHorizontal: 8, paddingVertical: 8, gap: 6, alignItems: "center" },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginRight: 6,
    borderWidth: 1,
    borderColor: "rgba(74,115,144,0.35)",
  },
  tabChipActive: {
    backgroundColor: "#fdfcfc",
    borderColor: "#8cadc4",
  },
  tabChipText: { color: "#3d627a", fontWeight: "600", fontSize: 11 },
  tabChipTextActive: { color: "#2f4f66" },
  content: { flex: 1, padding: 12 },
  card: {
    backgroundColor: "#fdfcfc",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 115, 144, 0.28)",
  },
  h2: { fontSize: 17, fontWeight: "700", color: "#2f4f66", marginBottom: 8 },
  muted: { color: "#5c6a72", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#b3c9d9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: "#faf9f7",
    fontSize: 15,
    color: "#243848",
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: "#b3c9d9",
    borderRadius: 8,
    marginBottom: 10,
    overflow: "hidden",
  },
  pickerWrapSmall: { marginVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnPrimary: {
    backgroundColor: "#5c85a0",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  btnSecondary: {
    backgroundColor: "#6f96b0",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  btnSecondaryText: { color: "#fff", fontWeight: "600" },
  statLine: { marginBottom: 4, color: "#243848" },
  rankingLine: { fontSize: 12, color: "#243848", marginBottom: 4 },
  rowCard: {
    borderWidth: 1,
    borderColor: "#d0dfe9",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#faf9f7",
  },
  anulado: { backgroundColor: "#f5e4e4" },
  rowTitle: { fontWeight: "700", color: "#2f4f66" },
  rowMeta: { fontSize: 12, color: "#243848", marginTop: 2 },
  rowActions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#5c85a0",
  },
  miniBtnDanger: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#b14a44",
  },
  miniBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  pagination: { marginTop: 8 },
  paginationInfo: { fontSize: 12, color: "#3d627a", marginBottom: 4 },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 8,
  },
  pageLabel: { fontSize: 13, fontWeight: "600", color: "#2f4f66" },
  disabled: { opacity: 0.4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
});
