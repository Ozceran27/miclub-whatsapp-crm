import React from 'react';
import type { CurrencyPresentation } from './currencyPresentation';

type FlagProps = Pick<CurrencyPresentation, 'flagRegion' | 'flagName'>;

/** Local, font-independent flag artwork for the operational currency picker. */
export function CurrencyFlag({ flagRegion, flagName }: FlagProps) {
  return <span className="currency-flag" role="img" aria-label={flagName} data-flag-region={flagRegion}>
    <svg viewBox="0 0 30 20" aria-hidden="true" focusable="false">
      {flagRegion === 'AR' && <><path fill="#74acdf" d="M0 0h30v20H0z"/><path fill="#fff" d="M0 6.67h30v6.66H0z"/><circle fill="#f6b40e" cx="15" cy="10" r="2"/></>}
      {flagRegion === 'US' && <><path fill="#fff" d="M0 0h30v20H0z"/>{[0,4,8,12,16].map(y=><path key={y} fill="#b22234" d={`M0 ${y}h30v2H0z`}/>)}<path fill="#3c3b6e" d="M0 0h13v10H0z"/><path fill="#fff" d="m2 2 .4 1.2h1.3l-1 .7.4 1.2-1.1-.7-1 .7.4-1.2-1-.7h1.2zm5 0 .4 1.2h1.3l-1 .7.4 1.2-1.1-.7-1 .7.4-1.2-1-.7h1.2z"/></>}
      {flagRegion === 'BR' && <><path fill="#009b3a" d="M0 0h30v20H0z"/><path fill="#ffdf00" d="m15 2 12 8-12 8-12-8z"/><circle fill="#002776" cx="15" cy="10" r="4.3"/><path fill="none" stroke="#fff" strokeWidth=".8" d="M11 9c3-1 6-.2 8 1.5"/></>}
      {flagRegion === 'EU' && <><path fill="#003399" d="M0 0h30v20H0z"/>{Array.from({length:12},(_,index)=>{const angle=index*Math.PI/6;return <circle key={index} fill="#ffcc00" cx={15+5*Math.sin(angle)} cy={10-5*Math.cos(angle)} r=".7"/>;})}</>}
    </svg>
    <span className="currency-flag__fallback" aria-hidden="true">{flagRegion}</span>
  </span>;
}
