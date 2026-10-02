// src/i18n/locales/tr/quests.ts

import type { LocalizedQuestText } from "../../types";

export const TR_QUESTS: Record<string, LocalizedQuestText> = {
  "quest.tradecraft_materials": {
    actTitle: "İşini Bilen Tüccar", questTitle: "Bir Yükün Maliyeti",
    introDialogue: [
      "Pinewatch’a Öğütülmüş Tahıl Çuvalları lazım. Tahılı Neva’da öğüt ya da satın al; keteni Pinewatch’tan alabilir veya dokuyabilirsin. Buğdayla birlikte bizim paketleme avlusuna getir.",
      "Paketleme ücretini vermeden kazanca bak. Kendi tarlanın ürünü de yerine yenisini koyma bedeliyle hesaplanır. Sonra çuvalları Pinewatch’a taşı."
    ],
    completionDialogue: [
      "Pinewatch tahılını aldı. Ödemeden sonraki partinin ketenini ve paketleme ücretini ayır; buğdayı kendin yetiştirince bu masraflar kaybolmuyor."
    ],
    objectives: { "step.tradecraft.materials.make": { description: "Neva tezgâhında öğütülmüş tahıl çuvalları hazırla." }, "step.tradecraft.materials.deliver": { description: "Tahıl çuvallarını Pinewatch’ta sat." } }
  },
  "quest.tradecraft_return_goods": {
    actTitle: "İşini Bilen Tüccar", questTitle: "İki Yönde de Dolu Yük",
    introDialogue: [
      "Reedhaven’daki onarım işleri için Atölye Metal Kasası lazım. Çelikle bakırı Highridge’den, keresteyi Pinewatch’tan al. Highridge avlusunda paketleyip Reedhaven’a teslim et."
    ],
    completionDialogue: [
      "İskelenin onarımında işe yarar. Metal yolda dayanır ama aynısından bir kasa daha yapmadan talebe bak."
    ],
    objectives: { "step.tradecraft.return_goods.make": { description: "Highridge’de bir atölye metal kasası hazırla." }, "step.tradecraft.return_goods.deliver": { description: "Metal kasasını Reedhaven’da sat." } }
  },
  "quest.tradecraft_premium": {
    actTitle: "İşini Bilen Tüccar", questTitle: "Yük Yerinin Değeri",
    introDialogue: [
      "Highridge’e Nehir Seferi Malzemeleri lazım. Reedhaven’dan yoğun yem harcıyla sahte yem, Pinewatch’tan muşambayla kereste al. Sazlıktaki avluda paketle.",
      "Bu yük daha çok tecrübe ve peşin masraf ister. Başlamadan şartlara ve kazanca bak, sonra Highridge’e taşı."
    ],
    completionDialogue: [
      "Bir bölmede bütün sefer malzemelerini tepeye çıkardın. Sonraki yükü planlarken hazırlık masrafını unutma."
    ],
    objectives: { "step.tradecraft.premium.make": { description: "Reedhaven’da nehir seferi malzemeleri hazırla." }, "step.tradecraft.premium.deliver": { description: "Sefer malzemelerini Highridge’de sat." } }
  },
  "quest.tradecraft_overseas": {
    actTitle: "İşini Bilen Tüccar", questTitle: "Dönüş Yükü",
    introDialogue: [
      "Sonraki geçişte Sunreach’e öğütülmüş tahıl ve keten götür. Koy avlusunda yerel zeytinle kurutulmuş balık ekleyip Sunreach İhracat Sepeti hazırla.",
      "Sepeti Neva’ya getirip sat. Ambarın kalanını doldurmadan teklife bak."
    ],
    completionDialogue: [
      "Ana karanın tahılı gitti, adanın sepeti döndü. Geçişin iki yönü de işe yaradı. Sonraki yük listeni beklerim."
    ],
    objectives: { "step.tradecraft.overseas.make": { description: "Sunreach’te bir ihracat sepeti hazırla." }, "step.tradecraft.overseas.deliver": { description: "Sunreach ihracat sepetini Neva’da sat." } }
  },

  "quest.caravan_first_stamp": {
    actTitle: "Köyler Arası Ticaret", questTitle: "İlk Damga",
    introDialogue: [
      "On buğdayı Neva Paketleme Avlusu’nda bir ticaret paketi yap. Önce bizim köy tezgâhına taşıyıp sat. Seni yola göndermeden teslimi öğrenmeni istiyorum."
    ],
    completionDialogue: [
      "İlk Neva damgan. Şimdi aynı tahılı ona ihtiyaç duyan bir köye götür, teklifleri karşılaştır."
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
      "Rowan’ın Pinewatch fırınları için tahıla ihtiyacı var. Bizim avluda bir buğday paketi daha hazırla, onun tezgâhında sat; sonra kereste avlusunun yanında kendisini bul."
    ],
    "completionDialogue": [
      "Sonraki ekmeğin tahılı tamam. Burada ketenimiz bol; Reedhaven’daki Mara’ya biraz lazım."
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
      "Mara’nın deposunda sarıp sarmalamak, onarmak için keten lazım. Burada Pinewatch ketenini paketle, yükseltilmiş yoldan Reedhaven’a götürüp tezgâhında sat."
    ],
    "completionDialogue": [
      "Güzel keten. Depoda işe yarar. Buradan tepeye çıkacaksan Ada bizim mısırdan istiyordu."
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
      "Bizim avluda Reedhaven mısırını paketle, Highridge’e çıkar. Ada’nın sofrasına kök sebzelerle arpadan başka bir şey gelsin. Yokuşun virajlarına dikkat et."
    ],
    "completionDialogue": [
      "Sazlıktan mısır gelmiş. Akşam sofrasına iyi gider. İnişte yük istersen Neva’ya gönderecek arpamız var."
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
      "Arpamızı paketleyip Neva’da sat. Sonra meydanın doğusundaki arabacı ahırına uğra. Paran ve Ticaret tecrüben yettiğinde dört paketlik arabayı al."
    ],
    "completionDialogue": [
      "Artık kendi atın ve dört yük bölmen var. Arkadan yükle, dönüşte alacağın mala da yer bırak. Yolu değerlendirecek kadar köy tanıdın."
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
      "Arabacıda altı paketlik araba var. Parasını biriktir, Ticaret tecrübeni artır; tek seferde birkaç köye uğrayabiliriz. Doldurmadan tezgâhların talebine bak."
    ],
    "completionDialogue": [
      "Altı bölme hazır. Tahılla domatesi aynı yola çıkaralım; her birinin alıcısı ayrı olsun."
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
      "Neva’da bir buğday paketi hazırla, altı paketlik arabaya arkadan yükle. Ellerin boşalınca domates paketi hazırla, onu da yükle.",
      "Buğdayı Pinewatch’ta, sonra domatesi Reedhaven’da sat. Varınca her teklife bak; önceki satış sonraki yükün fiyatını etkiler."
    ],
    completionDialogue: [
      "Tahıl ormana, domates sazlığa, hepsi tek seferde. Boğaza hazır olduğunda Maeve’nin aklında daha uzun bir rota var."
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
      "Sunreach’e Neva tahılı lazım. Paran ve Ticaret tecrüben yettiğinde Seabreak Yük Rıhtımı’ndan ticaret gemisini al. On paketlik yeri var.",
      "On Neva buğday paketini karşıya götür. Her birini indirip Sunreach tezgâhına elden taşı, sonra Tomas’la konuş."
    ],
    "completionDialogue": [
      "On paket de teslim edildi. Fırınlarımız çalışacak. Eve dönmeden taraçalardan ne götürebileceğine bak."
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
      "Zeytinimizi koy avlusunda paketle, Neva’nın tezgâhına götür. Bütün ambarı doldurmadan önce teklife bak; köyün kullanacağı kadar gönderelim."
    ],
    "completionDialogue": [
      "İlk tahıl paketini sattığın yere Sunreach zeytini getirdin. Artık iki yönde de taşıyacak malın var. Tezgâhlara bakmayı sürdür; iyi rota alıcısına göre değişir."
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
      "Kapının önünü açık tuttum. Ev de bu tarhlar da artık senin.",
      "Ailen her hasattan gelecek ekime biraz buğday ayırırdı. Al şu tohumları; hazır tarh hemen arkamda."
    ],
    "completionDialogue": [
      "Başlangıç için altı tohum. Üçünü ek, kalanını sonraki sıra için sakla."
    ],
    "objectives": {
      "step.act1_welcome_talk": {
        "description": "Çiftlik evinin avlusunda Elspeth ile konuş"
      }
    }
  },
  "quest.act1_sow_wheat": {
    "actTitle": "1. Bölüm: Ata Çiftliğinin Uyanışı",
    "questTitle": "Üç Tohum Toprağa",
    "introDialogue": [
      "Hazır tarha üç buğday ek. Aralarında biraz yer bırak; sularken bu sıraların arasından geçeceğiz."
    ],
    "completionDialogue": [
      "İşte oldu. Küçük bir sıra ama senin emeğin. Şimdi her birine su ver."
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
      "Üç ekini de sula. Toprak koyulaşınca bırak; köklere o kadarı yeter."
    ],
    "completionDialogue": [
      "Bu kadar yeter. İlk tarh çabuk büyür; başaklar sararınca hasat et.",
      "Artanları nasıl değerlendireceğini Barnaby gösterir. Kompost teknesi evin yanında."
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
      "Ben Barnaby. Buradaki aletleri onarırım. Sen tahıla bak, ben de artanları değerlendirmene yardım edeyim.",
      "Olgunlaşan üç buğdayı hasat et. Sonra tekneye bitki artıklarıyla kompost mayası koy; hazır olunca yem solucanlarını al. Çiftlik evindeki tezgâhımda buluşuruz."
    ],
    "completionDialogue": [
      "Tahıl değirmene, solucanlar oltaya. Bu tarhtan çıkan hiçbir şey boşa gitmesin."
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
      "Buğdayını köy değirmeninde öğüt. Öğütülmüş Tahıl ile Yem Solucanlarını tezgâhıma getir; bir kova yem harcı hazırlayalım.",
      "Suya biraz yem atınca sürü yaklaşır. Geldiğinde ne yapacağını Silas gösterir."
    ],
    "completionDialogue": [
      "Tamamdır. Kovayı sürü için sakla; önce birkaç solucan alıp nehre in."
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
      "Bana Silas derler. Ailen şu ahşap köprünün aşağısında balık tutardı. Bakalım nehir sana ne verecek.",
      "Orada iki tatlı su balığı yakala. Şamandıra batınca tasma at, sonra balığı yakalama çubuğunun içinde tut."
    ],
    "completionDialogue": [
      "Eski yerden iki balık. Tekneyle açıldığımızda da böyle sakin kal."
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
      "Bir sonraki ekim için gerekeni ayır, kalan üründen birazını meydandaki tezgâha götür. İlk hasadın sonraki ekimin masrafını çıkarabilir."
    ],
    "completionDialogue": [
      "Emeğinin karşılığını aldın. Maeve limandaki balık pazarına bakıyor; gidip tanış."
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
      "Ben Maeve. Burada balık alır, teslimat defterini tutarım. Açılmadan önce avını nereye götüreceğini bil.",
      "Normal avını Balık Pazarı’na getir. Büyük balık paketini köyün ticaret tezgâhına elden taşı; başka bir pazara sipariş aldıysan oraya teslim et. Yolda tazeliği azalır."
    ],
    "completionDialogue": [
      "Silas ailenin filikasını kızakta tutuyor. İlk seferini planlamadan önce iskelede onu bul."
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
      "Ailenin filikası hâlâ kızakta. Bunca zamana rağmen sedir gövdesi sapasağlam.",
      "İzin için 30 altın, kürek çatalının yağı için bir Öğütülmüş Tahıl getir. Ben tekneyi hazır ederim."
    ],
    "completionDialogue": [
      "Tekne hazır. Yanına iki Dokuma Sahte Yem koydum; sürüden balık tutmadan önce birini tak. Ahşap kızaktan binebilirsin."
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
      "Filikanı, yem harcını ve bir Dokuma Sahte Yem alıp işaretli göl sürüsüne git. Harcı suya at, sahte yemi tak ve bir balık yakala.",
      "Misina izin verdikçe sar; zorlanınca gevşet. Avını tekneye alıp limana dön, paketi Köy Ticaret Merkezi’ne taşı. Sonra bana da anlat."
    ],
    "completionDialogue": [
      "Ailenin teknesi yeniden balıkla döndü. Bunu görmeyi umuyordum.",
      "Artık Sefer Panosu’ndan sipariş alabilirsin. Vaktinde yetiştirebileceğin birini seç."
    ],
    "objectives": {
      "step.act5_board_rowboat": {
        "description": "Ahşap Filikana bin"
      },
      "step.act5_chum_school": {
        "description": "İlk göl sürüsüne Yem Harcı at"
      },
      "step.act5_hook_sport_fish": {
        "description": "Dokuma Sahte Yemi takıp yemlediğin göl sürüsünden bir balığı oltaya al"
      },
      "step.act5_land_sport_fish": {
        "description": "Mücadele ederek trofe balığı tekneye çek"
      },
      "step.act5_stow_cargo": {
        "description": "Avı tekne ambarına yerleştir veya kıyıya taşı"
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
      "Her siparişin ucunda bekleyen biri var. Sefer Panosu’ndan birini seç; süresine ve teslim yerine bak, istenen malı götür."
    ],
    "completionDialogue": [
      "Söz verdiğin gibi teslim ettin. Ödemen burada; şu temiz balık artıklarını da Barnaby’ye götür. Tarlanın nasıl gittiğini soruyordu."
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
      "Sıra sıra su taşımak sabahın yarısını alıyor. Ata Çiftliği kuyusuna pompa kurup tarlayı sula. Maeve’nin verdiği para parçalara yeter."
    ],
    "completionDialogue": [
      "Artık kuyuya daha az gidip gelirsin. Şimdi balık artıklarını limandaki tezgâha götür; toprak için gübre yapalım."
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
      "Maeve’nin artıklarını Liman Balık Masası’nda gübreye çevir, sonra Ata Çiftliği toprağına ver. Toprağın işine yarayanı atmayalım."
    ],
    "completionDialogue": [
      "Bir sonraki ekine yarar. Nasıl yapıldığını günlüğüne yazdım.",
      "Silas iskelede seni soruyordu. Boğazın ötesinden haberi varmış."
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
      "Şamandıraların içine yanaşıp karaya çık. Silas karşıya geçebileceğini söylemişti."
    ],
    "completionDialogue": [
      "Sunreach’e hoş geldin. Şu ayçiçeği tohumlarını koyun üstündeki taraçalarda Ines’e götür. Nereye ekeceğini gösterir."
    ],
    "heraldLines": [
      "Tomas Sunreach’ten haber yolladı. Yanına gitmek için limandaki Kıyı Balıkçı Filikası’nı almalısın. Satıcı parasının yanında Uzman düzeyinde balıkçılık tecrübesi de istiyor.",
      "Hazır olana kadar balık tut, siparişleri tamamla. Sonra şamandıraları doğuya takip et, Sunreach Koyu’na yanaşıp pazarda Tomas’ı bul."
    ],
    "objectives": {
      "step.act7_own_skiff": {
        "description": "Kıyı Balıkçı Filikasını satın al"
      },
      "step.act7_board_skiff": {
        "description": "Kıyı Balıkçı Filikasına bin"
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
      "Tomas mı gönderdi? Ben Ines. Taş duvarlar toprağı tutar ama güneş suyunu çabuk alır. Üç ayçiçeği ek, sula; olgunlaşınca birini hasat et."
    ],
    "completionDialogue": [
      "İlk hasadın güzel. Çekirdeği Tomas’a götür; bir kısmını resifte kullanır. Şu zeytin fidanını da sen dik."
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
      "Yem harcımın çoğu Ines’in tarlasından gelir. Ayçiçeği çekirdeğini el değirmeninde öğüt, sonra koydaki tezgâhta bir kova harç hazırla."
    ],
    "completionDialogue": [
      "Kovayı teknede tut. Resifin kenarında, tabanın derinleştiği yerde bir sürü var."
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
      "Filikayla resifin kenarına git, sürüye yem harcı at. Güverteden bir Altın Çipura yakala.",
      "Geçiş için ambara koy, sonra paketini limandan Köy Ticaret Merkezi’ne taşı. Karadaki yol da tazeliğinden götürür."
    ],
    "completionDialogue": [
      "Resiften çıkan balık köyün sofrasına vardı. Sonraki avının artıklarını Ines’e ayır; taraçalarında işe yarar."
    ],
    "objectives": {
      "step.act7_chum_sunreach": {
        "description": "Sunreach resif eşiğindeki sürüye Yem Harcı serp"
      },
      "step.act7_land_bream": {
        "description": "Sunreach sularında bir Altın Çipura avla"
      },
      "step.act7_stow_bream": {
        "description": "Kıyı Balıkçı Filikasının güvertesinden bir Çipura yakala"
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
      "Koydan iki sardalya yakalayıp balık tezgâhında temizle. Üç balık artığından gübre yap, taraçalara ver; sonra yanıma uğra."
    ],
    "completionDialogue": [
      "Bu toprakta besin az. Getirdiklerin sonraki ekime yarar. Biraz kal; kurak günler bastırmadan yapacak işimiz var."
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
      "Köprünün aşağısındaki nehre dönelim. Gümüşsu’da bir sürüyü yemle, Gökkuşağı Alabalığı’nı oltaya takıp çek. İlk av yerinde kıyıdan gördüğünden fazlası var."
    ],
    "completionDialogue": [
      "Takımın iyileşse de bu küçük balık hâlâ çevik. Deniz açılmana izin vermediğinde bu kıyıyı hatırla."
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
      "Kanal Yayın Balığı nehrin derininde durur. Ağırlığını kaldıracak takım al, çekerken acele etme. Oltanda birini görmek isterim."
    ],
    "completionDialogue": [
      "İşte geldi. Alabalıktan başka türlü sabır istiyor, değil mi? Biraz daha sarmadan önce bırak kamış işini yapsın."
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
      "Gölde Turna Balığı ara. Çıkmadan yıllıktan mevsimine bak; bazı günleri takım onarmaya ayırmak daha iyi."
    ],
    "completionDialogue": [
      "Şu dişlere bak. Turnaya kaç yem kaptırdığımı saymayı bıraktım. Sen kendininkini yeterince korudun."
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
      "Bir akşam Altın Arowana’nın su altında döndüğünü gördüm. Göle para düşmüş sandım.",
      "Yazın göründüğü vakitlerde ara. Ağır Mücadele Kamışı ya da daha iyi bir takım al; çıkmadan yıllığa bak."
    ],
    "completionDialogue": [
      "O renk çizimde aynı durmuyor. Artık sen de gördün."
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
      "Kıyıda Beyaz Mersin Balığı ara. Ne zaman çıktığına bak, oltayı atmadan ona yer ayır.",
      "Avını getir, paketini alıp Köy Ticaret Merkezi’ne taşı. Bu büyüklükte bir balığın karadaki yolunu da düşünmek gerek."
    ],
    "completionDialogue": [
      "Zor kısmını başkasına bırakmadan kıyıdan köye taşıdın. Hatırlamaya değer bir sefer."
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
      "Önce nehirde, sonra gölde, en son kıyıda birer sürüden balık oltaya tak. Üçünü de deneyince gel; en çok hangi suyu sevdiğini merak ediyorum."
    ],
    "completionDialogue": [
      "Üç su, misinada üç ayrı çekiş. Biri nereden başlayacağını sorarsa artık kendi cevabın var."
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
      "Benim hiç çıkaramadığım bir balık var: sığlığın ötesindeki Mavi Marlin. Peşine düşersen Üstat Denizci Oltası’nı al, teknede ona uygun bir askıyı boş bırak.",
      "Ne zaman çıktığına yıllıktan bak. Hazır olana kadar bekleyebilir."
    ],
    "completionDialogue": [
      "Kendi oltanla bir marlin. Otur da ilk çekişinden başlayarak anlat. Bu hikâyeyi yıllardır bekliyorum."
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
      "Ailenin tohum kesesini mutfakta buldum; hâlâ aynı iple bağlıydı. Senin için sakladım.",
      "Kendi tarlan büyüyor artık. Bu tohumları al, Köy Ortak Tarlası’nı ekmek için Barnaby’ye yardım et."
    ],
    "completionDialogue": [
      "Her hasattan biraz tohum ayırırlardı. Yeniden toprağa girecek olmasına sevindim."
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
      "Doğudaki tarhlar Köy Ortak Tarlası’nın. Fazla boş bıraktık. Oraya üç buğday ek ve sula."
    ],
    "completionDialogue": [
      "O sıraları yeniden yeşil görmek güzel. Geçerken gözüm üzerlerinde olur."
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
      "Üç buğday olgunlaşınca hasat et. Birazını köy tezgâhında sat; ortak tarla meydana yiyecek getirsin, sen de emeğinin karşılığını al."
    ],
    "completionDialogue": [
      "Ortak tarladan yine hasat çıktı. Elspeth tezgâhta görünce sevinecek."
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
      "Biraz buğdayı köy değirmenine götür. Kolundaki aşınmış yeri görüyor musun? Ailenin de eli değdi. Taşı hâlâ güzel öğütür."
    ],
    "completionDialogue": [
      "Eski kol biraz daha aşındı. Şu elma fidanını ortak tarlaya götür; Elspeth ona yer ayırıyordu."
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
      "Barnaby’nin elma fidanını Köy Ortak Tarlası’na dik. Özenle bak; ilk elma olgunlaşınca bana getir."
    ],
    "completionDialogue": [
      "İlk elma da yetişti. Bir gün biri o ağacın altında oturacak, kimin diktiğini bilmeyecek. Ben bileceğim."
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
      "Panodan toplu bir sipariş seç. Toplamaya başlamadan miktarına bak; belirtilen tezgâha parça parça teslim edebilirsin."
    ],
    "completionDialogue": [
      "Son ölçü de geldi. Teslimatlar arasında diğer işlerine yer ayırınca büyük sipariş de yürür."
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
      "Tazelik şartlı bir balık siparişi tamamla. Açılmadan buz al, balığı oltaya takmadan dönüş yolunu seç."
    ],
    "completionDialogue": [
      "Alıcının istediği tazelikte ve vaktinde geldi. Dönüşü son dakika telaşına bırakmadın."
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
      "Bu alıcı kaliteyi baştan söylüyor. Kalite şartlı bir sipariş seç; teslimden önce avına bak. Şartı karşılamayan balık sende kalır."
    ],
    "completionDialogue": [
      "İstenen kalitede. Alıcıların ne aradığına bak; iyi avı doğru tezgâha götürmek gerek."
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
      "Sunreach’e yanaş, sonra panodan boğaz aşırı bir sipariş tamamla. Zeytinimiz karşıya gider, ana karanın malları buraya gelir. Teslimatı hangi tarafın beklediğine bak."
    ],
    "completionDialogue": [
      "Mal boğazın doğru tarafına ulaştı. Teslimat sözü verirken o geçişe de zaman ayır."
    ],
    "heraldLines": [
          "Tomas’ın boğaz aşırı siparişleri var. Filikayla Sunreach’e geç, koyda onu bul. Panoda karşıya götürülecek bir yük ara."
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
      "Balık Pazarı’na uğra. Miktarı, tazeliği, kaliteyi ve boğaz geçişini gördün; en çok hangi teslimatın zorladığını merak ediyorum."
    ],
    "completionDialogue": [
      "Yeni biri sorunca bunu hatırlarım. Adın defterde kalsın; bir yerde her zaman bekleyen bir yük vardır."
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
      "Ben Rowan. Fırının sonraki hamuru için sekiz buğday gerek; tezgâhımızda sat. Dönüş yolun için kereste ve ketenimiz var."
    ],
    "completionDialogue": [
      "Sonraki ekmeğin tahılı tamam. Eve dönmeden malzemelere bir bak."
    ],
    "heraldLines": [
          "Pinewatch’taki Rowan’a tahıl lazım. Orman yolundan git ya da koyun karşısındaki iskeleye açıl. Dönmeden kereste avlusuna da bak."
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
      "Ben Mara. Reedhaven Takas Yeri’ne bir balık paketi getir. Yükü indirip tezgâha elden taşı; iskeleden sonraki birkaç adım yaya."
    ],
    "completionDialogue": [
      "Balık tezgâhımıza ulaştı. Sonraki avını planlarken yolun ne kadar sürdüğünü hatırla."
    ],
    "heraldLines": [
          "Kıyı yolunu güneye takip edip Reedhaven’a git. Mara takas yerinde yem ve buz satar; tezgâha elden getirilen balık paketlerini alır."
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
      "Highridge’den denizi görürüz ama akşam yemeğinin hâlâ yokuşu çıkması gerekir. İki balık paketi getir, tezgâhımızda sırayla sat.",
      "İkisini tek seferde getireceksen araba kullan. İnişte götürmek için atölye malzemelerimiz var."
    ],
    "completionDialogue": [
      "İki av da tepeye ulaştı. Bu rotayı sürdürürsen seni tezgâhta yeniden görmek isteriz."
    ],
    "heraldLines": [
          "Highridge’deki Ada’ya balık lazım. Geçit yolundan git; orada iskele yok."
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
      "Önce üst sıralar kuruyor. Oraya iki ayçiçeği ek, sonra kuyudan taraçaları sula. Sarnıç sayesinde bu basamaklardan kova taşımayız."
    ],
    "completionDialogue": [
      "Su yeni köklere ulaştı. Şimdi Tomas’ın resifte ne bulduğuna bakacak vaktimiz var."
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
      "Güneydeki sığlığın kenarında akyalar var. Koydan izliyordum; bugün birini yakaladığını görmek isterim.",
      "Filikayı ve Ağır Mücadele Kamışı ya da daha iyi bir takım al. Koy tezgâhında bulabilirsin. Ne zaman çıkacağını yıllıktan kontrol et."
    ],
    "completionDialogue": [
      "Bizim sulardan bir akya. Burada kıyıdan sattığımız sardalyadan fazlası var. Ines avın bir kısmını karşıya götürmenin yolunu bulmuş."
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
      "İki sardalya yakala, balık tezgâhımızda tuzlayıp kurut. Biz yıllardır böyle saklarız; boğazın ötesinde alıcı bulacak vaktin olur."
    ],
    "completionDialogue": [
      "Kurutulmuş balıkları heybene koy. Ana karada nerede satacağını Tomas biliyor."
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
      "Tuzlu Kuru Balığı Neva’daki Köy Pazarı’na götür. Heybende taşıyabilirsin; teknede balık bölmesi ayırman gerekmez."
    ],
    "completionDialogue": [
      "Aldılar mı? Güzel. Artık dönüşte de taşıyacak malımız var. Taraçalardan ayrılmadan Ines’e haber ver."
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
      "Tomas kurutulmuş balıkların Neva’da satıldığını söyledi. Taraçalara gel; yolculuğun nasıl geçtiğini anlat."
    ],
    "completionDialogue": [
      "Geldiğinde ilk sıcak öğleden sonra dönüp gidersin sanmıştım. Tarlamıza baktın, yiyeceğimizi karşıya taşıdın. Burada her zaman yerin var."
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
      "Sana henüz göstermediğim derin sular var. Maeve’nin tezgâhından Açık Deniz Çıkrığı’nı al, sonra iskelede buluşalım."
    ],
    "completionDialogue": [
      "Bu oltayla daha açığa gidebilirsin. Çukura gitmeden yakıtına bak, av için yer ayır."
    ],
    "heraldLines": [
          "Silas haber yolladı: döndüğünde liman iskelesinde buluşmak istiyor. Sana daha derin bir av yeri gösterecekmiş. Gereken Açık Deniz Çıkrığı Maeve’de var."
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
      "Kılıç balıkları her zamanki av yerimizin güneybatısındaki çukurda beslenir. Yıllıktan ne zaman çıktıklarına bak; beklemeye yetecek yakıt al.",
      "Birini yakalayıp eve getir, sonra paketini Köy Ticaret Merkezi’ne taşı. Dönüş yolu da bu işin bir parçası."
    ],
    "completionDialogue": [
      "Çukurdan çıkan kılıç balığını köye kadar getirdin. Ailenle o yolu giderdik. Yeniden konuşacak birinin olması güzel."
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
      "Düzenli teslimatlara güvenebileceğim biri lazım. Önce kalite şartlı, sonra toplu bir sipariş tamamla. İlkinde kaliteye, ikincisinde miktara dikkat et."
    ],
    "completionDialogue": [
      "İki sipariş de teslim edildi. Artık mal gelir mi diye düşünmeden adını sonraki siparişin yanına yazabilirim. Bu iş için bir anlaşmamız var."
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
      "Liman anlaşması aynı anda bir sipariş daha almanı sağlar. 400 altın ve iki Tuzlu Kuru Balık getir, burada imzalayalım."
    ],
    "completionDialogue": [
      "Adın deftere yazıldı. Bir sipariş daha alabilirsin. Liman dönüşünü bekliyor."
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
      "Sonraki yolculuğundan önce Silas’a, Maeve’ye ve Barnaby’ye uğra. Sonra bahçeye dön. Gitmeden biraz konuşalım."
    ],
    "completionDialogue": [
      "Geldiğinde sana bir kese tohum vermiştim. Şimdi tarlada ekinler, kızakta bir tekne, dönüşünü bekleyen insanlar var.",
      "Kapıyı yağlamayı unutma. Daha çok kez o kapıdan eve döneceksin."
    ],
    "heraldLines": [
          "Elspeth sonraki seferinden önce bize uğramanı istedi. Önce Silas’a git, sonra buraya dön, ardından tezgâhında Barnaby’ye uğra. Kendisi çiftlik evinin avlusunda bekleyecek."
        ],
    "objectives": {
      "step.act10_silas": {
        "description": "İskelede Koca Silas ile konuş",
        dialogue: [
          "Biraz otur. Yıllarca ailenin kızağını boş tuttum; biri tekneyi yeniden açar diye.",
          "Sen açtın. Hadi Maeve’ye git; beklemiyormuş gibi yapar."
        ]
      },
      "step.act10_maeve": {
        "description": "Balık Pazarında Maeve ile konuş",
        dialogue: [
          "Adın eskiden tezgahtaki küçük bir sepeti hatırlatırdı. Şimdi teslimat defterinde arıyorum.",
          "Barnaby’ye uğra. Dikkat et, seni işe koşmasın."
        ]
      },
      "step.act10_barnaby": {
        "description": "Çiftlik evi tezgâhında Barnaby ile konuş",
        dialogue: [
          "Tezgâhtaki izleri görüyor musun? Bazıları artık senin. Zımparalamam.",
          "Elspeth bekliyor. Tarhların yanından git; nasıl olduklarını sorar."
        ]
      },
      "step.act10_elspeth": {
        "description": "Bostan kapısında Elspeth'in yanına dön"
      }
    }
  }
};
