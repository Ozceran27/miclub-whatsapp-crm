import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type InfoTooltipProps = {
  content: string;
  label?: string;
  className?: string;
};

type TooltipPosition = {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
};

const TOOLTIP_GAP = 10;
const VIEWPORT_MARGIN = 12;
const MAX_TOOLTIP_WIDTH = 280;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export function InfoTooltip({ content, label = 'Ver ayuda', className = '' }: InfoTooltipProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltip = tooltipRef.current;
      const tooltipWidth = Math.min(tooltip?.offsetWidth ?? MAX_TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
      const tooltipHeight = tooltip?.offsetHeight ?? 0;
      const spaceAbove = triggerRect.top - VIEWPORT_MARGIN;
      const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_MARGIN;
      const placement: TooltipPosition['placement'] = spaceAbove >= tooltipHeight + TOOLTIP_GAP || spaceAbove > spaceBelow ? 'top' : 'bottom';
      const desiredTop = placement === 'top'
        ? triggerRect.top - tooltipHeight - TOOLTIP_GAP
        : triggerRect.bottom + TOOLTIP_GAP;
      const centeredLeft = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;

      setPosition({
        top: clamp(desiredTop, VIEWPORT_MARGIN, window.innerHeight - tooltipHeight - VIEWPORT_MARGIN),
        left: clamp(centeredLeft, VIEWPORT_MARGIN, window.innerWidth - tooltipWidth - VIEWPORT_MARGIN),
        placement
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const showTooltip = () => setIsOpen(true);
  const hideTooltip = () => setIsOpen(false);

  return (
    <span className={`info-tooltip ${className}`.trim()}>
      <button
        ref={triggerRef}
        className="info-tooltip__trigger"
        type="button"
        aria-label={label}
        aria-describedby={isOpen ? tooltipId : undefined}
        onBlur={hideTooltip}
        onFocus={showTooltip}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
      >
        ?
      </button>
      {isOpen && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          className={`info-tooltip__content info-tooltip__content--portal info-tooltip__content--${position?.placement ?? 'top'}`}
          role="tooltip"
          style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: 'hidden' }}
        >
          {content}
        </div>,
        document.body
      )}
    </span>
  );
}
