export function RecentColors({ colors, color, disabled, onSelect }: {
  colors: readonly string[]; color: string; disabled: boolean; onSelect: (color: string) => void;
}) {
  return <section className="recent-colors" aria-label="最近使った色" title="最近使った色（最新5色）">
    {Array.from({ length: 5 }, (_, index) => {
      const hex = colors[index];
      return hex ? <button key={hex} className="recent-color" disabled={disabled} aria-label={`最近使った色 ${hex}`} aria-pressed={color === hex} title={hex.toUpperCase()} onClick={() => onSelect(hex)}><span className="alpha-checker"><span className="swatch-alpha" style={{ backgroundColor: hex }} /></span></button>
        : <span key={`empty-${index}`} className="recent-color-empty" aria-hidden="true" />;
    })}
  </section>;
}
