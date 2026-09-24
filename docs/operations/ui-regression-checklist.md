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

## Estándar de tablas administrativas

Las listas actuales de **Sectores, Trabajadores y Actividades** son la referencia
para futuras tablas de la aplicación. Este estándar documenta su diseño; no
autoriza a cambiar otras tablas durante esta tarea.

- Cada registro es una fila o tarjeta compacta independiente, con superficie,
  borde, radio y separación consistentes con los tokens de tema claro y oscuro.
- La primera celda identifica la entidad mediante icono o inicial y nombre. Los
  campos descriptivos se alinean a la izquierda; estados, conteos y cifras se
  alinean según su función y conservan una jerarquía de texto principal/secundario.
- Las tablas HTML conservan `thead` y `th` semánticos aun cuando el encabezado
  esté oculto visualmente. La vista de tarjetas muestra etiquetas de campo.
- Las columnas distribuyen el ancho disponible sin imponer scroll horizontal.
  Los valores largos se acortan visualmente y su contenido completo está
  disponible en la ficha; no se usa el truncamiento para ocultar la única vía
  de consulta del dato.
- La fila abre su ficha con puntero, Enter y Espacio, muestra foco visible y
  mantiene nombre accesible. Los estados de carga, vacío y error son explícitos.
- La adaptación depende del ancho real del contenedor: escritorio presenta
  columnas compactas y los anchos estrechos pasan a tarjetas legibles. Verificar
  ambas variantes de permisos financieros en Trabajadores y Actividades.
- La ficha modal conserva nombre accesible, Escape, contención y restauración de
  foco. La semántica, orden y ancho de columnas específicos de cada dominio se
  mantienen en su propio componente.

Revisión visual mínima: Sectores, Trabajadores y Actividades con datos largos,
valores ausentes, cifras negativas y estados distintos; temas claro y oscuro;
escritorio ancho, tablet y móvil. Al incorporar una tabla nueva, usar esta guía
sin copiar tamaños de columnas que sólo tienen sentido para otro dominio.

## Área de trabajo global

En escritorio ancho, el contenedor autenticado conserva el origen horizontal
previo y deja un margen derecho de 3,5 vw, limitado a 24–64 px. A 1366 px CSS
el margen izquierdo es de 12 px y el derecho de unos 48 px; a 1707 px son
aproximadamente 232 y 60 px. Desde 1100 px el contenedor usa 12 px a ambos
lados. El ajuste pertenece a la estructura global: revisar Inicio,
Administración, Tesorería, CRM, Migración y navegación sin scroll horizontal.

La capa experimental de densidad se retiró. Antes de intentar otra reducción
de escala, comparar los mismos recorridos con el zoom real del navegador al
80 % y al 100 %, incluidos badges, menús, modales y tablas.

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
