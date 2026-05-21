import type { Member } from "@miclub/shared";

export const normalizeArPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  const without15 = digits.replace(/(\d{2,4})15(\d+)/, "$1$2");
  if (without15.startsWith("549")) return without15;
  if (without15.startsWith("54")) return `549${without15.slice(2)}`;
  if (without15.startsWith("9")) return `54${without15}`;
  return `549${without15}`;
};

export const interpolateTemplate = (template: string, member: Member): string => {
  const values: Record<string, string> = {
    nombre: member.nombre,
    apellido: member.apellido,
    actividad: member.actividad ?? "tu actividad",
    modalidad: member.modalidad ?? "",
    cuota: member.cuota ? String(member.cuota) : "",
    instructor: member.instructor ?? ""
  };

  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
};

export const buildWaLink = (phone: string, message: string): string =>
  `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
