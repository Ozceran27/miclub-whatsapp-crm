import { useDataMigration } from '../DataMigration/useDataMigration';

export function MigrationStep({ available,onPendingImport }: { available: boolean;onPendingImport:(batchId:string|null)=>void }) {
 const state=useDataMigration();
 if(!available)return <aside className="onboarding-warning" role="note"><strong>Migración no disponible</strong><p>La capacidad DATA_MIGRATION no está habilitada para este club. Podés omitir este paso sin perder la configuración realizada.</p></aside>;
 return <div className="setup-form"><p>Descargá la plantilla y validala. La importación no se aplicará antes de finalizar.</p><button type="button" onClick={()=>void state.downloadTemplate()}>Descargar plantilla XLSX</button><label>Archivo XLSX<input aria-label="Archivo XLSX" type="file" accept=".xlsx" onChange={event=>state.setFile(event.target.files?.[0])}/></label><button type="button" disabled={!state.file||state.loading} onClick={()=>void state.run().then(result=>onPendingImport(result?.batchId??null))}>Ejecutar dry-run</button>{state.summary&&<p role="status">Dry-run {state.summary.status}</p>}</div>;
}
