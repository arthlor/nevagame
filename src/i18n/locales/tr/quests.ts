// src/i18n/locales/tr/quests.ts

import type { LocalizedQuestText } from "../../types";

export const TR_QUESTS: Record<string, LocalizedQuestText> = {
  "quest.tradecraft_materials": {
    actTitle: "İşini Bilen Tüccar", questTitle: "Bir Yükün Maliyeti",
    introDialogue: ["Mahsul paketleri işin başlangıcı. Öğütülmüş tahıl, buğday ve ketenle daha değerli bir yük hazırlayabilirsin.",
      "Tahılı değirmende öğüt ya da Neva pazarından al. Keten rulosunu Pinewatch’tan alabilir veya kendin dokuyabilirsin. Malzemeleri ve paketleme ücretini Neva tezgâhına getir.",
      "Paketlemeden önce tahmini kazanca bak. Kendi yetiştirdiğin ürünler de yeniden alma bedeliyle hesaba katılır. Tahıl çuvallarını Pinewatch’a götür."],
    completionDialogue: ["Pinewatch, düzgün sarılmış öğütülmüş tahıla para verdi. Buğdayı kendi tarladan getirsen de keteni ve paketleme ücretini hesaba kat.", "İşlenmiş yük, ham hasattan daha çok kazandırabilir; ama sonraki paket de malzeme isteyecek. O payı defterden silme."],
    objectives: { "step.tradecraft.materials.make": { description: "Neva tezgâhında öğütülmüş tahıl çuvalları hazırla." }, "step.tradecraft.materials.deliver": { description: "Tahıl çuvallarını Pinewatch’ta sat." } }
  },
  "quest.tradecraft_return_goods": {
    actTitle: "İşini Bilen Tüccar", questTitle: "İki Yönde de Dolu Yük",
    introDialogue: ["Highridge çelik ve bakır satar; Pinewatch ise kereste. Malzemeleri Highridge tezgâhında bir atölye metal kasasına dönüştür.", "Kasayı Reedhaven’a götür. Metal yolda bozulmaz ama alıcıların deposu dolar: benzer yükleri arka arkaya satarsan fiyat düşebilir."],
    completionDialogue: ["Highridge metalini Reedhaven’a ulaştırdın. Islak tahtaların yıprattığı yerlerde bu kasa işe yarayacak.", "Metal yolda bozulmaz ama ambar sonsuz değil. Aynı kasadan durmadan getirirsen fiyat da değişir."],
    objectives: { "step.tradecraft.return_goods.make": { description: "Highridge’de bir atölye metal kasası hazırla." }, "step.tradecraft.return_goods.deliver": { description: "Metal kasasını Reedhaven’da sat." } }
  },
  "quest.tradecraft_premium": {
    actTitle: "İşini Bilen Tüccar", questTitle: "Yük Yerinin Değeri",
    introDialogue: ["Değerli bir sevkiyat, arabadaki tek bölmeden daha çok kazandırır. Bunun için işleme ve ticaret tecrübesi, bir de daha fazla sermaye gerekir.", "Reedhaven’dan yoğun yem ve olta yemi al. Pinewatch’tan muşamba ve kereste getir. Nehir seferi malzemelerini sazlık köyünde paketleyip Highridge’e taşı.", "Dayanıklı kumanya, taze yemeklerden uzun süre korunur. Yükünü çeşitlendir; benzer tarifler aynı talebi paylaşır."],
    completionDialogue: ["Tek bir araba bölmesine koca bir seferin malzemesi sığdı. O yere değerini, yokuşa çıkmadan önce yaptığın hazırlık verdi.", "Bu bedelde yapanın emeği, yolun zahmeti ve alıcı köyün ihtiyacı var."],
    objectives: { "step.tradecraft.premium.make": { description: "Reedhaven’da nehir seferi malzemeleri hazırla." }, "step.tradecraft.premium.deliver": { description: "Sefer malzemelerini Highridge’de sat." } }
  },
  "quest.tradecraft_overseas": {
    actTitle: "İşini Bilen Tüccar", questTitle: "Dönüş Yükü",
    introDialogue: ["Sunreach’te zeytin ve tuzlanmış balık var. İhracat sepeti için anakaradan tahıl ve keten de gerekir; bir sonraki seferinde yanında götür.", "Koy tezgâhında dönüş fiyatlarını karşılaştır ve Neva’ya götürmek üzere bir ihracat sepeti hazırla. Büyük yük gemisinin on bölmesi ayrı yükler taşır; her paket tek tek yüklenir ve kıyıya taşınır."],
    completionDialogue: ["Dönüş sepetinde Sunreach zeytiniyle tuzlu balığı, ana karadan götürdüğün tahıl ve ketenle yan yana geldi.", "İyi tüccar geçişin iki yanını da görür. Adanın işe yarar kıldığı şey, ambarda eve döner."],
    objectives: { "step.tradecraft.overseas.make": { description: "Sunreach’te bir ihracat sepeti hazırla." }, "step.tradecraft.overseas.deliver": { description: "Sunreach ihracat sepetini Neva’da sat." } }
  },

  "quest.caravan_first_stamp": {
    actTitle: "Köyler Arası Ticaret", questTitle: "İlk Damga",
    introDialogue: [
      "Açık tahıl manav tezgâhına gider. Bağlı ticaret paketi ise köyün paketleme avlusunda hazırlanır ve varış tezgâhına elden taşınır.",
      "On buğdayı mutfağa değil, Neva’nın paketleme avlusuna götür. Bir paket hazırlayıp önce burada, Neva’da sat. Kısa yol teslimi öğretir; sonra uzun yolun getirdiği fiyat farkına bakarız."
    ],
    completionDialogue: [
      "Tezgâh on avuç açık buğdayı değil, bağlı paketi aldı. Damgası yükün Neva’da hazırlandığını söylüyor.",
      "Şimdi aynı yükü tahıla ihtiyacı olan köye götür. Yol, geçen zaman ve alıcının ambarı fiyatı değiştirecek."
    ],
    objectives: {
      "step.caravan.first_stamp.pack": { description: "Neva Paketleme Avlusu’nda bir buğday paketi hazırla." },
      "step.caravan.first_stamp.sell": { description: "Buğday paketini Neva Ticaret Tezgâhı’na taşıyıp sat." }
    }
  },
  "quest.caravan_first_load": {
    "actTitle": "Köyler Arası Ticaret",
    "questTitle": "Pinewatch’a Ekmeklik Tahıl",
    "introDialogue": [
      "Pinewatch’ta keten, elma ve kereste var. Hiçbiri ekmek olmaz. Rowan fırınlar için Neva tahılı bekliyor.",
      "On buğdayı avlumuzda paketleyip Pinewatch tezgâhında sat. Teklifi Neva’daki satışınla karşılaştır, sonra kereste avlusunda Rowan’la konuş."
    ],
    "completionDialogue": [
      "Buğday fırının listesine girdi. Neva damgası, ilk ekmek pişmeden önce tahılın nereden geldiğini gösteriyor.",
      "Tahıl buraya gelirken bizim ketenle elma da yola çıkabilir. Gel, sonraki yolu göstereyim."
    ],
    "objectives": {
      "step.caravan.struct.trade_neva.pack": {
        "description": "Neva’da bir buğday ticaret paketi hazırla."
      },
      "step.caravan.market.pinewatch.produce.wheat": {
        "description": "Neva buğday paketini Pinewatch Ticaret Tezgâhı’nda sat."
      }
    }
  },
  "quest.caravan_woodland_return": {
    "actTitle": "Köyler Arası Ticaret",
    "questTitle": "Bataklık İçin Keten",
    "introDialogue": [
      "Pinewatch keten ve elma yetiştirir; orman da kereste verir. Reedhaven’da Mara’nın kuru ambarları, bir kütükten çok kumaşa ihtiyaç duyar.",
      "Burada keten paketi hazırla, yükseltilmiş yoldan Reedhaven’a götürüp Mara’nın tezgâhında sat. Bataklığın yollayacağı yüke de yer bırak."
    ],
    "completionDialogue": [
      "Keten şu kuru tahtalarda iyi saklanır. Pinewatch ormanını yerinden oynatmadan tekne erzağını sarabileceğiz.",
      "Bizim mısırla havucun da gidecek yolu var. Highridge yokuş yukarı; virajı da fiyatı da göz önünde tut."
    ],
    "objectives": {
      "step.caravan.struct.trade_pinewatch.pack": {
        "description": "Pinewatch’ta bir keten ticaret paketi hazırla."
      },
      "step.caravan.market.reedhaven.produce.flax": {
        "description": "Pinewatch keten paketini Reedhaven Ticaret Tezgâhı’nda sat."
      }
    }
  },
  "quest.caravan_upland_round": {
    "actTitle": "Köyler Arası Ticaret",
    "questTitle": "Yaylanın Sofrası",
    "introDialogue": [
      "Reedhaven’ın yükseltilmiş tarhlarında mısır ve havuç yetişir. Highridge kök sebze ve atölye malzemesi tutar; alçaktan gelen taze yiyecek ise geçidi aşmak zorundadır.",
      "Avlumuzda bir mısır paketi bağla, Ada’ya kadar çıkar. Yük sağlam varırsa uzun yolun karşılığı da fiyata yansır."
    ],
    "completionDialogue": [
      "Islak topraktan çıkan mısır, burada kuru rafta. Bu köyün verdiği bedelde aştığın mesafenin tadı var.",
      "Biz arpa ve patates yetiştiririz. Neva’ya dönüşte arpa götür; Maeve sana bu yolları bilen tüccar için arabacının ne yaptığını göstersin."
    ],
    "objectives": {
      "step.caravan.struct.trade_reedhaven.pack": {
        "description": "Reedhaven’da bir mısır ticaret paketi hazırla."
      },
      "step.caravan.market.highridge.produce.corn": {
        "description": "Reedhaven mısır paketini Highridge Ticaret Tezgâhı’nda sat."
      }
    }
  },
  "quest.caravan_four_wheels": {
    "actTitle": "Köyler Arası Ticaret",
    "questTitle": "Dört Paketlik Yer",
    "introDialogue": [
      "Highridge arpası yola dayanır. Bir paket Neva’ya indir, sonra meydanın doğusundaki arabacı ahırına bak.",
      "Dört paketlik arabanın kendi atı var. Usta hem parasını hem de yüklü arabayı sürecek kadar Ticaret tecrübesini ister."
    ],
    "completionDialogue": [
      "Dört bölme daha az boş yol demek, her pakete iyi fiyat garantisi değil. Yükleri arkadan yerleştir; yola çıkmadan tezgâhlara bak.",
      "Atıyla araba artık senin. Onu yapan köylerin işine yarayacak bir rota tut."
    ],
    "objectives": {
      "step.caravan.struct.trade_highridge.pack": {
        "description": "Highridge’de bir arpa ticaret paketi hazırla."
      },
      "step.caravan.market.village.produce.barley": {
        "description": "Highridge arpa paketini Neva Ticaret Tezgâhı’nda sat."
      },
      "step.caravan.buy_four": {
        "description": "Arabacıdan dört paketlik yük arabasını satın al."
      }
    }
  },
  "quest.caravan_six_loads": {
    "actTitle": "Köyler Arası Ticaret",
    "questTitle": "Tüccarın Arabası",
    "introDialogue": [
      "Altı bölmeyle aynı seferde birden fazla köye mal taşıyabilirsin. Hepsini tek tezgâha boşaltırsan onun ambarı dolar, sonraki paket daha az eder.",
      "Büyük araba pahalı. Hem Ticaret tecrübeni hem birikimini artır; arabayla yapacağın işe de para ayırarak ahırdan satın al."
    ],
    "completionDialogue": [
      "İkinci araba hazır. Şimdi aynı yola iki çeşit Neva ürünü çıkaralım, iki tezgâhın ne dediğine bakalım."
    ],
    "objectives": {
      "step.caravan.buy_six": {
        "description": "Arabacıdan altı paketlik yük arabasını satın al."
      }
    }
  },
  "quest.caravan_shared_load": {
    actTitle: "Köyler Arası Ticaret", questTitle: "Bir Yol, İki Tezgâh",
    introDialogue: [
      "Neva’da bir buğday paketi hazırla ve altı paketlik arabaya yükle. Ellerin boşalınca bir domates paketi hazırlayıp onu da yanına koy.",
      "Tahılı Pinewatch’a, domatesi Reedhaven’a götür. Tek seferde iki sofraya hizmet edebilirsin; her tezgâhın talebi satıştan sonra değişir."
    ],
    completionDialogue: [
      "Buğday ormana, domates bataklığa vardı. Yol kısalmadı; sen aynı yolu iki kere işe yarar kıldın.",
      "Sonraki yolculuk için biraz yer ve para bırak. Maeve’nin büyük ambar isteyen bir kanal yük defteri var."
    ],
    objectives: {
      "step.caravan.shared_load.wheat": { description: "Neva’da bir buğday ticaret paketi hazırla." },
      "step.caravan.shared_load.load_wheat": { description: "Buğday paketini altı paketlik arabana arkadan yükle." },
      "step.caravan.shared_load.tomato": { description: "Neva’da bir domates ticaret paketi hazırla." },
      "step.caravan.shared_load.load_tomato": { description: "Domates paketini altı paketlik arabana arkadan yükle." },
      "step.caravan.shared_load.sell_wheat": { description: "Neva buğday paketini Pinewatch Ticaret Tezgâhı’nda sat." },
      "step.caravan.shared_load.sell_tomato": { description: "Neva domates paketini Reedhaven Ticaret Tezgâhı’nda sat." }
    }
  },
  "quest.caravan_sunreach_freight": {
    "actTitle": "Köyler Arası Ticaret",
    "questTitle": "Boğazın Ötesine On Paket",
    "introDialogue": [
      "Sunreach’in kuru taraçaları ve tuzlu rüzgârı var ama her fırını doyuracak tahılı yok. Geniş güverteli yük gemisi kanaldan on ayrı paket taşıyabilir.",
      "Paran ve Ticaret tecrüben yettiğinde gemiyi Seabreak yük rıhtımından al. Köy buğdayı paketlerini tek tek yükle, Sunreach’te karaya çıkarıp sat. Tomas koyun teslim defterini tutuyor."
    ],
    "completionDialogue": [
      "Tek defterde on Neva damgası. Tahıl ambarımızda, güverte yeniden boş.",
      "Eskiden bu geçiş ambarı gidişte doldurup dönüşte pek az şey getirirdi. Ayçiçeği çekirdeğiyle zeytin, dolu dönmen için bir sebep."
    ],
    "objectives": {
      "step.caravan.buy_ship": {
        "description": "Seabreak Yük Rıhtımı’ndan Sunreach ticaret gemisini satın al."
      },
      "step.caravan.market.sunreach_cove.produce.wheat": {
        "description": "Sunreach Ticaret Tezgâhı’nda on Neva buğday paketi sat."
      }
    }
  },
  "quest.caravan_island_return": {
    "actTitle": "Köyler Arası Ticaret",
    "questTitle": "Eve Dönen Yük",
    "introDialogue": [
      "Ines taraçalarda ayçiçeği ve zeytin yetiştiriyor. İkisi de burada su ve sabır ister; ana kara boş pazar rafına bakarak bunları üretemez.",
      "Koy avlusunda zeytin paketi hazırla. Neva’ya götürüp elden sat. Ambarın kalanını doldurmadan dönüş tekliflerine bak."
    ],
    "completionDialogue": [
      "Kuru taraçaların zeytini, Neva tahılının yola çıktığı yerde satıldı. Yol ve kanal artık iki yönde de iş görüyor.",
      "Defteri okumaya devam et. İyi rota; havaya, arza ve yolun sonunda bekleyen insana göre değişir."
    ],
    "objectives": {
      "step.caravan.struct.trade_sunreach.pack": {
        "description": "Sunreach’te bir zeytin ticaret paketi hazırla."
      },
      "step.caravan.market.village.produce.olive": {
        "description": "Sunreach zeytin paketini Neva Ticaret Tezgâhı’nda sat."
      }
    }
  },
  "quest.act1_welcome": {
    "actTitle": "1. Bölüm: Ata Çiftliğinin Uyanışı",
    "questTitle": "Kapı Artık Senin",
    "introDialogue": [
      "Kapı senin. Ev de öyle; mirastır bu, köyden parayla satın alınmış değil.",
      "Senin ailen bu tarhlarda ter döktü, burnun ardındaki suları iyi bilirdi. Onların her zaman başladığı yerden başla: bakmazsan kabuk bağlayan topraktan.",
      "Buğday tenekede. Tarla arkamda. Öğleden sonra rüzgârı üst toprağı kurutmadan tohumları toprağa kavuştur."
    ],
    "completionDialogue": [
      "Ellerin titrememiş. Tıpkı onun gibi. Kabuk bağlamadan toprağın altına girdiler."
    ],
    "objectives": {
      "step.act1_welcome_talk": {
        "description": "Bostan kapısında Elspeth ile konuş"
      }
    }
  },
  "quest.act1_sow_wheat": {
    "actTitle": "1. Bölüm: Ata Çiftliğinin Uyanışı",
    "questTitle": "Üç Tohum Toprağa",
    "introDialogue": [
      "Sürülmüş tarha geç. Tohumları çıkar, her seferinde bir temiz yere ek.",
      "Aralarında mesafe bırak. Sıkışık kökler küser; küskün buğday da kimseyi doyurmaz."
    ],
    "completionDialogue": [
      "Toprağa girdiler. Şimdi sen onları ıslatana kadar orada mağrur mağrur otururlar."
    ],
    "objectives": {
      "step.act1_sow_3_wheat": {
        "description": "Ata Çiftliği tarlasına 3 buğday tohumu ek"
      }
    }
  },
  "quest.act1_water_crops": {
    "actTitle": "1. Bölüm: Ata Çiftliğinin Uyanışı",
    "questTitle": "Kabuk Bağlamadan Önce",
    "introDialogue": [
      "Güğüm kapının yanındadır, bıraktıysan oradan al. Susamış olan her birine can suyu ver — gölet yapma, toprağı nemlendir kâfi.",
      "Bu tarh öğleden sonra çabuk kabuk bağlar. Üstü hâlâ koyuyken sula."
    ],
    "completionDialogue": [
      "Koyulaşmayı gördün mü? İşte tarh kana kana içiyor demektir. Senin için ılık tutulmuştu, o yüzden bu başaklar birkaç dakikaya sararır — bütün bir mevsim beklemezsin.",
      "Döndüklerinde orakla biç. Beklerken evin yanındaki kompost teknesine bak; Barnaby buğdayın ne işe yarayacağını sana anlatır."
    ],
    "objectives": {
      "step.act1_water_3_crops": {
        "description": "Ekinlerini 3 kez sula"
      }
    }
  },
  "quest.act2_harvest_and_compost": {
    "actTitle": "2. Bölüm: Tahıldan Yeme",
    "questTitle": "Toprağın Döngüsü",
    "introDialogue": [
      "Selam sana! Ben Barnaby, çiftliğin tamircisiyim. İlk buğdayın fazla bekletmez — başlangıç tarhı pek seridir.",
      "Başaklar altın sarısına dönünce orakla biç, sonra kompost teknesini çalıştır: bitki artıkları ve bir kürek mayalık malzeme koydun mu gerisini solucanlar halleder. Sonra çiftlik evi tezgâhında yanıma gel. Neva'da çiftçilik sadece ekmek için değildir — balık seferlerimizi de böyle donatırız!"
    ],
    "completionDialogue": [
      "İşte birinci sınıf dane! Ağır başaklar ve dolgun taneler. Şimdi bunu deniz azığına dönüştürelim."
    ],
    "objectives": {
      "step.act2_harvest_3_wheat": {
        "description": "3 Buğday hasat et"
      },
      "step.act2_compost_worms": {
        "description": "Bitki artıklarını kompostla ve Yem Solucanı üret"
      }
    }
  },
  "quest.act2_mill_and_craft_chum": {
    "actTitle": "2. Bölüm: Tahıldan Yeme",
    "questTitle": "Öğütme ve Yem Karma",
    "introDialogue": [
      "Açık denizin iri balıklarını yüzeye çekmek için sağlam bir yem harcı (chum) gerekir ki ortalık kırıma uğrasın.",
      "Önce hasat ettiğin buğdayı köy değirmenine götürüp Öğütülmüş Tahıl haline getir.",
      "Sonra o Öğütülmüş Tahıl ile Yem Solucanlarını benim tezgâhıma getir de bir Kova Yem Harcı karalım!"
    ],
    "completionDialogue": [
      "Şu yem kovasına bir bak! Yağlı, mis kokulu ve öğütülmüş tahılla dolu. Kıyıdaki balık sürüleri buna bayılacak."
    ],
    "objectives": {
      "step.act2_mill_grain": {
        "description": "Buğdayı değirmende Öğütülmüş Tahıla çevir"
      },
      "step.act2_craft_chum": {
        "description": "Çiftlik evi tezgâhında Kova Yem Harcı üret"
      }
    }
  },
  "quest.act3_river_angler": {
    "actTitle": "3. Bölüm: Nehrin Fısıltısı",
    "questTitle": "Akıntıları Okumak",
    "introDialogue": [
      "Gümüşsu Nehri çağıldıyor. Oltanı kap ve kıyıya in.",
      "Akıntının derinleştiği, köpüklerin dindiği durgun sulara dikkat et. Alabalıklar orada saklanır.",
      "Misina gerildiğinde acele etme; balığın gücünü tüketmesine izin ver."
    ],
    "completionDialogue": [
      "Güzel bir vuruş ve temiz bir çekiş! Akıntıyı okumayı öğreniyorsun."
    ],
    "objectives": {
      "step.act3_catch_2_river_fish": {
        "description": "Nehirden 2 balık yakala"
      }
    }
  },
  "quest.act3_market_intro": {
    "actTitle": "3. Bölüm: Nehrin Fısıltısı",
    "questTitle": "Köyde Adil Ticaret",
    "introDialogue": [
      "Köyün manav tezgâhı tahılla bostan ürünlerini bekler.",
      "Köprüden geçip meydandaki manava git. Hasadının birazını sat. Av limana gider; tahılla sebzenin yeri köydür."
    ],
    "completionDialogue": [
      "Kesendeki para kendi emeğinin karşılığı. Şimdi daha büyük limanı görmeye hazırsın.",
      "Uzun yollar için Maeve sana paketleme avlularını gösterebilir. Bağlı yük köy tezgâhına elden taşınır; uzak köy ona daha çok ihtiyaç duyabilir."
    ],
    "objectives": {
      "step.act3_sell_item_village": {
        "description": "Köy Pazarında bir ürün sat"
      }
    }
  },
  "quest.act4_harbor_journey": {
    "actTitle": "4. Bölüm: Güneydoğu Limanı",
    "questTitle": "Liman Seferi",
    "introDialogue": [
      "Güneydoğu Limanına hoş geldin! Ben Maeve. Buralarda her şeye okyanus karar verir.",
      "Açık hasadı manava götürebilir, köy avlularında ticaret paketi de hazırlayabilirsin. Yol, başka köyün ihtiyacı olan yükün taşınmasına para verir; mutfak ise yemek içindir.",
      "Balık Pazarı fiyatlarına bir bak: açık deniz tuzlu su balıkları iyi para eder ama unutma: balık çabuk bozulabilen fiziksel bir yüktür!",
      "Ambarında ne kadar uzun durursa tazeliği o kadar düşer. Seferlerini iyi planla ve elini çabuk tut!"
    ],
    "completionDialogue": [
      "Artık pazar dengesini anladın. Yüksek risk, yüksek kazanç; tabii balıkları soğuk getirebilirsen!"
    ],
    "objectives": {
      "step.act4_talk_maeve": {
        "description": "Balık Pazarında Maeve ile konuş"
      }
    }
  },
  "quest.act4_restore_rowboat": {
    "actTitle": "4. Bölüm: Güneydoğu Limanı",
    "questTitle": "Sedir Filikanın Dönüşü",
    "introDialogue": [
      "Ailenin eski ahşap filikası kızakta bağlı. Sedir gövdesi taş gibi ama taze bağlama kaydı ve kürek çatalı yağı lazım.",
      "Bana liman izni için 30 akçe ve çatal yağı için 1 Öğütülmüş Tahıl getir, denize çıkış vizesini vereyim!"
    ],
    "completionDialogue": [
      "Denize açılma izni çıktı! Olta çantana iki Dokuma Sahte Yem iliştirdim. İri bir balığa olta atmadan önce [R] ile yemini tak.",
      "Ahşap kızağa in, [E] tuşuyla bin ve tekneyi körfeze aç."
    ],
    "objectives": {
      "step.act4_restore_rowboat_silas": {
        "description": "Silas'a 30 Akçe ve 1 Öğütülmüş Tahıl teslim et"
      }
    }
  },
  "quest.act5_maiden_voyage": {
    "actTitle": "5. Bölüm: İlk Açılış",
    "questTitle": "Körfezin Çağrısı",
    "introDialogue": [
      "İşte bütün mesele bu. Yem Kovalı ve Dokuma Sahte Yemlerinle filikana bin, sonra açık sulara doğru yol al.",
      "Turlayan martılara ve sudaki kaynaşmaya bak. Sürüye yaklaş, yem harcını atıp balıkları hareketlendir, [R] ile sahte yemi tak ve oltanı savur!",
      "Misina gerginliğini iyi yönet: güvenliyken sar, misina turuncu zorlanmaya girince boşluk bırak ve [A] ile [D] ile ters bas.",
      "Avını ambarına istifle, tazelik düşmeden kıyıya yarış, yük paketini eline alıp Köy Ticaret Merkezine taşı."
    ],
    "completionDialogue": [
      "Muhteşem! Neva'nın ilk büyük döngüsünü kavradın: buğday tohumundan solucana, solucandan yem harcına, yemden göl avına ve elden teslim ticaret paketine!",
      "Sefer Panosu artık aktif. Çiftliğine bakmaya, suları tanımaya ve daha uzun rotalara hazırlanmaya devam et."
    ],
    "objectives": {
      "step.act5_board_rowboat": {
        "description": "Ahşap Filikana bin"
      },
      "step.act5_chum_school": {
        "description": "Göl veya koydaki balık sürüsüne Yem Harcı at"
      },
      "step.act5_hook_sport_fish": {
        "description": "Trofe balığı oltaya tak"
      },
      "step.act5_land_sport_fish": {
        "description": "Mücadele ederek trofe balığı tekneye çek"
      },
      "step.act5_stow_cargo": {
        "description": "Avı tekne ambarına yerleştir"
      },
      "step.act5_dock_rowboat": {
        "description": "Filikanı iskeleye yanaştır"
      },
      "step.act5_sell_fish": {
        "description": "Balık yük paketini Köy Ticaret Merkezinde sat"
      },
      "step.act5_return_to_silas": {
        "description": "Liman İskelesinde Silas'a rapor ver"
      }
    }
  },
  "quest.act6_harbor_promise": {
    "actTitle": "6. Bölüm: Döngüyü Kurmak",
    "questTitle": "Limanın Sözü",
    "introDialogue": [
      "Pano kuru bir fiyat listesinden ibaret değildir. Vaktinden önce dürüstçe bitirebileceğin bir sipariş seç, sonra onu asan pazara teslim et.",
      "Düzenli bir çiftlik teslimatı sağlam iştir. Balık siparişi daha çok kazandırabilir ama su, olta, ambar ve saat hepsi söz sahibidir."
    ],
    "completionDialogue": [
      "Bir söz verdin ve tuttun. Körfez sana böyle güvenmeyi öğrenir işte.",
      "Şu ödemeni al — bir de bu temiz balık artıklarını. Barnaby'nin bunları ata çiftliğinde değerlendirmek için bir fikri var."
    ],
    "objectives": {
      "step.act6_complete_contract": {
        "description": "Panodan bir teslimat sözleşmesi tamamla"
      }
    }
  },
  "quest.act6_field_pump": {
    "actTitle": "6. Bölüm: Döngüyü Kurmak",
    "questTitle": "Tarla Pompası",
    "introDialogue": [
      "Maeve'in ödemesi tarla pompası parçalarına yeter. Onları ata çiftliğindeki kuyuya tak, sonra ekinler su istedikçe pompayı çalıştır.",
      "Senin yerine bir şey büyütmez. Ama tek tek elle sulama zahmetini bütünsel bir tarla kararına çevirir."
    ],
    "completionDialogue": [
      "Şu düzenli tıkırtıyı duyuyor musun? Zaman kazandın, sorumluluğu devretmedin.",
      "Şimdi o balık artıklarını liman temizleme tezgâhına götür. Deniz de toprağı besler, tıpkı tarlanın limanı beslediği gibi."
    ],
    "objectives": {
      "step.act6_install_irrigation": {
        "description": "Ata Çiftliği kuyusuna tarla pompasını monte et"
      },
      "step.act6_irrigate_farm": {
        "description": "Ata Çiftliğini sulamak için tarla pompasını çalıştır"
      }
    }
  },
  "quest.act6_land_sea_cycle": {
    "actTitle": "6. Bölüm: Döngüyü Kurmak",
    "questTitle": "Kara ve Deniz Döngüsü",
    "introDialogue": [
      "Maeve'in balık artıklarını liman tezgâhında gübreye dönüştür. Sonra eve taşıyıp ata tarlasına yedir.",
      "Bir zanaatın artığı, diğerinin hazırlığı olur. Neva Körfezi'nin sessiz çarkı böyle döner."
    ],
    "completionDialogue": [
      "İşte bu: tarladan yeme, yemden balığa, balıktan tekrar tarlaya. Artık körfezin döngüsünü sadece izlemiyorsun — onu bizzat işletiyorsun.",
      "Yöntemi günlüğüne yazdım. Toprak bir mevsime daha ihtiyaç duyduğunda kullanırsın.",
      "Silas da iskelede seni soruyordu. Boğazla ve motorlu bir tekneyle ilgili bir şeyler geveliyordu."
    ],
    "objectives": {
      "step.act6_craft_fertilizer": {
        "description": "Liman Balık Masasında balık artıklarından gübre üret"
      },
      "step.act6_fertilize_farm": {
        "description": "Ata Çiftliği toprağını gübrele"
      }
    }
  },
  "quest.act7_open_channel": {
    "actTitle": "7. Bölüm: Boğazın Ötesi",
    "questTitle": "Açık Boğaz",
    "introDialogue": [
      "Şamandıraların içine yanaşıp iskeleye çık. Kuru taşa ayak basana kadar her şey bekleyebilir."
    ],
    "completionDialogue": [
      "Kendi omurganın üzerinde geldin. Filikalar şamandıralarda geri döner; o dalgayı çoğu insan bir kez dener.",
      "Sunreach'e hoş geldin — sıcak taşlar, kuru sekiler ve emeği ödüllendiren bir resif. İnes yukarımızdaki taraçalara bakar. Kuru toprakta elinden ne geleceğini merak edecektir."
    ],
    "heraldLines": [
      "Sunreach açık boğazın karşısında yer alır ve bir sandal o dalgalarda hattını koruyamaz. Liman bağlama yerindeki Sedir Balıkçı Filikasını edinmelisin.",
      "850 altına mal olur ve komisyoncu elinde Uzman oltası olmayan birine açık su teknesi satmaz. Bunu kimse sana hediye etmez. Sularımda mevsiminde balık tut, Maeve'in siparişlerini yerine getir, gerisini geçen saatler halleder.",
      "Tekne senin olunca şamandıraları doğuya, korunaklı koya doğru takip et ve bağlama yerine yanaş. Tomas o koya bakar; seni bekliyor olacak."
    ],
    "objectives": {
      "step.act7_own_skiff": {
        "description": "Sedir Balıkçı Filikasına sahip ol"
      },
      "step.act7_board_skiff": {
        "description": "Sedir Balıkçı Filikasına bin"
      },
      "step.act7_dock_sunreach": {
        "description": "Boğazı geç ve Sunreach Koyuna yanaş"
      },
      "step.act7_meet_tomas": {
        "description": "Koy pazarında Tomas ile konuş"
      }
    }
  },
  "quest.act7_terraces_for_the_sun": {
    "actTitle": "7. Bölüm: Boğazın Ötesi",
    "questTitle": "Güneş Taraçaları",
    "introDialogue": [
      "Bu taraçalar sıcağı tutar ama suyu çabuk salar. Üç ayçiçeği ek, özenle sula ve bir başak hasat et."
    ],
    "completionDialogue": [
      "Taraçalar sesine karşılık verdi. Sunreach aşırı su değil, özenli dikkat ister."
    ],
    "objectives": {
      "step.act7_meet_ines": {
        "description": "Taraçalarda İnes ile tanış"
      },
      "step.act7_plant_sunflowers": {
        "description": "Taraçalara 3 Ayçiçeği ek"
      },
      "step.act7_water_sunflowers": {
        "description": "3 Ayçiçeğini sula"
      },
      "step.act7_harvest_sunflower": {
        "description": "Olgun bir Ayçiçeği hasat et"
      }
    }
  },
  "quest.act7_seed_for_the_sea": {
    "actTitle": "7. Bölüm: Boğazın Ötesi",
    "questTitle": "Deniz İçin Tohum",
    "introDialogue": [
      "Ayçiçeği tablası bir sonraki mahsulden fazlasını taşır. Çekirdeklerini öğütüp tahıla çevir, sonra o unu koy tezgâhında yem harcına kar."
    ],
    "completionDialogue": [
      "Tarla emeği resif hazırlığına dönüştü. Sunreach yolu böyledir."
    ],
    "objectives": {
      "step.act7_mill_sunflower": {
        "description": "Ayçiçeği Çekirdeğini Öğütülmüş Tahıla çevir"
      },
      "step.act7_craft_sunreach_chum": {
        "description": "Sunreach Tezgâhında Yem Harcı üret"
      }
    }
  },
  "quest.act7_reef_answer": {
    "actTitle": "7. Bölüm: Boğazın Ötesi",
    "questTitle": "Resifin Cevabı",
    "introDialogue": [
      "Burada hazırladığın yem harcını alıp şamandıraların ardındaki resif eşiğine git.",
      "Sürüye yem serp, oltanı hazırla ve bir Altın Çipura avla. Onu ambarına alıp köye geri götür."
    ],
    "completionDialogue": [
      "Altın Çipura, pırıl pırıl ve soğuk. Küçük bir yerin kendi kendine yetmesi işte böyle olur: büyüyerek değil, birbirine kenetlenerek."
    ],
    "objectives": {
      "step.act7_chum_sunreach": {
        "description": "Sunreach resif eşiğindeki sürüye Yem Harcı serp"
      },
      "step.act7_land_bream": {
        "description": "Sunreach sularında bir Altın Çipura avla"
      },
      "step.act7_stow_bream": {
        "description": "Teknenin güvertesinden Çipurayı ambarına al"
      },
      "step.act7_sell_bream": {
        "description": "Çipura paketini alıp Köy Ticaret Merkezinde sat"
      }
    }
  },
  "quest.act7_land_sea_cycle": {
    "actTitle": "7. Bölüm: Boğazın Ötesi",
    "questTitle": "Sunreach'te Döngü",
    "introDialogue": [
      "Balık tezgâhına iki koy sardalyası getir. Onları temizleyip artık çıkar, üç tanesini gübreye sık ve besini taraça toprağına geri ver."
    ],
    "completionDialogue": [
      "Şimdi koy taraçayı besliyor, taraça da bir sonraki seferi hazırlıyor. Sunreach'i tek bir yaşayan rota olarak kavradın."
    ],
    "objectives": {
      "step.act7_catch_sardine": {
        "description": "Koyda iki Sunreach Sardalyası yakala"
      },
      "step.act7_press_fertilizer": {
        "description": "Sardalyaları temizle, sonra artıklardan Gübre yap"
      },
      "step.act7_fertilize_terraces": {
        "description": "Sunreach Taraçalarını gübrele"
      },
      "step.act7_report_ines": {
        "description": "İnes'e gidip sonucu bildir"
      }
    }
  },
  "quest.tides_home_water": {
    "actTitle": "Suları Okumak",
    "questTitle": "Başladığın Sular",
    "introDialogue": [
      "Silas Amca sana kadim balıkçılık takvimini açtı.",
      "İlk olarak başladığın suları tanı: nehirde sazan ve alabalık, gölde ise turna ve arowana yatar. Hepsini kendi vaktinde avla."
    ],
    "completionDialogue": [
      "Ev sularını ezberledin evlat. Artık gözün kapalı nerede neyin yüzdüğünü bilirsin."
    ],
    "objectives": {
      "step.tides_chum_river": {
        "description": "Nehirdeki bir balık sürüsüne Yem Harcı serp"
      },
      "step.tides_hook_river": {
        "description": "Nehirde bir Dere Alabalığı yakala"
      },
      "step.tides_land_river": {
        "description": "Alabalığı karaya çek"
      }
    }
  },
  "quest.tides_deep_channel": {
    "actTitle": "Suları Okumak",
    "questTitle": "Derin Kanal",
    "introDialogue": [
      "Adalar arasındaki kanal rüzgâr aldığında suyun rengi kurşunileşir.",
      "O derinliklerde kılıçbalığı ve ton balığı kol gezer. Makaranı sıkı tut."
    ],
    "completionDialogue": [
      "Kanalın akıntısına karşı galebe çaldın. Olta tutuşun sağlamlaşmış."
    ],
    "objectives": {
      "step.tides_land_catfish": {
        "description": "Bir Kanal Yayınbalığı avla"
      }
    }
  },
  "quest.tides_cold_teeth": {
    "actTitle": "Suları Okumak",
    "questTitle": "Soğuk Suyun Dişleri",
    "introDialogue": [
      "Kış gelip de su buz kestiğinde gölün derinliklerinde avcılar uyanır.",
      "Buz gibi suda turna yakalamak sabır işidir. Oltanın ucundaki en ufak kıpırtıyı hisset."
    ],
    "completionDialogue": [
      "Kış ayazında parlayan o pullar ustalığının nişanesidir."
    ],
    "objectives": {
      "step.tides_land_pike": {
        "description": "Gölden bir Turna Balığı avla"
      }
    }
  },
  "quest.tides_summer_gold": {
    "actTitle": "Suları Okumak",
    "questTitle": "Yaz Altını",
    "introDialogue": [
      "Yaz sıcağında göl sazlıklarının dibinde altın arowanalar parıldar.",
      "Güneş tepedeyken vururlar. Sessizce yaklaş ve yemi tam önüne düşür."
    ],
    "completionDialogue": [
      "Gerçek bir altın parıltısı! Bu balık gölün tacıdır."
    ],
    "objectives": {
      "step.tides_land_arowana": {
        "description": "Bir Altın Arowana avla"
      }
    }
  },
  "quest.tides_old_coast": {
    "actTitle": "Suları Okumak",
    "questTitle": "Kadim Kıyı",
    "introDialogue": [
      "Fener kayalıklarının altındaki dalgalı kıyıda mersin balıkları dipte beslenir.",
      "Ağır kurşun ve sağlam misina gerekir; taşlara takılmadan çekmeyi bilmelisin."
    ],
    "completionDialogue": [
      "O kadim balığı karaya aldın ya, helal olsun. Kıyının hakkını verdin."
    ],
    "objectives": {
      "step.tides_land_sturgeon": {
        "description": "Kıyıdan bir Mersin Balığı avla"
      },
      "step.tides_sell_sturgeon": {
        "description": "Mersin Balığı paketini alıp Köy Ticaret Merkezinde sat"
      }
    }
  },
  "quest.tides_every_water": {
    "actTitle": "Suları Okumak",
    "questTitle": "Haritadaki Her Su",
    "introDialogue": [
      "Artık Neva haritasındaki bütün su yatakları senin av sahan haline geldi.",
      "Nehir, göl, kıyı ve açık deniz... Her birinden birer trofe av getirerek ustalığını mühürle."
    ],
    "completionDialogue": [
      "Haritanın her damla suyunu hafızana kazıdın. Artık sana öğretebileceğim tek şey kendi sezgilerindir."
    ],
    "objectives": {
      "step.tides_sweep_river": {
        "description": "Nehirdeki bir sürüye olta at"
      },
      "step.tides_sweep_lake": {
        "description": "Göldeki bir sürüye olta at"
      },
      "step.tides_sweep_coast": {
        "description": "Kıyıdaki bir sürüye olta at"
      },
      "step.tides_report_silas": {
        "description": "Koca Silas'a dönüp rapor ver"
      }
    }
  },
  "quest.tides_blue_marlin": {
    "actTitle": "Gelgitler & Derin Sular",
    "questTitle": "Mavi Kral",
    "introDialogue": [
      "Bir şey daha var, ama sadece istersen. Sahanlığın ardında senin ne kadar usta olduğuna hiç aldırmayan bir balık yatar.",
      "Bir mavi marlin. Yazın veya sonbaharda, ilk ışıkta, elinde Usta oltasıyla. Onu yakaladığında bu dövüş sana diğer bütün derslerin ne için olduğunu öğretir.",
      "Taşıyamayacaksan sakın tekneye alma. O boyda bir balık, yeri olmayan tekneyi rezil eder."
    ],
    "completionDialogue": [
      "Kendi oltanda gümüş bir kral. Ömrümde dört tane gördüm, güverteye birini bile çekemedim.",
      "Sana öğretecek başka bir şeyim kalmadı. Git ve diğer balıkçıların akıl danıştığı kişi sen ol."
    ],
    "objectives": {
      "step.tides_land_blue_marlin": {
        "description": "Sahanlığın ötesinde bir Mavi Marlin avla"
      }
    }
  },
  "quest.homestead_seed_pouch": {
    "actTitle": "Koy Ortaklığı",
    "questTitle": "Ailenin Anahtarı",
    "introDialogue": [
      "Elspeth sana eski, yağlı kumaştan dikilmiş bir tohum kesesi uzatıyor.",
      "Bu kese ailenden kaldı. Her sonbaharda en verimli başakların taneleri buraya ayrılırdı. Gelecek sezona inanmanın simgesidir bu."
    ],
    "completionDialogue": [
      "Kese yeniden dolmaya başladı. Ailenin mirası emin ellerde."
    ],
    "objectives": {
      "step.homestead_take_pouch": {
        "description": "Elspeth'ten tohum kesesini teslim al"
      }
    }
  },
  "quest.homestead_overgrown_rows": {
    "actTitle": "Koy Ortaklığı",
    "questTitle": "Herkes İçin Bir Karık",
    "introDialogue": [
      "Köyün ortak tarhları ot bürümüş durumda. Tek başına kimse el atmaya cesaret edememişti.",
      "Aletlerini kap ve yabani otları temizle. Komşularınla birlikte ekeceğiniz alanları aç."
    ],
    "completionDialogue": [
      "Tarhlar yeniden nefes alıyor. Köy ahalisi şimdiden tohumlarını getirmeye başladı bile."
    ],
    "objectives": {
      "step.homestead_plant_wheat": {
        "description": "Köy Ortak Arazisine 3 Buğday ek"
      },
      "step.homestead_water_wheat": {
        "description": "Ortak arazideki sıraları sula"
      }
    }
  },
  "quest.homestead_first_crop": {
    "actTitle": "Koy Ortaklığı",
    "questTitle": "Hakkaniyetli Pay",
    "introDialogue": [
      "Ortak tarlaya ekilen ilk buğdaylar boy verdi.",
      "Hasadı kaldır ve köy ambarına teslim et. Herkesin sofrasına bir somun sıcak ekmek düşsün."
    ],
    "completionDialogue": [
      "Fırından yayılan o taze ekmek kokusu bütün koya yayıldı. Bu senin sayende oldu."
    ],
    "objectives": {
      "step.homestead_harvest_wheat": {
        "description": "Köy Ortak Arazisinden 3 Buğday hasat et"
      },
      "step.homestead_sell_wheat": {
        "description": "Köy Mahsul Pazarında Buğday sat"
      }
    }
  },
  "quest.homestead_worn_tools": {
    "actTitle": "Koy Ortaklığı",
    "questTitle": "Bizden Uzun Yaşayan Aletler",
    "introDialogue": [
      "Bir ara köy değirmeninin koluna bak. Yalnızca bir yanı aşınmış, üstelik senin yüzünden değil.",
      "Ortak arazideki buğdaydan biraz orada öğüt. Aynı taş koydaki her aileye hizmet eder. Mirasın işe yarayan tarafı budur: bir sonraki çift ele hazır tutulan bir alet."
    ],
    "completionDialogue": [
      "Bu koydaki her alet, onu kullanan ellerin kaydıdır. Artık o kolda seninkiler de var.",
      "Bu elma fidanını ortak arazi için al. Nereye ait olduğunu Elspeth söyleyecek."
    ],
    "objectives": {
      "step.homestead_mill_grain": {
        "description": "Köy değirmeninde Buğdayı Öğütülmüş Tahıla çevir"
      }
    }
  },
  "quest.homestead_orchard": {
    "actTitle": "Koy Ortaklığı",
    "questTitle": "Gelecek Mevsim İçin Gölge",
    "introDialogue": [
      "Tepenin yamacına elma fidanları dikme vakti.",
      "Bir ağaç dikmek, belki de gölgesinde hiç oturamayacağını bildiğin halde geleceğe hediye bırakmaktır. Can suyunu ver."
    ],
    "completionDialogue": [
      "Fidanlar rüzgârda salınıyor. Yıllar sonra burada oynayacak çocuklar senin diktiğin elmaları toplayacak."
    ],
    "objectives": {
      "step.homestead_plant_orchard": {
        "description": "Köy Ortak Arazisine bir Elma Ağacı dik"
      },
      "step.homestead_harvest_apple": {
        "description": "Ortak araziden ilk elmayı hasat et"
      },
      "step.homestead_report_elspeth": {
        "description": "İlk elmayı Elspeth'e götür"
      }
    }
  },
  "quest.tradelanes_volume": {
    "actTitle": "Kargo ve İtibar",
    "questTitle": "Bir Siparişin Ağırlığı",
    "introDialogue": [
      "Maeve tezgâhın arkasından gülümsüyor: 'Ufak tefek işleri geçtik artık.'",
      "Büyük bir toptan teslimat siparişi al. Ambarını ağzına kadar doldur ve tek seferde teslim et."
    ],
    "completionDialogue": [
      "Kargo eksiksiz teslim edildi. İtibarın pazarda sağlamlaşıyor."
    ],
    "objectives": {
      "step.tradelanes_bulk": {
        "description": "Herhangi bir toplu siparişi tamamla"
      }
    }
  },
  "quest.tradelanes_freshness": {
    "actTitle": "Kargo ve İtibar",
    "questTitle": "Ambarda İşleyen Saat",
    "introDialogue": [
      "Denizden çıkan balık güneşte beklemez. Buz kalıplarını hazırla.",
      "Avı tuttuğun andan Maeve'in tezgâhına koyduğun ana kadar saat senin aleyhine işler. Kusursuz tazelikte teslim et."
    ],
    "completionDialogue": [
      "Pulları hâlâ parıldıyor, gözleri cam gibi! İşte buna hakiki tazelik denir."
    ],
    "objectives": {
      "step.tradelanes_fresh": {
        "description": "Herhangi bir taze balık siparişini tazelik sınırında teslim et"
      }
    }
  },
  "quest.tradelanes_grade": {
    "actTitle": "Kargo ve İtibar",
    "questTitle": "Kıymetini Bilen Alıcı",
    "introDialogue": [
      "Bazı alıcılar sıradan balık istemez; kusursuz işçilik ve nadir kalite ararlar.",
      "Panodaki 'Üst Kalite' talebini karşıla. Her balıkçı bunu başaramaz."
    ],
    "completionDialogue": [
      "Alıcı hayran kaldı. Pazarda adın birinci sınıf tedarikçi olarak anılıyor."
    ],
    "objectives": {
      "step.tradelanes_quality": {
        "description": "Herhangi bir kalite hedefli siparişi tamamla"
      }
    }
  },
  "quest.tradelanes_crossing": {
    "actTitle": "Kargo ve İtibar",
    "questTitle": "Uzun Yoldan Dolaşmak",
    "introDialogue": [
      "Güneşeri Adası ile Neva Limanı arasındaki mesafe tekneler için çetin bir sınavdır.",
      "Adadan aldığın özel kargoyu bozulmadan ana karaya ulaştır. Rüzgârı iyi hesapla."
    ],
    "completionDialogue": [
      "Kanalı kargoyla aştın! Bu iki kıyı arasında düzenli ticaretin kapısını araladı."
    ],
    "heraldLines": [
      "There is a fourth kind of promise, and Tomas tells it better than I do. It is his island's whole trade.",
      "Take the skiff across and find him at the cove. And look at the board on your way: some of those orders only make sense on the far side of the channel."
    ],
    "objectives": {
      "step.tradelanes_dock_cove": {
        "description": "Sunreach Koyuna yanaş"
      },
      "step.tradelanes_cross_order": {
        "description": "Malları boğazı aşan bir siparişi yerine getir"
      }
    }
  },
  "quest.tradelanes_ledger": {
    "actTitle": "Kargo ve İtibar",
    "questTitle": "Kargo ve İtibar",
    "introDialogue": [
      "Maeve ticaret defterini önüne koyuyor: 'Girdiğin her risk, teslim ettiğin her söz buraya yazıldı.'",
      "Koyun en güvenilir deniz tüccarı olduğunu kanıtlamak için son bir büyük sevkiyatı tamamla."
    ],
    "completionDialogue": [
      "Defterdeki mühür tamamlandı. Artık Neva tüccarları senin adını saygıyla anıyor."
    ],
    "objectives": {
      "step.tradelanes_report_maeve": {
        "description": "Balık Pazarında Maeve'e rapor ver"
      }
    }
  },
  "quest.tradelanes_pinewatch": {
    "actTitle": "Kargo ve İtibar",
    "questTitle": "Orman Seferi",
    "introDialogue": [
      "Çamgözü Ormanı'ndaki keresteciler un ve taze yiyeceğe muhtaç.",
      "Köyden un çuvallarını yükle ve orman ticaret avlusundaki Rowan'a götür. Dönüşte kereste almayı unutma."
    ],
    "completionDialogue": [
      "Rowan çuvalları indirdi: 'Fırınımız nihayet tütmeye başlayacak.' Güzel bir sefer oldu."
    ],
    "heraldLines": [
      "There are more kitchens round this cove than ours. Rowan in Pinewatch has timber to send back and grain to buy.",
      "Take the woodland road, or find the landing across the cove. The useful route is the one you can return along with a load."
    ],
    "objectives": {
      "step.tradelanes_meet_rowan": {
        "description": "Pinewatch'ta Rowan ile buluş"
      },
      "step.tradelanes_pinewatch_wheat": {
        "description": "Pinewatch'ta 8 Buğday sat"
      }
    }
  },
  "quest.tradelanes_reedhaven": {
    "actTitle": "Kargo ve İtibar",
    "questTitle": "Sazlıkların Koyu Bulduğu Yer",
    "introDialogue": [
      "Sazlıkköy bataklık köyü taze tahıl ve meyve bekliyor.",
      "Yükseltilmiş yolları takip ederek Mara'nın takas tezgâhına ulaş. Bataklığın ihtiyacını karşıla."
    ],
    "completionDialogue": [
      "Mara tezgâhın başında teşekkür ediyor: 'Bataklığa hayat getirdin.' Dönüş için taze yemlerin hazır."
    ],
    "heraldLines": [
      "Follow the coast road south to Reedhaven. Mara keeps bait and ice at the exchange, and she buys a catch carried to her counter."
    ],
    "objectives": {
      "step.tradelanes_meet_mara": {
        "description": "Reedhaven'da Mara ile buluş"
      },
      "step.tradelanes_reedhaven_pack": {
        "description": "Reedhaven'a taze balık paketi taşı ve sat"
      }
    }
  },
  "quest.tradelanes_highridge": {
    "actTitle": "Kargo ve İtibar",
    "questTitle": "Koyun Üstünde Akşam Yemeği",
    "introDialogue": [
      "Yüksektepe yaylasında kök sebzeler boldur ama taze deniz balığı oraya zor ulaşır.",
      "Buzlu sandıklarla taze balığı geçitten yukarı, Ada'nın dükkânına taşı. Yavaş ve dikkatli sür."
    ],
    "completionDialogue": [
      "Ada sandıkları açınca gülümsedi: 'Ahali bu akşam hakiki bir ziyafet çekecek.' Yolu hakkıyla aştın."
    ],
    "heraldLines": [
      "Ada at Highridge buys for the mountain kitchens. There is no landing up there; keep to the pass road with your load."
    ],
    "objectives": {
      "step.tradelanes_meet_ada": {
        "description": "Highridge'de Ada ile buluş"
      },
      "step.tradelanes_highridge_packs": {
        "description": "Highridge'de elden taşınan 2 balık paketi sat"
      }
    }
  },
  "quest.act8_dry_season": {
    "actTitle": "8. Bölüm: Kurak Sezon",
    "questTitle": "Taraçaların İçtiği Su",
    "introDialogue": [
      "Yaz sıcağı adayı kavuruyor, sarnıçlar dip yapmaya başladı.",
      "Ines'in taraçalarına ana karadan getirdiğin tulumba sistemini bağla. Derin kuyudan su çekip taraçaları kurtar."
    ],
    "completionDialogue": [
      "Gürül gürül akan suyla taraçalar yeniden can buldu. Kuraklığa boyun eğmedik."
    ],
    "objectives": {
      "step.act8_plant_terrace": {
        "description": "Sunreach taraçalarına 2 Ayçiçeği ek"
      },
      "step.act8_irrigate_terrace": {
        "description": "Kuyudan sarnıcı çalıştırarak taraçaları sula"
      }
    }
  },
  "quest.act8_southern_shelf": {
    "actTitle": "8. Bölüm: Derin Rotalar",
    "questTitle": "Güney Resif Sahanlığı",
    "introDialogue": [
      "Çalılıkların güneyinde resif sahanlığı epeyce açığa uzanır ve oraya kimse gitmez. Bereketli olmadığından değil — vaktinde satabileceğin herhangi bir yere çok uzak olduğundan.",
      "Tekneni çevirip oradan bir Sarıkuyruk İstavrit getir. Vinç gibi çekerler, o yüzden Ağır Av takımı veya daha iyisi lazım; koy tezgâhında tam buna göre bir olta var.",
      "Şimdilik saate aldırma. Önce orada ne olduğunu kendi gözünle görmeni istiyorum."
    ],
    "completionDialogue": [
      "Artık gördün işte. Biz koy duvarından sardalya satarken o su hep doluydu."
    ],
    "objectives": {
      "step.act8_land_amberjack": {
        "description": "Sunreach sularında bir Sarıkuyruk İstavrit avla"
      }
    }
  },
  "quest.act8_salt_and_shade": {
    "actTitle": "8. Bölüm: Kurak Sezon",
    "questTitle": "Tuz ve Gölge",
    "introDialogue": [
      "Güneşeri'nin güneşi yakıcı, rüzgârı kurudur. Bu bir kusur değil, nimettir.",
      "Tuttuğun balıkları ada tuzuyla salamura et ve gölgelikte kurut. Zamana meydan okuyan kurutulmuş balık hazırla."
    ],
    "completionDialogue": [
      "Sertleşen ve mis gibi tuz kokan bu balıklar aylarca bozulmaz. Saati durdurdun."
    ],
    "objectives": {
      "step.act8_catch_sardines": {
        "description": "2 Sunreach Sardalyası yakala"
      },
      "step.act8_cure_sardines": {
        "description": "Sunreach balık masasında sardalyaları tuzla"
      }
    }
  },
  "quest.act8_route_worth_keeping": {
    "actTitle": "8. Bölüm: Kurak Sezon",
    "questTitle": "Korumaya Değer Bir Rota",
    "introDialogue": [
      "Kurutulmuş balıklar artık uzun kanal geçişinde bozulma riski taşımıyor.",
      "Bu kargoyu Neva Limanı'na taşı ve Maeve'e sun. İki kıyı arasındaki kalıcı köprüyü kur."
    ],
    "completionDialogue": [
      "Maeve hayretle inceledi: 'Bunu başardın demek... Artık mesafe bir engel değil.'"
    ],
    "objectives": {
      "step.act8_sell_cured": {
        "description": "Köy Sebze Pazarında Tuzlu Balık sat"
      }
    }
  },
  "quest.act8_dry_season_end": {
    "actTitle": "8. Bölüm: Kurak Sezon",
    "questTitle": "Kurak Sezonun Sonu",
    "introDialogue": [
      "İlk yağmur bulutları dağların ardında belirdi. Kurak sezonu geride bıraktık.",
      "Ines ve Tomas ile koyun meydanında buluş. Ada bu sınavı senin sayende atlattı."
    ],
    "completionDialogue": [
      "Yağmur damlaları toprağa düşerken herkesin yüzünde bir tebessüm var. Birlikte başardınız."
    ],
    "objectives": {
      "step.act8_report_ines": {
        "description": "Taraçalarda İnes'e rapor ver"
      }
    }
  },
  "quest.act9_beyond_the_grounds": {
    "actTitle": "9. Bölüm: Berat",
    "questTitle": "Av Sahalarının Ötesinde",
    "introDialogue": [
      "Kıyı şeridi ve adalar artık bildiğin yurt oldu. Silas sana haritanın en dış halkasını işaret ediyor.",
      "Sisli günlerde fenerin ışığının bittiği o derin sulara açılma vakti."
    ],
    "completionDialogue": [
      "Ufuk çizgisi artık sana korkutucu gelmiyor. O suların da dilini çözdün."
    ],
    "heraldLines": [
      "One more thing before you sail. Silas sent word across with the morning boat: he wants you at the harbor pier.",
      "He says you are still fishing deep water with shore tackle, and that Maeve has an offshore rod on her rack."
    ],
    "objectives": {
      "step.act9_buy_offshore_rod": {
        "description": "Liman balık tezgâhından Açık Deniz Oltası satın al"
      }
    }
  },
  "quest.act9_deep_trench": {
    "actTitle": "9. Bölüm: Berat",
    "questTitle": "Derin Çukur",
    "introDialogue": [
      "Okyanus tabanının aniden uçuruma dönüştüğü derin çukura ulaştın.",
      "Burada deniz canavarı gibi koca kılıçbalıkları ve tonlar yüzer. Bütün ustalığını ortaya koy."
    ],
    "completionDialogue": [
      "Muazzam bir mücadeleydi! Böylesine zorlu bir avı karaya çıkarmak her babayiğidin harcı değil."
    ],
    "objectives": {
      "step.act9_land_swordfish": {
        "description": "Derin çukurdan bir Kılıçbalığı avla"
      },
      "step.act9_sell_swordfish": {
        "description": "Kılıçbalığı paketini alıp Köy Ticaret Merkezinde sat"
      }
    }
  },
  "quest.act9_standing_arrangement": {
    "actTitle": "9. Bölüm: Berat",
    "questTitle": "Sürekli Bir Anlaşma",
    "introDialogue": [
      "Liman loncası ve köy konseyi senin başarılarını görüyor.",
      "Sürekli bir tedarik hattı kurmak için son büyük siparişleri tamamla ve masadaki yerini hazırla."
    ],
    "completionDialogue": [
      "Bütün şartlar yerine getirildi. Artık sadece bir kaptan değil, kıyının direğisin."
    ],
    "objectives": {
      "step.act9_quality_order": {
        "description": "Kalite hedefli bir siparişi tamamla"
      },
      "step.act9_bulk_order": {
        "description": "Toplu bir siparişi tamamla"
      }
    }
  },
  "quest.act9_the_charter": {
    "actTitle": "9. Bölüm: Berat",
    "questTitle": "Denizcilik Beratı",
    "introDialogue": [
      "Silas, Maeve, Elspeth ve Barnaby masanın başında toplandı.",
      "Neva Denizcilik Beratı önüne serildi. Bu kâğıt sana sadece haklar vermez; bu kıyıyı koruma ve geri dönme sözü ister. İmzanı at."
    ],
    "completionDialogue": [
      "Mühür basıldı, berat imzalandı! Artık Neva'nın tescilli kaptanı ve koruyucususun."
    ],
    "objectives": {
      "step.act9_sign_charter": {
        "description": "Maeve ile lonca beratını imzala"
      }
    }
  },
  "quest.act10_open_horizons": {
    "actTitle": "10. Bölüm: Ufkun Ötesi",
    "questTitle": "Açık Ufuklar",
    "introDialogue": [
      "O beratı alıp gitmeden önce benim için bir şey daha yap; bu bir vazife değil.",
      "Etrafı bir dolaş. Silas, Maeve, Barnaby. İçinden ne geliyorsa onu söyle. Sonra dön ve gerçekten başardıktan sonra neyi miras aldığını bana anlat."
    ],
    "completionDialogue": [
      "Toprak, bir tekne, bir rota ve üç tezgâhta bir isim. Sana geldiğinde hiçbiri bitmiş değildi, sen devrederken de hiçbiri bitmiş olmayacak.",
      "Bütün mesele budur ve bu kadarı yeter. Hadi git ve ufkun ne işe yaradığını kendin gör."
    ],
    "heraldLines": [
      "One more thing, and it is not mine to ask. Elspeth sent word down from the garden: before you take that charter anywhere, she wants you to go round.",
      "Silas first, then back by me, then Barnaby at his bench. Finish with her at the garden gate. It is not work. Humour an old baker."
    ],
    "objectives": {
      "step.act10_silas": {
        "description": "İskelede Koca Silas ile konuş"
      },
      "step.act10_maeve": {
        "description": "Balık Pazarında Maeve ile konuş"
      },
      "step.act10_barnaby": {
        "description": "Çiftlik evi tezgâhında Barnaby ile konuş"
      },
      "step.act10_elspeth": {
        "description": "Bostan kapısında Elspeth'in yanına dön"
      }
    }
  }
};
