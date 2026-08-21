export const MOVEMENT_CATEGORY_CLASSIFICATIONS = [
  "OPERATIONAL", "NON_OPERATIONAL", "TAX", "SERVICE", "LIABILITY",
] as const;

export type MovementCategoryClassification = typeof MOVEMENT_CATEGORY_CLASSIFICATIONS[number];
export type MovementCategoryDirection = "INGRESOS" | "EGRESOS";

/** Product catalog used by tenant provisioning and movement creation. */
export const MOVEMENT_CATEGORY_CATALOG = [
  ["INSCRIPCION", "Inscripción", "OPERATIONAL", "INGRESOS"], ["CUOTA", "Cuota", "OPERATIONAL", "INGRESOS"],
  ["TURNOS", "Turnos", "OPERATIONAL", "INGRESOS"], ["COMISION", "Comisión", "OPERATIONAL", "INGRESOS"],
  ["ALQUILER", "Alquiler", "OPERATIONAL", "INGRESOS"], ["EVENTOS", "Eventos", "OPERATIONAL", "INGRESOS"],
  ["VENTAS", "Ventas", "OPERATIONAL", "INGRESOS"], ["CLASES", "Clases", "OPERATIONAL", "INGRESOS"],
  ["CURSOS", "Cursos", "OPERATIONAL", "INGRESOS"], ["KIOSCO", "Kiosco", "OPERATIONAL", "INGRESOS"],
  ["BEBIDAS", "Bebidas", "OPERATIONAL", "INGRESOS"], ["PUBLICIDAD", "Publicidad", "NON_OPERATIONAL", "EGRESOS"],
  ["SALARIOS", "Salarios", "OPERATIONAL", "EGRESOS"], ["MANTENIMIENTO", "Mantenimiento", "NON_OPERATIONAL", "EGRESOS"],
  ["DEPOSITOS", "Depósitos", "NON_OPERATIONAL", "INGRESOS"], ["EXTRACCIONES", "Extracciones", "NON_OPERATIONAL", "EGRESOS"],
  ["DOLARES", "Dólares", "NON_OPERATIONAL", "EGRESOS"], ["REPARACIONES", "Reparaciones", "NON_OPERATIONAL", "EGRESOS"],
  ["VIATICOS", "Viáticos", "NON_OPERATIONAL", "EGRESOS"], ["GANANCIA", "Ganancia", "NON_OPERATIONAL", "INGRESOS"],
  ["PERDIDA", "Pérdida", "NON_OPERATIONAL", "EGRESOS"], ["CMV", "CMV", "OPERATIONAL", "EGRESOS"],
  ["SEGUROS", "Seguros", "NON_OPERATIONAL", "EGRESOS"], ["LIMPIEZA", "Limpieza", "NON_OPERATIONAL", "EGRESOS"],
  ["LIBRERIA", "Librería", "NON_OPERATIONAL", "EGRESOS"], ["OTROS", "Otros", "NON_OPERATIONAL", "EGRESOS"],
  ["IMPUESTOS", "Impuestos", "TAX", "EGRESOS"], ["LUZ", "Luz", "SERVICE", "EGRESOS"],
  ["AGUA", "Agua", "SERVICE", "EGRESOS"], ["INTERNET", "Internet", "SERVICE", "EGRESOS"],
  ["DEUDAS", "Deudas", "LIABILITY", "EGRESOS"], ["SERVICIOS", "Servicios", "SERVICE", "EGRESOS"],
  ["CAPITAL_INICIAL", "Capital inicial", "NON_OPERATIONAL", "INGRESOS"],
] as const satisfies readonly (readonly [string, string, MovementCategoryClassification, MovementCategoryDirection])[];

export const ACTIVE_MOVEMENT_CATEGORY_CODES = MOVEMENT_CATEGORY_CATALOG.map(([code]) => code);
