# Domain Model

## Identidad y ownership

- Club: raíz tenant, configuración, onboarding y subscription.
- User (users): identidad autenticable global.
- Person (people): perfil dentro de un club, opcionalmente vinculado a User; DNI no es PK.
- user_club_memberships: acceso User↔Club, rol, permisos, estado y sector_ids.
- club_memberships: relación Person↔Club; no es la membership de autorización.
- Role: roles tenant DIRECTOR, TRABAJADOR e INSTRUCTOR, con definiciones/permisos shared.

## Configuración y operación

Sector es tenant, con UUID, metadata visual, capacidad ENROLLMENTS/INCOME, estado y archivo. Administración/administracion, Tesorería/tesoreria y Áreas Comunes/areas-comunes son system. sector_templates es catálogo global de 30 plantillas. Alta desde plantilla en Administración y draft libre en onboarding son caminos diferentes.

Employee/Worker relaciona Person, User y membership. Tiene remuneración fija opcional (has_fixed_compensation, amount, frequency, currency), no un porcentaje VARIABLE personal. Instructor tiene relación propia con Person; las actividades lo referencian. Invitaciones de 72 horas para identidades existentes se modelan aparte; entrega/sincronización pendientes (C02).

Activity relaciona club, sector e instructor/responsable según estado/validación. Activity Terms versiona VARIABLE (share del club) o FIXED (monto, frecuencia, moneda), con vigencia y continuidad. monthly_fee/comisiones antiguas no son autoridad de liquidación moderna.

Movement es hecho financiero con categoría, sector/actividad, persona/contraparte, medio de pago, origen y estados operacional/financiero. Enrollment relaciona Person con Activity; sector/instructor se derivan. Conserva estado, fee, fechas, override, UUID y secuencia tenant. Receivable, Payment y payment_allocations son objetos diferentes; las rutas de pagos inspeccionadas son lecturas.

Activity Settlement requiere actividad, término y período; Allocation relaciona pagos/anticipos/ajustes explícitos. Modelado DB presente, ciclo runtime incompleto (C01/B03).

## Configuración comercial, saldos y trazabilidad

Plan/Feature/Entitlement son globales; Subscription y capability override son tenant. FREE inicial; cuatro planes activables sin cobro durante onboarding.

Financial Account, Opening Balance Batch/Movement integran capital inicial y conciliación. Exchange Rate y Sync State son globales; usages/components registran valoración tenant.

Club Onboarding persiste finalización; Onboarding Operation conserva clave idempotente y resultado. Draft v2 es temporal. Employee Photo almacena metadata tenant y referencia privada, inicialmente temporal.

Task y Approval Request son operación administrativa. Import Batch/Error/XLSX Row conservan trazabilidad. Audit Log registra acciones sanitizadas.

## Autoridad por dominio

Rutas relativas a apps/api/src salvo shared/web indicados.

| Dominio | Service / repository real | Contrato y consumidores | Tests |
| --- | --- | --- | --- |
| Auth/registro | auth/loginService, registrationService, sessionService, userRepository; clubProvisioningService | shared contracts/auth; web session, LoginPage, RegisterPage | auth, registration, provisioning |
| Onboarding | onboardingService / onboardingRepository | shared contracts/onboarding; web modules/Onboarding | onboarding, atomicity, billing, photos |
| Sectores | ruta → sectorsRepository; catalog/readOnlyRepository | tipos locales y shared administration; SectorList/SetupForms | sectors, sectorCapacity |
| Workers | administration/workersService, workerMutationService / workersRepository | AdministrationWorkerMutationDto; WorkerDraftList/Administración | workersService, workerMutationService |
| Actividades | ruta → activitiesRepository; readOnlyRepository | shared contracts/activities, ActivityInput local; ActivityDraftList | activitiesRepository, activityTermsMigration |
| Liquidaciones | vistas SQL → postgresDashboard/implementation; calculador TS aislado | activity_settlements/allocations; Inicio/Economía indirectos | activitySettlementService, SQL estático |
| Movimientos | financeService / movementsRepository | MovementInput local, respuestas genéricas; Administración | financeRoutes, predicates, readOnly |
| Inscripciones | ruta → enrollmentsRepository, lifecycle SQL | EnrollmentInput local; Administración/CRM | enrollmentsRepository, lifecycle |
| Pagos/deudas | financeService / paymentsRepository, receivablesRepository | queries locales; consumidores financieros | financeRoutes; sin gate DB ejecutado |
| Categorías | shared movementCategoryCatalog; catalogRepository/provisioning | category_catalog/aliases/movement_categories; formularios/Economía | categoryCatalogMigration, economy |
| Inicio | dashboardService, postgresDashboardService y postgresDashboard/* | shared legacy; HomeModule | dashboard/balances |
| Economía | economyService, economyDomain, economyClubService / economyRepository y economy/* | shared contracts/economy; EconomyModule | characterization/domain/repository |
| Administración | administration Read/Summary services y repositories | shared contracts/administration; AdministrationModule | metrics/capacity/read |
| CRM | crmService/messages / crmRepository | shared legacy/members; CrmModule | crm/messages/prepareMessages |
| XLSX | xlsxMigration validator/referenceResolver/workbook | shared contracts/xlsxImport; DataMigrationModule | workbook/validator/references |
| Planes | clubCapabilityService, planCommercialCatalog, billingService (SQL en services) | shared commercialPlans/capabilities; MigrationStep/nav | capability/billing/catalog |
| Tareas/solicitudes | rutas → tasksRepository/requestsRepository | shared tasks/requests; Administración | repository tests |
| FX | exchangeRateService, providers y SQL de valoración | tablas FX; saldos/presentación | exchange/valuation tests |

No existe un repository o DTO dedicado para cada dominio. Ver CURRENT_STATE para bugs; no duplicar implementaciones para rellenar esta tabla.
