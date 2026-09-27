// src/i18n/equipmentEffectsTr.ts
//
// Mirrors EquipmentDomain.effectLine and the rod lines on the character
// screen. The domain keeps writing English; this rewrites the sentence.

const ACTION_TR: Record<string, string> = {
  plant: "ekim",
  fertilize: "gübreleme",
  water: "sulama",
  harvest: "hasat",
  casting: "savurma",
  "sport hooking": "sportif kancalama",
  unroot: "sökme",
  inspect: "inceleme"
};

const HABITAT_TR: Record<string, string> = {
  river: "nehir",
  lake: "göl",
  coast: "kıyı",
  offshore: "açık deniz"
};

const CARGO_TR: Record<string, string> = {
  small: "küçük",
  medium: "orta",
  large: "büyük",
  huge: "iri",
  gargantuan: "dev"
};

function joinTr(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ve ${parts[parts.length - 1]}`;
}

/** Translates one equipment or rod effect line. Unknown lines stay as written. */
export function translateEffectLine(line: string, locale?: string): string {
  if (locale !== "tr" || !line) return line;
  if (line === "No specialist bonus") return "Özel bir hüner yok";
  if (line === "A physical fishing rod carried from the wardrobe into the world.") {
    return "Gardıroptan dünyaya taşınan somut bir olta.";
  }

  const work = line.match(/^(\d+)% less Work for (.+); integer rounding may limit small costs$/);
  if (work) {
    const actions = work[2].split(" and ").map((name) => ACTION_TR[name] ?? name);
    return `${joinTr(actions)} için %${work[1]} daha az Emek; küçük bedellerde tam sayı yuvarlaması sınır koyabilir`;
  }

  const quality = line.match(/^(\d+)% more chance for exceptional or prize crops; uses the same harvest roll$/);
  if (quality) return `Seçkin veya ödüllük mahsul şansı %${quality[1]} artar; aynı hasat zarı kullanılır`;

  const reach = line.match(/^\+([\d.]+) m ([a-z/]+) reach$/);
  if (reach) {
    const actions = reach[2].split("/").map((name) => ACTION_TR[name] ?? name);
    return `+${reach[1]} m ${actions.join("/")} menzili`;
  }

  const matter = line.match(/^\+(\d+) Plant Matter from mature annual harvests when space allows$/);
  if (matter) return `Yer varsa olgun yıllık hasattan +${matter[1]} Bitki Artığı`;

  const lineDamage = line.match(/^(\d+)% less sport line damage from overload and shake$/);
  if (lineDamage) return `Aşırı yük ve silkmede sportif misina hasarı %${lineDamage[1]} azalır`;

  const brace = line.match(/^(\d+)% stronger extra resistance while bracing$/);
  if (brace) return `Direnirken ek direnç %${brace[1]} daha güçlü`;

  const reel = line.match(/^([\d.]+) reel power · ([\d.]+) safe tension$/);
  if (reel) return `${reel[1]} makara gücü · ${reel[2]} güvenli gerilim`;

  const handles = line.match(/^Handles (\w+) catch · (.+)$/);
  if (handles) {
    const habitats = handles[2].split(", ").map((habitat) => HABITAT_TR[habitat] ?? habitat);
    const size = CARGO_TR[handles[1]] ?? handles[1];
    return `${size.charAt(0).toUpperCase()}${size.slice(1)} boy av taşır · ${habitats.join(", ")}`;
  }

  return line;
}
