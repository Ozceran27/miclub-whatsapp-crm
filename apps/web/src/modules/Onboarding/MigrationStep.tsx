import { downloadTemplate } from '../../services/api/importApi';

export function MigrationStep({ available }: { available: boolean }) {
  return <div className="migration-intro">
    <section className="migration-intro__plans" aria-labelledby="migration-plans-title">
      <div className="migration-intro__heading">
        <p className="eyebrow">ACCESO SEGÚN TU PLAN</p>
        <h3 id="migration-plans-title">Elegí cómo preparar tu migración</h3>
        <p>La carga se realiza después del onboarding, desde el módulo <strong>Migración</strong>.</p>
      </div>
      <div className="migration-plan-grid">
        <article className="migration-plan-card">
          <span className="migration-plan-card__badge">Plan Complex</span>
          <h4>Migración autogestionada</h4>
          <p>Incluye acceso al módulo para validar la planilla y confirmar el lote cuando esté listo.</p>
        </article>
        <article className="migration-plan-card">
          <span className="migration-plan-card__badge">Plan Club</span>
          <h4>Migración con habilitación</h4>
          <p>Está disponible como servicio de migración. Contactá al equipo de miClub para coordinarla.</p>
        </article>
      </div>
      {!available && <p className="onboarding-warning" role="note"><strong>Tu club todavía no tiene acceso habilitado.</strong> Podés continuar la configuración y solicitar la migración más adelante.</p>}
    </section>

    <section className="migration-intro__workbook" aria-labelledby="migration-workbook-title">
      <div>
        <p className="eyebrow">MODELO XLSX</p>
        <h3 id="migration-workbook-title">Dos hojas, una única fuente de datos</h3>
      </div>
      <div className="migration-sheet-grid">
        <article><strong>ADMINISTRACIÓN</strong><p>Movimientos de ingresos, egresos y capital, con su categoría, sector, monto, estado y medio de pago.</p></article>
        <article><strong>INSCRIPCIONES</strong><p>Personas e inscripciones, con DNI, actividad, modalidad, cuota y estado.</p></article>
      </div>
      <p className="migration-reference-note"><strong>Las referencias deben coincidir exactamente.</strong> Los nombres de actividades, sectores y responsables del XLSX tienen que corresponder con los configurados en miClub para poder relacionar cada fila.</p>
      {available && <button className="secondary-button" type="button" onClick={() => void downloadTemplate()}>Descargar Modelo_Import_miClub.xlsx</button>}
    </section>

    <section className="migration-intro__flow" aria-labelledby="migration-flow-title">
      <h3 id="migration-flow-title">Cómo completar la importación</h3>
      <ol>
        <li><span>1</span><div><strong>Descargar</strong><p>Obtené el modelo oficial sin modificar hojas ni encabezados.</p></div></li>
        <li><span>2</span><div><strong>Adaptar</strong><p>Copiá tus datos y verificá que todas las referencias coincidan.</p></div></li>
        <li><span>3</span><div><strong>Dry-run</strong><p>Subí el archivo en Migración y revisá los errores de actividades, sectores y responsables.</p></div></li>
        <li><span>4</span><div><strong>Confirmar</strong><p>Aplicá el mismo lote solamente cuando la validación no tenga errores.</p></div></li>
      </ol>
    </section>

    <aside className="migration-capital-warning" role="note">
      <span aria-hidden="true">!</span>
      <div><strong>Importante: evitá duplicar el capital inicial</strong><p>Si la hoja <strong>ADMINISTRACIÓN</strong> contiene movimientos de capital inicial, configurá en <strong>cero los tres saldos del paso 2</strong>: Caja, Cuenta Corriente y Dólares.</p></div>
    </aside>
  </div>;
}
