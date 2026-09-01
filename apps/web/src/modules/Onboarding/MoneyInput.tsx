import React, { type InputHTMLAttributes } from 'react';

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  prefix?: string;
  suffix?: string;
};

/** Shared affixed numeric control for balances, compensation and percentages. */
export function NumberInput({ prefix, suffix, ...inputProps }: NumberInputProps) {
  return <div className="onboarding-money-input">
    {prefix && <span className="onboarding-money-input__prefix" aria-hidden="true">{prefix}</span>}
    <input {...inputProps} type="number" />
    {suffix && <span className="onboarding-money-input__suffix" aria-hidden="true">{suffix}</span>}
  </div>;
}

export function MoneyInput(props: NumberInputProps & { prefix: string }) {
  return <NumberInput {...props} />;
}
