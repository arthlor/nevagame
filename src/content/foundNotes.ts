/** A readable scrap that is not a person, a quest, or saved state. */

export const SUMMIT_OVERLOOK_NOTE_ID = "note.summit_overlook";

const SUMMIT_OVERLOOK_NOTE = {
  en: {
    title: "A note",
    lines: [
      "I came here often these days. The journey to climb here is exhausting, yet it makes me feel alive. Looking into the vast ocean in front of me makes me feel sad. It is vast, yet the emptiness inside me is even greater. This overthinking will never end. I'll never find peace."
    ]
  },
  tr: {
    title: "Bir not",
    lines: [
      "Bu aralar sık sık buraya geliyorum. Buraya tırmanmak yorucu, ama beni canlı hissettiriyor. Önümdeki engin okyanusa bakmak içimi hüzünle dolduruyor. Okyanus uçsuz bucaksız, ama içimdeki boşluk ondan da büyük. Bu düşünceler hiç bitmeyecek. Huzuru asla bulamayacağım."
    ]
  }
} as const;

export interface FoundNoteView {
  id: string;
  title: string;
  lines: readonly string[];
}

export function foundNoteView(id: string, locale: string): FoundNoteView | null {
  if (id !== SUMMIT_OVERLOOK_NOTE_ID) return null;
  const copy = locale === "tr" ? SUMMIT_OVERLOOK_NOTE.tr : SUMMIT_OVERLOOK_NOTE.en;
  return { id, title: copy.title, lines: copy.lines };
}
