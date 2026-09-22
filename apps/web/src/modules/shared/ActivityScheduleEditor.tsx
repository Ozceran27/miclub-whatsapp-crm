import { areActivitySchedulesValid, type ActivityScheduleBlock } from '@miclub/shared';

const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
type Props={value:ActivityScheduleBlock[];onChange:(value:ActivityScheduleBlock[])=>void};
export function ActivityScheduleEditor({value,onChange}:Props){
  const update=(index:number,patch:Partial<ActivityScheduleBlock>)=>onChange(value.map((block,i)=>i===index?{...block,...patch}:block));
  return <div className="activity-schedule-editor">
    <p>Podés agregar varios bloques por día. Los horarios corresponden a la zona horaria del club.</p>
    {value.map((block,index)=><div className="activity-schedule-editor__row" key={index}>
      <label>Día<select value={block.weekday} onChange={event=>update(index,{weekday:Number(event.target.value)})}>{days.map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label>
      <label>Desde<input type="time" value={block.startTime} onChange={event=>update(index,{startTime:event.target.value})} required/></label>
      <label>Hasta<input type="time" value={block.endTime} onChange={event=>update(index,{endTime:event.target.value})} required/></label>
      <button type="button" className="ghost-btn" aria-label={`Quitar horario ${index+1}`} onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Quitar</button>
    </div>)}
    {!areActivitySchedulesValid(value)&&<p className="activity-form__error" role="alert">Los bloques deben terminar después de comenzar y no pueden duplicarse ni solaparse en un mismo día.</p>}
    <button type="button" className="ghost-btn activity-schedule-editor__add" onClick={()=>onChange([...value,{weekday:1,startTime:'09:00',endTime:'10:00'}])}>+ Agregar horario</button>
  </div>;
}
export const describeSchedule=(block:ActivityScheduleBlock)=>`${days[block.weekday]} ${block.startTime}–${block.endTime}`;
