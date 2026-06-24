import { ButtonHTMLAttributes, ReactNode } from "react";

import { actionStyles } from "../lib/visualSystem";
import { classNames } from "../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: actionStyles.primary,
    secondary: actionStyles.secondary,
    ghost: actionStyles.ghost,
    danger: actionStyles.danger,
  };

  return (
    <button className={classNames(variants[variant], className)} {...props}>
      {children}
    </button>
  );
}