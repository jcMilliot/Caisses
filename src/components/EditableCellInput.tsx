import { useEffect, useRef } from "react";

export default function EditableCellInput({
  type,
  defaultValue,
  align,
  onCommit,
  onCancel,
}: {
  type: "text" | "number";
  defaultValue: string;
  align: "left" | "right";
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function commitOnce() {
    if (committed.current) return;
    committed.current = true;
    onCommit(ref.current?.value ?? defaultValue);
  }

  return (
    <input
      ref={ref}
      type={type}
      defaultValue={defaultValue}
      onBlur={commitOnce}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitOnce();
        } else if (e.key === "Escape") {
          e.preventDefault();
          committed.current = true;
          onCancel();
        }
      }}
      style={{
        width: "100%",
        textAlign: align,
        padding: "3px 6px",
        border: "1px solid var(--accent)",
        borderRadius: 4,
        font: "inherit",
      }}
    />
  );
}
