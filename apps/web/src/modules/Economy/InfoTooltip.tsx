type InfoTooltipProps = {
  content: string;
  label?: string;
};

export function InfoTooltip({ content, label = 'Ver ayuda' }: InfoTooltipProps) {
  return (
    <span className="info-tooltip">
      <button className="info-tooltip__trigger" type="button" aria-label={label}>?</button>
      <span className="info-tooltip__content" role="tooltip">{content}</span>
    </span>
  );
}
