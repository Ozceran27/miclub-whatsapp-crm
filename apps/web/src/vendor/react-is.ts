import { Fragment, isValidElement } from 'react';

export function isFragment(value: unknown): boolean {
  return isValidElement(value) && value.type === Fragment;
}
