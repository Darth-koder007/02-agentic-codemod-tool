import type { ReactNode } from "react";

interface MyButtonProps {
  tone: string;
  children: ReactNode;
}

function MyButton({ tone, children }: MyButtonProps) {
  return <button data-tone={tone}>{children}</button>;
}

export function DeleteAction() {
  // Legacy caller still using the old `color` prop name, before MyButton was renamed to `tone`.
  return <MyButton color="danger">Delete</MyButton>;
}
