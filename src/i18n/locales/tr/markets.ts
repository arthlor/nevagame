// src/i18n/locales/tr/markets.ts

import type { LocalizedMarketText } from "../../types";

export const TR_MARKETS: Record<string, LocalizedMarketText> = {
  "market.village": {
    name: "Köy Ürünleri Pazarı",
    description: "Tarla için tohum ve atölye malzemeleri. Hasadını ve elde taşıdığın balık paketlerini burada sat."
  },
  "market.harbor": {
    name: "Liman Balık Hali ve Toptancısı",
    description: "Olta takımı, buz ve yol erzağı. Liman siparişlerini burada teslim et; diğer balık paketlerini köy tezgâhlarında sat."
  },
  "market.sunreach_cove": {
    name: "Gündoğumu Koyu Pazarı",
    description: "Teras tohumları, ağır olta takımı ve yol erzağı. Yöre mahsullerini ve elde taşınan balıkları alır."
  },
  "market.pinewatch": {
    name: "Çamlıgöz Ticaret Karakolu",
    description: "Orman yolu üzerinde kereste ve kumaş. Mahsul ve balık getir; koy iskelesi başka bir ulaşım yolu sunar."
  },
  "market.reedhaven": {
    name: "Sazlıliman Nehir Borsası",
    description: "Bataklık iskelesinde yem, buz ve yakıt. Tahıl, bahçe meyveleri ve balık için alıcı bulabilirsin."
  },
  "market.highridge": {
    name: "Yüksek Sırt Yayla Deposu",
    description: "Koyun yukarısında kök bitki tohumları ve atölye malzemeleri. Deniz balıklarını karadan getir; tekne iskelesi yok."
  }
};

export const TR_HARBOR_SHOPKEEP_LINES = [
  "Kantar memuru ambarına göz gezdiriyor. Tartı dürüst, akçe peşin.",
  "Bugün deniz cömertti. Göster bakalım ne çektin.",
  "Tuz kokusu ve doğru terazi; limanın töresi budur.",
  "Kısmetin bol mu? Gel bakalım pazar ne diyor.",
  "İskelede bir gün daha bitti. Dök avını tezgâha."
];

export const TR_VILLAGE_SHOPKEEP_LINES = [
  "Dükkâncı tezgâhı siliyor. Tarladan taze geldin herhalde?",
  "Sabah bereketiyle geldin. Ne getirdin bakalım?",
  "Çizmelerin çamurlu; hasat günü gelmiş anlaşılan.",
  "Raflar kendi kendine dolmaz. Göster bakalım bereketi.",
  "Çiftçinin emeği sepetinden belli olur. Aç bakalım."
];
