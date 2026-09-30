// Pastille rouge « ! » — même visuel que celle posée sur l'icône de l'app dans la barre des
// tâches (commands/alerte.rs), pour l'alerte « À commander ».
export default function PastilleAlerte({ titre }: { titre: string }) {
  return (
    <span
      title={titre}
      aria-label={titre}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "#dc2626",
        color: "#fff",
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
        verticalAlign: "middle",
        cursor: "help",
      }}
    >
      !
    </span>
  );
}
