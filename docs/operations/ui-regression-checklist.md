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

## Onboarding: matriz de viewports

Validar siempre con el **zoom del navegador al 100%**, sin escalado CSS. En cada escenario, el encabezado de progreso y la barra de acciones deben permanecer visibles; cuando el paso exceda el espacio disponible, únicamente `.onboarding-viewport` debe desplazarse.

| Escenario | Viewport CSS | Zoom | Verificación esperada |
| --- | ---: | ---: | --- |
| Notebook | 1366 × 768 | 100% | Diálogo con margen exterior; progreso y acciones fijos; scroll central si hace falta. |
| Desktop | 1440 × 900 | 100% | Diálogo centrado y compacto, sin exceder su alto máximo. |
| Desktop grande | 1920 × 1080 | 100% | Ancho legible limitado; encabezado y acciones no se estiran ni salen de vista. |
| Tablet | 768 × 1024 | 100% | Contenido en una columna cuando corresponda y controles con área cercana a 44 px. |
| Tablet horizontal | 1024 × 768 | 100% | Se aplica la densidad por altura y sólo se desplaza el contenido central. |
| Móvil | 390 × 844 | 100% | Hoja inferior a ancho completo; acciones visibles y controles de al menos 44 px. |
| Móvil compacto | 360 × 640 | 100% | Etiquetas de progreso ocultas; cabecera y acciones visibles; scroll central. |

Comprobar además la apertura de los modales de edición dentro del onboarding: deben usar el mismo margen y densidad, conservar el foco en coordenadas reales y permitir su propio scroll sin `zoom` ni `transform: scale()`.

## Recorrido integral de onboarding

- Registrar un club nuevo y confirmar que el tenant se obtiene de la sesión, no del payload.
- Cerrar sesión, iniciar sesión y abrir el onboarding pendiente.
- Configurar saldos, sectores, trabajadores y actividades con sus referencias e iconos.
- Seleccionar un plan, revisar términos económicos y llegar al resumen final.
- Pulsar una vez **Iniciar mi club**, mantener visible el resumen durante el proceso y comprobar la confirmación de éxito.
- Simular una interrupción y reintentar con la misma clave: no deben duplicarse entidades.
- Después de la respuesta definitiva, acceder a Inicio, Administración, Economía y los módulos habilitados por el plan.
