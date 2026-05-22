import type { Member } from "@miclub/shared";

export const normalizeArPhone = (raw: string): string => {
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return "";

  let digits = digitsOnly;

  if (digits.startsWith("549")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("54")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  digits = digits.replace(/^(\d{2,4})15/, "$1");

  return `549${digits}`;
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

export const buildWaLink = (phone: string, message: string): string => {
  const url = new URL("https://web.whatsapp.com/send");
  url.searchParams.set("phone", phone);
  url.searchParams.set("text", message.normalize("NFC"));
  url.searchParams.set("app_absent", "0");
  return url.toString();
};
