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
  memberId: string;
  phone: string;
  message: string;
  waLink: string;
  createdAt: string;
}

export interface PrepareMessagesRequest {
  memberIds: string[];
  message: string;
}
