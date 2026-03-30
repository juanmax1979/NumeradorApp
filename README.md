# NumeradorApp

Replica de la aplicacion original de numeracion judicial, separada en:

- `backend`: Node.js + Express + SQL Server
- `frontend`: React + Vite

## Funcionalidades replicadas

- Login por usuario/clave con control de sesion por PC.
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
