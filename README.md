# miClub WhatsApp CRM

Herramienta interna para gestión de cobranzas y preparación manual de mensajes por WhatsApp para miClub.

## Stack
- Node.js + TypeScript
- Express (API)
- React + Vite (Web)
- SQLite (historial local)
- Monorepo con workspaces npm

## Instalación
```bash
npm install
cp .env.example .env
```

## Variables de entorno
```env
PORT=4000
SQLITE_DB_PATH=apps/api/data/miclub.sqlite
VITE_API_URL=http://localhost:4000
```

## Desarrollo
```bash
npm run dev
```
Esto inicia:
- API: http://localhost:4000
- Web: http://localhost:5173

## Scripts útiles
```bash
npm run typecheck
npm run build
npm run dev
```

## Fase 1 (MVP robustecido)
- Datos mock de deudores.
- Filtros y selección múltiple.
- Plantillas editables con vista previa.
- Preparación manual de mensajes por links `wa.me`.
- Historial local en SQLite y endpoint `GET /history`.
- Validaciones en `POST /prepare-messages` con errores JSON estándar.

## Flujo operativo
1. Sincronizar deudores y plantillas mock.
2. Filtrar y seleccionar miembros.
3. Personalizar mensaje y preparar envíos.
4. Abrir manualmente cada link de WhatsApp.
5. Consultar historial preparado desde la UI.

## Fase 2 (futura, no incluida)
- Integración Google Sheets real.
- WhatsApp Business Platform / Cloud API.
- Webhooks, estados de entrega y métricas.

## Política WhatsApp
En Fase 1 no se automatiza el envío ni se manipula WhatsApp Web: el usuario confirma manualmente cada mensaje.
