import { useCallback, useState } from "react";

interface AboutButtonProps {
  onClick: () => void;
}

export default function AboutButton({ onClick }: AboutButtonProps) {
  const [glow, setGlow] = useState(false);

  const handleClick = useCallback(() => {
    setGlow(true);
    onClick();
    window.setTimeout(() => setGlow(false), 480);
  }, [onClick]);

  return (
    <span className="rag-intel-btn-wrap">
      <button
        type="button"
        className={`rag-intel-btn${glow ? " rag-intel-btn--glow" : ""}`}
        onClick={handleClick}
        title="Learn about CVLM"
      >
        About
      </button>
    </span>
  );
}
