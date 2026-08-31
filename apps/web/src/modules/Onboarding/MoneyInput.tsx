import React, { type InputHTMLAttributes } from 'react';

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  prefix: string;
};

export function MoneyInput({ prefix, ...inputProps }: MoneyInputProps) {
  return <div className="onboarding-money-input">
    <span className="onboarding-money-input__prefix" aria-hidden="true">{prefix}</span>
    <input {...inputProps} type="number" />
  </div>;
}
