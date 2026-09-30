import type { ReactNode } from "react";

interface MyButtonProps {
  tone: string;
  children: ReactNode;
}

function MyButton({ tone, children }: MyButtonProps) {
  return <button data-tone={tone}>{children}</button>;
}

export function DeleteAction() {
  return <MyButton color="danger">Delete</MyButton>;
}
