// tools/content/buildTrQuests.ts
import fs from "fs";
import path from "path";

// Load extracted quests if needed

// We will construct the dictionary of translations for each quest ID.
// Each quest has: actTitle, questTitle, introDialogue, completionDialogue, heraldLines, objectives.
const trData: Record<string, any> = {};

// Helper to register quest translation
function register(
  id: string,
  actTitle: string,
  questTitle: string,
  introDialogue: string[],
  completionDialogue: string[],
  objectives: Record<string, { description: string; dialogue?: string[] }>,
  heraldLines?: string[]
) {
  trData[id] = {
    actTitle,
    questTitle,
    introDialogue,
    completionDialogue,
    heraldLines,
    objectives
  };
}

// ==========================================
// ACT 1: HOMESTEAD AWAKENING
// ==========================================
register(
  "quest.act1_welcome",
  "1. Bölüm: Ata Çiftliğinin Uyanışı",
  "Kapı Artık Senin",
  [
    "Kapı senin. Ev de öyle; mirastır bu, köyden parayla satın alınmış değil.",
    "Senin ailen bu tarhlarda ter döktü, burnun ardındaki suları iyi bilirdi. Onların her zaman başladığı yerden başla: bakmazsan kabuk bağlayan topraktan.",
    "Buğday tenekede. Tarla arkamda. Öğleden sonra rüzgârı üst toprağı kurutmadan tohumları toprağa kavuştur."
  ],
  [
    "Ellerin titrememiş. Tıpkı onun gibi. Kabuk bağlamadan toprağın altına girdiler."
  ],
  {
    "step.act1_welcome_talk": {
      description: "Bostan kapısında Elspeth ile konuş"
    }
  }
);

register(
  "quest.act1_sow_wheat",
  "1. Bölüm: Ata Çiftliğinin Uyanışı",
  "Üç Tohum Toprağa",
  [
    "Sürülmüş tarha geç. Tohumları çıkar, her seferinde bir temiz yere ek.",
    "Aralarında mesafe bırak. Sıkışık kökler küser; küskün buğday da kimseyi doyurmaz."
  ],
  [
    "Toprağa girdiler. Şimdi sen onları ıslatana kadar orada mağrur mağrur otururlar."
  ],
  {
    "step.act1_sow_3_wheat": {
      description: "Ata Çiftliği tarlasına 3 buğday tohumu ek"
    }
  }
);

register(
  "quest.act1_water_crops",
  "1. Bölüm: Ata Çiftliğinin Uyanışı",
  "Kabuk Bağlamadan Önce",
  [
    "Güğüm tulumbanın yanında durur. Ön tarhı sula ama çamur deryasına da çevirme.",
    "Islak toprak koyulaşır, ne zaman doyduğunu gözünle görürsün. Toprak tozu yıkamak istemez, derinine içmek ister."
  ],
  [
    "İyi suladın. Şimdi iş güneşte ve sabırda. Git kendine sıcak bir çay koy."
  ],
  {
    "step.act1_water_3_wheat": {
      description: "Ektiğin 3 buğdayı sula"
    }
  }
);

// ==========================================
// ACT 2: FROM GRAIN TO BAIT
// ==========================================
register(
  "quest.act2_harvest_and_compost",
  "2. Bölüm: Tahıldan Yeme",
  "Toprağın Döngüsü",
  [
    "Güneş ve su işini gördü; başaklar altın sarısına döndü.",
    "Orakla dikkatlice biç. Taneler kilere gidecek ama sapları ve yaprakları sakın çöpe atma. Kompost teknesi onları bekler.",
    "Solucanlar tarlanın en vefakar işçileridir; onları doyurursan onlar da seni balık yemiyle donatır."
  ],
  [
    "İşte hakiki bir çiftçi döngüsü. Topraktan aldığının karşılığını geri verdin."
  ],
  {
    "step.act2_harvest_wheat": {
      description: "Olgunlaşan buğdayı hasat et"
    },
    "step.act2_compost_refuse": {
      description: "Hasat artıklarını kompost teknesine bırak"
    }
  }
);

register(
  "quest.act2_mill_and_craft_chum",
  "2. Bölüm: Tahıldan Yeme",
  "Öğütme ve Yem Karma",
  [
    "Kuru buğdayı alıp el değirmenine geç. Kolu çevir ve taneleri un haline getir.",
    "Sonra çalışma tezgâhına git. Biraz su ve ezilmiş tahıl harika bir yem harcı (chum) eder. Balıklar bunun kokusunu ta uzaktan alır."
  ],
  [
    "Kıvamı ve kokusu tam yerinde olmuş. Artık sular seni çağırıyor."
  ],
  {
    "step.act2_mill_wheat": {
      description: "Çiftlik değirmeninde buğday öğüt"
    },
    "step.act2_craft_chum": {
      description: "Zanaat tezgâhında balık yemi harcı (chum) kar"
    }
  }
);

// ==========================================
// ACT 3: THE RIVER'S WHISPERS
// ==========================================
register(
  "quest.act3_river_angler",
  "3. Bölüm: Nehrin Fısıltısı",
  "Akıntıları Okumak",
  [
    "Gümüşsu Nehri çağıldıyor. Oltanı kap ve kıyıya in.",
    "Akıntının derinleştiği, köpüklerin dindiği durgun sulara dikkat et. Alabalıklar orada saklanır.",
    "Misina gerildiğinde acele etme; balığın gücünü tüketmesine izin ver."
  ],
  [
    "Güzel bir vuruş ve temiz bir çekiş! Akıntıyı okumayı öğreniyorsun."
  ],
  {
    "step.act3_catch_river_fish": {
      description: "Gümüşsu Nehri'nde bir balık yakala"
    }
  }
);

register(
  "quest.act3_market_intro",
  "3. Bölüm: Nehrin Fısıltısı",
  "Köyde Adil Ticaret",
  [
    "Tuttuğun balığı veya tarladan kaldırdığın taze mahsulü köy meydanına götür.",
    "Tezgâhtaki terazi dürüsttür. Emeğinin karşılığını altına çevir ki yeni tohumlar, sağlam aletler alabilesin."
  ],
  [
    "Kesende şıngırdayan altın emeğinin helal karşılığıdır. Pazarı tanıdın artık."
  ],
  {
    "step.act3_sell_produce_or_fish": {
      description: "Köy pazarında mahsul veya balık sat"
    }
  }
);

// ==========================================
// ACT 4: THE HARBOR CALL
// ==========================================
register(
  "quest.act4_harbor_journey",
  "4. Bölüm: Limanın Çağrısı",
  "Tuzlu Suya Doğru",
  [
    "Köyün patikası güneye, denizin sesine doğru iner. Limana inme vakti geldi.",
    "İhtiyar Silas iskelenin ucunda ağlarını onarır, Maeve ise balık halini yönetir. Git onlara bir selam ver."
  ],
  [
    "Denizin tuzlu kokusunu ciğerlerine çektin demek. Hoş geldin limana."
  ],
  {
    "step.act4_visit_harbor": {
      description: "Neva Limanı'na git ve Silas ile konuş"
    }
  }
);

register(
  "quest.act4_restore_rowboat",
  "4. Bölüm: Limanın Çağrısı",
  "Eski Filikayı Donatmak",
  [
    "Çekek yerinde yatan ahşap filika senin ailene aitti. Yıllarca senin dönüşünü bekledi.",
    "Kerestesi sağlam, sedir ağacından yapılmış. Biraz bakım, yeni kürekler ve gerekli teçhizatla sulara dönmeye hazır."
  ],
  [
    "İşte şimdi suyun üstünde kuğu gibi süzülüyor. Bu tekne artık senin yuvan."
  ],
  {
    "step.act4_commission_rowboat": {
      description: "Liman çekek yerinde ahşap filikayı donat"
    }
  }
);

// ==========================================
// ACT 5: THE MAIDEN EXPEDITION
// ==========================================
register(
  "quest.act5_maiden_voyage",
  "5. Bölüm: İlk Sefer",
  "Derinlerin Çağrısı",
  [
    "Filikan hazır, deniz sakin. Şamandıraların ötesine, sahanlığın bittiği derin sulara açıl.",
    "Hazırladığın yem harcını suya dök ve yüzeye vuran balık sürüsünü bekle.",
    "Oltanı savur, trofe balığı tekneye al ve ambara dikkatlice yerleştir. Limanda gözler senin üstünde olacak."
  ],
  [
    "Deniz sana cömert davrandı evlat! Böyle bir av limanda haftalarca konuşulur."
  ],
  {
    "step.act5_board_boat": { description: "Ahşap filikaya bin" },
    "step.act5_reach_offshore": { description: "Açık deniz sahanlığına kürek çek" },
    "step.act5_chum_school": { description: "Balık yatağına yem harcı dök" },
    "step.act5_hook_sport_fish": { description: "Trofe balığı oltaya tak" },
    "step.act5_land_sport_fish": { description: "Mücadele ederek trofe balığı tekneye çek" },
    "step.act5_stow_cargo": { description: "Avı tekne ambarına yerleştir" },
    "step.act5_return_harbor": { description: "Liman iskelesine geri dön" },
    "step.act5_sell_catch": { description: "Maeve'in balık halinde avını sat" }
  }
);

// ==========================================
// ACT 6: STEWARDSHIP
// ==========================================
register(
  "quest.act6_harbor_promise",
  "6. Bölüm: Koya Kol Kanat Germek",
  "Panoda Verilen Söz",
  [
    "Liman panosu sadece fiyat listesi değildir; komşularına verilmiş birer sözdür.",
    "Bir teslimat sözleşmesi seç. Vaktinde ve taze şekilde teslim et ki limanda itibarın artsın."
  ],
  [
    "Sözünü tuttun. Bu kıyıda en değerli hazine insanın sözünün arkasında durmasıdır."
  ],
  {
    "step.act6_complete_contract": { description: "Panodan bir teslimat sözleşmesi tamamla" }
  }
);

register(
  "quest.act6_field_pump",
  "6. Bölüm: Koya Kol Kanat Germek",
  "Gereken Yere Su",
  [
    "Eski kuyuya bir tulumba sistemi bağlayabiliriz. Barnaby parçaları hazırladı.",
    "Kurulumu tamamlayınca tek tek kova taşımak yerine bütün tarhı bir hamlede suya doyurabileceksin."
  ],
  [
    "Gör bak, su karıkların arasında nasıl neşeyle akıyor! Emeğin yarısı zamana kaldı."
  ],
  {
    "step.act6_install_pump": { description: "Ata Çiftliğine sulama tulumbası kur" },
    "step.act6_test_irrigation": { description: "Tulumbayı çalıştırarak tarlayı sula" }
  }
);

register(
  "quest.act6_land_sea_cycle",
  "6. Bölüm: Koya Kol Kanat Germek",
  "Kara ve Deniz Döngüsü",
  [
    "Liman temizleme tezgâhında balık ayıkladığında artıkları sakın denize savurma.",
    "O artıkları çiftliğe getir, zengin gübreye dönüştür ve toprağı besle. Denizden gelen, tarlaya can verir."
  ],
  [
    "İşte toprağın kokusu değişti bile. Verimli ve güçlü; bir sonraki hasat bereketli olacak."
  ],
  {
    "step.act6_process_fertilizer": { description: "Balık artıklarından kaliteli gübre üret" },
    "step.act6_apply_fertilizer": { description: "Gübreyi çiftlik tarlasına uygula" }
  }
);

// ==========================================
// ACT 7: SUNREACH
// ==========================================
register(
  "quest.act7_open_channel",
  "7. Bölüm: Güneşeri Adası",
  "Açık Kanalı Aşmak",
  [
    "Kanalın ötesinde Güneşeri Adası uzanır. Rüzgârı arkana al ve rotanı o koya çevir.",
    "Tomas iskelede seni karşılayacak. Koyun suyunu ve adanın sert havasını öğren."
  ],
  [
    "Kanalı sağ salim aştın. Güneşeri serttir ama hakkını verene cömerttir."
  ],
  {
    "step.act7_board_for_sunreach": { description: "Teknene bin ve Güneşeri rotasını çiz" },
    "step.act7_cross_channel": { description: "Kanalı aşarak adaya ulaş" },
    "step.act7_dock_sunreach": { description: "Güneşeri Koyu iskelesine yanaş" },
    "step.act7_talk_tomas": { description: "İskelede Tomas ile görüş" }
  }
);

register(
  "quest.act7_terraces_for_the_sun",
  "7. Bölüm: Güneşeri Adası",
  "Güneşe Bakan Taraçalar",
  [
    "Tepedeki taş taraçalara çık. Ines orada susuz toprakla mücadele ediyor.",
    "Ayçiçekleri ve zeytinler bu güneşi sever ama suyun her damlasını hesaplamak gerekir."
  ],
  [
    "Taraçalar yeşerdi. Güneşeri toprağı sabrı ödüllendirmeyi bilir."
  ],
  {
    "step.act7_visit_terraces": { description: "Güneşeri taraçalarına çık ve Ines ile konuş" },
    "step.act7_plant_sunflowers": { description: "Taş taraçalara ayçiçeği ek" },
    "step.act7_water_terraces": { description: "Sarnıçtan su taşıyarak taraçaları sula" },
    "step.act7_harvest_sunflowers": { description: "Güneşte olgunlaşan ayçiçeklerini hasat et" }
  }
);

register(
  "quest.act7_seed_for_the_sea",
  "7. Bölüm: Güneşeri Adası",
  "Deniz İçin Tohum",
  [
    "Ayçiçeği taneleri sadece sofralık değildir; en iyi balık yemi harçlarının temelidir.",
    "Tomas'ın tezgâhında tohumları ez ve adanın derin suları için özel yem hazırla."
  ],
  [
    "Bu koku resifin dip balıklarını bile yüzeye çeker. Hazırlığın tam."
  ],
  {
    "step.act7_mill_seeds": { description: "Ada değirmeninde tohumları öğüt" },
    "step.act7_craft_reef_chum": { description: "Özel ada yem harcını hazırla" }
  }
);

register(
  "quest.act7_reef_answer",
  "7. Bölüm: Güneşeri Adası",
  "Resifin Yanıtı",
  [
    "Şamandıraların ardındaki resif sahanlığına git. Su orada birden derinleşir.",
    "Oltanı resifin gölgelerine savur. Mercanların arasından gelen balığı çekmek ustalık ister."
  ],
  [
    "Resifin avını tekneye aldın! Tomas haklıymış; bu suların dili başkadır."
  ],
  {
    "step.act7_row_to_reef": { description: "Resif sahanlığına doğru kürek çek" },
    "step.act7_chum_reef": { description: "Resif yatağına yem serp" },
    "step.act7_catch_reef_fish": { description: "Resif balığını oltaya tak ve yakala" },
    "step.act7_dock_and_report": { description: "Tomas'a avı göster" }
  }
);

register(
  "quest.act7_land_sea_cycle",
  "7. Bölüm: Güneşeri Adası",
  "Güneşeri Kara-Deniz Döngüsü",
  [
    "Bu adada hiçbir şey tek bir işle yetinemez. Resiften aldığın balığın artıklarını Ines'in taraçalarına taşı.",
    "Taşlı toprak balık gübresiyle güçlensin. Ada kendi kendini beslemeyi öğrenmeli."
  ],
  [
    "Toprak ve su el sıkıştı. Güneşeri artık kendi ayakları üzerinde durabiliyor."
  ],
  {
    "step.act7_clean_reef_catch": { description: "Balık tezgâhında avı temizle" },
    "step.act7_craft_terrace_compost": { description: "Taraçalar için zengin kompost hazırla" },
    "step.act7_enrich_terrace_soil": { description: "Kompostu taraça tarhlarına yay" },
    "step.act7_talk_ines": { description: "Ines ile başarıyı paylaş" }
  }
);

// ==========================================
// SIDE TRACK: READING THE WATER (TIDES)
// ==========================================
register(
  "quest.tides_home_water",
  "Suları Okumak",
  "Başladığın Sular",
  [
    "Silas Amca sana kadim balıkçılık takvimini açtı.",
    "İlk olarak başladığın suları tanı: nehirde sazan ve alabalık, gölde ise turna ve arowana yatar. Hepsini kendi vaktinde avla."
  ],
  [
    "Ev sularını ezberledin evlat. Artık gözün kapalı nerede neyin yüzdüğünü bilirsin."
  ],
  {
    "step.tides_home_river": { description: "Nehirde bir alabalık tut" },
    "step.tides_home_lake": { description: "Neva Gölü'nde bir tatlı su balığı tut" },
    "step.tides_home_report": { description: "Silas'a gözlemlerini aktar" }
  }
);

register(
  "quest.tides_deep_channel",
  "Suları Okumak",
  "Derin Kanal",
  [
    "Adalar arasındaki kanal rüzgâr aldığında suyun rengi kurşunileşir.",
    "O derinliklerde kılıçbalığı ve ton balığı kol gezer. Makaranı sıkı tut."
  ],
  [
    "Kanalın akıntısına karşı galebe çaldın. Olta tutuşun sağlamlaşmış."
  ],
  {
    "step.tides_channel_fish": { description: "Kanaldan bir açık deniz balığı yakala" }
  }
);

register(
  "quest.tides_cold_teeth",
  "Suları Okumak",
  "Soğuk Suyun Dişleri",
  [
    "Kış gelip de su buz kestiğinde gölün derinliklerinde avcılar uyanır.",
    "Buz gibi suda turna yakalamak sabır işidir. Oltanın ucundaki en ufak kıpırtıyı hisset."
  ],
  [
    "Kış ayazında parlayan o pullar ustalığının nişanesidir."
  ],
  {
    "step.tides_pike_catch": { description: "Soğuk suda büyük bir göl turnası yakala" }
  }
);

register(
  "quest.tides_summer_gold",
  "Suları Okumak",
  "Yaz Altını",
  [
    "Yaz sıcağında göl sazlıklarının dibinde altın arowanalar parıldar.",
    "Güneş tepedeyken vururlar. Sessizce yaklaş ve yemi tam önüne düşür."
  ],
  [
    "Gerçek bir altın parıltısı! Bu balık gölün tacıdır."
  ],
  {
    "step.tides_arowana_catch": { description: "Yaz mevsiminde altın arowana yakala" }
  }
);

register(
  "quest.tides_old_coast",
  "Suları Okumak",
  "Kadim Kıyı",
  [
    "Fener kayalıklarının altındaki dalgalı kıyıda mersin balıkları dipte beslenir.",
    "Ağır kurşun ve sağlam misina gerekir; taşlara takılmadan çekmeyi bilmelisin."
  ],
  [
    "O kadim balığı karaya aldın ya, helal olsun. Kıyının hakkını verdin."
  ],
  {
    "step.tides_sturgeon_catch": { description: "Fener kayalıklarında mersin balığı yakala" },
    "step.tides_old_coast_report": { description: "Silas ile avın hikâyesini paylaş" }
  }
);

register(
  "quest.tides_every_water",
  "Suları Okumak",
  "Haritadaki Her Su",
  [
    "Artık Neva haritasındaki bütün su yatakları senin av sahan haline geldi.",
    "Nehir, göl, kıyı ve açık deniz... Her birinden birer trofe av getirerek ustalığını mühürle."
  ],
  [
    "Haritanın her damla suyunu hafızana kazıdın. Artık sana öğretebileceğim tek şey kendi sezgilerindir."
  ],
  {
    "step.tides_all_river": { description: "Nehirden trofe av getir" },
    "step.tides_all_lake": { description: "Gölden trofe av getir" },
    "step.tides_all_coast": { description: "Kıyıdan trofe av getir" },
    "step.tides_all_offshore": { description: "Açık denizden trofe av getir" }
  }
);

register(
  "quest.tides_blue_marlin",
  "Suları Okumak",
  "Gümüş Kral",
  [
    "Açık denizin en derin çukurunda efsanevi mavi marlin yüzer.",
    "Ona 'Gümüş Kral' derler. Saatlerce mücadele etmeye, misinanı kopma noktasına getirmeye hazır mısın?"
  ],
  [
    "Gözlerime inanamıyorum! Denizlerin kralı güvertende. Silas Amca seninle gurur duyuyor."
  ],
  {
    "step.tides_marlin_catch": { description: "Açık denizin derinliklerinde dev bir Mavi Marlin yakala" }
  }
);

// ==========================================
// SIDE TRACK: THE COVE COMMONS (HOMESTEAD)
// ==========================================
register(
  "quest.homestead_seed_pouch",
  "Koy Ortaklığı",
  "Ailenin Anahtarı",
  [
    "Elspeth sana eski, yağlı kumaştan dikilmiş bir tohum kesesi uzatıyor.",
    "Bu kese ailenden kaldı. Her sonbaharda en verimli başakların taneleri buraya ayrılırdı. Gelecek sezona inanmanın simgesidir bu."
  ],
  [
    "Kese yeniden dolmaya başladı. Ailenin mirası emin ellerde."
  ],
  {
    "step.homestead_examine_pouch": { description: "Ailenin tohum kesesini incele ve Elspeth ile konuş" }
  }
);

register(
  "quest.homestead_overgrown_rows",
  "Koy Ortaklığı",
  "Herkes İçin Bir Karık",
  [
    "Köyün ortak tarhları ot bürümüş durumda. Tek başına kimse el atmaya cesaret edememişti.",
    "Aletlerini kap ve yabani otları temizle. Komşularınla birlikte ekeceğiniz alanları aç."
  ],
  [
    "Tarhlar yeniden nefes alıyor. Köy ahalisi şimdiden tohumlarını getirmeye başladı bile."
  ],
  {
    "step.homestead_clear_weeds": { description: "Ortak tarhlardaki yabani otları temizle" },
    "step.homestead_till_commons": { description: "Toprağı havalandırıp karıkları aç" }
  }
);

register(
  "quest.homestead_first_crop",
  "Koy Ortaklığı",
  "Hakkaniyetli Pay",
  [
    "Ortak tarlaya ekilen ilk buğdaylar boy verdi.",
    "Hasadı kaldır ve köy ambarına teslim et. Herkesin sofrasına bir somun sıcak ekmek düşsün."
  ],
  [
    "Fırından yayılan o taze ekmek kokusu bütün koya yayıldı. Bu senin sayende oldu."
  ],
  {
    "step.homestead_harvest_commons": { description: "Ortak tarladaki mahsulü hasat et" },
    "step.homestead_deliver_commons": { description: "Hasadı köy fırınına teslim et" }
  }
);

register(
  "quest.homestead_worn_tools",
  "Koy Ortaklığı",
  "Bizden Uzun Yaşayan Aletler",
  [
    "Barnaby değirmenin aşınmış ahşap kolunu gösteriyor.",
    "Yıllarca dedenin elleri bu kola basmıştı; şekli onun avucuna göre eğrilmiş. Aletlerin hikâyesini dinle ve bakımını yap."
  ],
  [
    "Aletler sadece demir ve tahta değildir; onlara dokunan ellerin hatırasını taşırlar."
  ],
  {
    "step.homestead_inspect_tools": { description: "Ata yadigârı el aletlerinin bakımını yap" }
  }
);

register(
  "quest.homestead_orchard",
  "Koy Ortaklığı",
  "Gelecek Mevsim İçin Gölge",
  [
    "Tepenin yamacına elma fidanları dikme vakti.",
    "Bir ağaç dikmek, belki de gölgesinde hiç oturamayacağını bildiğin halde geleceğe hediye bırakmaktır. Can suyunu ver."
  ],
  [
    "Fidanlar rüzgârda salınıyor. Yıllar sonra burada oynayacak çocuklar senin diktiğin elmaları toplayacak."
  ],
  {
    "step.homestead_plant_saplings": { description: "Yamaçtaki ortak alana meyve fidanları dik" },
    "step.homestead_water_saplings": { description: "Fidanlara bolca can suyu ver" },
    "step.homestead_orchard_complete": { description: "Elspeth ile ortak meyve bahçesini kutla" }
  }
);

// ==========================================
// SIDE TRACK: FREIGHT AND FAVOUR (TRADELANES)
// ==========================================
register(
  "quest.tradelanes_volume",
  "Kargo ve İtibar",
  "Bir Siparişin Ağırlığı",
  [
    "Maeve tezgâhın arkasından gülümsüyor: 'Ufak tefek işleri geçtik artık.'",
    "Büyük bir toptan teslimat siparişi al. Ambarını ağzına kadar doldur ve tek seferde teslim et."
  ],
  [
    "Kargo eksiksiz teslim edildi. İtibarın pazarda sağlamlaşıyor."
  ],
  {
    "step.tradelanes_bulk_delivery": { description: "Büyük ölçekli bir toptan teslimat sözleşmesini tamamla" }
  }
);

register(
  "quest.tradelanes_freshness",
  "Kargo ve İtibar",
  "Ambarda İşleyen Saat",
  [
    "Denizden çıkan balık güneşte beklemez. Buz kalıplarını hazırla.",
    "Avı tuttuğun andan Maeve'in tezgâhına koyduğun ana kadar saat senin aleyhine işler. Kusursuz tazelikte teslim et."
  ],
  [
    "Pulları hâlâ parıldıyor, gözleri cam gibi! İşte buna hakiki tazelik denir."
  ],
  {
    "step.tradelanes_fresh_delivery": { description: "Yüksek tazelik derecesine sahip taze balık siparişini tamamla" }
  }
);

register(
  "quest.tradelanes_grade",
  "Kargo ve İtibar",
  "Kıymetini Bilen Alıcı",
  [
    "Bazı alıcılar sıradan balık istemez; kusursuz işçilik ve nadir kalite ararlar.",
    "Panodaki 'Üst Kalite' talebini karşıla. Her balıkçı bunu başaramaz."
  ],
  [
    "Alıcı hayran kaldı. Pazarda adın birinci sınıf tedarikçi olarak anılıyor."
  ],
  {
    "step.tradelanes_quality_delivery": { description: "Kusursuz kalitede bir trofe siparişini teslim et" }
  }
);

register(
  "quest.tradelanes_crossing",
  "Kargo ve İtibar",
  "Uzun Yoldan Dolaşmak",
  [
    "Güneşeri Adası ile Neva Limanı arasındaki mesafe tekneler için çetin bir sınavdır.",
    "Adadan aldığın özel kargoyu bozulmadan ana karaya ulaştır. Rüzgârı iyi hesapla."
  ],
  [
    "Kanalı kargoyla aştın! Bu iki kıyı arasında düzenli ticaretin kapısını araladı."
  ],
  {
    "step.tradelanes_load_island_cargo": { description: "Güneşeri'nden teslimat kargosunu yükle" },
    "step.tradelanes_deliver_mainland": { description: "Kargoyu Neva Limanı'na zamanında teslim et" }
  }
);

register(
  "quest.tradelanes_ledger",
  "Kargo ve İtibar",
  "Kargo ve İtibar",
  [
    "Maeve ticaret defterini önüne koyuyor: 'Girdiğin her risk, teslim ettiğin her söz buraya yazıldı.'",
    "Koyun en güvenilir deniz tüccarı olduğunu kanıtlamak için son bir büyük sevkiyatı tamamla."
  ],
  [
    "Defterdeki mühür tamamlandı. Artık Neva tüccarları senin adını saygıyla anıyor."
  ],
  {
    "step.tradelanes_master_delivery": { description: "Usta tüccar kargo sevkiyatını başarıyla tamamla" }
  }
);

register(
  "quest.tradelanes_pinewatch",
  "Kargo ve İtibar",
  "Orman Seferi",
  [
    "Çamgözü Ormanı'ndaki keresteciler un ve taze yiyeceğe muhtaç.",
    "Köyden un çuvallarını yükle ve orman ticaret avlusundaki Rowan'a götür. Dönüşte kereste almayı unutma."
  ],
  [
    "Rowan çuvalları indirdi: 'Fırınımız nihayet tütmeye başlayacak.' Güzel bir sefer oldu."
  ],
  {
    "step.tradelanes_load_pinewatch": { description: "Köyden buğday ve un kargosunu yükle" },
    "step.tradelanes_deliver_pinewatch": { description: "Kargoyu Çamgözü'nde Rowan'a teslim et" }
  }
);

register(
  "quest.tradelanes_reedhaven",
  "Kargo ve İtibar",
  "Sazlıkların Koyu Bulduğu Yer",
  [
    "Sazlıkköy bataklık köyü taze tahıl ve meyve bekliyor.",
    "Yükseltilmiş yolları takip ederek Mara'nın takas tezgâhına ulaş. Bataklığın ihtiyacını karşıla."
  ],
  [
    "Mara tezgâhın başında teşekkür ediyor: 'Bataklığa hayat getirdin.' Dönüş için taze yemlerin hazır."
  ],
  {
    "step.tradelanes_load_reedhaven": { description: "Sazlıkköy için meyve ve erzak kargosunu hazırla" },
    "step.tradelanes_deliver_reedhaven": { description: "Kargoyu Sazlıkköy'de Mara'ya ulaştır" }
  }
);

register(
  "quest.tradelanes_highridge",
  "Kargo ve İtibar",
  "Koyun Üstünde Akşam Yemeği",
  [
    "Yüksektepe yaylasında kök sebzeler boldur ama taze deniz balığı oraya zor ulaşır.",
    "Buzlu sandıklarla taze balığı geçitten yukarı, Ada'nın dükkânına taşı. Yavaş ve dikkatli sür."
  ],
  [
    "Ada sandıkları açınca gülümsedi: 'Ahali bu akşam hakiki bir ziyafet çekecek.' Yolu hakkıyla aştın."
  ],
  {
    "step.tradelanes_load_highridge": { description: "Buzlanmış taze balık sandıklarını arabaya yükle" },
    "step.tradelanes_deliver_highridge": { description: "Kargoyu Yüksektepe'de Ada'ya teslim et" }
  }
);

// ==========================================
// ACT 8: THE DRY SEASON
// ==========================================
register(
  "quest.act8_dry_season",
  "8. Bölüm: Kurak Sezon",
  "Taraçaların İçtiği Su",
  [
    "Yaz sıcağı adayı kavuruyor, sarnıçlar dip yapmaya başladı.",
    "Ines'in taraçalarına ana karadan getirdiğin tulumba sistemini bağla. Derin kuyudan su çekip taraçaları kurtar."
  ],
  [
    "Gürül gürül akan suyla taraçalar yeniden can buldu. Kuraklığa boyun eğmedik."
  ],
  {
    "step.act8_transport_pump": { description: "Gelişmiş sulama tulumbasını Güneşeri'ne taşı" },
    "step.act8_irrigate_dry_terraces": { description: "Tulumbayı kurarak kurak taraçaları sula" }
  }
);

register(
  "quest.act8_southern_shelf",
  "8. Bölüm: Kurak Sezon",
  "Güney Sahanlığı",
  [
    "Koydaki sular ısındı, balıklar güneydeki serin resif sahanlığına çekildi.",
    "Tomas'ın işaret ettiği açık deniz burnuna git. Derin suların soğuk akıntısında avlan."
  ],
  [
    "Sahanlığın derin suları cömertliğini gösterdi. Av ambarda yerini aldı."
  ],
  {
    "step.act8_catch_southern_shelf": { description: "Güney sahanlığının soğuk sularında avlan" }
  }
);

register(
  "quest.act8_salt_and_shade",
  "8. Bölüm: Kurak Sezon",
  "Tuz ve Gölge",
  [
    "Güneşeri'nin güneşi yakıcı, rüzgârı kurudur. Bu bir kusur değil, nimettir.",
    "Tuttuğun balıkları ada tuzuyla salamura et ve gölgelikte kurut. Zamana meydan okuyan kurutulmuş balık hazırla."
  ],
  [
    "Sertleşen ve mis gibi tuz kokan bu balıklar aylarca bozulmaz. Saati durdurdun."
  ],
  {
    "step.act8_harvest_salt": { description: "Ada kıyısından kaya tuzu topla" },
    "step.act8_cure_fish": { description: "Kurutma tezgâhında balıkları tuzla kurut" }
  }
);

register(
  "quest.act8_route_worth_keeping",
  "8. Bölüm: Kurak Sezon",
  "Korumaya Değer Bir Rota",
  [
    "Kurutulmuş balıklar artık uzun kanal geçişinde bozulma riski taşımıyor.",
    "Bu kargoyu Neva Limanı'na taşı ve Maeve'e sun. İki kıyı arasındaki kalıcı köprüyü kur."
  ],
  [
    "Maeve hayretle inceledi: 'Bunu başardın demek... Artık mesafe bir engel değil.'"
  ],
  {
    "step.act8_deliver_cured_fish": { description: "Kurutulmuş balık kargosunu Neva Limanı'na teslim et" }
  }
);

register(
  "quest.act8_dry_season_end",
  "8. Bölüm: Kurak Sezon",
  "Kurak Sezonun Sonu",
  [
    "İlk yağmur bulutları dağların ardında belirdi. Kurak sezonu geride bıraktık.",
    "Ines ve Tomas ile koyun meydanında buluş. Ada bu sınavı senin sayende atlattı."
  ],
  [
    "Yağmur damlaları toprağa düşerken herkesin yüzünde bir tebessüm var. Birlikte başardınız."
  ],
  {
    "step.act8_celebrate_season": { description: "Kurak sezonun kapanışında Güneşeri ahalisiyle buluş" }
  }
);

// ==========================================
// ACT 9: THE CHARTER
// ==========================================
register(
  "quest.act9_beyond_the_grounds",
  "9. Bölüm: Berat",
  "Av Sahalarının Ötesinde",
  [
    "Kıyı şeridi ve adalar artık bildiğin yurt oldu. Silas sana haritanın en dış halkasını işaret ediyor.",
    "Sisli günlerde fenerin ışığının bittiği o derin sulara açılma vakti."
  ],
  [
    "Ufuk çizgisi artık sana korkutucu gelmiyor. O suların da dilini çözdün."
  ],
  {
    "step.act9_sail_deep": { description: "Açık denizin en uç noktasına yelken aç" }
  }
);

register(
  "quest.act9_deep_trench",
  "9. Bölüm: Berat",
  "Derin Çukur",
  [
    "Okyanus tabanının aniden uçuruma dönüştüğü derin çukura ulaştın.",
    "Burada deniz canavarı gibi koca kılıçbalıkları ve tonlar yüzer. Bütün ustalığını ortaya koy."
  ],
  [
    "Muazzam bir mücadeleydi! Böylesine zorlu bir avı karaya çıkarmak her babayiğidin harcı değil."
  ],
  {
    "step.act9_find_trench": { description: "Derin Çukur balık yatağını bul" },
    "step.act9_land_trench_trophy": { description: "Derinliklerden efsanevi bir trofe çıkar" }
  }
);

register(
  "quest.act9_standing_arrangement",
  "9. Bölüm: Berat",
  "Sürekli Bir Anlaşma",
  [
    "Liman loncası ve köy konseyi senin başarılarını görüyor.",
    "Sürekli bir tedarik hattı kurmak için son büyük siparişleri tamamla ve masadaki yerini hazırla."
  ],
  [
    "Bütün şartlar yerine getirildi. Artık sadece bir kaptan değil, kıyının direğisin."
  ],
  {
    "step.act9_complete_commitments": { description: "Loncanın belirlediği taahhütleri yerine getir" },
    "step.act9_review_standing": { description: "Liman kâhyası ile anlaşma şartlarını görüş" }
  }
);

register(
  "quest.act9_the_charter",
  "9. Bölüm: Berat",
  "Denizcilik Beratı",
  [
    "Silas, Maeve, Elspeth ve Barnaby masanın başında toplandı.",
    "Neva Denizcilik Beratı önüne serildi. Bu kâğıt sana sadece haklar vermez; bu kıyıyı koruma ve geri dönme sözü ister. İmzanı at."
  ],
  [
    "Mühür basıldı, berat imzalandı! Artık Neva'nın tescilli kaptanı ve koruyucususun."
  ],
  {
    "step.act9_sign_charter": { description: "Neva Denizcilik Beratı'nı imzala" }
  }
);

// ==========================================
// ACT 10: OPEN HORIZONS
// ==========================================
register(
  "quest.act10_open_horizons",
  "10. Bölüm: Açık Ufuklar",
  "Açık Ufuklar",
  [
    "Berat cebinde, tarla yeşermiş, filika sağlam ve fener yolunu aydınlatıyor.",
    "Buradaki hiçbir şey tek bir kişiyle bitmedi. Toprak başkaları için beslendi, tekneler başkaları için onarıldı.",
    "Şimdi ufuk tamamen senin. İstediğin yere yelken aç, istediğin tohumu serp ve kıyının hikâyesini yaşatmaya devam et."
  ],
  [
    "Ufuk artık bir sınır değil, bir davet. Rüzgârın daima pupandan essin, deniz daima yol versin."
  ],
  {
    "step.act10_visit_homestead": { description: "Ata Çiftliği'ne uğra ve Elspeth'le kucaklaş" },
    "step.act10_visit_workshop": { description: "Barnaby'nin tezgâhına selam ver" },
    "step.act10_visit_harbor": { description: "Liman iskelesinde Silas ve Maeve ile vedalaş" },
    "step.act10_sail_horizon": { description: "Açık ufuklara doğru kürek çek" }
  }
);

// Build output file content
let code = `// src/i18n/locales/tr/quests.ts
// Generated Turkish translations for all 48 canonical quests in Neva.

import type { LocalizedQuestText } from "../../types";

export const TR_QUESTS: Record<string, LocalizedQuestText> = {
`;

for (const [id, data] of Object.entries(trData)) {
  code += `  ${JSON.stringify(id)}: ${JSON.stringify(data, null, 4)},\n`;
}

code += `};\n`;

fs.writeFileSync(path.join(process.cwd(), "src/i18n/locales/tr/quests.ts"), code, "utf8");
console.log(`Successfully generated src/i18n/locales/tr/quests.ts with ${Object.keys(trData).length} quests.`);
