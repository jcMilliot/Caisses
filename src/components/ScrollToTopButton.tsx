import { useEffect, useState } from "react";

interface Props {
  cible: React.RefObject<HTMLElement | null>;
}

export default function ScrollToTopButton({ cible }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = cible.current;
    if (!el) return;
    function onScroll() {
      setVisible((el as HTMLElement).scrollTop > 200);
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [cible]);

  if (!visible) return null;

  return (
    <button
      onClick={() => cible.current?.scrollTo({ top: 0, behavior: "smooth" })}
      title="Remonter en haut"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "1px solid var(--border-strong)",
        background: "var(--bg-panel)",
        color: "var(--accent)",
        fontSize: 18,
        cursor: "pointer",
        boxShadow: "var(--shadow-lg)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      ↑
    </button>
  );
}
