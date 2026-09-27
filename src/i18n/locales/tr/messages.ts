// src/i18n/locales/tr/messages.ts

import type { MessagesSchema } from "../en/messages";

export const TR_MESSAGES: MessagesSchema = {
  notifications: {
    workCapacityExhausted: "Dermanın kalmadı. Emeğini toplamak için dinlen ya da bir lokma bir şey ye.",
    satchelFull: "Heybende bunu koyacak yer kalmadı.",
    wrongTool: "Bu iş için elinde uygun bir alet olmalı.",
    notEnoughCoins: "Bunun için yeterli akçen yok.",
    cropHarvested: "{count} adet {name} toplandı",
    fishCaught: "{name} ({weight} kg) yakalandı!",
    recipeUnlocked: "Yeni tarif öğrenildi: {name}",
    proficiencyUp: "{skill} hünerinde {rank}. Aşamaya ulaştın!",
    errandCompleted: "İş tamamlandı: {title}",
    boatBoarded: "{name} dümenine geçtin",
    daySaved: "Günün kaydı güvenle alındı.",
    fastTravelReady: "{destination} mevkiine varıldı",
    emergencyTowSuccess: "Tekne güvenle limandaki yerine çekildi.",
    emergencyTowFailed: "Tekne çekilemedi: {reason}"
  }
};
