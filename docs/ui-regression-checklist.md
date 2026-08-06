# Checklist automatizable de regresión de interfaz

Ejecutar `npm run test -w @miclub/web`. La suite `uiRegression.test.ts` convierte este checklist en un control de CI:

- **Loading:** anuncia el progreso con `role="status"`, marca la región ocupada y no muestra resultados anteriores.
- **Error:** usa `role="alert"`, ofrece reintento y no presenta el error como un total igual a cero.
- **Vacío:** sólo aparece después de una carga exitosa con cero resultados.
- **Modales:** conservan nombre accesible, `role="dialog"` y `aria-modal="true"`.
- **Escape y teclado:** Escape cierra el modal, Tab queda contenido, el foco vuelve al disparador y las filas se activan con Enter o Espacio.
- **Foco visible:** la hoja global mantiene una regla `:focus-visible`.
- **Paginación:** anuncia página actual/total y deshabilita Anterior/Siguiente en los extremos.
- **Filtros:** búsqueda y estado tienen etiquetas; el envío se realiza con un botón de tipo `submit`.

La regla funcional es: **desconocido o fallido no equivale a cero**. Un cero se muestra únicamente cuando la respuesta fue exitosa y el valor fue realmente informado.
