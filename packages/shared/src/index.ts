export type SourceSheet = "FITNESS" | "SALON" | "AULA" | "LOCAL_1" | "ADMINISTRACION";

export type DebtorStatus = "Adeudando" | "Al día" | "Pendiente" | "Desconocido";

export interface Member {
  id: string;
  nombre: string;
  apellido: string;
  dni?: string;
  telefono: string;
  actividad?: string;
  modalidad?: string;
  cuota?: number;
  estado: DebtorStatus;
  instructor?: string;
  sourceSheet: SourceSheet;
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
}

export interface PreparedMessage {
  historyId?: number;
  memberId: string;
  nombre?: string;
  phone: string;
  actividad?: string;
  message: string;
  waLink: string;
  status?: "prepared" | "opened" | "sent_manual" | "skipped";
  createdAt: string;
  openedAt?: string | null;
  sentAt?: string | null;
  note?: string | null;
}

export interface PrepareMessagesRequest {
  memberIds: string[];
  message: string;
}
