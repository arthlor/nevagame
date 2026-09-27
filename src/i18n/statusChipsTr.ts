// src/i18n/statusChipsTr.ts

export interface StatusChipCopy {
  label: string;
  description: string;
}

/** Turkish copy for HUD status chips. English chip text stays the simulation source. */
export function translateStatusChip(
  chip: { id: string; label: string; description: string },
  locale?: string
): StatusChipCopy {
  if (locale !== "tr") return { label: chip.label, description: chip.description };
  if (chip.id === "overburdened") {
    const penalty = chip.description.match(/Movement (\d+)% slower/);
    return {
      label: "Ağır Yük",
      description: penalty
        ? `Balığı iki elle taşıyorsun. Hareket %${penalty[1]} yavaş.`
        : "Balığı iki elle taşıyorsun."
    };
  }
  if (chip.id === "well-rested") {
    return {
      label: "Dinç",
      description: "Emek rezervin dolu. Üretken çalışma gücün hazır."
    };
  }
  return { label: chip.label, description: chip.description };
}
