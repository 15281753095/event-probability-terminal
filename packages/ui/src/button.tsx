import type { ButtonHTMLAttributes } from "react";
import { cn } from "./lib";

export function Button({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center border border-transparent bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      type={type}
      {...props}
    />
  );
}

