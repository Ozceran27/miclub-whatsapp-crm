# Decisión de caché de server state y aislamiento por club

**Estado:** aceptada para implementación posterior.  
**Decisión:** adoptar TanStack Query; no construir una caché propia.

## Separación de entregas

La corrección P0 de tenant scope no incorpora TanStack Query, no agrega su dependencia y no migra módulos. Primero se conserva en la sesión del frontend el `clubId` y el `membershipId` autoritativos enviados por `/auth/me` o por `/auth/clubs/select`. Además, el árbol del módulo se vuelve a montar al cambiar el club para descartar estado local del tenant anterior.

TanStack Query se incorporará en otro PR, después de validar el backend tenant-scoped. Se migrará **un módulo por PR**, empezando por Economía. No se hará una migración transversal de hooks existentes.

## Contrato de query keys

El PR de adopción debe centralizar factories. Toda key que represente datos de un tenant incluirá el `clubId` no nulo como primer dato variable y nunca usará `membershipId` como sustituto:

```ts
const economyKeys = {
  all: (clubId: string) => ['club', clubId, 'economy'] as const,
  summary: (clubId: string) => [...economyKeys.all(clubId), 'summary'] as const,
  movements: (clubId: string, filters: MovementFilters) =>
    [...economyKeys.all(clubId), 'movements', filters] as const
};
```

No se habilitará una query tenant-scoped mientras `clubId` sea `null`. El `QueryClient` será único para la sesión activa y se ejecutará `queryClient.clear()` tanto al cerrar sesión como después de confirmar un cambio de club. Incluir `clubId` en las keys es la defensa primaria; limpiar el cliente limita además exposición accidental, memoria y datos inactivos.

## Invalidaciones futuras

Las mutaciones deben invalidar sólo factories del club activo:

- **Movimientos:** listas, recientes, pendientes, resumen, evolución, rankings, medios de pago y balances afectados.
- **Pagos:** pagos, cuentas por cobrar, movimientos derivados, resumen y balances.
- **Inscripciones:** listas de socios/inscripciones, estado de deuda, crecimiento, resumen y sector correspondiente.
- **Sectores:** catálogo/detalle del sector, rankings, liquidaciones, inscripciones y agregados económicos del sector.

Hasta que cada dominio migre, sus efectos actuales siguen realizando fetch directo. No se deben mezclar datos de fetch directo con entradas parciales de TanStack Query bajo una misma pantalla.

## Regresión obligatoria

Cada PR de migración conservará una prueba que cargue Club A, cambie a Club B y compruebe que durante la transición no se renderiza contenido de A. La regresión inicial verifica que las identidades de instancia de los módulos incluyen el club, por lo que el cambio A/B descarta el estado local anterior. Al migrar Economía, se ampliará para inspeccionar el `QueryClient` y la UI con respuestas demoradas y fuera de orden.
