# NumeradorApp

Replica de la aplicacion original de numeracion judicial, separada en:

- `backend`: Node.js + Express + SQL Server
- `frontend`: React + Vite

## Funcionalidades replicadas

- Login por usuario/clave con control de sesion por PC.
- Login configurable con proveedor local (`bcrypt`) o Active Directory (`LDAP`).
- Access token + refresh token rotativo (cookie httpOnly).
- Contexto multi-dependencia (cada usuario opera solo sobre su dependencia).
- Roles (`admin`, `user`, `robot`) y permisos.
- Numeracion correlativa por `tipo + anio`.
- Numeracion correlativa separada por `dependencia + tipo + anio`.
- Tipos documentales:
  - OFICIO
  - AUTO
  - SENTENCIA TRAMITE
  - SENTENCIA RELATORIA
- Alta, modificacion, anulacion y borrado (borrado solo admin).
- Campo `remitido` exclusivo para OFICIO.
- Buscador global por texto, rango de fechas y tipo.
- Exportacion a Excel desde backend (`/records/export.xlsx`).
- Estadisticas por anio: totales, ranking y log de auditoria (admin).
- Catalogo de categorias en JSON (`backend/src/data/categorias.json`).
- Validacion de entrada con Zod en auth/registros/usuarios.

## 1) SQL Server

1. Crear base/objetos ejecutando:
   - `backend/sql/schema.sql`
2. Verificar acceso SQL Server desde credenciales del `.env`.

## 2) Backend (Node.js)

1. Ir a `backend`.
2. Copiar `.env.example` a `.env` y completar datos.
   - `JWT_ACCESS_EXPIRES` define duracion de access token.
   - `JWT_REFRESH_EXPIRES_DAYS` define duracion del refresh token.
   - `COOKIE_SECURE=true` para HTTPS en produccion.
   - `BCRYPT_ROUNDS` recomendado 12 o mayor.
   - `AUTH_PROVIDER=ad` para autenticar contra Active Directory.
   - `AD_AUTO_PROVISION=true` para crear usuario local al primer login AD.
   - `AD_DEFAULT_ROLE` rol para el auto-alta (recomendado `user`).
   - `AD_DEFAULT_DEPENDENCIA` dependencia por defecto en el auto-alta.
   - Para AD completar:
     - `AD_URL` (ej: `ldap://dc01.mi-organizacion.local:389`)
     - `AD_BASE_DN` (ej: `DC=mi-organizacion,DC=local`)
     - `AD_USER_FILTER` (por defecto `sAMAccountName`)
     - `AD_DNI_ATTRIBUTE` (por defecto `employeeID`) para guardar DNI en auto-alta
     - `AD_DNI_FALLBACK_ATTRIBUTES` (por defecto `employeeNumber,serialNumber`) si el atributo principal no viene informado
     - `AD_FULLNAME_ATTRIBUTE` (por defecto `displayName`) para guardar nombre completo
     - Opcional: `AD_BIND_DN` y `AD_BIND_PASSWORD` para buscar DN de usuario
     - Si no usas bind tecnico, configurar `AD_UPN_SUFFIX` para login directo `usuario@dominio`
3. Instalar dependencias:
   - `npm install`
4. Iniciar:
   - `npm run dev`

API base por defecto: `http://localhost:4000/api`

## 3) Frontend (React)

1. Ir a `frontend`.
2. Copiar `.env.example` a `.env`.
3. Instalar dependencias:
   - `npm install`
4. Iniciar:
   - `npm run dev`

Frontend por defecto: `http://localhost:5173`

## 4) Docker (frontend + backend en una red)

Esto levanta frontend, backend y módulo de integración conectados por una red Docker (`numerador-network`):

1. Mantener dos archivos de entorno:
   - `backend/.env` para desarrollo local (`npm run dev`).
   - `backend/.env.docker` para `docker compose` (si la clave tiene `$`, escaparla como `$$`).
2. Si SQL Server corre fuera de Docker en tu PC, usar:
   - `SQLSERVER_HOST=host.docker.internal`
   - `SIGI_SQLSERVER_HOST=host.docker.internal`
3. Desde la raiz del repo ejecutar:
   - `docker compose up --build -d`
4. Accesos:
   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:4000`
   - Integración embebida (demo): `http://localhost:5174`
   - En la demo de integración, la URL API por defecto es `/api` (same-origin por proxy interno de Docker).
   - Si necesitás apuntar a otro backend, podés cambiarla desde el campo "URL base del API".
5. Para detener:
   - `docker compose down`

## Endpoints principales

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`
- `GET /api/meta/categorias`
- `GET /api/records`
- `GET /api/records/export.xlsx`
- `GET /api/records/next-number/:tipo`
- `POST /api/records`
- `PUT /api/records/:id`
- `POST /api/records/:id/annul`
- `POST /api/records/:id/toggle-remitido`
- `DELETE /api/records/:id`
- `GET /api/stats`
- `GET /api/users` (admin)
- `PUT /api/users/:nombre/password` (admin)
- `PUT /api/users/:nombre/dependencia` (admin)
- `PUT /api/users/:nombre/dni` (admin)
