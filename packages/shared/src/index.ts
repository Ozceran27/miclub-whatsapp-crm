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
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
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
  mode?: "test" | "real";
}

export interface PrepareMessagesValidation {
  selectedCount: number;
  selectedPreview: Array<{ memberId: string; nombre: string; actividad?: string; cuota?: number; phone: string }>;
  missingPhoneMembers: Array<{ memberId: string; nombre: string }>;
  unresolvedVariables: string[];
  duplicates: Array<{ memberId: string; nombre: string; status: string; createdAt: string }>;
  sampleMessage: string;
  mode: "test" | "real";
  testPhoneOverride?: string;
}


export interface PaginatedHistoryResponse {
  items: PreparedMessage[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ContactedRecentMemberInfo {
  lastSentAt: string;
  count: number;
}

export interface ContactedRecentResponse {
  windowDays: number;
  since: string;
  memberIds: string[];
  byMemberId: Record<string, ContactedRecentMemberInfo>;
}
