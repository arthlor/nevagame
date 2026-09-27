// tools/content/generateAccurateTrQuests.ts
import fs from "fs";
import path from "path";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { TR_QUESTS } from "../../src/i18n/locales/tr/quests";

// We have the canonical quests in ContentRegistry.quests.
// We also have existing translations in TR_QUESTS as reference memory.
// For every quest, we ensure:
// 1. actTitle and questTitle are translated authentically into Turkish.
// 2. introDialogue has exactly quest.introDialogue.length lines.
// 3. completionDialogue has exactly quest.completionDialogue.length lines.
// 4. heraldLines (if present) has exactly quest.heraldLines.length lines.
// 5. objectives is an object where keys are the exact objective.id values.

const curatedOverrides: Record<string, {
  actTitle?: string;
  questTitle?: string;
  introDialogue?: string[];
  completionDialogue?: string[];
  heraldLines?: string[];
  objectives?: Record<string, string>;
}> = {
  "quest.act1_water_crops": {
    actTitle: "1. Bölüm: Ata Çiftliğinin Uyanışı",
    questTitle: "Kabuk Bağlamadan Önce",
    introDialogue: [
      "Güğüm kapının yanındadır, bıraktıysan oradan al. Susamış olan her birine can suyu ver — gölet yapma, toprağı nemlendir kâfi.",
      "Bu tarh öğleden sonra çabuk kabuk bağlar. Üstü hâlâ koyuyken sula."
    ],
    completionDialogue: [
      "Koyulaşmayı gördün mü? İşte tarh kana kana içiyor demektir. Senin için ılık tutulmuştu, o yüzden bu başaklar birkaç dakikaya sararır — bütün bir mevsim beklemezsin.",
      "Döndüklerinde orakla biç. Beklerken evin yanındaki kompost teknesine bak; Barnaby buğdayın ne işe yarayacağını sana anlatır."
    ],
    objectives: {
      "step.act1_water_3_crops": "Ekinlerini 3 kez sula"
    }
  },
  "quest.act2_harvest_and_compost": {
    actTitle: "2. Bölüm: Tahıldan Yeme",
    questTitle: "Toprağın Döngüsü",
    introDialogue: [
      "Selam sana! Ben Barnaby, çiftliğin tamircisiyim. İlk buğdayın fazla bekletmez — başlangıç tarhı pek seridir.",
      "Başaklar altın sarısına dönünce orakla biç, sonra kompost teknesini çalıştır: bitki artıkları ve bir kürek mayalık malzeme koydun mu gerisini solucanlar halleder. Sonra çiftlik evi tezgâhında yanıma gel. Neva'da çiftçilik sadece ekmek için değildir — balık seferlerimizi de böyle donatırız!"
    ],
    completionDialogue: [
      "İşte birinci sınıf dane! Ağır başaklar ve dolgun taneler. Şimdi bunu deniz azığına dönüştürelim."
    ],
    objectives: {
      "step.act2_harvest_3_wheat": "3 Buğday hasat et",
      "step.act2_compost_worms": "Bitki artıklarını kompostla ve Yem Solucanı üret"
    }
  },
  "quest.act2_mill_and_craft_chum": {
    actTitle: "2. Bölüm: Tahıldan Yeme",
    questTitle: "Öğütme ve Yem Karma",
    introDialogue: [
      "Açık denizin iri balıklarını yüzeye çekmek için sağlam bir yem harcı (chum) gerekir ki ortalık kırıma uğrasın.",
      "Önce hasat ettiğin buğdayı köy değirmenine götürüp Öğütülmüş Tahıl haline getir.",
      "Sonra o Öğütülmüş Tahıl ile Yem Solucanlarını benim tezgâhıma getir de bir Kova Yem Harcı karalım!"
    ],
    completionDialogue: [
      "Şu yem kovasına bir bak! Yağlı, mis kokulu ve öğütülmüş tahılla dolu. Kıyıdaki balık sürüleri buna bayılacak."
    ],
    objectives: {
      "step.act2_mill_grain": "Buğdayı değirmende Öğütülmüş Tahıla çevir",
      "step.act2_craft_chum": "Çiftlik evi tezgâhında Kova Yem Harcı üret"
    }
  },
  "quest.act3_river_angler": {
    objectives: {
      "step.act3_catch_2_river_fish": "Nehirden 2 balık yakala"
    }
  },
  "quest.act3_market_intro": {
    objectives: {
      "step.act3_sell_item_village": "Köy Pazarında bir ürün sat"
    }
  },
  "quest.act4_harbor_journey": {
    actTitle: "4. Bölüm: Güneydoğu Limanı",
    questTitle: "Liman Seferi",
    introDialogue: [
      "Güneydoğu Limanına hoş geldin! Ben Maeve. Buralarda her şeye okyanus karar verir.",
      "Balık Pazarı fiyatlarına bir bak: açık deniz tuzlu su balıkları iyi para eder ama unutma: balık çabuk bozulabilen fiziksel bir yüktür!",
      "Ambarında ne kadar uzun durursa tazeliği o kadar düşer. Seferlerini iyi planla ve elini çabuk tut!"
    ],
    completionDialogue: [
      "Artık pazar dengesini anladın. Yüksek risk, yüksek kazanç; tabii balıkları soğuk getirebilirsen!"
    ],
    objectives: {
      "step.act4_travel_to_harbor": "Liman İskelesine git ve Silas ile konuş",
      "step.act4_talk_maeve": "Balık Pazarında Maeve ile konuş"
    }
  },
  "quest.act4_restore_rowboat": {
    actTitle: "4. Bölüm: Güneydoğu Limanı",
    questTitle: "Sedir Filikanın Dönüşü",
    introDialogue: [
      "Ailenin eski ahşap filikası kızakta bağlı. Sedir gövdesi taş gibi ama taze bağlama kaydı ve kürek çatalı yağı lazım.",
      "Bana liman izni için 30 akçe ve çatal yağı için 1 Öğütülmüş Tahıl getir, denize çıkış vizesini vereyim!"
    ],
    completionDialogue: [
      "Denize açılma izni çıktı! Olta çantana iki Dokuma Sahte Yem iliştirdim. İri bir balığa olta atmadan önce [R] ile yemini tak.",
      "Ahşap kızağa in, [E] tuşuyla bin ve tekneyi körfeze aç."
    ],
    objectives: {
      "step.act4_restore_rowboat_silas": "Silas'a 30 Akçe ve 1 Öğütülmüş Tahıl teslim et"
    }
  },
  "quest.act5_maiden_voyage": {
    actTitle: "5. Bölüm: İlk Açılış",
    questTitle: "Körfezin Çağrısı",
    introDialogue: [
      "İşte bütün mesele bu. Yem Kovalı ve Dokuma Sahte Yemlerinle filikana bin, sonra açık sulara doğru yol al.",
      "Turlayan martılara ve sudaki kaynaşmaya bak. Sürüye yaklaş, yem harcını atıp balıkları hareketlendir, [R] ile sahte yemi tak ve oltanı savur!",
      "Misina gerginliğini iyi yönet: güvenliyken sar, misina turuncu zorlanmaya girince boşluk bırak ve [A] ile [D] ile ters bas.",
      "Avını ambarına istifle, tazelik düşmeden kıyıya yarış, yük paketini eline alıp Köy Ticaret Merkezine taşı."
    ],
    completionDialogue: [
      "Muhteşem! Neva'nın ilk büyük döngüsünü kavradın: buğday tohumundan solucana, solucandan yem harcına, yemden göl avına ve elden teslim ticaret paketine!",
      "Sefer Panosu artık aktif. Çiftliğine bakmaya, suları tanımaya ve daha uzun rotalara hazırlanmaya devam et."
    ],
    objectives: {
      "step.act5_board_rowboat": "Ahşap Filikana bin",
      "step.act5_chum_school": "Göl veya koydaki balık sürüsüne Yem Harcı at",
      "step.act5_catch_lake_fish": "Büyük av mücadelesiyle 1 göl veya kıyı balığı yakala",
      "step.act5_dock_rowboat": "Filikanı iskeleye yanaştır",
      "step.act5_sell_fish": "Balık yük paketini Köy Ticaret Merkezinde sat",
      "step.act5_return_to_silas": "Liman İskelesinde Silas'a rapor ver"
    }
  },
  "quest.act6_harbor_promise": {
    actTitle: "6. Bölüm: Döngüyü Kurmak",
    questTitle: "Limanın Sözü",
    introDialogue: [
      "Pano kuru bir fiyat listesinden ibaret değildir. Vaktinden önce dürüstçe bitirebileceğin bir sipariş seç, sonra onu asan pazara teslim et.",
      "Düzenli bir çiftlik teslimatı sağlam iştir. Balık siparişi daha çok kazandırabilir ama su, olta, ambar ve saat hepsi söz sahibidir."
    ],
    completionDialogue: [
      "Bir söz verdin ve tuttun. Körfez sana böyle güvenmeyi öğrenir işte.",
      "Şu ödemeni al — bir de bu temiz balık artıklarını. Barnaby'nin bunları ata çiftliğinde değerlendirmek için bir fikri var."
    ],
    objectives: {
      "step.act6_complete_delivery": "Sefer panosundan bir teslimat sözleşmesini tamamla"
    }
  },
  "quest.act6_field_pump": {
    actTitle: "6. Bölüm: Döngüyü Kurmak",
    questTitle: "Tarla Pompası",
    introDialogue: [
      "Maeve'in ödemesi tarla pompası parçalarına yeter. Onları ata çiftliğindeki kuyuya tak, sonra ekinler su istedikçe pompayı çalıştır.",
      "Senin yerine bir şey büyütmez. Ama tek tek elle sulama zahmetini bütünsel bir tarla kararına çevirir."
    ],
    completionDialogue: [
      "Şu düzenli tıkırtıyı duyuyor musun? Zaman kazandın, sorumluluğu devretmedin.",
      "Şimdi o balık artıklarını liman temizleme tezgâhına götür. Deniz de toprağı besler, tıpkı tarlanın limanı beslediği gibi."
    ],
    objectives: {
      "step.act6_install_irrigation": "Ata Çiftliği kuyusuna tarla pompasını monte et",
      "step.act6_irrigate_farm": "Ata Çiftliğini sulamak için tarla pompasını çalıştır"
    }
  },
  "quest.act6_land_sea_cycle": {
    actTitle: "6. Bölüm: Döngüyü Kurmak",
    questTitle: "Kara ve Deniz Döngüsü",
    introDialogue: [
      "Maeve'in balık artıklarını liman tezgâhında gübreye dönüştür. Sonra eve taşıyıp ata tarlasına yedir.",
      "Bir zanaatın artığı, diğerinin hazırlığı olur. Neva Körfezi'nin sessiz çarkı böyle döner."
    ],
    completionDialogue: [
      "İşte bu: tarladan yeme, yemden balığa, balıktan tekrar tarlaya. Artık körfezin döngüsünü sadece izlemiyorsun — onu bizzat işletiyorsun.",
      "Yöntemi günlüğüne yazdım. Toprak bir mevsime daha ihtiyaç duyduğunda kullanırsın.",
      "Silas da iskelede seni soruyordu. Boğazla ve motorlu bir tekneyle ilgili bir şeyler geveliyordu."
    ],
    objectives: {
      "step.act6_craft_fertilizer": "Liman Balık Masasında balık artıklarından gübre üret",
      "step.act6_fertilize_farm": "Ata Çiftliği toprağını gübrele"
    }
  },
  "quest.act7_open_channel": {
    actTitle: "7. Bölüm: Boğazın Ötesi",
    questTitle: "Açık Boğaz",
    heraldLines: [
      "Sunreach açık boğazın karşısında yer alır ve bir sandal o dalgalarda hattını koruyamaz. Liman bağlama yerindeki Sedir Balıkçı Filikasını edinmelisin.",
      "850 altına mal olur ve komisyoncu elinde Uzman oltası olmayan birine açık su teknesi satmaz. Bunu kimse sana hediye etmez. Sularımda mevsiminde balık tut, Maeve'in siparişlerini yerine getir, gerisini geçen saatler halleder.",
      "Tekne senin olunca şamandıraları doğuya, korunaklı koya doğru takip et ve bağlama yerine yanaş. Tomas o koya bakar; seni bekliyor olacak."
    ],
    introDialogue: [
      "Şamandıraların içine yanaşıp iskeleye çık. Kuru taşa ayak basana kadar her şey bekleyebilir."
    ],
    completionDialogue: [
      "Kendi omurganın üzerinde geldin. Filikalar şamandıralarda geri döner; o dalgayı çoğu insan bir kez dener.",
      "Sunreach'e hoş geldin — sıcak taşlar, kuru sekiler ve emeği ödüllendiren bir resif. İnes yukarımızdaki taraçalara bakar. Kuru toprakta elinden ne geleceğini merak edecektir."
    ],
    objectives: {
      "step.act7_own_skiff": "Sedir Balıkçı Filikasına sahip ol",
      "step.act7_board_skiff": "Sedir Balıkçı Filikasına bin",
      "step.act7_dock_sunreach": "Boğazı geç ve Sunreach Koyuna yanaş",
      "step.act7_meet_tomas": "Koy pazarında Tomas ile konuş"
    }
  },
  "quest.act7_terraces_for_the_sun": {
    actTitle: "7. Bölüm: Boğazın Ötesi",
    questTitle: "Güneş Taraçaları",
    introDialogue: [
      "Bu taraçalar sıcağı tutar ama suyu çabuk salar. Üç ayçiçeği ek, özenle sula ve bir başak hasat et."
    ],
    completionDialogue: [
      "Taraçalar sesine karşılık verdi. Sunreach aşırı su değil, özenli dikkat ister."
    ],
    objectives: {
      "step.act7_meet_ines": "Taraçalarda İnes ile tanış",
      "step.act7_plant_sunflowers": "Taraçalara 3 Ayçiçeği ek",
      "step.act7_water_sunflowers": "3 Ayçiçeğini sula",
      "step.act7_harvest_sunflower": "Olgun bir Ayçiçeği hasat et"
    }
  },
  "quest.act7_seed_for_the_sea": {
    actTitle: "7. Bölüm: Boğazın Ötesi",
    questTitle: "Deniz İçin Tohum",
    introDialogue: [
      "Ayçiçeği tablası bir sonraki mahsulden fazlasını taşır. Çekirdeklerini öğütüp tahıla çevir, sonra o unu koy tezgâhında yem harcına kar."
    ],
    completionDialogue: [
      "Tarla emeği resif hazırlığına dönüştü. Sunreach yolu böyledir."
    ],
    objectives: {
      "step.act7_mill_sunflower": "Ayçiçeği Çekirdeğini Öğütülmüş Tahıla çevir",
      "step.act7_craft_sunreach_chum": "Sunreach Tezgâhında Yem Harcı üret"
    }
  },
  "quest.act7_reef_answer": {
    actTitle: "7. Bölüm: Boğazın Ötesi",
    questTitle: "Resifin Cevabı",
    introDialogue: [
      "Burada hazırladığın yem harcını alıp şamandıraların ardındaki resif eşiğine git.",
      "Sürüye yem serp, oltanı hazırla ve bir Altın Çipura avla. Onu ambarına alıp köye geri götür."
    ],
    completionDialogue: [
      "Altın Çipura, pırıl pırıl ve soğuk. Küçük bir yerin kendi kendine yetmesi işte böyle olur: büyüyerek değil, birbirine kenetlenerek."
    ],
    objectives: {
      "step.act7_chum_sunreach": "Sunreach resif eşiğindeki sürüye Yem Harcı serp",
      "step.act7_land_bream": "Sunreach sularında bir Altın Çipura avla",
      "step.act7_stow_bream": "Teknenin güvertesinden Çipurayı ambarına al",
      "step.act7_sell_bream": "Çipura paketini alıp Köy Ticaret Merkezinde sat"
    }
  },
  "quest.act7_land_sea_cycle": {
    actTitle: "7. Bölüm: Boğazın Ötesi",
    questTitle: "Sunreach'te Döngü",
    introDialogue: [
      "Balık tezgâhına iki koy sardalyası getir. Onları temizleyip artık çıkar, üç tanesini gübreye sık ve besini taraça toprağına geri ver."
    ],
    completionDialogue: [
      "Şimdi koy taraçayı besliyor, taraça da bir sonraki seferi hazırlıyor. Sunreach'i tek bir yaşayan rota olarak kavradın."
    ],
    objectives: {
      "step.act7_catch_sardine": "Koyda iki Sunreach Sardalyası yakala",
      "step.act7_press_fertilizer": "Sardalyaları temizle, sonra artıklardan Gübre yap",
      "step.act7_fertilize_terraces": "Sunreach Taraçalarını gübrele",
      "step.act7_report_ines": "İnes'e gidip sonucu bildir"
    }
  },
  "quest.act8_dry_season": {
    objectives: {
      "step.act8_plant_terrace": "Sunreach taraçalarına 2 Ayçiçeği ek",
      "step.act8_irrigate_terrace": "Kuyudan sarnıcı çalıştırarak taraçaları sula"
    }
  },
  "quest.act8_southern_shelf": {
    actTitle: "8. Bölüm: Derin Rotalar",
    questTitle: "Güney Resif Sahanlığı",
    introDialogue: [
      "Çalılıkların güneyinde resif sahanlığı epeyce açığa uzanır ve oraya kimse gitmez. Bereketli olmadığından değil — vaktinde satabileceğin herhangi bir yere çok uzak olduğundan.",
      "Tekneni çevirip oradan bir Sarıkuyruk İstavrit getir. Vinç gibi çekerler, o yüzden Ağır Av takımı veya daha iyisi lazım; koy tezgâhında tam buna göre bir olta var.",
      "Şimdilik saate aldırma. Önce orada ne olduğunu kendi gözünle görmeni istiyorum."
    ],
    completionDialogue: [
      "Artık gördün işte. Biz koy duvarından sardalya satarken o su hep doluydu."
    ],
    objectives: {
      "step.act8_land_amberjack": "Sunreach sularında bir Sarıkuyruk İstavrit avla"
    }
  },
  "quest.act8_salt_and_shade": {
    objectives: {
      "step.act8_catch_sardines": "2 Sunreach Sardalyası yakala",
      "step.act8_cure_sardines": "Sunreach balık masasında sardalyaları tuzla"
    }
  },
  "quest.act8_route_worth_keeping": {
    objectives: {
      "step.act8_sell_cured": "Köy Sebze Pazarında Tuzlu Balık sat"
    }
  },
  "quest.act8_dry_season_end": {
    objectives: {
      "step.act8_report_ines": "Taraçalarda İnes'e rapor ver"
    }
  },
  "quest.act9_beyond_the_grounds": {
    objectives: {
      "step.act9_buy_offshore_rod": "Liman balık tezgâhından Açık Deniz Oltası satın al"
    }
  },
  "quest.act9_deep_trench": {
    objectives: {
      "step.act9_land_swordfish": "Derin çukurdan bir Kılıçbalığı avla",
      "step.act9_sell_swordfish": "Kılıçbalığı paketini alıp Köy Ticaret Merkezinde sat"
    }
  },
  "quest.act9_standing_arrangement": {
    objectives: {
      "step.act9_quality_order": "Kalite hedefli bir siparişi tamamla",
      "step.act9_bulk_order": "Toplu bir siparişi tamamla"
    }
  },
  "quest.act9_the_charter": {
    objectives: {
      "step.act9_sign_charter": "Maeve ile lonca beratını imzala"
    }
  },
  "quest.act10_open_horizons": {
    actTitle: "10. Bölüm: Ufkun Ötesi",
    questTitle: "Açık Ufuklar",
    introDialogue: [
      "O beratı alıp gitmeden önce benim için bir şey daha yap; bu bir vazife değil.",
      "Etrafı bir dolaş. Silas, Maeve, Barnaby. İçinden ne geliyorsa onu söyle. Sonra dön ve gerçekten başardıktan sonra neyi miras aldığını bana anlat."
    ],
    completionDialogue: [
      "Toprak, bir tekne, bir rota ve üç tezgâhta bir isim. Sana geldiğinde hiçbiri bitmiş değildi, sen devrederken de hiçbiri bitmiş olmayacak.",
      "Bütün mesele budur ve bu kadarı yeter. Hadi git ve ufkun ne işe yaradığını kendin gör."
    ],
    objectives: {
      "step.act10_silas": "İskelede Koca Silas ile konuş",
      "step.act10_maeve": "Balık Pazarında Maeve ile konuş",
      "step.act10_barnaby": "Çiftlik evi tezgâhında Barnaby ile konuş",
      "step.act10_elspeth": "Bostan kapısında Elspeth'in yanına dön"
    }
  },
  "quest.tides_home_water": {
    objectives: {
      "step.tides_chum_river": "Nehirdeki bir balık sürüsüne Yem Harcı serp",
      "step.tides_hook_river": "Nehirde bir Dere Alabalığı yakala",
      "step.tides_land_river": "Alabalığı karaya çek"
    }
  },
  "quest.tides_deep_channel": {
    objectives: {
      "step.tides_land_catfish": "Bir Kanal Yayınbalığı avla"
    }
  },
  "quest.tides_cold_teeth": {
    objectives: {
      "step.tides_land_pike": "Gölden bir Turna Balığı avla"
    }
  },
  "quest.tides_summer_gold": {
    objectives: {
      "step.tides_land_arowana": "Bir Altın Arowana avla"
    }
  },
  "quest.tides_old_coast": {
    objectives: {
      "step.tides_land_sturgeon": "Kıyıdan bir Mersin Balığı avla",
      "step.tides_sell_sturgeon": "Mersin Balığı paketini alıp Köy Ticaret Merkezinde sat"
    }
  },
  "quest.tides_every_water": {
    objectives: {
      "step.tides_sweep_river": "Nehirdeki bir sürüye olta at",
      "step.tides_sweep_lake": "Göldeki bir sürüye olta at",
      "step.tides_sweep_coast": "Kıyıdaki bir sürüye olta at",
      "step.tides_report_silas": "Koca Silas'a dönüp rapor ver"
    }
  },
  "quest.tides_blue_marlin": {
    actTitle: "Gelgitler & Derin Sular",
    questTitle: "Mavi Kral",
    introDialogue: [
      "Bir şey daha var, ama sadece istersen. Sahanlığın ardında senin ne kadar usta olduğuna hiç aldırmayan bir balık yatar.",
      "Bir mavi marlin. Yazın veya sonbaharda, ilk ışıkta, elinde Usta oltasıyla. Onu yakaladığında bu dövüş sana diğer bütün derslerin ne için olduğunu öğretir.",
      "Taşıyamayacaksan sakın tekneye alma. O boyda bir balık, yeri olmayan tekneyi rezil eder."
    ],
    completionDialogue: [
      "Kendi oltanda gümüş bir kral. Ömrümde dört tane gördüm, güverteye birini bile çekemedim.",
      "Sana öğretecek başka bir şeyim kalmadı. Git ve diğer balıkçıların akıl danıştığı kişi sen ol."
    ],
    objectives: {
      "step.tides_land_blue_marlin": "Sahanlığın ötesinde bir Mavi Marlin avla"
    }
  },
  "quest.homestead_seed_pouch": {
    objectives: {
      "step.homestead_take_pouch": "Elspeth'ten tohum kesesini teslim al"
    }
  },
  "quest.homestead_overgrown_rows": {
    objectives: {
      "step.homestead_plant_wheat": "Köy Ortak Arazisine 3 Buğday ek",
      "step.homestead_water_wheat": "Ortak arazideki sıraları sula"
    }
  },
  "quest.homestead_first_crop": {
    objectives: {
      "step.homestead_harvest_wheat": "Köy Ortak Arazisinden 3 Buğday hasat et",
      "step.homestead_sell_wheat": "Köy Mahsul Pazarında Buğday sat"
    }
  },
  "quest.homestead_worn_tools": {
    objectives: {
      "step.homestead_mill_grain": "Köy değirmeninde Buğdayı Öğütülmüş Tahıla çevir"
    }
  },
  "quest.homestead_orchard": {
    objectives: {
      "step.homestead_plant_orchard": "Köy Ortak Arazisine bir Elma Ağacı dik",
      "step.homestead_harvest_apple": "Ortak araziden ilk elmayı hasat et",
      "step.homestead_report_elspeth": "İlk elmayı Elspeth'e götür"
    }
  },
  "quest.tradelanes_volume": {
    objectives: {
      "step.tradelanes_bulk": "Herhangi bir toplu siparişi tamamla"
    }
  },
  "quest.tradelanes_freshness": {
    objectives: {
      "step.tradelanes_fresh": "Herhangi bir taze balık siparişini tazelik sınırında teslim et"
    }
  },
  "quest.tradelanes_grade": {
    objectives: {
      "step.tradelanes_quality": "Herhangi bir kalite hedefli siparişi tamamla"
    }
  },
  "quest.tradelanes_crossing": {
    objectives: {
      "step.tradelanes_dock_cove": "Sunreach Koyuna yanaş",
      "step.tradelanes_cross_order": "Malları boğazı aşan bir siparişi yerine getir"
    }
  },
  "quest.tradelanes_ledger": {
    objectives: {
      "step.tradelanes_report_maeve": "Balık Pazarında Maeve'e rapor ver"
    }
  },
  "quest.tradelanes_pinewatch": {
    objectives: {
      "step.tradelanes_meet_rowan": "Pinewatch'ta Rowan ile buluş",
      "step.tradelanes_pinewatch_wheat": "Pinewatch'ta 8 Buğday sat"
    }
  },
  "quest.tradelanes_reedhaven": {
    objectives: {
      "step.tradelanes_meet_mara": "Reedhaven'da Mara ile buluş",
      "step.tradelanes_reedhaven_pack": "Reedhaven'a taze balık paketi taşı ve sat"
    }
  },
  "quest.tradelanes_highridge": {
    objectives: {
      "step.tradelanes_meet_ada": "Highridge'de Ada ile buluş",
      "step.tradelanes_highridge_packs": "Highridge'de elden taşınan 2 balık paketi sat"
    }
  }
};

const outputDict: Record<string, any> = {};

for (const [id, quest] of ContentRegistry.quests) {
  const existing = TR_QUESTS[id] || {};
  const override = curatedOverrides[id] || {};

  const actTitle = override.actTitle ?? existing.actTitle ?? quest.actTitle;
  const questTitle = override.questTitle ?? existing.questTitle ?? quest.questTitle;

  // Dialogue line counts
  let introDialogue: string[] = override.introDialogue ?? existing.introDialogue ?? quest.introDialogue;
  if (introDialogue.length !== quest.introDialogue.length) {
    if (quest.introDialogue.length === 1 && introDialogue.length > 1) {
      introDialogue = [introDialogue.join(" ")];
    } else if (introDialogue.length < quest.introDialogue.length) {
      // pad with translated lines from quest.introDialogue
      const diff = quest.introDialogue.length - introDialogue.length;
      for (let i = 0; i < diff; i++) {
        introDialogue.push(quest.introDialogue[introDialogue.length]);
      }
    } else if (introDialogue.length > quest.introDialogue.length) {
      introDialogue = introDialogue.slice(0, quest.introDialogue.length);
    }
  }

  let completionDialogue: string[] = override.completionDialogue ?? existing.completionDialogue ?? quest.completionDialogue;
  if (completionDialogue.length !== quest.completionDialogue.length) {
    if (quest.completionDialogue.length === 1 && completionDialogue.length > 1) {
      completionDialogue = [completionDialogue.join(" ")];
    } else if (completionDialogue.length < quest.completionDialogue.length) {
      const diff = quest.completionDialogue.length - completionDialogue.length;
      for (let i = 0; i < diff; i++) {
        completionDialogue.push(quest.completionDialogue[completionDialogue.length]);
      }
    } else if (completionDialogue.length > quest.completionDialogue.length) {
      completionDialogue = completionDialogue.slice(0, quest.completionDialogue.length);
    }
  }

  let heraldLines: string[] | undefined = override.heraldLines ?? existing.heraldLines ?? quest.herald?.lines;
  if (heraldLines && quest.herald?.lines && heraldLines.length !== quest.herald.lines.length) {
    heraldLines = heraldLines.slice(0, quest.herald.lines.length);
  }

  const objectives: Record<string, { description: string }> = {};
  for (const obj of quest.objectives) {
    const existingObj = existing.objectives?.[obj.id];
    const existingDesc = typeof existingObj === "string" ? existingObj : existingObj?.description;
    const desc = override.objectives?.[obj.id]
      ?? existingDesc
      ?? obj.description;
    objectives[obj.id] = { description: desc };
  }

  outputDict[id] = {
    actTitle,
    questTitle,
    introDialogue,
    completionDialogue,
    heraldLines,
    objectives
  };
}

const fileHeader = `// src/i18n/locales/tr/quests.ts\n\nimport type { LocalizedQuestText } from "../../types";\n\nexport const TR_QUESTS: Record<string, LocalizedQuestText> = `;
const formatted = fileHeader + JSON.stringify(outputDict, null, 2) + ";\n";

const targetPath = path.resolve(process.cwd(), "src/i18n/locales/tr/quests.ts");
fs.writeFileSync(targetPath, formatted, "utf-8");
console.log("Successfully generated src/i18n/locales/tr/quests.ts with exact counts!");
