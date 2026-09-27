// src/i18n/reasonsTr.ts

import { localizeCatalogText } from "./catalogNames";
import { placeLabel } from "./placesTr";
import { villageTradeTextTr } from "./villageTradeText";

const EXACT_REASONS_TR: Record<string, string> = {
  // Movement & Mounting
  "Dismount first": "Önce binek veya arabadan in",
  "Dismount before using a station": "Tezgâhı kullanmadan önce binek veya arabadan in",
  "Disembark before using a station": "Tezgâhı kullanmadan önce tekneden in",
  "Land before mounting": "Binmeden önce karaya bas",
  "Dismount before tending crops": "Ekinlerle ilgilenmeden önce binek veya arabadan in",
  "Dismount before planting": "Ekimden önce binek veya arabadan in",
  "Disembark before planting": "Ekimden önce tekneden in",
  "Dismount before fishing": "Balık tutmadan önce binek veya arabadan in",
  "Dismount before working here": "Burada çalışmadan önce binek veya arabadan in",
  "Dismount before changing direction": "Yön değiştirmeden önce binek veya arabadan in",
  "Dismount first before using Safe Return": "Güvenli Dönüş'ü kullanmadan önce binek veya arabadan in",
  "Dismount before docking a boat": "Tekneyi bağlamadan önce binek veya arabadan in",
  "Dismount before handling fuel": "Yakıt doldurmadan önce binek veya arabadan in",
  "You are not riding a transport": "Herhangi bir binek veya taşıta binmiş değilsin",
  "There is no safe ground to dismount here": "Burada inebileceğin güvenli bir zemin yok",
  "Move closer to the donkey": "Eşeğe biraz daha yaklaş",
  "Return to the harbor before using Safe Return": "Güvenli Dönüş'ü kullanmadan önce limana dön",
  "Return to the harbor before using Safe Return while carrying physical fish cargo": "Taşınan balık kargosu varken Güvenli Dönüş'ü kullanmak için limana dön",
  "Movement could not be resolved": "Hareket gerçekleştirilemedi",

  // Stations & Crafting
  "Missing required ingredients": "Gerekli malzemeler eksik",
  "Station not found": "İş istasyonu bulunamadı",
  "Station is already in use": "İş istasyonu şu anda kullanımda",
  "Not enough ingredients to pack": "Paketlemek için malzeme yetersiz",
  "The ingredients changed before the job began": "İş başlamadan önce malzemeler değişti",
  "Job not complete": "İş henüz tamamlanmadı",
  "The saved job data is invalid": "Kaydedilen iş verisi geçersiz",
  "The satchel changed before collection": "Toplama yapılmadan önce heybe değişti",
  "Unknown recipe": "Bilinmeyen tarif",
  "That recipe is not available yet": "Bu tarif henüz öğrenilmedi veya açık değil",
  "This village packs its own local specialties": "Bu köy yalnızca kendi yöresel ürünlerini paketler",

  // Inventory & Wardrobe
  "The satchel is full": "Heyben tamamen dolu",
  "The wardrobe is full": "Gardıropta boş yer kalmadı",
  "Unknown equipment": "Bilinmeyen teçhizat",
  "That equipment is already owned": "Bu teçhizata zaten sahipsin",
  "That equipment is already being made": "Bu teçhizat şu anda hazırlanıyor",
  "Craft this equipment before wearing it": "Kuşanmadan önce bu teçhizatı üret",
  "Unknown rod": "Bilinmeyen olta",
  "Own this rod before equipping it": "Kuşanmadan önce bu oltaya sahip ol",
  "Could not stow the catch": "Av ambara yerleştirilemedi",
  "Could not move those goods": "Eşyalar taşınamadı",
  "Could not move that catch": "Av taşınamadı",
  "No clear ground here": "Burada temiz ve düz zemin yok",
  "Could not equip that": "Kuşanılamadı",
  "Could not equip that rod": "Olta kuşanılamadı",
  "Could not wear that outfit": "Kıyafet giyilemedi",
  "Could not eat that": "Bu yenilemez",

  // Farming
  "The seed is no longer available": "Tohum artık mevcut değil",
  "No seeds in the satchel. Visit the village stall.": "Heybede hiç tohum yok. Köy tezgâhına uğra.",
  "Crop not found": "Ekin bulunamadı",
  "Move closer to the crop": "Ekine biraz daha yaklaş",
  "This crop has withered": "Bu ekin kurumuş",
  "The soil is already wet": "Toprak zaten yeterince nemli",
  "This crop is not ready": "Bu ekin henüz olgunlaşmadı",
  "Step ashore before unrooting": "Kökünden sökmeden önce karaya bas",
  "Clear this withered plot instead": "Önce bu kurumuş tarhı temizle",
  "Farm not found": "Çiftlik bulunamadı",
  "Move closer to the farm": "Çiftliğe biraz daha yaklaş",
  "No fertilizer in the satchel": "Heybede gübre yok",
  "Use the farm well to install a field pump": "Tarla pompası kurmak için çiftlik kuyusunu kullan",
  "This well already has a field pump": "Bu kuyuda zaten tarla pompası kurulu",
  "Barnaby hasn't released the field pump yet": "Barnaby henüz tarla pompasını vermedi",
  "Install a field pump at the well first": "Önce kuyuda bir tarla pompası kur",
  "This farm is unavailable": "Bu çiftlik kullanılamaz",
  "Use the farm well to water the field": "Tarlayı sulamak için çiftlik kuyusunu kullan",
  "Every row is already damp; the pump had nothing to do": "Her tarh zaten nemli; pompanın yapacağı bir iş kalmadı",
  "Unknown crop": "Bilinmeyen ekin",
  "Watered": "Sulandı",
  "Fertilized the soil": "Toprak gübrelendi",
  "Planting cancelled": "Ekim iptal edildi",
  "Choose seeds from your inventory first": "Önce envanterinden tohum seç",

  // Fishing & Angling
  "Finish fishing first": "Önce balık tutmayı bitir",
  "Finish fishing before changing tackle": "Takımı değiştirmeden önce balık tutmayı bitir",
  "No Woven Lure is within reach": "Yakınında hazır Örme Sahte Yem yok",
  "No fish is waiting at the landing": "İskelede bekleyen bir av yok",
  "The fight is still running": "Mücadele hâlâ devam ediyor",
  "Already fishing": "Zaten balık tutuyorsun",
  "Move closer to fishable water": "Balık tutmak için suya biraz daha yaklaş",
  "Move closer to water to fish": "Balık tutmak için suya biraz daha yaklaş",
  "Nothing is biting in these conditions": "Bu koşullarda hiçbir balık vurmuyor",
  "There is no room for the catch": "Av için ambarda yer kalmadı",
  "No room in the hold": "Ambarda yer kalmadı",
  "No fish biting yet!": "Henüz balık vurmadı!",
  "The fish slipped the hook": "Balık iğneden kurtuldu",
  "Nothing to land yet": "Henüz çekilecek bir av yok",
  "The satchel is full. Make space to land the catch.": "Heyben dolu. Avı almak için yer aç.",
  "The satchel is full. Open it to make room or discard the catch.": "Heyben dolu. Yer açmak için heybeyi aç veya avı suya bırak.",
  "No catch is waiting": "Bekleyen bir av yok",
  "School disappeared": "Balık sürüsü dağıldı",
  "Move closer to the fish school": "Balık sürüsüne biraz daha yaklaş",
  "This school is already feeding": "Bu balık sürüsü zaten yemleniyor",
  "You need chum within reach": "Yakınında yem kovası olmalı",
  "Already fighting a fish": "Zaten bir balıkla mücadele ediyorsun",
  "No active school": "Etrafta aktif bir balık sürüsü yok",
  "This school has moved on": "Balık sürüsü uzaklaştı",
  "School is not in a feeding frenzy! Chum it first.": "Sürü henüz hareketlenmedi! Önce yem savur.",
  "Prepare a Woven Lure before hooking a sport fish": "Sportif balığı kancalamadan önce Örme Sahte Yem hazırla",
  "The prepared Woven Lure is no longer within reach": "Hazırlanan sahte yem artık erişilebilir değil",
  "No cargo space for the fish in this school": "Bu sürüdeki balıklar için kargo ambarında yer yok",
  "Move to open water before hooking the fish": "Balığı kancalamadan önce açık sulara çık",
  "Line reeled in": "Misina sarıldı",
  "Catch discarded": "Av suya bırakıldı",
  "Sunken treasure spotted": "Batık hazine görüldü",
  "New species recorded in the journal": "Yeni tür seyir defterine kaydedildi",
  "Finest of its kind yet": "Şimdiye dek tutulanların en kusursuzu",
  "Nothing bit this time": "Bu sefer iğneye hiçbir şey takılmadı",
  "Land the fish first": "Önce balığı karaya çıkar",
  "Could not adjust drag": "Kalama ayarlanamadı",
  "Could not keep the catch": "Av saklanamadı",
  "Could not release the fish": "Balık salıverilemedi",
  "The catch is still waiting": "Av hâlâ kararı bekliyor",
  "Collect the catch, or choose Open satchel or Discard catch": "Avı ambarına koy ya da Heybeyi Aç veya Avı At seçeneğini kullan",
  "No fishing rod in your kit": "Takımında olta yok",

  // Labor & Chores
  "Stow physical fish cargo before working": "Çalışmadan önce balık kargosunu ambara koy",
  "Finish the job in hand": "Önce elindeki işi bitir",
  "Put the rod away first": "Önce oltayı kaldır",
  "There is no work here": "Burada yapılacak bir iş yok",
  "Step closer to work here": "Burada çalışmak için biraz daha yaklaş",
  "You have already done that work today": "Bu işi bugün zaten yaptın",
  "No work in progress": "Süren bir iş yok",
  "You stepped away from the work": "İşin başından uzaklaştın",
  "The strike glanced off — line up the swing": "Vuruş kaydı — hamleni hizala",
  "The strike missed": "Vuruş ıskaladı",
  "You are full of energy already": "Dermanın zaten tamamen yerinde",
  "Time the strike — press E as the needle crosses the gold band": "Vuruşun zamanını ayarla — ibre altın şeride denk gelince E'ye bas",
  "Cannot work there": "Orada çalışılamaz",

  // Market & Trade
  "Market not found": "Pazar tezgâhı bulunamadı",
  "You must be at this market to trade": "Ticaret yapmak için pazar tezgâhında olmalısın",
  "Carry this fish trade pack to a village counter": "Bu balık ticaret paketini bir köy tezgâhına götür",
  "Market does not trade this item": "Pazar bu ürünü alıp satmaz",
  "You do not have enough of this item": "Elinde bu eşyadan yeteri kadar yok",
  "Your satchel changed before the sale": "Satıştan önce heyben değişti",
  "Market item not found": "Pazar ürünü bulunamadı",
  "Move closer to the stall": "Tezgâha biraz daha yaklaş",
  "This stall does not sell that item": "Bu tezgâh o ürünü satmaz",
  "No produce to sell here": "Burada satılacak mahsulün yok",
  "Not enough money": "Yeterli akçen yok",
  "You do not have enough coins.": "Yeterli akçen yok.",
  "Fish is spoiled and cannot be sold": "Balık bozulmuş, satılamaz",
  "Fish has no market value": "Balığın pazar değeri yok",
  "This trade pack has no market quote": "Bu ticaret paketinin piyasa değeri yok",
  "This pack is spoiled and cannot be sold": "Bu paket bozulmuş, satılamaz",
  "This pack has no market value": "Bu paketin pazar değeri yok",
  "The fish hold changed before the sale": "Satıştan önce balık ambarı değişti",
  "Only trade packs use this counter": "Bu tezgâhta yalnızca ticaret paketleri işlem görür",
  "Could not sell item": "Eşya satılamadı",
  "Could not sell produce": "Mahsul satılamadı",
  "Visit a market stall to trade": "Ticaret yapmak için bir pazar tezgâhına uğra",

  // Boats & Navigation
  "You are not aboard a boat": "Bir teknede değilsin",
  "Approach a dock or island landing to disembark": "İnmek için bir iskeleye veya kıyıya yanaş",
  "The hull is already sound": "Tekne gövdesi zaten sapasağlam",
  "Dock the vessel at Neva Harbor and find Silas at the pier": "Tekneyi Neva Limanı'na yanaştır ve iskelede Silas'ı bul",
  "No boat to refuel": "Yakıt doldurulacak bir tekne yok",
  "This boat does not take fuel": "Bu tekne yakıt kullanmaz",
  "Move to the boat or dock before refueling": "Yakıt doldurmadan önce tekneye veya iskeleye yaklaş",
  "The tank is already full": "Yakıt deposu zaten dolu",
  "No boat fuel in the satchel": "Heybede tekne yakıtı yok",
  "Tank filled": "Yakıt deposu dolduruldu",
  "You already own the coastal skiff": "Kıyı balıkçı filikasına zaten sahipsin",
  "Coastal skiff contract is unavailable": "Kıyı filikası sözleşmesi mevcut değil",
  "Move closer to the skiff mooring": "Filika iskelesine biraz daha yaklaş",
  "Could not purchase the skiff": "Filika satın alınamadı",
  "Could not purchase transport": "Taşıt satın alınamadı",
  "Could not arrange a tow": "Çekici ayarlanamadı",
  "Could not refuel": "Yakıt doldurulamadı",
  "Silas cannot repair her yet": "Silas tekneyi henüz onaramaz",
  "Docked at the mooring": "İskeleye bağlandı",
  "Return to a marked mooring to disembark": "İnmek için işaretli bir iskeleye yanaş",
  "Move closer to the docked vessel": "Yanaşmış tekneye biraz daha yaklaş",

  // Trade Packs & Carriage
  "Trade pack secured in carriage": "Ticaret paketi yük arabasına bağlandı",
  "Trade pack set down · collect it with [E] when ready": "Ticaret paketi yere bırakıldı · hazır olduğunda [E] ile al",
  "Trade pack collected · carry it to a village buyer or a posted commission": "Ticaret paketi alındı · köydeki bir alıcıya veya panodaki siparişe götür",
  "Could not load carriage": "Yük arabasına yüklenemedi",
  "Could not collect that trade pack": "Ticaret paketi alınamadı",

  // System & Misc
  "Close this first": "Önce açık pencereyi kapat",
  "Finish the current action first": "Önce süren eylemi tamamla",
  "Action cancelled": "Eylem iptal edildi",
  "Autosave failed — recent progress is not saved yet. Retrying.": "Otomatik kayıt başarısız — son ilerleme henüz kaydedilmedi. Tekrar deneniyor.",
  "Character safely returned to the nearest landing": "Karakter güvenle en yakın karaya ulaştırıldı",
  "Saving is disabled in this debug session": "Bu geliştirici oturumunda kayıt devre dışı",
  "Save failed": "Kayıt başarısız",
  "Complete your first expedition to unlock the expedition board": "Sefer masasını açmak için ilk seferini tamamla",

  // Gear, movement, and work that still reached the player in English
  "Finish or cancel the current action before changing gear": "Takım değiştirmeden önce süren eylemi bitir veya vazgeç",
  "Finish fishing before changing gear": "Takım değiştirmeden önce balık tutmayı bitir",
  "Dismount before changing gear": "Takım değiştirmeden önce binek veya arabadan in",
  "Put down the catch before changing gear": "Takım değiştirmeden önce avı bırak",
  "Moor the boat and come to a stop before changing gear": "Takım değiştirmeden önce tekneyi bağla ve durdur",
  "Close Place mode before opening your gear": "Donanımı açmadan önce yerleştirme kipini kapat",
  "Finish or cancel the current action first": "Önce süren eylemi bitir veya vazgeç",
  "Finish placing the crop first": "Önce ekini yerleştirmeyi bitir",
  "That mount is unavailable": "O binek şu an kullanılamaz",
  "You are already riding a mount": "Zaten bir binektesin",
  "Disembark from the boat first": "Önce tekneden in",
  "Stow physical fish cargo before riding": "Binmeden önce balık kargosunu ambara koy",
  "Move onto dry, walkable ground first": "Önce kuru, yürünebilir zemine geç",
  "The transport is not on stable ground": "Taşıt sağlam zeminde değil",
  "Today's Work earning limit is too close; rest until tomorrow": "Bugünkü Emek sınırın dolmak üzere; yarına kadar dinlen",
  "Spend some Work before taking more energy": "Daha fazla derman almadan önce biraz Emek harca",
  "Move closer to the station": "İş istasyonuna biraz daha yaklaş",
  "Stand in front of the station": "İş istasyonunun önünde dur",
  "Station is not interactable": "Bu iş istasyonu kullanılamaz",
  "Move back to the front of the station": "İş istasyonunun ön yüzüne geri dön",
  "Return to the station before starting this job": "Bu işe başlamadan önce istasyona dön",
  "No rod you can get will work here.": "Burada işine yarayacak bir olta yok.",
  "Dismount before resting": "Dinlenmeden önce binek veya arabadan in",
  "Rest in the farmhouse": "Çiftlik evinde dinlen",
  "It's too early to turn in": "Yatmak için henüz erken",
  "That is not something you can eat": "Bu yenilecek bir şey değil",
  "You are not carrying that meal": "O yemeği taşımıyorsun",
  "You are well fed — try again tomorrow": "Karnın tok — yarın yine dene",
  "Could not eat that meal": "O yemek yenemedi",
  "Boat heading owns facing while aboard": "Teknedeyken yönü dümen belirler",
  "Target direction is invalid": "Hedef yön geçersiz",
  "Boat not found": "Tekne bulunamadı",
  "Vessel not found": "Tekne bulunamadı",
  "That vessel is not registered": "Bu tekne kayıtlı değil",
  "Board the vessel to stow this catch": "Bu avı yerleştirmek için tekneye bin",
  "Dismount before handling fish cargo": "Balık kargosuyla ilgilenmeden önce binekten in",
  "Disembark before setting a trade pack down": "Ticaret paketini bırakmadan önce tekneden in",
  "Land before setting a trade pack down": "Ticaret paketini bırakmadan önce karaya bas",
  "Your hands are already full": "Ellerin zaten dolu",
  "Your hands are empty": "Ellerin boş",
  "Fish cargo not found": "Balık kargosu bulunamadı",
  "Cargo not found": "Kargo bulunamadı",
  "No cargo space": "Kargo yeri yok",
  "No inventory space for scraps": "Artıklar için heybede yer yok",
  "Farm packs cannot be released as fish": "Tarla paketleri balık gibi salınamaz",
  "The fish is spoiled — make scraps instead": "Balık bozulmuş — onun yerine artık çıkar",
  "This fish is not in a transport": "Bu balık bir taşıtta değil",
  "This boat cargo slot is no longer available": "Bu tekne kargo gözü artık boş değil",
  "Move to the docked boat to collect this trade pack": "Bu ticaret paketini almak için bağlı tekneye git",
  "Move closer to the grounded trade pack to collect it": "Yerdeki ticaret paketini almak için yaklaş",
  "Stand at the rear of the parked carriage to collect this pack": "Bu paketi almak için park etmiş arabanın arkasına geç",
  "Stand at the rear of the parked carriage to load it": "Yüklemek için park etmiş arabanın arkasına geç",
  "Carry a trade pack to the carriage first": "Önce bir ticaret paketini arabaya taşı",
  "This pack is too large for the carriage": "Bu paket araba için fazla büyük",
  "All carriage cargo slots are full": "Yük arabasının bütün bölmeleri dolu",
  "Carry this catch to the storage first": "Önce bu avı depoya taşı",
  "That catch is not in this storage": "Bu av bu depoda değil",
  "That storage is not available": "Bu depo kullanılamaz",
  "That storage is unavailable": "Bu depo kullanılamaz",
  "Move to the fish cargo before discarding it": "Atmadan önce balık kargosunun yanına git",
  "Move to the fish cargo before releasing it": "Salmadan önce balık kargosunun yanına git",
  "No clear ground here — find dry, walkable footing": "Burada temiz zemin yok — kuru, yürünebilir bir yer bul",
  "Choose a valid transfer direction": "Geçerli bir aktarma yönü seç",
  "Choose how many to move": "Kaç tane taşıyacağını seç",
  "Move closer to the vessel before transferring stores": "Erzak aktarmadan önce tekneye yaklaş",
  "Those stores are unavailable": "Bu erzaklar kullanılamaz",
  "Those goods are not held": "Bu mallar sende değil",
  "Those goods could not be taken out": "Bu mallar çıkarılamadı",
  "No satchel to sort": "Düzenlenecek heybe yok",
  "The satchel is already empty": "Heybe zaten boş",
  "The satchel is too full to tidy": "Heybe düzenlenemeyecek kadar dolu",
  "No satchel to discard from": "Bir şey atılacak heybe yok",
  "Choose a whole quantity of one held item": "Taşıdığın bir eşyadan tam bir miktar seç",
  "You are not carrying that much": "O kadarını taşımıyorsun",
  "Choose a positive whole quantity": "Sıfırdan büyük tam bir miktar seç",
  "The satchel has no room for this reward": "Bu ödül için heybede yer yok",
  "Step ashore before planting": "Ekimden önce karaya bas",
  "Move to prepared farm soil": "İşlenmiş tarla toprağına git",
  "Bring this fish cargo to the market dock": "Bu balık kargosunu pazar iskelesine götür",
  "Market does not trade this fish": "Pazar bu balığı almaz",
  "This market cannot value that fish": "Bu pazar o balığa değer biçemez",
  "This market cannot value those goods": "Bu pazar o mallara değer biçemez",
  "Move closer to the harbor stall": "Liman tezgâhına biraz daha yaklaş",
  "Carry fish trade packs to a village trade counter and sell them one at a time": "Balık ticaret paketlerini bir köy tezgâhına götür ve teker teker sat",
  "Carry trade packs to a village trade counter: Neva Village, Pinewatch, Reedhaven, Highridge or Sunreach": "Ticaret paketlerini bir köy tezgâhına götür: Neva Köyü, Çamlıgöz, Sazlıliman, Yüksek Sırt veya Gündoğumu",
  "Collect this fish trade pack and carry it to the contract counter": "Bu balık ticaret paketini al ve sözleşme tezgâhına götür",
  "Collect this trade pack from its boat or carriage and carry it to the counter": "Bu ticaret paketini teknesinden veya arabasından alıp tezgâha götür",
  "This counter does not buy this harvest": "Bu tezgâh bu mahsulü almaz",
  "Sale quantity must be a positive whole number": "Satış miktarı sıfırdan büyük bir tam sayı olmalı",
  "Delivery quantity must be a positive whole number": "Teslim miktarı sıfırdan büyük bir tam sayı olmalı",
  "You do not have enough items to deliver": "Teslim edecek kadar eşyan yok",
  "This contract does not accept that item": "Bu sözleşme o eşyayı kabul etmez",
  "This contract requires a different species": "Bu sözleşme başka bir tür istiyor",
  "This contract requires physical fish cargo": "Bu sözleşme somut balık kargosu istiyor",
  "Contract is not active": "Sözleşme etkin değil",
  "Contract is already fully delivered": "Sözleşme zaten tamamen teslim edildi",
  "No demand is posted": "Duyurulmuş bir talep yok",
  "That order is no longer on the board": "O sipariş artık panoda değil",
  "That quantity is more than the stall can quote": "Bu miktar tezgâhın fiyat verebileceğinden fazla",
  "Part of this order is already delivered; it stays until it is filled or runs out": "Bu siparişin bir kısmı teslim edildi; dolana veya süresi dolana kadar durur",
  "This order needs fewer than a full pack; deliver loose produce instead": "Bu sipariş tam bir paketten az istiyor; açık mahsul teslim et",
  "This order requires different produce": "Bu sipariş başka bir mahsul istiyor",
  "This order requires loose produce or a harvest pack, not mixed trade goods": "Bu sipariş açık mahsul veya hasat paketi ister, karışık ticaret malı değil",
  "This pack is not fresh enough for the order": "Bu paket sipariş için yeterince taze değil",
  "Visit the order's listed counter to pass on it": "Bu siparişi bırakmak için yazılı tezgâhına git",
  "Quest already completed": "Bu iş zaten tamamlandı",
  "Quest definition not found": "İş tanımı bulunamadı",
  "Unknown quest track": "Bilinmeyen iş dizisi",
  "This quest is not active": "Bu iş etkin değil",
  "Complete the final objective first": "Önce son hedefi tamamla",
  "That thread has nothing waiting": "Bu işte bekleyen bir adım yok",
  "Buy the previous rod first": "Önce bir önceki oltayı al",
  "You already own this rod": "Bu oltaya zaten sahipsin",
  "You do not own this rod": "Bu oltaya sahip değilsin",
  "That rod is not for sale": "Bu olta satılık değil",
  "Change tackle at a stall that sells it": "Takımı, onu satan bir tezgâhta değiştir",
  "That tackle is not sold here": "Bu takım burada satılmaz",
  "This stall does not sell that supply": "Bu tezgâh o erzaktan satmaz",
  "This stall has no stock of that supply": "Bu tezgâhta o erzaktan kalmadı",
  "Unknown fish species": "Bilinmeyen balık türü",
  "Unknown outfit preset": "Bilinmeyen kıyafet düzeni",
  "Skiff supplies are already registered": "Filika erzakı zaten kayıtlı",
  "The ship supply store is already registered": "Gemi erzak ambarı zaten kayıtlı",
  "Nothing to collect": "Toplanacak bir şey yok",
  "Not fishing": "Balık tutmuyorsun",
  "Not casting": "Olta savrulmuyor",
  "Not charging a cast": "Savurma hazırlığı yok",
  "Cast power is invalid": "Savurma gücü geçersiz",
  "Fishing is paused": "Balık tutma duraklatıldı",
  "No active fishing encounter": "Süren bir balık karşılaşması yok",
  "Drag runs Light, Balanced or Heavy": "Kalama Hafif, Dengeli veya Ağır olur",
  "already-fertile": "Toprak zaten verimli",
  "Harvest or clear withered crops": "Olgun ekinleri topla veya kurumuşları temizle",
  "Water dry cultivated plots": "Kuru işlenmiş tarhları sula",
  "Collect mature crop yields": "Olgun mahsulü topla",
  "No seeds": "Tohum yok",
  "No fertilizer": "Gübre yok",
  "No rod equipped": "Kuşanılmış olta yok",
  "Put away the fishing rod": "Oltayı kaldır",
  "Inspect storage and supplies": "Depoyu ve erzakı incele",
  "Required for sport fishing · prepare": "Sportif balık için gerekli · hazırla"
};

/**
 * Translates simulation reason strings, action blocker reasons, and notification phrases to Turkish.
 * Preserves numbers, variables, and fallbacks cleanly.
 */
const ACTION_LABEL_TR: Record<string, string> = {
  Planting: "Ekim",
  Fertilizing: "Gübreleme",
  Casting: "Savurma",
  "Hooking this fish": "Bu balığı kancalama",
  Processing: "İşleme"
};

const STATION_TR: Record<string, string> = {
  "hand-mill": "el değirmeni",
  workbench: "çalışma tezgâhı",
  "fish-table": "balık masası",
  "compost-bin": "kompost sandığı",
  "trading-station": "ticaret tezgâhı",
  kitchen: "köy mutfağı"
};

const WATER_TR: Record<string, string> = {
  river: "nehir",
  lake: "göl",
  coastal: "kıyı",
  offshore: "açık deniz"
};

const QUALITY_TR: Record<string, string> = {
  common: "sıradan",
  fine: "iyi",
  exceptional: "seçkin",
  prize: "ödüllük",
  trophy: "ganimet"
};

const SEASON_TR: Record<string, string> = {
  Spring: "İlkbahar",
  Summer: "Yaz",
  Autumn: "Sonbahar",
  Winter: "Kış",
  spring: "İlkbahar",
  summer: "Yaz",
  autumn: "Sonbahar",
  winter: "Kış"
};

function named(text: string): string {
  if (text === "the boat") return "tekneyi";
  if (text === "rod") return "oltan";
  if (text === "the quest giver") return "işi veren";
  if (text === "its listed market") return "yazılı pazarı";
  return localizeCatalogText(placeLabel(text, "tr"), "tr");
}

function translateReasonPattern(reason: string): string | null {
  const patterns: Array<[RegExp, (...groups: string[]) => string]> = [
    [/^(.+) needs (\d+) Work · (\d+) available · rest, eat, or work to recover$/, (action, cost, available) =>
      `${ACTION_LABEL_TR[action] ?? named(action)} için ${cost} Emek gerek · Elinde ${available} var · dinlen, ye ya da çalışarak toparla`],
    [/^(.+) outfit contains unavailable gear$/, (preset) => `${named(preset)} kıyafetinde bulunmayan parçalar var`],
    [/^Bring (.+) to finish this quest$/, (requirement) => `Bu işi bitirmek için ${named(requirement)} getir`],
    [/^Bring this fish cargo to (.+)$/, (market) => `Bu balık kargosunu ${named(market)} noktasına götür`],
    [/^Contract requires (\w+) quality or better$/, (quality) => `Sözleşme ${QUALITY_TR[quality] ?? quality} veya daha iyi kalite istiyor`],
    [/^Contract requires at least (\d+)% freshness$/, (freshness) => `Sözleşme en az %${freshness} tazelik istiyor`],
    [/^Contract requires at least ([\d.]+) kg$/, (weight) => `Sözleşme en az ${weight} kg istiyor`],
    [/^Deliver this order at (.+)$/, (market) => `Bu siparişi ${named(market)} tezgâhında teslim et`],
    [/^Move closer to the (.+)$/, (place) => `${named(place)} yakınına gel`],
    [/^Not enough money · ([\d,.]+) G required$/, (cost) => `Akçe yetmiyor · ${cost} akçe gerek`],
    [/^Only (\d+) more needed for this contract$/, (remaining) => `Bu sözleşme için yalnızca ${remaining} tane daha gerek`],
    [/^Requires ([\d,.]+) Fishing XP$/, (xp) => `${xp} Balıkçılık TP gerekiyor`],
    [/^Return to (.+) to turn this in$/, (speaker) => `Teslim etmek için ${named(speaker)} yanına dön`],
    [/^Stow gear and steer (.+)$/, (boat) => `Takımı kaldır ve ${named(boat)} kullan`],
    [/^The (.+) cannot hold a pack this large$/, (facility) => `${named(facility)} bu kadar büyük bir paketi alamaz`],
    [/^The (.+) is full$/, (facility) => `${named(facility)} dolu`],
    [/^This recipe requires a (.+)$/, (station) => `Bu tarif bir ${STATION_TR[station] ?? station} istiyor`],
    [/^You need ([\d,.]+) G to finish this quest$/, (money) => `Bu işi bitirmek için ${money} akçe gerek`],
    [/^Need ([\d,.]+) G for packing$/, (cost) => `Paketlemek için ${cost} akçe gerek`],
    [/^Need (\d+) Work$/, (cost) => `${cost} Emek gerek`],
    [/^Need (\d+) ([^·]+)$/, (count, item) => `${count} ${named(item)} gerek`],
    [/^Switch to your (.+) in Character & Gear \[C\]\.$/, (rod) => `Karakter ve Donanım [C] ekranından ${named(rod)} oltasına geç.`],
    [/^A (.+) will do; (.+) sells one\.$/, (rod, stall) => `${named(rod)} yeter; ${named(stall)} bir tane satar.`],
    [/^A (.+) will do; (.+) sell one\.$/, (rod, stalls) => `${named(rod)} yeter; ${named(stalls)} birer tane satar.`],
    [/^A (.+) will do\.$/, (rod) => `${named(rod)} yeter.`],
    [/^Cast (.+)$/, (rod) => `${named(rod)} ile savur`],
    [/^Put away the rod · (.+) \((\d+)\)$/, (bait, count) => `Oltayı kaldır · ${named(bait)} (${count})`],
    [/^Hold (\d+)\/(\d+) · Bait, ice and supplies$/, (used, total) => `Ambar ${used}/${total} · Yem, buz ve erzak`],
    [/^(.+) armed · put away$/, (lure) => `${named(lure)} hazır · kaldır`],
    [/^(.+) out of reach · return to supplies or put away$/, (lure) => `${named(lure)} uzakta · erzağa dön veya kaldır`],
    [/^No (.+) · craft or buy one$/, (lure) => `${named(lure)} yok · üret ya da satın al`],
    [/^(.+) \((\d+)\)$/, (item, count) => `${named(item)} (${count})`],
    [/^Day (\d+) of (Spring|Summer|Autumn|Winter), Year (\d+)$/i, (day, season, year) => `${day}. Gün, ${SEASON_TR[season] ?? season}, ${year}. Yıl`]
  ];

  for (const [pattern, format] of patterns) {
    const match = reason.match(pattern);
    if (!match) continue;
    return format(...match.slice(1));
  }

  const wrongWater = reason.match(/^Your (.+) isn't made for (\w+) water\. (.+)$/);
  if (wrongWater) {
    return `${named(wrongWater[1])} ${WATER_TR[wrongWater[2]] ?? wrongWater[2]} suyuna göre değil. ${translateReason(wrongWater[3], "tr")}`;
  }
  const wrongHold = reason.match(/^Your (.+) can't hold what is feeding here\. (.+)$/);
  if (wrongHold) {
    return `${named(wrongHold[1])} burada beslenen avı taşıyamaz. ${translateReason(wrongHold[3], "tr")}`;
  }
  return null;
}

export function translateReason(reason: string | null | undefined, locale?: string): string {
  if (!reason) return "";
  if (locale !== "tr") return reason;

  // 1. Direct dictionary match
  const exact = EXACT_REASONS_TR[reason.trim()];
  if (exact) return exact;

  const patterned = translateReasonPattern(reason);
  if (patterned) return patterned;

  // 2. Dynamic patterns with parameters
  let translated = reason
    .replace(/^Need (\d+) Work to plant · (\d+) available$/, "Ekim için $1 Emek gerekiyor · Elinde $2 var")
    .replace(/^Need (\d+) Work to (\w+) · (\d+) available$/, "$2 için $1 Emek gerekiyor · Elinde $3 var")
    .replace(/^Sold for (\d+) G$/, "$1 akçeye satıldı")
    .replace(/^Sold (\d+) items for (\d+) G$/, "$1 parça eşya $2 akçeye satıldı")
    .replace(/^Hull repaired · ([\d,.]+) G$/, "Gövde onarıldı · $1 akçe")
    .replace(/^Field pump installed · ([\d,.]+) G paid$/, "Tarla pompası kuruldu · $1 akçe ödendi")
    .replace(/^Rested until morning · \+(\d+) Work$/, "Sabaha kadar dinlenildi · +$1 Emek")
    .replace(/^Meal eaten · \+(\d+) Work$/, "Yemek yenildi · +$1 Emek")
    .replace(/^(\w+) reached (\w+) Rank (\d+)/, "$1 ustalığı $2 $3. Aşamaya ulaştı")
    .replace(/^Errand progress · (\d+) \/ (\d+)$/, "Vazife ilerlemesi · $1 / $2")
    .replace(/^Errand complete · (.+)$/, "Vazife tamamlandı · $1")
    .replace(/^New errand · (.+)$/, "Yeni vazife · $1")
    .replace(/^Discovered · (.+)$/, "Keşfedildi · $1")
    .replace(/^Contract complete · \+(\d+) G$/, "Sözleşme tamamlandı · +$1 akçe")
    .replace(/^A field pump costs ([\d,.]+) G$/, "Tarla pompası $1 akçedir")
    .replace(/^Silas needs ([\d,.]+) G for the repair$/, "Silas onarım için $1 akçe istiyor")
    .replace(/^You need ([\d,.]+) G for the coastal skiff$/, "Kıyı filikası için $1 akçe gerekiyor")
    .replace(/^Landed ([\d.]+) kg (.+)$/, "$1 kg $2 yakalandı")
    .replace(/^Chummed with (.+) · the school is feeding$/, "$1 ile yemlendi · balık sürüsü besleniyor")
    .replace(/^(\w+) is ready to collect$/, "$1 toplanmaya hazır")
    .replace(/^(\w+) unrooted$/, "$1 söküldü")
    .replace(/^(\w+) planted$/, "$1 ekildi");

  if (translated !== reason) return translated;

  // 3. Village trade text regex helper
  translated = villageTradeTextTr(reason);
  return translated;
}
