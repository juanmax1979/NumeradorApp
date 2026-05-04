---
pdf_options:
  format: A4
  printBackground: true
  margin:
    top: 18mm
    right: 16mm
    bottom: 18mm
    left: 16mm
  displayHeaderFooter: true
  headerTemplate: "<div></div>"
  footerTemplate: "<div style=\"font-size:9px;width:100%;text-align:center;color:#555;padding:0 16mm;\"><span class=\"pageNumber\"></span> / <span class=\"totalPages\"></span></div>"
---

# Instructivo de uso — Numerador

**Sistema de gestión y numeración de recaudos judiciales**  
**Poder Judicial del Chaco**

*Documento orientado a usuarios de las distintas dependencias judiciales. Las pantallas corresponden a la aplicación web (frontend) del Numerador.*

---

## 1. Qué es el Numerador

El Numerador permite **asignar números correlativos** a recaudos judiciales según el **tipo documental** y el **año**, de forma **aislada por dependencia**: cada usuario opera sobre la dependencia activa en su sesión. Los tipos contemplados en la interfaz son:

- **OFICIO**
- **AUTO**
- **SENTENCIA TRAMITE**
- **SENTENCIA RELATORIA**

Además, la aplicación ofrece **búsqueda global**, **exportación a Excel** y **estadísticas** por año para la dependencia en la que se está actuando.

---

## 2. Acceso e inicio de sesión

Al abrir la aplicación se muestra la pantalla **Inicio de sesión**, con el título *Numerador* y la leyenda *Sistema de gestión y numeración de recaudos judiciales*.

### 2.1 Datos a completar

1. **Usuario** — nombre de usuario asignado por la administración del sistema.  
2. **Contraseña** — clave correspondiente (puede estar vinculada a autenticación local o a directorio activo, según la configuración institucional).  
3. **Código de verificación** — se muestra un código alfanumérico en pantalla; debe transcribirse exactamente en el campo *Ingrese el codigo de verificacion* (sin confundir letras y números). El botón **Regenerar** genera un nuevo código si no se lee bien.

### 2.2 Sesión en otra computadora

Si el sistema indica que el usuario **ya tiene sesión activa** en otra PC, la aplicación puede ofrecer **forzar el ingreso**. Solo debe aceptarse si se está seguro de que no hay otra persona usando legítimamente la misma cuenta.

### 2.3 Tras iniciar sesión

Tras un login correcto, se accede al **área principal** con barra superior, pestañas de trabajo y tablas de registros. La sesión se mantiene mediante el mecanismo de tokens del sistema (renovación automática mientras se usa la aplicación).

---

## 3. Barra superior (identidad y dependencia)

En la parte superior se muestra información de contexto:

| Elemento | Descripción |
|----------|-------------|
| **Nombre y usuario** | Identificación del operador; también el **rol** (`admin`, `user`, `robot`, según corresponda). |
| **Fuero** | Fuero asociado al usuario (por ejemplo Penal), visible como referencia. |
| **Dependencia activa** | Dependencia judicial sobre la cual se **numeran, buscan y listan** los recaudos. En integración **SIGI**, puede mostrarse el texto devuelto por SIGI alineado al catálogo de dependencias del Numerador. |
| **Actuar en** (lista desplegable) | Si SIGI indica **más de una dependencia** para el usuario, aparece un selector **Actuar en** para cambiar de dependencia **sin cerrar sesión**. Al cambiar, los datos (números, listados, estadísticas) corresponden a la nueva dependencia. |
| **Refrescar** | Vuelve a cargar listados y el “próximo número” según la pestaña actual. |
| **Salir** | Cierra sesión en el servidor y en el navegador. |

### 3.1 Elección inicial de dependencia (varias asignaciones en SIGI)

Si, según SIGI, el usuario tiene **varias dependencias** mapeadas en el Numerador, al entrar puede abrirse un cuadro **“Elegí dependencia”**: debe seleccionarse la dependencia en la que se desea operar y pulsarse **Continuar**. Hasta confirmar, el contenido principal puede mostrar el mensaje de sincronización.

### 3.2 DNI y dependencia

Para usuarios con **sistema de origen SIGI**, la coherencia entre SIGI y el Numerador usa el **DNI** del perfil y el cruce con el catálogo de dependencias. Si no hay DNI cargado en el perfil, la barra puede indicar *sin DNI en el perfil*; en ese caso debe gestionarse el alta o corrección del dato con quien administra usuarios.

---

## 4. Pestañas de trabajo

Debajo de la barra superior hay botones de navegación:

| Pestaña | Uso principal |
|---------|----------------|
| **OFICIO**, **AUTO**, **SENTENCIA TRAMITE**, **SENTENCIA RELATORIA** | Alta de recaudos de ese tipo, consulta SIGI opcional, listado filtrado del tipo y acciones sobre filas. |
| **BUSCADOR** | Búsqueda transversal con filtros de texto, tipo, fechas y exportación a Excel. |
| **ESTADISTICAS** | Totales por tipo y ranking de detalles para un año, **de la dependencia activa**. |

---

## 5. Trabajo por tipo (OFICIO, AUTO, SENTENCIAS)

En cada pestaña de tipo:

### 5.1 Próximo número

Se muestra la leyenda **Proximo numero** con el valor que el sistema asignará al **próximo guardado** válido para ese tipo, año y dependencia activa.

### 5.2 Formulario de alta

1. **Expediente** — formato **NNNNNNNN/AAAA-CC** (hasta 8 dígitos antes de la barra, año de 4 dígitos, guion y circunscripción de 1 a 4 dígitos). Ejemplos válidos: `12345/2026-1`, `3500384/2026-91`. El campo normaliza caracteres no válidos mientras se escribe.  
2. **Detalle** — lista desplegable alimentada por el **catálogo de categorías** del sistema. Las opciones varían según el tipo; en **OFICIO** los textos pueden llevar prefijo *Of.* según la categoría.  
3. **OTROS (especificar)** — si se elige esta opción, debe completarse el campo de texto **Especificar detalle**.  
4. Botón con **icono de limpiar** (papelera): borra expediente, detalle y el filtro de búsqueda de la zona inferior, y cierra el panel SIGI si estaba abierto.  
5. **Guardar** — envía el alta. Si el expediente o el detalle no son válidos, el sistema lo indicará. Tras guardar correctamente, el formulario se vacía y se actualizan la tabla y el próximo número.

### 5.3 Filtro de registros y SIGI

- Campo **Filtrar registros o expediente para SIGI**: permite texto libre para acotar el listado del tipo actual.  
- **Buscar** — aplica el filtro y recarga la grilla del tipo.  
- **Consultar SIGI** — consulta el expediente en **formato SIGI** usando el valor del campo (mismo patrón NNNNNNN/AAAA-CC). Si el formato no es correcto, se muestra un mensaje de error.

#### Panel “SIGI — expediente”

Tras una consulta exitosa puede abrirse un panel con:

- Título **SIGI — expediente** y el número consultado.  
- Tabla con **todas las columnas** devueltas por SIGI.  
- Por cada fila, el botón **Usar expediente** copia el número de expediente detectado al formulario de alta **solo si la fila corresponde a la dependencia activa** del Numerador (códigos/nombres cruzados con la configuración). Si la fila es de otra dependencia, el botón aparece atenuado o, al pulsarlo, se explica que debe cambiarse la dependencia en la barra superior o verificarse el trámite en SIGI.  
- **Cerrar** — oculta el panel.

### 5.4 Tabla de registros (común a todas las pestañas con listado)

Debajo del formulario o del buscador, la sección **Registros** muestra columnas tales como: Tipo, Número (número/año), Expediente, Detalle, Remitido, Fecha, Usuario, datos de anulación si existieran, y **Acciones**.

**Paginación:** puede elegirse cuántos registros por página (10, 20 o 50) y navegar con **Anterior** / **Siguiente**.

**Acciones por fila (si el expediente no es “ANULADO”):**

- **Modificar** — solicita nuevo expediente y nuevo detalle mediante cuadros de diálogo; respeta el formato de expediente.  
- **Anular** — abre un formulario modal con **motivo** (Decreto no firmado, Rechazado por incongruencias, Otro) y **observación**. Si el motivo es *Otro*, la observación es obligatoria. La anulación **solo está habilitada dentro de un plazo** desde la creación del recaudo (por defecto 48 horas, según parámetro del sistema); pasado ese plazo el botón queda deshabilitado.  
- **Remitido** — **solo para tipo OFICIO**: alterna el estado remitido del recaudo (columna *Remitido*: SI o guión).

Los registros **anulados** aparecen tachados y no admiten modificación desde esta pantalla.

---

## 6. Buscador global (pestaña BUSCADOR)

Permite buscar en la **dependencia activa** con:

- **Texto** — criterio libre sobre campos relevantes.  
- **Tipo** — *TODOS* o uno de los cuatro tipos.  
- **Fechas** “desde” y “hasta” (por defecto el año en curso hasta hoy).

**Buscar** carga la grilla inferior con los resultados (hasta un límite fijado por el sistema). **Exportar Excel** descarga un archivo `.xlsx` con el mismo criterio de búsqueda (límite de filas según backend).

---

## 7. Estadísticas (pestaña ESTADISTICAS)

1. Ingresar el **año** numérico a analizar.  
2. Pulsar **Cargar**.  

Se muestran:

- **Totales por tipo** — tarjetas con la cantidad de recaudos no anulados del año, por cada tipo, para la dependencia activa.  
- **Ranking de detalles** — tabla con los detalles más frecuentes, tipo y cantidad.

*(El registro detallado de auditoría en base de datos puede estar restringido a perfiles administrativos; la pantalla actual enfatiza totales y ranking.)*

---

## 8. Buenas prácticas y soporte

1. **Siempre verificar** la **dependencia activa** en la barra superior antes de guardar o exportar.  
2. Usar **Consultar SIGI** para **validar** expediente y dependencia cuando el trámite viene de ese sistema.  
3. Ante **errores de login** o captcha, regenerar el código y reintentar; si persiste, contactar a soporte técnico o administración de usuarios.  
4. **No compartir** usuario y contraseña; el control de sesión por PC protege el uso indebido de la cuenta.  
5. Para **cambios de perfil** (DNI, dependencia por defecto, rol), debe intervenir un **administrador** del sistema.

---

*Documento generado a partir del comportamiento de la interfaz web del repositorio Numerador (React). Las políticas institucionales (plazos de anulación, catálogos, integración SIGI) pueden ajustarse en servidor sin que este texto lo refleje al instante.*

**Mayo de 2026**
