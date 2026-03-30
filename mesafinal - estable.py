import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime, timedelta
import os
import socket
import json
import sys
import os

# 🌟 BLINDAJE DE CARPETAS (Fuerza a Windows a usar el directorio correcto)
if getattr(sys, 'frozen', False):
    # Si estamos ejecutando el .exe
    os.chdir(os.path.dirname(sys.executable))
else:
    # Si estamos ejecutando el código .py
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
try:
    from tkcalendar import DateEntry
    HAY_CALENDARIO = True
except ImportError:
    HAY_CALENDARIO = False

# ══════════════════════════════════════════════════════════════
# 🌐 CONFIGURACIÓN DE BASE DE DATOS
# ══════════════════════════════════════════════════════════════
import sqlite3

# Ruta de la base compartida en Z: (red del tribunal)
RUTA_DB_RED = r"Z:\PROTEUS\Biblioratos\numerador.db"

# Detectar si estamos en el tribunal (Z: accesible) o en casa
if os.path.exists(os.path.dirname(RUTA_DB_RED)):
    RUTA_DB = RUTA_DB_RED
    MODO_RED = True
    print("🏛️  Modo TRIBUNAL — Base compartida en Z:")
else:
    RUTA_DB = "numerador.db"
    MODO_RED = False
    print("🏠 Modo CASA — Base local")

# Turso (para sync entre casa y tribunal)
try:
    import libsql
    from dotenv import dotenv_values
    _config_turso = dotenv_values("turso.env")
    TURSO_URL = _config_turso.get("TURSO_DATABASE_URL", "")
    TURSO_TOKEN = _config_turso.get("TURSO_AUTH_TOKEN", "")
    MODO_TURSO = bool(TURSO_URL and TURSO_TOKEN)
    if MODO_TURSO:
        print("☁️  Turso configurado — sync manual con botón 🔄")
except ImportError:
    MODO_TURSO = False

# 🔑 Archivo exclusivo para libsql (NUNCA lo toca sqlite3)
TURSO_SYNC_DB = "turso_sync.db"


# 🎨 PALETA DE COLORES POR PESTAÑA
COLORES_PESTANAS = {
    "OFICIO":               {"fondo": "#EAF0F7", "acento": "#3B7DD8", "titulo": "#2C5F9E"},
    "AUTO":                 {"fondo": "#F0EAF7", "acento": "#7B3DD8", "titulo": "#5C2E9E"},
    "SENTENCIA TRAMITE":    {"fondo": "#EAFAF0", "acento": "#2DA86A", "titulo": "#1E7A4D"},
    "SENTENCIA RELATORIA":  {"fondo": "#FFF7EA", "acento": "#D89B3B", "titulo": "#9E7A2C"},
}

# 📝 CATEGORÍAS — se cargan desde categorias.json (editalo con Bloc de Notas o VS Code)
try:
    with open("categorias.json", "r", encoding="utf-8") as f:
        SUGERENCIAS_POR_TIPO = json.load(f)
    print("📋 Categorías cargadas desde categorias.json")
except:
    print("⚠️  No se encontró categorias.json — usando valores vacíos")
    SUGERENCIAS_POR_TIPO = {}

# 👥 DICCIONARIO DE USUARIOS POR DEFECTO (solo se usa para poblar la DB la primera vez)
USUARIOS = {
    "Ayala Sartor Renzo E.": {"pass": "admin123", "rol": "admin"},
    "Mujica Jorge": {"pass": "admin123", "rol": "admin"},
    "Unger Nancy B.": {"pass": "1234", "rol": "user"},
    "Igich Patricia": {"pass": "1234", "rol": "user"},
    "Oleschuk Micaela": {"pass": "1234", "rol": "user"},
    "Berndt Lucas": {"pass": "1234", "rol": "user"},
    "Alvarez Matias": {"pass": "1234", "rol": "user"},
    "Bazan Facundo": {"pass": "1234", "rol": "user"},
    "Proteus (Robot)": {"pass": "robot", "rol": "robot"}
}

DICCIONARIO_MESES = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
}


def conectar_db():
    if not MODO_RED and MODO_TURSO:
        # Casa: libsql embedded replica (rápido en local, sync solo cuando se pide)
        conn = libsql.connect(TURSO_SYNC_DB, sync_url=TURSO_URL, auth_token=TURSO_TOKEN)
    else:
        # Tribunal o sin Turso: sqlite3 puro
        conn = sqlite3.connect(RUTA_DB, timeout=20, check_same_thread=False)
        conn.isolation_level = None

    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS registros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT,
            numero INTEGER,
            anio INTEGER,
            expediente TEXT,
            detalle TEXT,
            usuario TEXT,
            fecha TIMESTAMP,
            remitido INTEGER DEFAULT 0,
            remitido_por TEXT DEFAULT '',
            remitido_fecha TEXT DEFAULT ''
        )
    """)

    # Migraciones
    try: cursor.execute("ALTER TABLE registros ADD COLUMN remitido INTEGER DEFAULT 0")
    except: pass
    try: cursor.execute("ALTER TABLE registros ADD COLUMN remitido_por TEXT DEFAULT ''")
    except: pass
    try: cursor.execute("ALTER TABLE registros ADD COLUMN remitido_fecha TEXT DEFAULT ''")
    except: pass

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sesiones (
            usuario TEXT PRIMARY KEY,
            pc_name TEXT,
            fecha_login TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            nombre TEXT PRIMARY KEY,
            password TEXT,
            rol TEXT
        )
    """)

    # 📋 TABLA DE AUDITORÍA
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS log_auditoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            registro_id INTEGER,
            accion TEXT,
            campo_modificado TEXT,
            valor_anterior TEXT,
            valor_nuevo TEXT,
            usuario TEXT,
            fecha TIMESTAMP
        )
    """)

    cursor.execute("SELECT COUNT(*) FROM usuarios")
    if cursor.fetchone()[0] == 0:
        for k, v in USUARIOS.items():
            cursor.execute("INSERT INTO usuarios VALUES (?, ?, ?)", (k, v["pass"], v["rol"]))

    conn.commit()
        
    return conn
def sincronizar(conn):
    """No hace nada — sync manual solamente con el botón."""
    pass


def obtener_nuevo_numero(conn, tipo):
    cursor = conn.cursor()
    anio_actual = datetime.now().year
    cursor.execute(
        "SELECT MAX(numero) FROM registros WHERE tipo = ? AND anio = ?",
        (tipo, anio_actual)
    )
    resultado = cursor.fetchone()[0]
    if resultado is None:
        return 1
    return resultado + 1


def registrar_auditoria(conn, registro_id, accion, campo, valor_ant, valor_nuevo, usuario):
    """Escribe una entrada en la tabla log_auditoria."""
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO log_auditoria
        (registro_id, accion, campo_modificado, valor_anterior, valor_nuevo, usuario, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (registro_id, accion, campo, valor_ant, valor_nuevo, usuario, ahora))
# ══════════════════════════════════════════════════════════════
# APLICACIÓN PRINCIPAL
# ══════════════════════════════════════════════════════════════
class NumeradorApp:
    def __init__(self, root, usuario_actual, rol_actual):
        self.root = root
        self.usuario_actual = usuario_actual
        self.rol_actual = rol_actual

        self.root.title("🏛️ Biblioratos — Juzgado Correccional - Iv. Circ. Judicial - Charata")
        self.root.geometry("1050x800")

        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after_idle(self.root.attributes, '-topmost', False)
        self.root.protocol("WM_DELETE_WINDOW", self.cerrar_aplicacion)

        self.conn = conectar_db()
        self.funciones_actualizar = []

        # ── Estilos ──────────────────────────────────────────
        style = ttk.Style()
        style.theme_use('clam')

        style.configure("Treeview", font=("Segoe UI", 10), rowheight=26)
        style.configure("Treeview.Heading", font=("Segoe UI", 10, "bold"), background="#D5D5D5")
        style.map("Treeview", background=[('selected', '#3B7DD8')], foreground=[('selected', 'white')])

        # Tags de color para filas
        # (los configuramos en cada Treeview después de crearlo)

        style.configure("Accent.TButton", font=("Segoe UI", 10, "bold"))
        style.configure("TCombobox", font=("Segoe UI", 11))
        self.root.option_add("*TCombobox*Listbox.font", ("Segoe UI", 11))
        style.configure("ProximoNum.TLabel", font=("Segoe UI", 13, "bold"), foreground="#FFFFFF", background="#3B7DD8")

        # ── Barra superior ───────────────────────────────────
        top_bar = tk.Frame(self.root, bg="#2C3E50", height=45)
        top_bar.pack(fill="x")
        top_bar.pack_propagate(False)

        tk.Label(top_bar, text=f"👤 {self.usuario_actual}",
                 font=("Segoe UI", 11, "bold"), bg="#2C3E50", fg="white").pack(side="left", padx=15)

        tk.Label(top_bar, text=f"({self.rol_actual.upper()})",
                 font=("Segoe UI", 9), bg="#2C3E50", fg="#BDC3C7").pack(side="left")
        # 🌐 STATUS DE CONEXIÓN Y DETECCIÓN DE ENTORNO
        if MODO_RED:
            estado_txt = "🏢 WORK (Juzgado)"
            estado_color = "#27AE60"
        elif MODO_TURSO:
            estado_txt = "🏠 HOMEOFFICE"
            estado_color = "#8E44AD"
        else:
            estado_txt = "💾 Local"
            estado_color = "#F39C12"

        self.lbl_status = tk.Label(top_bar, text=estado_txt, font=("Segoe UI", 9, "bold"),
                                    bg=estado_color, fg="white", padx=8, pady=2, relief="groove")
        self.lbl_status.pack(side="right", padx=5, pady=7)

        # Botón Sync visible para todos
        self.btn_sync = ttk.Button(top_bar, text="🔄 Sync", command=lambda: self._forzar_sync())
        self.btn_sync.pack(side="right", padx=3, pady=7)

        ttk.Button(top_bar, text="🔑 Cambiar Contraseña", command=self.cambiar_password).pack(side="right", padx=10, pady=7)

        if self.usuario_actual in ("Ayala Sartor Renzo E.", "Mujica Jorge"):
            ttk.Button(top_bar, text="👑 Panel de Juez", command=self.panel_superusuario).pack(side="right", padx=10, pady=7)

        # ── Notebook (pestañas) ──────────────────────────────
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(pady=5, expand=True, fill="both", padx=10)

        self.tab_oficios = ttk.Frame(self.notebook)
        self.tab_autos = ttk.Frame(self.notebook)
        self.tab_sent_tramite = ttk.Frame(self.notebook)
        self.tab_sent_relatoria = ttk.Frame(self.notebook)
        self.tab_buscador = ttk.Frame(self.notebook)
        self.tab_estadisticas = ttk.Frame(self.notebook)

        self.notebook.add(self.tab_oficios, text="  📝 Oficios  ")
        self.notebook.add(self.tab_autos, text="  ⚖️ Auto/Interlocutorios  ")
        self.notebook.add(self.tab_sent_tramite, text="  📜 Sentencias - Sec. Trámite  ")
        self.notebook.add(self.tab_sent_relatoria, text="  📜 Sentencias - Sec. Relatora  ")
        self.notebook.add(self.tab_buscador, text="  🔍 Buscador  ")
        self.notebook.add(self.tab_estadisticas, text="  📊 Estadísticas  ")

        self.construir_pestaña_ingreso(self.tab_oficios, "OFICIO")
        self.construir_pestaña_ingreso(self.tab_autos, "AUTO")
        self.construir_pestaña_ingreso(self.tab_sent_tramite, "SENTENCIA TRAMITE")
        self.construir_pestaña_ingreso(self.tab_sent_relatoria, "SENTENCIA RELATORIA")
        self.construir_pestaña_buscador()
        self.construir_pestaña_estadisticas()

    def _forzar_sync(self):
        if not MODO_TURSO:
            messagebox.showinfo("Info", "Turso no configurado.\nCrear archivo turso.env")
            return
        try:
            self.lbl_status.config(text="☁️ Sincronizando...", bg="#F39C12")
            self.root.update()
            if MODO_RED:
                # Tribunal: copiar Z: a Turso (CON PROTECCIÓN)
                local = sqlite3.connect(RUTA_DB)
                n_registros = local.execute("SELECT COUNT(*) FROM registros").fetchone()[0]

                if n_registros == 0:
                    local.close()
                    self.lbl_status.config(text="⚠️ Z: vacío — sync cancelado", bg="#E74C3C")
                    messagebox.showerror("🛡️ Protección de Datos",
                        "La base de datos en Z: está VACÍA.\n\n"
                        "El sync fue CANCELADO para proteger los datos de la nube.\n\n"
                        "Verifique la conexión de red y reintente.")
                    return

                t = libsql.connect(TURSO_SYNC_DB, sync_url=TURSO_URL, auth_token=TURSO_TOKEN)
                t.sync()
                for tabla in ["registros", "usuarios", "log_auditoria"]:
                    rows = local.execute(f"SELECT * FROM {tabla}").fetchall()
                    if rows:
                        ph = ",".join(["?"] * len(rows[0]))
                        t.execute(f"DELETE FROM {tabla}")
                        for row in rows:
                            t.execute(f"INSERT INTO {tabla} VALUES ({ph})", row)
                local.close()
                t.execute("COMMIT")
                t.sync()
                t.close()
                ahora = datetime.now().strftime("%H:%M:%S")
                self.lbl_status.config(text=f"☁️ Z:→Nube {ahora} ({n_registros} reg) ✅", bg="#2ECC71")
            else:
                # Casa: simplemente sync la replica
                self.conn.sync()
                ahora = datetime.now().strftime("%H:%M:%S")
                self.lbl_status.config(text=f"☁️ Nube→Local {ahora} ✅", bg="#2ECC71")
            for funcion in self.funciones_actualizar:
                funcion()
        except Exception as e:
            self.lbl_status.config(text="☁️ Sin conexión ❌", bg="#E74C3C")
            messagebox.showwarning("Sync", f"No se pudo sincronizar:\n{e}")

    # ──────────────────────────────────────────────────────────
    # CERRAR
    # ──────────────────────────────────────────────────────────
    def cerrar_aplicacion(self):
        try:
            cursor = self.conn.cursor()
            cursor.execute("DELETE FROM sesiones WHERE usuario = ?", (self.usuario_actual,))
            self.conn.commit()
        except:
            pass
        # Desde casa: sync al cerrar
        if not MODO_RED and MODO_TURSO:
            try:
                self.conn.sync()
            except:
                pass
        self.root.destroy()

    def _begin_exclusive(self):
        """Inicia la transacción (Siempre usamos sqlite3 localmente)"""
        try:
            self.conn.execute("BEGIN EXCLUSIVE")
        except:
            pass

    def _commit_y_sync(self):
        """Commit + sincronizar con Turso si está activo."""
        self.conn.commit()
        sincronizar(self.conn)

    def _safe_rollback(self):
        """Rollback seguro — libsql puede no soportar rollback en todos los contextos."""
        try:
            self.conn.rollback()
        except Exception:
            pass

    # ──────────────────────────────────────────────────────────
    # HELPER: Aplicar zebra striping + resaltar ANULADOS
    # ──────────────────────────────────────────────────────────
    def _configurar_tags_treeview(self, tree, color_fondo):
        """Configura los tags para zebra striping y ANULADOS."""
        tree.tag_configure("par", background=color_fondo)
        tree.tag_configure("impar", background="#FFFFFF")
        tree.tag_configure("anulado", background="#FDDDDD", foreground="#CC0000", font=("Segoe UI", 10, "overstrike"))

    def _aplicar_zebra(self, tree):
        """Re-aplica los tags de colores después de insertar filas."""
        items = tree.get_children()
        for i, item in enumerate(items):
            valores = tree.item(item)['values']
            # Detectar si es ANULADO: buscar en expediente
            es_anulado = False
            for v in valores:
                if str(v).strip().upper() == "ANULADO":
                    es_anulado = True
                    break
            if es_anulado:
                tree.item(item, tags=("anulado",))
            elif i % 2 == 0:
                tree.item(item, tags=("par",))
            else:
                tree.item(item, tags=("impar",))

    # ──────────────────────────────────────────────────────────
    # PESTAÑA DE INGRESO (una por tipo)
    # ──────────────────────────────────────────────────────────
    def construir_pestaña_ingreso(self, frame, tipo_doc):
        colores = COLORES_PESTANAS.get(tipo_doc, {"fondo": "#F5F5F5", "acento": "#555", "titulo": "#333"})

        # ── Panel superior con color de identidad ────────────
        top_frame = tk.Frame(frame, bg=colores["fondo"])
        top_frame.pack(fill="x", pady=0)

        header = tk.Frame(top_frame, bg=colores["acento"], height=50)
        header.pack(fill="x")
        header.pack_propagate(False)

        NOMBRES_BONITOS = {
            "OFICIO": "OFICIOS",
            "AUTO": "AUTO / INTERLOCUTORIOS",
            "SENTENCIA TRAMITE": "SENTENCIAS - Sec. Trámite",
            "SENTENCIA RELATORIA": "SENTENCIAS - Sec. Relatora",
        }
        tk.Label(header, text=f"  {NOMBRES_BONITOS.get(tipo_doc, tipo_doc)}",
                 font=("Segoe UI", 15, "bold"), bg=colores["acento"], fg="white").pack(side="left", padx=10)

        # 🔢 CONTADOR DE PRÓXIMO NÚMERO
        proximo = obtener_nuevo_numero(self.conn, tipo_doc)
        lbl_proximo = tk.Label(header,
                               text=f"  Próximo N°: {proximo}  ",
                               font=("Segoe UI", 13, "bold"),
                               bg="white", fg=colores["acento"],
                               relief="groove", padx=10, pady=2)
        lbl_proximo.pack(side="right", padx=(0, 15), pady=8)

        # 🔄 BOTÓN REFRESCAR junto al próximo número
        def refrescar_proximo():
            if not MODO_RED and MODO_TURSO:
                try:
                    self.conn.sync()
                except:
                    pass
            nuevo = obtener_nuevo_numero(self.conn, tipo_doc)
            lbl_proximo.config(text=f"  Próximo N°: {nuevo}  ")

        btn_refresh_prox = tk.Button(header, text="🔄", font=("Segoe UI", 11),
                                     bg="white", fg=colores["acento"], relief="flat",
                                     cursor="hand2", command=refrescar_proximo)
        btn_refresh_prox.pack(side="right", padx=(5, 0), pady=8)
        if not MODO_RED:
            lbl_proximo.config(text=f"  Próximo N°: ~{proximo}  ")

        # ── Formulario ───────────────────────────────────────
        form_frame = tk.Frame(top_frame, bg=colores["fondo"])
        form_frame.pack(pady=10)

        tk.Label(form_frame, text="Expte Nro:", font=("Segoe UI", 10),
                 bg=colores["fondo"]).grid(row=0, column=0, padx=5, pady=5, sticky="e")
        ent_expte = ttk.Entry(form_frame, width=30)
        ent_expte.grid(row=0, column=1, padx=5, pady=5)

        tk.Label(form_frame, text="Descripción:", font=("Segoe UI", 10),
                 bg=colores["fondo"]).grid(row=1, column=0, padx=5, pady=5, sticky="e")

        # ── Combobox con categorías agrupadas ────────────────
        sugerencias = SUGERENCIAS_POR_TIPO.get(tipo_doc, {})

        items_combo = []
        mapa_resultado = []

        sugerencias_con_otros = dict(sugerencias) if isinstance(sugerencias, dict) else {}
        sugerencias_con_otros["── OTROS ──"] = []

        for categoria, sub_opciones in sugerencias_con_otros.items():
            if categoria == "── OTROS ──":
                items_combo.append("── OTROS ──")
                mapa_resultado.append("OTROS")
            elif not sub_opciones:
                items_combo.append(categoria)
                mapa_resultado.append(f"Of. {categoria}" if tipo_doc == "OFICIO" else categoria)
            else:
                items_combo.append(f"▸ {categoria.upper()}")
                mapa_resultado.append(None)
                for sub in sub_opciones:
                    display = f"     {sub}"
                    items_combo.append(display)
                    mapa_resultado.append(f"Of. {categoria} ({sub})" if tipo_doc == "OFICIO" else f"{categoria} ({sub})")

        ent_detalle = ttk.Combobox(form_frame, width=42, values=items_combo, state="readonly")
        ent_detalle.grid(row=1, column=1, padx=5, pady=5)

        lbl_otros = tk.Label(form_frame, text="Especificar:", font=("Segoe UI", 10), bg=colores["fondo"])
        ent_otros = ttk.Entry(form_frame, width=42)

        def al_seleccionar(event=None):
            sel = ent_detalle.get()
            if sel.startswith("▸ "):
                ent_detalle.set("")
                lbl_otros.grid_remove()
                ent_otros.grid_remove()
                return
            if sel == "── OTROS ──":
                lbl_otros.grid(row=2, column=0, padx=5, pady=3, sticky="e")
                ent_otros.grid(row=2, column=1, padx=5, pady=3)
                ent_otros.focus()
            else:
                lbl_otros.grid_remove()
                ent_otros.grid_remove()
                ent_otros.delete(0, tk.END)

        ent_detalle.bind("<<ComboboxSelected>>", al_seleccionar)

        def obtener_detalle():
            sel = ent_detalle.get()
            if sel == "── OTROS ──":
                return ent_otros.get().strip().title()
            try:
                idx = ent_detalle.current()
                if idx >= 0 and idx < len(mapa_resultado) and mapa_resultado[idx]:
                    return mapa_resultado[idx]
            except:
                pass
            return sel.strip()

        def limpiar_detalle():
            ent_detalle.set("")
            ent_otros.delete(0, tk.END)
            lbl_otros.grid_remove()
            ent_otros.grid_remove()

        lbl_resultado = tk.Label(top_frame, text="", font=("Segoe UI", 12, "bold"),
                                 fg=colores["titulo"], bg=colores["fondo"])

        def guardar():
            expte = ent_expte.get().strip()
            detalle = obtener_detalle()

            if not expte:
                messagebox.showwarning("Atención", "Debe ingresar el número de expediente.")
                return

            try:
                # Desde casa: sync obligatorio antes de numerar
                if not MODO_RED and MODO_TURSO:
                    try:
                        conn2 = libsql.connect(TURSO_SYNC_DB, sync_url=TURSO_URL, auth_token=TURSO_TOKEN)
                        conn2.sync()
                        conn2.close()
                    except:
                        pass
                self._begin_exclusive()
                cursor = self.conn.cursor()
                nuevo_num = obtener_nuevo_numero(self.conn, tipo_doc)
                anio = datetime.now().year
                ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                cursor.execute("""
                    INSERT INTO registros (tipo, numero, anio, expediente, detalle, usuario, fecha)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (tipo_doc, nuevo_num, anio, expte, detalle, self.usuario_actual, ahora))

                reg_id = cursor.lastrowid
                self.conn.commit()

                registrar_auditoria(self.conn, reg_id, "CREACION", "-",
                                    "-", f"{tipo_doc} N° {nuevo_num}/{anio}", self.usuario_actual)
                self.conn.commit()

                # Desde casa: subir a la nube inmediatamente
                if not MODO_RED and MODO_TURSO:
                    try:
                        turso_subir_desde_local(RUTA_DB)
                        ahora_sync = datetime.now().strftime("%H:%M:%S")
                        self.lbl_status.config(text=f"☁️ Sync {ahora_sync} ✅", bg="#2ECC71")
                    except:
                        self.lbl_status.config(text="☁️ Pendiente subir ⚠️", bg="#F39C12")

                lbl_resultado.config(text=f"✅ ASIGNADO: {tipo_doc} N° {nuevo_num} / {anio}")
                ent_expte.delete(0, tk.END)
                limpiar_detalle()

                nuevo_proximo = obtener_nuevo_numero(self.conn, tipo_doc)
                lbl_proximo.config(text=f"  Próximo N°: {nuevo_proximo}  ")

                for funcion in self.funciones_actualizar:
                    funcion()
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"Fallo al guardar:\n{e}")

        ttk.Button(top_frame, text=f"✔ Asignar N° y Guardar", command=guardar,
                   style="Accent.TButton").pack(pady=5)
        lbl_resultado.pack(pady=3)

        ttk.Separator(frame, orient="horizontal").pack(fill="x", pady=5, padx=20)

        # ── Grilla inferior ──────────────────────────────────
        bottom_frame = tk.Frame(frame)
        bottom_frame.pack(expand=True, fill="both", padx=10, pady=2)

        search_frame = tk.Frame(bottom_frame)
        search_frame.pack(fill="x", pady=3)

        tk.Label(search_frame, text="Filtrar:", font=("Segoe UI", 9)).pack(side="left")
        ent_busqueda_local = ttk.Entry(search_frame, width=25)
        ent_busqueda_local.pack(side="left", padx=5)

        btn_refrescar_local = ttk.Button(search_frame, text="🔄", width=3,
                                         command=lambda: actualizar_grilla_local())
        btn_refrescar_local.pack(side="left", padx=2)

        # 🌟 LÓGICA CONDICIONAL: Solo Oficios tienen Remitido
        if tipo_doc == "OFICIO":
            columnas = ("Número", "Expediente", "Detalle", "Remitido", "Mes", "Año", "Fecha", "Usuario", "ID")
        else:
            columnas = ("Número", "Expediente", "Detalle", "Mes", "Año", "Fecha", "Usuario", "ID")

        tree = ttk.Treeview(bottom_frame, columns=columnas, show="headings", height=10)
        self._configurar_tags_treeview(tree, colores["fondo"])

        # Botones de acción alineados a la derecha
        btn_borrar = ttk.Button(search_frame, text="🗑️ Borrar", command=lambda: self.borrar_registro(tree))
        btn_borrar.pack(side="right", padx=2)
        if self.rol_actual != "admin":
            btn_borrar.state(['disabled'])

        btn_anular = ttk.Button(search_frame, text="🚫 Anular", command=lambda: self.anular_registro(tree))
        btn_anular.pack(side="right", padx=2)

        btn_modificar = ttk.Button(search_frame, text="✏️ Modificar", command=lambda: self.modificar_registro(tree))
        btn_modificar.pack(side="right", padx=2)

        # 🌟 El botón Remitido solo aparece en la pestaña Oficios
        if tipo_doc == "OFICIO":
            btn_remitido = ttk.Button(search_frame, text="📨 Remitido", command=lambda: self.toggle_remitido(tree))
            btn_remitido.pack(side="right", padx=2)

        # Configuración de anchos de columna mejorada
        tree.column("Número", width=70, anchor="center")
        tree.column("Expediente", width=120)
        tree.column("Detalle", width=450, stretch=True) # <--- Mucho más ancho y estirable
        if tipo_doc == "OFICIO":
            tree.column("Remitido", width=70, anchor="center")
        tree.column("Mes", width=90, anchor="center")
        tree.column("Año", width=50, anchor="center")
        tree.column("Fecha", width=130, anchor="center")
        tree.column("Usuario", width=110)
        
        # 🙈 Ocultamos el ID visualmente pero lo mantenemos para el sistema
        tree.column("ID", width=0, stretch=False)

        for col in columnas:
            tree.heading(col, text=col)

        # Scrollbar
        scrollbar = ttk.Scrollbar(bottom_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=scrollbar.set)
        tree.pack(side="left", expand=True, fill="both")
        scrollbar.pack(side="right", fill="y")

        def actualizar_grilla_local(*args):
            for item in tree.get_children():
                tree.delete(item)
            termino = f"%{ent_busqueda_local.get().strip()}%"
            cursor = self.conn.cursor()
            
            # 🌟 CAMBIO DE LÓGICA: Ordenamos por Año y luego por Número (descendente)
            cursor.execute("""
                SELECT id, numero, anio, expediente, detalle, usuario, fecha, COALESCE(remitido, 0)
                FROM registros
                WHERE tipo = ? AND (expediente LIKE ? OR detalle LIKE ? OR usuario LIKE ?)
                ORDER BY anio DESC, numero DESC LIMIT 100
            """, (tipo_doc, termino, termino, termino))
            
            for fila in cursor.fetchall():
                id_reg, numero, anio, expte, detalle, usu, fecha, remitido = fila
                mes_num = fecha[5:7] if fecha else '01'
                mes_texto = DICCIONARIO_MESES.get(mes_num, "")
                remitido_txt = "✅" if remitido else "—"
                
                if tipo_doc == "OFICIO":
                    fila_ordenada = (numero, expte, detalle, remitido_txt, mes_texto, anio, fecha, usu, id_reg)
                else:
                    fila_ordenada = (numero, expte, detalle, mes_texto, anio, fecha, usu, id_reg)
                    
                tree.insert("", tk.END, values=fila_ordenada)
            self._aplicar_zebra(tree)

            nuevo_proximo = obtener_nuevo_numero(self.conn, tipo_doc)
            lbl_proximo.config(text=f"  Próximo N°: {nuevo_proximo}  ")

        ent_busqueda_local.bind("<KeyRelease>", actualizar_grilla_local)
        self.funciones_actualizar.append(actualizar_grilla_local)
        actualizar_grilla_local()

    # ──────────────────────────────────────────────────────────
    # PESTAÑA BUSCADOR GLOBAL
    # ──────────────────────────────────────────────────────────
    def construir_pestaña_buscador(self):
        header = tk.Frame(self.tab_buscador, bg="#34495E", height=45)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="  🔍 Búsqueda General y Auditoría",
                 font=("Segoe UI", 14, "bold"), bg="#34495E", fg="white").pack(side="left", padx=10)

        # ── Filtros ──────────────────────────────────────────
        filtro_frame = tk.Frame(self.tab_buscador, bg="#ECF0F1", relief="groove", bd=1)
        filtro_frame.pack(fill="x", padx=10, pady=5)

        tk.Label(filtro_frame, text="Texto:", bg="#ECF0F1", font=("Segoe UI", 9)).grid(row=0, column=0, padx=5, pady=5)
        ent_busqueda_global = ttk.Entry(filtro_frame, width=22)
        ent_busqueda_global.grid(row=0, column=1, padx=3, pady=5)

        tk.Label(filtro_frame, text="Desde:", bg="#ECF0F1", font=("Segoe UI", 9)).grid(row=0, column=2, padx=5)
        if HAY_CALENDARIO:
            ent_fecha_desde = DateEntry(filtro_frame, width=11, date_pattern="dd/MM/yyyy",
                                       year=datetime.now().year, month=1, day=1,
                                       locale="es_AR", background="#34495E", foreground="white")
        else:
            ent_fecha_desde = ttk.Entry(filtro_frame, width=12)
            ent_fecha_desde.insert(0, f"01/01/{datetime.now().year}")
        ent_fecha_desde.grid(row=0, column=3, padx=3, pady=5)

        tk.Label(filtro_frame, text="Hasta:", bg="#ECF0F1", font=("Segoe UI", 9)).grid(row=0, column=4, padx=5)
        if HAY_CALENDARIO:
            ent_fecha_hasta = DateEntry(filtro_frame, width=11, date_pattern="dd/MM/yyyy",
                                       locale="es_AR", background="#34495E", foreground="white")
        else:
            ent_fecha_hasta = ttk.Entry(filtro_frame, width=12)
            ent_fecha_hasta.insert(0, datetime.now().strftime("%d/%m/%Y"))
        ent_fecha_hasta.grid(row=0, column=5, padx=3, pady=5)

        tk.Label(filtro_frame, text="Tipo:", bg="#ECF0F1", font=("Segoe UI", 9)).grid(row=0, column=6, padx=5)
        combo_tipo = ttk.Combobox(filtro_frame, width=18, state="readonly",
                                  values=["TODOS", "OFICIO", "AUTO", "SENTENCIA TRAMITE", "SENTENCIA RELATORIA"])
        combo_tipo.set("TODOS")
        combo_tipo.grid(row=0, column=7, padx=3, pady=5)

        btn_buscar = ttk.Button(filtro_frame, text="🔍 Buscar",
                                command=lambda: actualizar_grilla_global())
        btn_buscar.grid(row=0, column=8, padx=8, pady=5)

        def _obtener_fecha(widget, fallback_str):
            """Extrae fecha de DateEntry o Entry con validación."""
            try:
                if HAY_CALENDARIO and isinstance(widget, DateEntry):
                    return widget.get_date()
                else:
                    txt = widget.get().strip()
                    return datetime.strptime(txt, "%d/%m/%Y")
            except:
                return datetime.strptime(fallback_str, "%d/%m/%Y")

        # ── Barra de acciones ────────────────────────────────
        action_frame = tk.Frame(self.tab_buscador)
        action_frame.pack(fill="x", padx=10, pady=2)

        def exportar_a_excel():
            try:
                import pandas as pd
                cursor = self.conn.cursor()
                cursor.execute("SELECT id, tipo, numero, anio, expediente, detalle, usuario, fecha, COALESCE(remitido, 0) FROM registros ORDER BY id DESC")
                datos = cursor.fetchall()
                df = pd.DataFrame(datos, columns=["ID", "Tipo", "Número", "Año", "Expediente", "Detalle", "Usuario", "Fecha", "Remitido"])
                df['Fecha_Convertida'] = pd.to_datetime(df['Fecha'])
                dicc_meses = {1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
                              7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'}
                df['Mes'] = df['Fecha_Convertida'].dt.month.map(dicc_meses)
                df['Remitido'] = df['Remitido'].apply(lambda x: "SI" if x else "NO")
                df = df[["Tipo", "Número", "Expediente", "Detalle", "Remitido", "Mes", "Año", "Fecha", "Usuario", "ID"]]
                nombre_archivo = f"Auditoria_Numeradores_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                with pd.ExcelWriter(nombre_archivo, engine='openpyxl') as writer:
                    df.to_excel(writer, sheet_name="General", index=False)
                    df[df["Tipo"] == "OFICIO"].to_excel(writer, sheet_name="Oficios", index=False)
                    df[df["Tipo"] == "AUTO"].to_excel(writer, sheet_name="Interlocutorios", index=False)
                    df[df["Tipo"] == "SENTENCIA TRAMITE"].to_excel(writer, sheet_name="Sent. Trámite", index=False)
                    df[df["Tipo"] == "SENTENCIA RELATORIA"].to_excel(writer, sheet_name="Sent. Relatoría", index=False)
                messagebox.showinfo("Éxito", f"¡Excel exportado con éxito!\n{nombre_archivo}")
            except Exception as e:
                messagebox.showerror("Error", f"No se pudo exportar:\n{e}")

        ttk.Button(action_frame, text="📥 Exportar Excel", command=exportar_a_excel).pack(side="left", padx=3)

        btn_borrar = ttk.Button(action_frame, text="🗑️ Borrar", command=lambda: self.borrar_registro(tree))
        btn_borrar.pack(side="right", padx=2)
        if self.rol_actual != "admin":
            btn_borrar.state(['disabled'])

        ttk.Button(action_frame, text="🚫 Anular", command=lambda: self.anular_registro(tree)).pack(side="right", padx=2)
        ttk.Button(action_frame, text="✏️ Modificar", command=lambda: self.modificar_registro(tree)).pack(side="right", padx=2)
        ttk.Button(action_frame, text="📨 Remitido", command=lambda: self.toggle_remitido(tree)).pack(side="right", padx=2)

        # ── Grilla global ────────────────────────────────────
        tree_frame = tk.Frame(self.tab_buscador)
        tree_frame.pack(expand=True, fill="both", padx=10, pady=5)

        columnas = ("Tipo", "Número", "Expediente", "Detalle", "Remitido", "Mes", "Año", "Fecha", "Usuario", "ID")
        tree = ttk.Treeview(tree_frame, columns=columnas, show="headings", height=18)
        self._configurar_tags_treeview(tree, "#F0F4F8")

        # Buscador Global: Detalle grande e ID oculto
        tree.column("Tipo", width=130)
        tree.column("Número", width=70, anchor="center")
        tree.column("Expediente", width=120)
        tree.column("Detalle", width=400, stretch=True) # <--- Agrandado
        tree.column("Remitido", width=70, anchor="center")
        tree.column("Mes", width=90, anchor="center")
        tree.column("Año", width=50, anchor="center")
        tree.column("Fecha", width=130, anchor="center")
        tree.column("Usuario", width=110)
        
        # 🙈 Ocultamos el ID
        tree.column("ID", width=0, stretch=False)
        for col in columnas:
            tree.heading(col, text=col)

        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=scrollbar.set)
        tree.pack(side="left", expand=True, fill="both")
        scrollbar.pack(side="right", fill="y")

        # ── Barra de estado inferior ─────────────────────────
        lbl_conteo = tk.Label(self.tab_buscador, text="", font=("Segoe UI", 9), fg="#555", anchor="w")
        lbl_conteo.pack(fill="x", padx=15, pady=2)

        def actualizar_grilla_global(*args):
            for item in tree.get_children():
                tree.delete(item)
            termino = f"%{ent_busqueda_global.get().strip()}%"
            tipo_filtro = combo_tipo.get()

            fecha_desde = _obtener_fecha(ent_fecha_desde, f"01/01/{datetime.now().year}").strftime("%Y-%m-%d 00:00:00")
            fecha_hasta = _obtener_fecha(ent_fecha_hasta, datetime.now().strftime("%d/%m/%Y")).strftime("%Y-%m-%d 23:59:59")

            cursor = self.conn.cursor()
            if tipo_filtro == "TODOS":
                cursor.execute("""
                    SELECT id, tipo, numero, anio, expediente, detalle, usuario, fecha, COALESCE(remitido, 0)
                    FROM registros
                    WHERE (expediente LIKE ? OR detalle LIKE ? OR tipo LIKE ? OR usuario LIKE ?)
                      AND fecha BETWEEN ? AND ?
                    ORDER BY anio DESC, numero DESC LIMIT 200
                """, (termino, termino, termino, termino, fecha_desde, fecha_hasta))
            else:
                cursor.execute("""
                    SELECT id, tipo, numero, anio, expediente, detalle, usuario, fecha, COALESCE(remitido, 0)
                    FROM registros
                    WHERE tipo = ?
                      AND (expediente LIKE ? OR detalle LIKE ? OR usuario LIKE ?)
                      AND fecha BETWEEN ? AND ?
                    ORDER BY id DESC LIMIT 200
                """, (tipo_filtro, termino, termino, termino, fecha_desde, fecha_hasta))

            filas = cursor.fetchall()
            for fila in filas:
                id_reg, tipo, numero, anio, expte, detalle, usu, fecha, remitido = fila
                mes_num = fecha[5:7] if fecha else '01'
                mes_texto = DICCIONARIO_MESES.get(mes_num, "")
                remitido_txt = "✅" if remitido else "—"
                fila_ordenada = (tipo, numero, expte, detalle, remitido_txt, mes_texto, anio, fecha, usu, id_reg)
                tree.insert("", tk.END, values=fila_ordenada)
            self._aplicar_zebra(tree)

            desde_txt = _obtener_fecha(ent_fecha_desde, f"01/01/{datetime.now().year}").strftime("%d/%m/%Y")
            hasta_txt = _obtener_fecha(ent_fecha_hasta, datetime.now().strftime("%d/%m/%Y")).strftime("%d/%m/%Y")
            lbl_conteo.config(text=f"Mostrando {len(filas)} registro(s) — Período: {desde_txt} a {hasta_txt}")

        ent_busqueda_global.bind("<KeyRelease>", actualizar_grilla_global)
        self.funciones_actualizar.append(actualizar_grilla_global)
        actualizar_grilla_global()

    # ──────────────────────────────────────────────────────────
    # PESTAÑA ESTADÍSTICAS
    # ──────────────────────────────────────────────────────────
    def construir_pestaña_estadisticas(self):
        header = tk.Frame(self.tab_estadisticas, bg="#1ABC9C", height=45)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="  📊 Estadísticas y Resumen",
                 font=("Segoe UI", 14, "bold"), bg="#1ABC9C", fg="white").pack(side="left", padx=10)

        ttk.Button(header, text="🔄 Refrescar",
                   command=lambda: self.actualizar_estadisticas()).pack(side="right", padx=15, pady=8)

        contenido = tk.Frame(self.tab_estadisticas, bg="#FAFAFA")
        contenido.pack(expand=True, fill="both", padx=10, pady=5)

        # ── Resumen del año (tarjetas) ───────────────────────
        frame_resumen = tk.Frame(contenido, bg="#FAFAFA")
        frame_resumen.pack(fill="x", pady=5)

        tarjetas_frame = tk.Frame(frame_resumen, bg="#FAFAFA")
        tarjetas_frame.pack(fill="x")

        self.labels_stats = {}
        tipos_info = [
            ("OFICIO", "📝", "#3B7DD8"),
            ("AUTO", "⚖️", "#7B3DD8"),
            ("SENTENCIA TRAMITE", "📜", "#2DA86A"),
            ("SENTENCIA RELATORIA", "📜", "#D89B3B"),
        ]

        for i, (tipo, emoji, color) in enumerate(tipos_info):
            card = tk.Frame(tarjetas_frame, bg=color, padx=8, pady=4, relief="raised", bd=1)
            card.grid(row=0, column=i, padx=4, pady=2, sticky="nsew")
            tarjetas_frame.columnconfigure(i, weight=1)

            inner = tk.Frame(card, bg=color)
            inner.pack()
            tk.Label(inner, text=f"{emoji} {tipo.replace('SENTENCIA ', 'Sent. ')}",
                     font=("Segoe UI", 9, "bold"), bg=color, fg="white").pack(side="left", padx=3)
            lbl_num = tk.Label(inner, text="0", font=("Segoe UI", 14, "bold"), bg=color, fg="white")
            lbl_num.pack(side="left", padx=5)
            self.labels_stats[tipo] = lbl_num

        # ── Sub-notebook para Mensual / Ranking / Auditoría ──
        sub_notebook = ttk.Notebook(contenido)
        sub_notebook.pack(expand=True, fill="both", pady=5)

        tab_mensual = ttk.Frame(sub_notebook)
        tab_ranking = ttk.Frame(sub_notebook)
        tab_log = ttk.Frame(sub_notebook)

        sub_notebook.add(tab_mensual, text="  📅 Desglose Mensual  ")
        sub_notebook.add(tab_ranking, text="  🏆 Ranking  ")
        if self.rol_actual == "admin":
            sub_notebook.add(tab_log, text="  📋 Log de Auditoría  ")

        # ── Ranking de detalles más usados ───────────────────
        cols_rank = ("Pos", "Detalle", "Tipo", "Cantidad")
        self.tree_ranking = ttk.Treeview(tab_ranking, columns=cols_rank, show="headings", height=15)
        self.tree_ranking.column("Pos", width=40, anchor="center")
        self.tree_ranking.column("Detalle", width=350)
        self.tree_ranking.column("Tipo", width=150)
        self.tree_ranking.column("Cantidad", width=80, anchor="center")
        for col in cols_rank:
            self.tree_ranking.heading(col, text=col)

        self.tree_ranking.tag_configure("oro", background="#FFF3CD", font=("Segoe UI", 10, "bold"))
        self.tree_ranking.tag_configure("plata", background="#F0F0F0")
        self.tree_ranking.tag_configure("bronce", background="#FDEBD0")
        self.tree_ranking.tag_configure("normal_par", background="#FFFFFF")
        self.tree_ranking.tag_configure("normal_impar", background="#F8F9FA")

        scroll_rank = ttk.Scrollbar(tab_ranking, orient="vertical", command=self.tree_ranking.yview)
        self.tree_ranking.configure(yscrollcommand=scroll_rank.set)
        self.tree_ranking.pack(side="left", expand=True, fill="both")
        scroll_rank.pack(side="right", fill="y")

        # ── Desglose Mensual ─────────────────────────────────
        cols_mes = ("Mes", "Oficios", "Interlocutorios", "Sent. Trámite", "Sent. Relatoría", "Total")
        self.tree_mensual = ttk.Treeview(tab_mensual, columns=cols_mes, show="headings", height=13)

        self.tree_mensual.column("Mes", width=120)
        self.tree_mensual.column("Oficios", width=90, anchor="center")
        self.tree_mensual.column("Interlocutorios", width=110, anchor="center")
        self.tree_mensual.column("Sent. Trámite", width=110, anchor="center")
        self.tree_mensual.column("Sent. Relatoría", width=110, anchor="center")
        self.tree_mensual.column("Total", width=80, anchor="center")
        for col in cols_mes:
            self.tree_mensual.heading(col, text=col)

        self.tree_mensual.tag_configure("par", background="#E8F8F5")
        self.tree_mensual.tag_configure("impar", background="#FFFFFF")
        self.tree_mensual.tag_configure("total", background="#2C3E50", foreground="white",
                                        font=("Segoe UI", 10, "bold"))

        self.tree_mensual.pack(expand=True, fill="both")

        # ── Log de Auditoría (ahora con scroll y en su propia pestaña) ──
        cols_log = ("Fecha", "Acción", "Registro", "Detalle", "Usuario")
        self.tree_log = ttk.Treeview(tab_log, columns=cols_log, show="headings", height=15)
        self.tree_log.column("Fecha", width=140)
        self.tree_log.column("Acción", width=130)
        self.tree_log.column("Registro", width=80, anchor="center")
        self.tree_log.column("Detalle", width=350)
        self.tree_log.column("Usuario", width=130)
        for col in cols_log:
            self.tree_log.heading(col, text=col)

        scroll_log = ttk.Scrollbar(tab_log, orient="vertical", command=self.tree_log.yview)
        self.tree_log.configure(yscrollcommand=scroll_log.set)
        self.tree_log.pack(side="left", expand=True, fill="both")
        scroll_log.pack(side="right", fill="y")

        self.funciones_actualizar.append(self.actualizar_estadisticas)
        self.actualizar_estadisticas()

    def actualizar_estadisticas(self):
        anio = datetime.now().year
        cursor = self.conn.cursor()

        # 1. TOTALES POR TIPO (Tarjetas)
        cursor.execute("SELECT tipo, COUNT(*) FROM registros WHERE anio = ? AND expediente != 'ANULADO' GROUP BY tipo", (anio,))
        totales = {fila[0]: fila[1] for fila in cursor.fetchall()}

        for tipo, lbl in self.labels_stats.items():
            lbl.config(text=str(totales.get(tipo, 0)))

        # 2. DESGLOSE MENSUAL
        for item in self.tree_mensual.get_children():
            self.tree_mensual.delete(item)

        cursor.execute("""
            SELECT substr(fecha, 6, 2), tipo, COUNT(*) 
            FROM registros 
            WHERE anio = ? AND expediente != 'ANULADO' 
            GROUP BY substr(fecha, 6, 2), tipo
        """, (anio,))
        
        datos_meses = {}
        for mes, tipo, cantidad in cursor.fetchall():
            if mes not in datos_meses:
                datos_meses[mes] = {}
            datos_meses[mes][tipo] = cantidad

        meses_nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        gran_total = [0, 0, 0, 0]
        columnas = ["OFICIO", "AUTO", "SENTENCIA TRAMITE", "SENTENCIA RELATORIA"]

        for m_idx, mes_nombre in enumerate(meses_nombres, start=1):
            mes_str = f"{m_idx:02d}"
            conteos = []
            
            for t_idx, tipo_col in enumerate(columnas):
                cantidad = datos_meses.get(mes_str, {}).get(tipo_col, 0)
                conteos.append(cantidad)
                gran_total[t_idx] += cantidad

            total_mes = sum(conteos)
            tag = "par" if m_idx % 2 == 0 else "impar"
            self.tree_mensual.insert("", tk.END,
                                     values=(mes_nombre, conteos[0], conteos[1], conteos[2], conteos[3], total_mes),
                                     tags=(tag,))

        # Fila TOTAL
        self.tree_mensual.insert("", tk.END,
                                 values=("TOTAL", gran_total[0], gran_total[1], gran_total[2], gran_total[3],
                                         sum(gran_total)),
                                 tags=("total",))

        # 3. LOG DE AUDITORIA
        for item in self.tree_log.get_children():
            self.tree_log.delete(item)
        cursor.execute("""
            SELECT fecha, accion, registro_id, campo_modificado || ': ' || COALESCE(valor_anterior,'') || ' → ' || COALESCE(valor_nuevo,''), usuario
            FROM log_auditoria ORDER BY id DESC LIMIT 100
        """)
        for fila in cursor.fetchall():
            self.tree_log.insert("", tk.END, values=fila)
            
        # 4. RANKING
        for item in self.tree_ranking.get_children():
            self.tree_ranking.delete(item)
        cursor.execute("""
            SELECT detalle, tipo, COUNT(*) as cantidad
            FROM registros
            WHERE anio = ? AND expediente != 'ANULADO' AND detalle != ''
            GROUP BY detalle, tipo
            ORDER BY cantidad DESC
            LIMIT 30
        """, (anio,))
        for pos, fila in enumerate(cursor.fetchall(), start=1):
            detalle, tipo, cantidad = fila
            medalla = "🥇" if pos == 1 else "🥈" if pos == 2 else "🥉" if pos == 3 else ""
            tag = "oro" if pos == 1 else "plata" if pos == 2 else "bronce" if pos == 3 else "normal_par" if pos % 2 == 0 else "normal_impar"
            self.tree_ranking.insert("", tk.END,
                                     values=(f"{medalla} {pos}".strip(), detalle, tipo, cantidad),
                                     tags=(tag,))
    # ──────────────────────────────────────────────────────────
    # PANEL SUPERUSUARIO (JUEZ)
    # ──────────────────────────────────────────────────────────
    def panel_superusuario(self):
        pop = tk.Toplevel(self.root)
        pop.title("👑 Gestión de Claves de Empleados")
        pop.geometry("500x380")
        pop.transient(self.root)
        pop.grab_set()

        tk.Label(pop, text="Usuarios y Contraseñas", font=("Segoe UI", 12, "bold")).pack(pady=10)

        columnas = ("Nombre", "Contraseña", "Rol")
        tree_usr = ttk.Treeview(pop, columns=columnas, show="headings", height=8)
        for col in columnas:
            tree_usr.heading(col, text=col)
        tree_usr.column("Nombre", width=180)
        tree_usr.column("Contraseña", width=120, anchor="center")
        tree_usr.column("Rol", width=100, anchor="center")
        tree_usr.pack(pady=5, padx=10, fill="x")

        # 🔒 Variable para mostrar/ocultar contraseñas
        mostrar_pass = tk.BooleanVar(value=False)

        def cargar_usuarios():
            for item in tree_usr.get_children():
                tree_usr.delete(item)
            cursor = self.conn.cursor()
            cursor.execute("SELECT nombre, password, rol FROM usuarios ORDER BY rol, nombre")
            for fila in cursor.fetchall():
                nombre, pwd, rol = fila
                pwd_display = pwd if mostrar_pass.get() else "••••••"
                tree_usr.insert("", tk.END, values=(nombre, pwd_display, rol))

        cargar_usuarios()

        chk_ver = ttk.Checkbutton(pop, text="👁 Mostrar contraseñas", variable=mostrar_pass,
                                  command=cargar_usuarios)
        chk_ver.pack(pady=3)

        frame_edicion = tk.Frame(pop)
        frame_edicion.pack(pady=10)

        tk.Label(frame_edicion, text="Nueva clave:").grid(row=0, column=0, padx=5)
        ent_nueva_clave = ttk.Entry(frame_edicion, width=15)
        ent_nueva_clave.grid(row=0, column=1, padx=5)

        def forzar_cambio():
            seleccion = tree_usr.selection()
            if not seleccion:
                messagebox.showwarning("Atención", "Seleccione un usuario.", parent=pop)
                return
            nueva_clave = ent_nueva_clave.get().strip()
            if len(nueva_clave) < 4:
                messagebox.showwarning("Atención", "Mínimo 4 caracteres.", parent=pop)
                return
            usuario_sel = tree_usr.item(seleccion[0])['values'][0]
            if messagebox.askyesno("Confirmar", f"¿Cambiar clave de {usuario_sel}?", parent=pop):
                try:
                    cursor = self.conn.cursor()
                    cursor.execute("UPDATE usuarios SET password = ? WHERE nombre = ?", (nueva_clave, usuario_sel))
                    self._commit_y_sync()
                    messagebox.showinfo("Éxito", f"Clave de {usuario_sel} actualizada.", parent=pop)
                    ent_nueva_clave.delete(0, tk.END)
                    cargar_usuarios()
                except Exception as e:
                    messagebox.showerror("Error", f"Fallo:\n{e}", parent=pop)

        ttk.Button(frame_edicion, text="💾 Forzar Cambio", command=forzar_cambio).grid(row=0, column=2, padx=10)

    # ──────────────────────────────────────────────────────────
    # CAMBIAR PASSWORD PROPIO
    # ──────────────────────────────────────────────────────────
    def cambiar_password(self):
        pop = tk.Toplevel(self.root)
        pop.title("Cambiar Contraseña")
        pop.geometry("300x260")
        pop.transient(self.root)
        pop.grab_set()

        tk.Label(pop, text="Contraseña Actual:", font=("Segoe UI", 10)).pack(pady=5)
        ent_actual = ttk.Entry(pop, show="*")
        ent_actual.pack(pady=2)

        tk.Label(pop, text="Nueva Contraseña:", font=("Segoe UI", 10)).pack(pady=5)
        ent_nueva = ttk.Entry(pop, show="*")
        ent_nueva.pack(pady=2)

        tk.Label(pop, text="Repetir Nueva:", font=("Segoe UI", 10)).pack(pady=5)
        ent_rep = ttk.Entry(pop, show="*")
        ent_rep.pack(pady=2)

        def guardar_pass():
            actual = ent_actual.get()
            nueva = ent_nueva.get()
            rep = ent_rep.get()
            cursor = self.conn.cursor()
            cursor.execute("SELECT password FROM usuarios WHERE nombre = ?", (self.usuario_actual,))
            bd_pass = cursor.fetchone()[0]
            if actual != bd_pass:
                messagebox.showerror("Error", "Contraseña actual incorrecta.", parent=pop)
                return
            if nueva != rep:
                messagebox.showerror("Error", "Las nuevas no coinciden.", parent=pop)
                return
            if len(nueva) < 4:
                messagebox.showwarning("Atención", "Mínimo 4 caracteres.", parent=pop)
                return
            cursor.execute("UPDATE usuarios SET password = ? WHERE nombre = ?", (nueva, self.usuario_actual))
            self._commit_y_sync()
            messagebox.showinfo("Éxito", "¡Contraseña actualizada!", parent=pop)
            pop.destroy()

        ttk.Button(pop, text="Guardar", command=guardar_pass).pack(pady=15)

    # ──────────────────────────────────────────────────────────
    # TOGGLE REMITIDO (marcar/desmarcar como enviado)
    # ──────────────────────────────────────────────────────────
    def toggle_remitido(self, tree):
        seleccion = tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un registro para marcar como remitido.")
            return

        id_registro = tree.item(seleccion[0])['values'][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT COALESCE(remitido, 0), tipo, numero FROM registros WHERE id = ?", (id_registro,))
        row = cursor.fetchone()
        if not row:
            return
        estado_actual, tipo_doc, num_doc = row

        # 🌟 BLOQUEO DE SEGURIDAD PARA EL BUSCADOR GLOBAL
        if tipo_doc != "OFICIO":
            messagebox.showwarning("Atención", "La función de Remitido es exclusiva para OFICIOS.")
            return

        if estado_actual:
            # Ya está marcado → desmarcar
            if messagebox.askyesno("Desmarcar", f"¿Quitar marca de REMITIDO de {tipo_doc} N° {num_doc}?"):
                try:
                    self._begin_exclusive()
                    cursor.execute("UPDATE registros SET remitido = 0, remitido_por = '', remitido_fecha = '' WHERE id = ?", (id_registro,))
                    registrar_auditoria(self.conn, id_registro, "DESMARCAR_REMITIDO", "remitido",
                                        "REMITIDO", "NO REMITIDO", self.usuario_actual)
                    self._commit_y_sync()
                    for funcion in self.funciones_actualizar:
                        funcion()
                except Exception as e:
                    self._safe_rollback()
                    messagebox.showerror("Error", f"Fallo:\n{e}")
        else:
            # No está marcado → marcar
            ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            try:
                self._begin_exclusive()
                cursor.execute("UPDATE registros SET remitido = 1, remitido_por = ?, remitido_fecha = ? WHERE id = ?",
                               (self.usuario_actual, ahora, id_registro))
                registrar_auditoria(self.conn, id_registro, "MARCAR_REMITIDO", "remitido",
                                    "NO REMITIDO", f"REMITIDO por {self.usuario_actual}", self.usuario_actual)
                self._commit_y_sync()
                for funcion in self.funciones_actualizar:
                    funcion()
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"Fallo:\n{e}")

    # ──────────────────────────────────────────────────────────
    # MODIFICAR REGISTRO (con auditoría)
    # ──────────────────────────────────────────────────────────
    def modificar_registro(self, tree):
        seleccion = tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un registro.")
            return

        id_registro = tree.item(seleccion[0])['values'][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT expediente, detalle, usuario, tipo, numero FROM registros WHERE id = ?", (id_registro,))
        row = cursor.fetchone()
        if not row:
            return
        expte_actual, detalle_actual, creador_doc, tipo_doc, num_doc = row

        if self.rol_actual != "admin" and str(self.usuario_actual) != str(creador_doc):
            messagebox.showerror("Acceso Denegado",
                                 f"Documento creado por: {creador_doc}\nSolo podés modificar tus registros.")
            return

        pop = tk.Toplevel(self.root)
        pop.title(f"Modificar {tipo_doc} N° {num_doc}")
        pop.geometry("450x250")
        pop.transient(self.root)
        pop.grab_set()

        tk.Label(pop, text=f"Corrigiendo {tipo_doc} N° {num_doc}", font=("Segoe UI", 12, "bold")).pack(pady=10)

        frame_inputs = tk.Frame(pop)
        frame_inputs.pack(pady=5)

        tk.Label(frame_inputs, text="Expte Nro:").grid(row=0, column=0, sticky="e", pady=5)
        ent_expte = ttk.Entry(frame_inputs, width=35)
        ent_expte.insert(0, expte_actual)
        ent_expte.grid(row=0, column=1, padx=5, pady=5)

        tk.Label(frame_inputs, text="Detalle:").grid(row=1, column=0, sticky="e", pady=5)
        ent_detalle = ttk.Entry(frame_inputs, width=45)
        ent_detalle.insert(0, detalle_actual)
        ent_detalle.grid(row=1, column=1, padx=5, pady=5)

        def guardar_cambios():
            nuevo_expte = ent_expte.get().strip()
            nuevo_detalle = ent_detalle.get().strip().title()
            if not nuevo_expte:
                messagebox.showwarning("Atención", "Expediente no puede estar vacío.", parent=pop)
                return
            try:
                self._begin_exclusive()
                c = self.conn.cursor()
                c.execute("UPDATE registros SET expediente = ?, detalle = ? WHERE id = ?",
                          (nuevo_expte, nuevo_detalle, id_registro))

                # 📋 AUDITORÍA de la modificación
                if nuevo_expte != expte_actual:
                    registrar_auditoria(self.conn, id_registro, "MODIFICACION", "expediente",
                                        expte_actual, nuevo_expte, self.usuario_actual)
                if nuevo_detalle != detalle_actual:
                    registrar_auditoria(self.conn, id_registro, "MODIFICACION", "detalle",
                                        detalle_actual, nuevo_detalle, self.usuario_actual)

                self._commit_y_sync()
                for funcion in self.funciones_actualizar:
                    funcion()
                messagebox.showinfo("Éxito", "Registro modificado.", parent=pop)
                pop.destroy()
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"Fallo:\n{e}", parent=pop)

        ttk.Button(pop, text="💾 Guardar Cambios", command=guardar_cambios).pack(pady=15)

    # ──────────────────────────────────────────────────────────
    # ANULAR REGISTRO (con auditoría)
    # ──────────────────────────────────────────────────────────
    def anular_registro(self, tree):
        seleccion = tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un registro.")
            return

        id_registro = tree.item(seleccion[0])['values'][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT usuario, tipo, numero, expediente, detalle FROM registros WHERE id = ?", (id_registro,))
        row = cursor.fetchone()
        if not row:
            return
        creador_doc, tipo_doc, num_doc, expte_ant, detalle_ant = row

        if self.rol_actual != "admin" and str(self.usuario_actual) != str(creador_doc):
            messagebox.showerror("Acceso Denegado",
                                 f"Documento creado por: {creador_doc}\nSolo podés anular tus registros.")
            return

        if messagebox.askyesno("Confirmar Anulación",
                               f"¿ANULAR {tipo_doc} N° {num_doc} (ID {id_registro})?\n\nQuedará marcado como ANULADO."):
            try:
                self._begin_exclusive()
                cursor = self.conn.cursor()
                cursor.execute("UPDATE registros SET expediente = 'ANULADO', detalle = ? WHERE id = ?",
                               (f"Anulado por {self.usuario_actual}", id_registro))

                registrar_auditoria(self.conn, id_registro, "ANULACION", "expediente",
                                    expte_ant, "ANULADO", self.usuario_actual)

                self._commit_y_sync()
                for funcion in self.funciones_actualizar:
                    funcion()
                messagebox.showinfo("Éxito", "Registro ANULADO.")
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"Fallo:\n{e}")

    # ──────────────────────────────────────────────────────────
    # BORRAR REGISTRO (con auditoría)
    # ──────────────────────────────────────────────────────────
    def borrar_registro(self, tree):
        if self.rol_actual != "admin":
            messagebox.showerror("Acceso Denegado", "Solo admins pueden borrar. Use ANULAR.")
            return

        seleccion = tree.selection()
        if not seleccion:
            messagebox.showwarning("Atención", "Seleccione un registro.")
            return

        id_registro = tree.item(seleccion[0])['values'][-1]
        cursor = self.conn.cursor()
        cursor.execute("SELECT numero, tipo, expediente, detalle FROM registros WHERE id = ?", (id_registro,))
        row = cursor.fetchone()
        if not row:
            return
        num_doc, tipo_doc, expte, detalle = row

        if messagebox.askyesno("⚠️ Borrado Físico",
                               f"¿BORRAR DEFINITIVAMENTE {tipo_doc} N° {num_doc} (ID {id_registro})?\n\nDejará hueco en la numeración."):
            try:
                self._begin_exclusive()

                registrar_auditoria(self.conn, id_registro, "BORRADO", "registro_completo",
                                    f"{tipo_doc} N°{num_doc} | {expte} | {detalle}", "ELIMINADO",
                                    self.usuario_actual)

                cursor = self.conn.cursor()
                cursor.execute("DELETE FROM registros WHERE id = ?", (id_registro,))
                self._commit_y_sync()
                for funcion in self.funciones_actualizar:
                    funcion()
                messagebox.showinfo("Éxito", "Registro borrado.")
            except Exception as e:
                self._safe_rollback()
                messagebox.showerror("Error", f"Fallo:\n{e}")


# ══════════════════════════════════════════════════════════════
# PANTALLA DE LOGIN
# ══════════════════════════════════════════════════════════════
# ⏳ VENTANA DE CARGA (Para disimular el delay de la Nube)
class VentanaCarga:
    def __init__(self, root_principal, mensaje="Conectando..."):
        self.top = tk.Toplevel(root_principal)
        self.top.title("Conectando")
        self.top.geometry("260x120")
        self.top.overrideredirect(True) # Le saca los bordes de Windows
        self.top.attributes('-topmost', True) # Siempre al frente
        
        # Centrar en pantalla
        x = (self.top.winfo_screenwidth() // 2) - 130
        y = (self.top.winfo_screenheight() // 2) - 60
        self.top.geometry(f'+{x}+{y}')
        
        frame = tk.Frame(self.top, bg="#2C3E50", relief="raised", bd=2)
        frame.pack(expand=True, fill="both")
        
        tk.Label(frame, text=mensaje, font=("Segoe UI", 11, "bold"), bg="#2C3E50", fg="white").pack(pady=(25, 15))
        
        self.barra = ttk.Progressbar(frame, mode='indeterminate', length=200)
        self.barra.pack(pady=5)
        self.barra.start(15) 
        
        self.top.update()

    def cerrar(self):
        # 🌟 EL PARCHE: Detenemos la animación antes de destruir la ventana
        try:
            self.barra.stop()
        except:
            pass
        self.top.destroy()
class LoginScreen:
    def __init__(self, root):
        self.root = root
        self.root.title("Proteus — Acceso al Sistema de Numeración")
        self.root.geometry("400x330")
        self.root.configure(bg="#2C3E50")

        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after_idle(self.root.attributes, '-topmost', False)

        self.root.update_idletasks()
        width, height = 400, 330
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f'{width}x{height}+{x}+{y}')

        # ── Encabezado visual ────────────────────────────────
        tk.Label(root, text="🏛️", font=("Segoe UI", 24), bg="#2C3E50").pack(pady=(8, 0))
        tk.Label(root, text="SISTEMA DE NUMERACIÓN", font=("Segoe UI", 14, "bold"),
                 bg="#2C3E50", fg="white").pack(pady=(0, 2))
        tk.Label(root, text="Juzgado Correccional — Charata", font=("Segoe UI", 9),
                 bg="#2C3E50", fg="#BDC3C7").pack(pady=(0, 5))

        # ── Formulario de login ──────────────────────────────
        form = tk.Frame(root, bg="#2C3E50")
        form.pack(pady=5)

        conn = conectar_db()
        cursor = conn.cursor()
        cursor.execute("SELECT nombre FROM usuarios ORDER BY nombre")
        lista_nombres = [fila[0] for fila in cursor.fetchall()]
        conn.close()

        tk.Label(form, text="Usuario:", bg="#2C3E50", fg="white", font=("Segoe UI", 10)).pack(pady=2)
        self.combo_usuarios = ttk.Combobox(form, values=lista_nombres, state="readonly", width=30)
        self.combo_usuarios.pack(pady=3)
        if lista_nombres:
            self.combo_usuarios.current(0)

        tk.Label(form, text="Contraseña:", bg="#2C3E50", fg="white", font=("Segoe UI", 10)).pack(pady=2)
        self.ent_password = ttk.Entry(form, show="*", width=33)
        self.ent_password.pack(pady=3)

        self.lbl_error = tk.Label(form, text="", fg="#E74C3C", bg="#2C3E50", font=("Segoe UI", 9))
        self.lbl_error.pack(pady=2)

        lbl_caps = tk.Label(form, text="", fg="#F1C40F", bg="#2C3E50", font=("Segoe UI", 9, "bold"))
        lbl_caps.pack()

        def verificar_caps(event):
            if event.state & 0x2:
                lbl_caps.config(text="⚠️ MAYÚSCULAS ACTIVADAS")
            else:
                lbl_caps.config(text="")

        self.ent_password.bind("<KeyPress>", verificar_caps)

        def ingresar(event=None):
            usuario_elegido = self.combo_usuarios.get()
            pwd_ingresada = self.ent_password.get()
            if not usuario_elegido:
                return

            # 🚀 🌟 MOSTRAR CARTEL DE CARGA ANTES DE CONECTAR 🌟 🚀
            cartel_carga = VentanaCarga(self.root)
            self.root.update() # Asegura que se dibuje el cartel

            try:
                # 1. Conexión limpia y única
                conn = conectar_db()
                cursor = conn.cursor()
                cursor.execute("SELECT password, rol FROM usuarios WHERE nombre = ?", (usuario_elegido,))
                resultado = cursor.fetchone()

                # 2. Validar contraseña
                if not resultado or pwd_ingresada != resultado[0]:
                    cartel_carga.cerrar() # Cerrar ANTES del error
                    if not resultado:
                        self.lbl_error.config(text="❌ Usuario no encontrado")
                    else:
                        self.lbl_error.config(text="❌ Contraseña incorrecta")
                    conn.close()
                    return

                # 3. Control de sesiones abiertas
                nombre_pc = socket.gethostname()
                cursor.execute("SELECT pc_name FROM sesiones WHERE usuario = ?", (usuario_elegido,))
                sesion_activa = cursor.fetchone()

                if sesion_activa and sesion_activa[0] != nombre_pc:
                    cartel_carga.cerrar() # Cerrar ANTES de la pregunta
                    if not messagebox.askyesno("⚠️ Usuario en Uso", 
                                                f"'{usuario_elegido}' está abierto en:\n\n💻 {sesion_activa[0]}\n\n¿Forzar ingreso?"):
                        conn.close()
                        return
                    # Si forzaron, necesitamos reabrir el cartel para el arranque
                    cartel_carga = VentanaCarga(self.root) 
                    self.root.update()
                    # Reabrimos la conexión si se cerró en el messagebox
                    conn = conectar_db()
                    cursor = conn.cursor()

                # 4. Registrar la sesión
                ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute("REPLACE INTO sesiones (usuario, pc_name, fecha_login) VALUES (?, ?, ?)",
                               (usuario_elegido, nombre_pc, ahora))
                
                # Ojo: Solo hacemos commit manual si es sqlite3 (modo red)
                if not MODO_TURSO:
                    conn.commit()
                
                # Si es Turso, sincronizamos esta sesión al servidor antes de cerrar
                if hasattr(conn, 'sync'):
                    try:
                        conn.sync()
                    except:
                        pass
                
                # Cerramos esta conexión inicial (NumeradorApp abre la propia)
                conn.close()

                # 🌟 5. ÉXITO: Cerramos cartel y entramos al sistema
                cartel_carga.cerrar()
                self.root.destroy()
                ventana_principal = tk.Tk()
                app = NumeradorApp(ventana_principal, usuario_elegido, resultado[1])
                ventana_principal.mainloop()

            except Exception as e:
                # ❌ Si explota la conexión
                cartel_carga.cerrar()
                messagebox.showerror("Error al iniciar", f"Ocurrió un error grave:\n{e}")
        ttk.Button(form, text="🔑 Ingresar", command=ingresar).pack(pady=8)
        self.root.bind('<Return>', ingresar)


if __name__ == "__main__":
    root_login = tk.Tk()
    login = LoginScreen(root_login)
    root_login.mainloop()