/** Localized presentation for the simulation's transport and packing prompts. */
export function villageTradeTextTr(text: string): string {
  return text
    .replace('Pack village specialties', 'Yöresel ürünleri paketle')
    .replace('Four-pack Wagon', 'Dört Paketlik Yük Arabası')
    .replace('Six-pack Wagon', 'Altı Paketlik Yük Arabası')
    .replace('Sunreach Trading Coaster', 'Sunreach Ticaret Gemisi')
    .replace('Coastal Fishing Skiff', 'Kıyı Balıkçı Teknesi')
    .replace(' purchased · ', ' satın alındı · ')
    .replace('Drive carriage', 'Yük arabasını sür')
    .replace('Load carriage', 'Yük arabasına yükle')
    .replace('Collect trade pack', 'Ticaret paketini al')
    .replace(/(\d+(?:\/\d+)?) packs/g, '$1 paket')
    .replace(/Need ([\d,.]+) G for packing/g, 'Paketlemek için $1 G gerekiyor')
    .replace(/Requires ([\d,.]+) Processing XP/g, '$1 İşleme TP gerekiyor')
    .replace(/Need ([\d,.]+) Work/g, '$1 Emek gerekiyor')
    .replace(/Requires ([\d,.]+) Trading XP/g, '$1 Ticaret TP gerekiyor')
    .replace(/Requires ([\d,.]+) G/g, '$1 G gerekiyor')
    .replace('You already own this transport', 'Bu taşıta zaten sahipsin')
    .replace('Approach on foot with empty hands', 'Ellerin boşken yaya olarak yaklaş')
    .replace("Move closer to the transport's sale marker", 'Taşıtın satış noktasına yaklaş')
    .replace('Move your parked vehicle out of the display bay first', 'Önce park ettiğin taşıtı sergi yerinden çıkar')
    .replace('All carriage cargo slots are full', 'Yük arabasının bütün bölmeleri dolu');
}
