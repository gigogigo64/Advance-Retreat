import type { ReactNode } from "react";
import { Dialog as RadixDialog } from "radix-ui";

/** 简单模态对话框（基于 Radix Dialog） */
export function Modal({
  open, onOpenChange, title, children, wide,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  title: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40
          data-[state=open]:animate-in data-[state=open]:fade-in" />
        <RadixDialog.Content
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
            card shadow-2xl p-6 w-[92vw] ${wide ? "max-w-2xl" : "max-w-md"} max-h-[85vh] overflow-y-auto
            outline-none`}
        >
          <RadixDialog.Title className="text-lg font-bold mb-4">{title}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** 主按钮 */
export function Button({
  children, onClick, variant = "primary", className = "", disabled, type = "button",
}: {
  children: ReactNode; onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft"; className?: string;
  disabled?: boolean; type?: "button" | "submit";
}) {
  const styles: Record<string, string> = {
    primary: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/30",
    soft: "bg-[var(--surface-2)] text-[var(--ink)] hover:brightness-95",
    ghost: "hover:bg-[var(--surface-2)] text-[var(--ink-soft)]",
    danger: "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95
        disabled:opacity-40 disabled:pointer-events-none ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** 带图标的小输入控件容器 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-xs text-[var(--ink-soft)] mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]
        text-sm outline-none focus:border-emerald-400 transition-colors ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]
        text-sm outline-none focus:border-emerald-400 ${props.className ?? ""}`}
    />
  );
}

/** emoji 选择器 */
export function EmojiPicker({ value, onChange, list }: { value: string; onChange: (e: string) => void; list: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onChange(e)}
          className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all
            ${value === e ? "bg-emerald-500/15 ring-2 ring-emerald-400 scale-110" : "hover:bg-[var(--surface-2)]"}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** 颜色选择器 */
export function ColorPicker({ value, onChange, list }: { value: string; onChange: (c: string) => void; list: string[] }) {
  return (
    <div className="flex gap-2">
      {list.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full transition-transform
            ${value === c ? "ring-2 ring-offset-2 ring-[var(--ink-soft)] scale-110" : ""}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
