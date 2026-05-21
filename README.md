# miclub-whatsapp-crm
Herramienta interna para sincronizar inscriptos de Google Sheets y gestionar mensajes de cobranza por WhatsApp para miClub.


# miClub WhatsApp CRM

Herramienta interna para sincronizar inscriptos desde Google Sheets y preparar mensajes de WhatsApp para gestión administrativa y cobranzas de miClub.

## Fase 1

- Lectura de inscriptos.
- Filtro de personas con estado Adeudando.
- Selección manual de destinatarios.
- Plantillas de mensajes.
- Apertura de WhatsApp Web con mensajes precargados mediante links wa.me.
- Sin automatización directa del envío.

## Fase 2

- Integración futura con WhatsApp Business Platform / Cloud API.
- Plantillas aprobadas.
- Automatización profesional.
- Historial avanzado.
- Webhooks y métricas.

## Stack previsto

- React + Vite + TypeScript
- Node.js + Express + TypeScript
- SQLite
- Google Sheets API