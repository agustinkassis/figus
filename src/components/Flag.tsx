// Maps internal team codes → ISO 3166-1 alpha-2 codes for flagcdn.com
const TEAM_ISO: Record<string, string> = {
  mex: "mx", rsa: "za", kor: "kr", cze: "cz",
  can: "ca", bih: "ba", qat: "qa", sui: "ch",
  bra: "br", mar: "ma", hai: "ht", sco: "gb-sct",
  usa: "us", par: "py", aus: "au", tur: "tr",
  ger: "de", cuw: "cw", civ: "ci", ecu: "ec",
  ned: "nl", jpn: "jp", swe: "se", tun: "tn",
  bel: "be", egy: "eg", irn: "ir", nzl: "nz",
  esp: "es", cpv: "cv", ksa: "sa", uru: "uy",
  fra: "fr", sen: "sn", irq: "iq", nor: "no",
  arg: "ar", alg: "dz", aut: "at", jor: "jo",
  por: "pt", cod: "cd", uzb: "uz", col: "co",
  eng: "gb-eng", cro: "hr", gha: "gh", pan: "pa",
};

// flagcdn.com widths available: 20, 40, 80, 160 px
function cdnWidth(displayH: number): 20 | 40 | 80 | 160 {
  if (displayH <= 16) return 20;
  if (displayH <= 28) return 40;
  if (displayH <= 56) return 80;
  return 160;
}

export function Flag({
  team,
  height = 20,
  style,
}: {
  team: string;
  height?: number;
  style?: React.CSSProperties;
}) {
  const iso = TEAM_ISO[team];
  if (!iso) return null;

  const w = cdnWidth(height);
  // Flags are roughly 3:2; compute display width from height
  const displayW = Math.round(height * 1.5);

  return (
    <img
      src={`https://flagcdn.com/w${w}/${iso}.png`}
      alt={team.toUpperCase()}
      width={displayW}
      height={height}
      style={{
        display: "inline-block",
        objectFit: "cover",
        borderRadius: 2,
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
