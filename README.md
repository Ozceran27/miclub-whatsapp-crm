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
```

## Desarrollo
```bash
npm run dev
```
Esto inicia:
- API: http://localhost:4000
- Web: http://localhost:5173

## Fase 1 (MVP)
- Datos mock de deudores.
- Filtros y selección múltiple.
- Plantillas editables.
- Generación de links `wa.me`.
- Registro local de mensajes preparados en SQLite.

## Fase 2 (futura)
- Integración Google Sheets real.
- WhatsApp Business Platform / Cloud API.
- Webhooks, estados de entrega y métricas.

## Política WhatsApp
En Fase 1 no se automatiza el envío ni se manipula WhatsApp Web: el usuario confirma manualmente cada mensaje.
