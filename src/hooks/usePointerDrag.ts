import { useEffect, useRef, useState } from "react";

interface DragState {
  articleId: number;
  x: number;
  y: number;
}

/**
 * Drag & drop basé sur les pointer events plutôt que l'API HTML5 Drag and Drop,
 * car cette dernière est peu fiable dans la WebView2 utilisée par Tauri sous Windows
 * (icône "interdit" permanente malgré preventDefault()/dropEffect corrects).
 */
export function usePointerDrag(onDrop: (articleId: number, targetEl: Element) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  function startDrag(articleId: number, e: React.PointerEvent) {
    setDrag({ articleId, x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!drag) return;

    function handleMove(e: PointerEvent) {
      setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
    }

    function handleUp(e: PointerEvent) {
      setDrag((prev) => {
        if (prev) {
          const target = document.elementFromPoint(e.clientX, e.clientY);
          if (target) onDropRef.current(prev.articleId, target);
        }
        return null;
      });
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // Ne se ré-abonne qu'au passage inactif <-> actif, pas à chaque coordonnée de `drag`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  return { drag, startDrag };
}
