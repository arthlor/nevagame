// src/i18n/locales/tr/markets.ts

import type { LocalizedMarketText } from "../../types";

export const TR_MARKETS: Record<string, LocalizedMarketText> = {
  "market.village": {
    name: "Köy Ürünleri Pazarı",
    description: "Tarım mahsulleri ve günlük erzak için işlek ticaret meydanı. Teknelerden karaya taşınan balık denklerini de satın alır."
  },
  "market.harbor": {
    name: "Liman Balık Hali ve Toptancısı",
    description: "Taze deniz ürünleri, buz, yem ve tekne malzemeleri tedarik edilen ana liman iskelesi."
  },
  "market.sunreach_cove": {
    name: "Gündoğumu Koyu Pazarı",
    description: "Güneye bakan sıcak terasların zeytin, sardalya ve tuzlu balık takas ettiği kıyı pazarı."
  },
  "market.pinewatch": {
    name: "Çamlıgöz Ticaret Karakolu",
    description: "Kuzey ormanlarının kenarında kereste, av eti ve dayanıklı malzeme takas edilen ticaret noktası."
  },
  "market.reedhaven": {
    name: "Sazlıliman Nehir Borsası",
    description: "İç su yollarının kesiştiği, nehir balıkları ve saz ürünlerinin alınıp satıldığı sakin pazar."
  },
  "market.highridge": {
    name: "Yüksek Sırt Yayla Deposu",
    description: "Dağ yamaçlarından gelen erzakların ve dayanıklı kışlık mahsullerin toplandığı iç bölge ambarı."
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
