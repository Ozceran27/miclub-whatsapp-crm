import type { Member, MessageTemplate } from "@miclub/shared";

export const members: Member[] = [
  { id: "1", nombre: "Lucía", apellido: "Gómez", dni: "30111222", telefono: "(011) 15-6234-1133", actividad: "Entrenamiento Funcional", modalidad: "Mensual", cuota: 32000, estado: "Adeudando", instructor: "Pablo Ruiz", sourceSheet: "FITNESS" },
  { id: "2", nombre: "Martín", apellido: "Pérez", dni: "27888999", telefono: "011 1544456677", actividad: "Yoga", modalidad: "Mensual", cuota: 28000, estado: "Adeudando", instructor: "Mariana Costa", sourceSheet: "AULA" },
  { id: "3", nombre: "Valeria", apellido: "Luna", dni: "33222111", telefono: "+54 9 11 5722 1199", actividad: "Salón de eventos", modalidad: "Reserva", cuota: 90000, estado: "Adeudando", instructor: "Equipo Comercial", sourceSheet: "SALON" },
  { id: "4", nombre: "Nicolás", apellido: "Suárez", telefono: "011-1541112233", actividad: "Musculación", modalidad: "Mensual", cuota: 30000, estado: "Al día", instructor: "Romina Diaz", sourceSheet: "FITNESS" }
];

export const templates: MessageTemplate[] = [
  { id: "friendly", name: "Recordatorio amable", body: "Hola {nombre}, ¿cómo estás? Te escribimos desde miClub para recordarte que registrás una cuota pendiente correspondiente a {actividad}. Cuando puedas, podés acercarte a administración o consultarnos por este medio. ¡Gracias!", isDefault: true, createdAt: "", updatedAt: "" },
  { id: "direct", name: "Recordatorio directo", body: "Hola {nombre}. Desde miClub te informamos que figura pendiente el pago de tu cuota de {actividad}. Por favor, regularizá tu situación para mantener activa tu inscripción.", isDefault: true, createdAt: "", updatedAt: "" },
  { id: "warning", name: "Aviso previo a vencimiento/suspensión", body: "Hola {nombre}. Te contactamos desde miClub porque tu inscripción en {actividad} figura con deuda pendiente. Para evitar la suspensión temporal del servicio, te pedimos regularizar el pago a la brevedad.", isDefault: true, createdAt: "", updatedAt: "" },
  { id: "custom-amount", name: "Recordatorio personalizado con monto", body: "Hola {nombre}, te escribimos por tu cuota pendiente de {actividad}. El monto registrado es ${cuota}. Si ya abonaste, por favor ignorá este mensaje. ¡Gracias!", isDefault: true, createdAt: "", updatedAt: "" }
];
