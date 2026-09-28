import type { PreparedMessage } from '@miclub/shared';
import type { MessageStatus } from './types';
import { getStatusClass, getStatusLabel } from './types';

type Props={prepared:PreparedMessage[];page:number;total:number;loadPage:(page:number)=>Promise<void>;canWrite:boolean;
  openWhatsApp:(item:PreparedMessage)=>Promise<void>;updatePreparedStatus:(id:number|undefined,status:MessageStatus)=>Promise<void>};
export const PreparedMessagesPanel=({prepared,page,total,loadPage,canWrite,openWhatsApp,updatePreparedStatus}:Props)=><section className="section-panel">
  <div className="section-header"><div><h3>Mensajes preparados</h3><p>Bandeja persistente del club. Abrí cada mensaje en WhatsApp y confirmá el envío manualmente.</p></div>
    <button className="icon-btn ghost-btn" onClick={()=>void loadPage(page)}>Actualizar bandeja</button></div>
  {!prepared.length?<div className="empty-state"><p className="empty-state-title">No hay mensajes pendientes</p><p>Los mensajes preparados y abiertos aparecerán acá, incluso después de recargar.</p></div>
    :<div className="prepared-grid">{prepared.map(item=><article key={item.historyId} className="prepared-card"><div className="prepared-header"><h4>{item.nombre ?? item.memberId}</h4>
      <span className={`status-chip ${getStatusClass(item.status)}`}>{getStatusLabel(item.status)}</span></div>
      <p className="prepared-meta"><strong>Teléfono:</strong> {item.phone}</p><p className="prepared-meta"><strong>Actividad:</strong> {item.actividad ?? 'Sin vínculo histórico'}</p>
      <p>{item.message}</p>{canWrite&&<div className="actions-row prepared-actions">
        <button className="icon-btn" onClick={()=>void openWhatsApp(item)}>Abrir WhatsApp</button>
        <button className="icon-btn" onClick={()=>void updatePreparedStatus(item.historyId,'sent_manual')}>Marcar enviado</button>
        <button className="icon-btn" onClick={()=>void updatePreparedStatus(item.historyId,'skipped')}>Omitir</button>
      </div>}</article>)}</div>}
  <div className="history-pagination"><button className="icon-btn ghost-btn" disabled={page<=1} onClick={()=>void loadPage(page-1)}>Anterior</button>
    <span>Página {page} de {Math.max(1,Math.ceil(total/50))}</span>
    <button className="icon-btn ghost-btn" disabled={page*50>=total} onClick={()=>void loadPage(page+1)}>Siguiente</button></div>
</section>;
