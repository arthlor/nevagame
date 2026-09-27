/** Named freight is content text; saved production labels remain an English fallback. */
export const TRADE_PACK_NAMES_TR: Readonly<Record<string, string>> = {
  'trade.wheat': 'Buğday Paketi', 'trade.tomato': 'Domates Paketi', 'trade.flax': 'Keten Paketi',
  'trade.apple_tree': 'Elma Paketi', 'trade.corn': 'Mısır Paketi', 'trade.carrot': 'Havuç Paketi',
  'trade.barley': 'Arpa Paketi', 'trade.potato': 'Patates Paketi', 'trade.sunflower': 'Ayçekirdeği Paketi', 'trade.olive_tree': 'Zeytin Paketi',
  'trade.neva_grain': 'Öğütülmüş Tahıl Çuvalları', 'trade.neva_provisions': 'Hasat Kumanyası',
  'trade.neva_feast': 'Köy Sofrası Sepeti', 'trade.neva_voyage': 'Sefer Kumanyası Sandığı',
  'trade.pinewatch_timber': 'Kurutulmuş Kereste Yükü', 'trade.pinewatch_linen': 'Keten Balyası',
  'trade.pinewatch_weatherproof': 'Yağmurluk Malzemeleri', 'trade.pinewatch_outfitter': 'Orman İşçisinin Sandığı',
  'trade.reedhaven_angler': 'Olta Takımı Kasası', 'trade.reedhaven_preserved': 'Dayanıklı Nehir Kumanyası',
  'trade.reedhaven_expedition': 'Nehir Seferi Malzemeleri', 'trade.reedhaven_pantry': 'Sazlık Erzak Sepeti',
  'trade.highridge_metals': 'Atölye Metal Kasası', 'trade.highridge_field': 'Tarla Aleti Malzemeleri',
  'trade.highridge_fittings': 'Sağlam Bağlantı Parçaları', 'trade.highridge_harvest': 'Yayla Erzak Sandığı',
  'trade.sunreach_cured': 'Tuzlanmış Deniz Balığı Kasası', 'trade.sunreach_pantry': 'Ada Erzak Paketi',
  'trade.sunreach_export': 'Sunreach İhracat Sepeti', 'trade.sunreach_rigging': 'Denizci Donanım Sandığı'
};
export function tradePackName(id: string | undefined, fallback: string, locale: string): string {
  return locale === 'tr' && id ? TRADE_PACK_NAMES_TR[id] ?? fallback : fallback;
}
