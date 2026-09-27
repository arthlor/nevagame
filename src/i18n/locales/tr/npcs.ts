// src/i18n/locales/tr/npcs.ts

import type { LocalizedNpcText } from "../../types";

export const TR_NPCS: Record<string, LocalizedNpcText> = {
  "npc.elspeth": {
    name: "Elspeth",
    title: "Köyün Fırıncısı & Bostan Büyüğü",
    district: "Başlangıç Çiftliği & Köy Sınırı",
    idleDialogue: [
      "Ön tarh öğleye kalmadan kabuk bağlar eğer bakmazsan. Kabuk bağlamadan önce sula; yoksa sadece tozu yıkamış olursun.",
      "Ekmek ancak aceleye getirmediğin tahıl kadar güzel olur.",
      "Bu sabah karıklar ılık. 'Sonra yaparım' demeyi bırakmak için güzel bir gün."
    ],
    beckonLines: [
      "Kapıdayım! Bir dakikanı ayır. Sıraların ardından bana bağırtma kendini.",
      "Şöyle gel, çitin yanına geç; burada rüzgâr daha sakindir."
    ],
    recognitionDialogue: [
      {
        id: "dialogue.elspeth_discovery_farm",
        lines: [
          "Eski karıkların ardındaki yukarı giden patikayı bulmuşsun. Ailen her ilkbahar suyu kontrol etmek için oradan yürürdü.",
          "Ata Çiftliği Tepeleri sadece bir manzara değildir. Bu çiftliğin buraya kurulmasının yegâne sebebidir."
        ]
      },
      {
        id: "dialogue.elspeth_discovery_overlook",
        lines: [
          "Demek batı tepesi... Oradan hem tarlaları hem de nehri aynı anda görebilirsin.",
          "Bütün çiftliği tek bir bakışta görürsün. Ailen sadece çiftliğe göz kulak olmak için bile oraya çıkardı."
        ]
      },
      {
        id: "dialogue.elspeth_land_sea_cycle",
        lines: [
          "Barnaby bana günlüğündeki sayfayı gösterdi. Tarlaya balık artığı, suya doğru da tahıl... İşte hakiki bir Neva döngüsü.",
          "Toprak ona ne verdiğini asla unutmaz. O tarlayı beslemeye devam et, o da limanı doyurmaya devam etsin."
        ]
      },
      {
        id: "dialogue.elspeth_skilled_farmer",
        lines: [
          "Artık bana ne zaman sulayacağını sormayı bıraktın. İşte kimsenin öğretemeyeceği kısım budur; bunu sadece bilmeye başlarsın.",
          "Vakti gelince ketene dikkat et. Buğdaydan farklı bir sabır ister."
        ]
      },
      {
        id: "dialogue.elspeth_homestead_worked",
        lines: [
          "Daha ben sormadan tezgâhtakiler o buğdayın kime ait olduğunu söyledi. Ortak tarhlar yeniden mevsime katılınca laf tez yayılır.",
          "Sana bir karış toprak satmak zorunda kalmadılar. Koya yeniden aş sundun ve emeğin kendi adına konuştu."
        ]
      },
      {
        id: "dialogue.elspeth_family_ledger",
        lines: [
          "O ağaçtan bir elma ha... Doğrusu bunu görebileceğimi hiç sanmıyordum.",
          "Ailen kendilerinden sonra gelecek kişi için bir yurt bıraktı. Belki de hiç tanışmayacağın insanlar için gölge diktin; artık bunun nasıl bir his olduğunu biliyorsun."
        ]
      },
      {
        id: "dialogue.elspeth_open_horizons",
        lines: [
          "Hadi bakalım, yolun açık olsun. Bostan kapısı hep burada olacak.",
          "Daha önce tatmadığım bir şeyle geri dön ve arayı fazla açma sakın."
        ]
      }
    ]
  },

  "npc.barnaby": {
    name: "Barnaby",
    title: "Çiftlik Ustası & Zanaatkâr",
    district: "Ata Çiftliği",
    idleDialogue: [
      "Artıkların mı var? At kompost teknesine! Bu koyda en iyi işi solucanlar çıkarır.",
      "Sağlam bir tezgâh ile bir avuç iyi tahıl, her balıkçıyı denize hazırlar.",
      "Aletlerini daima keskin, keresteni daima kuru tut."
    ],
    beckonLines: [
      "Bir dakikan var mı? Şöyle gel, iki lafın belini kıralım.",
      "Hey, ellerin boşalınca bir buraya uğra bakalım."
    ],
    recognitionDialogue: [
      {
        id: "dialogue.barnaby_discovery_spring",
        lines: [
          "Nehrin nereden başladığını gördün demek. Güzel. Yaptığım her alet o pınarın aşağısındadır.",
          "O su sonsuz değil. İnsanlar unutur, sonra da kurak bir yaz gelir çatar."
        ]
      },
      {
        id: "dialogue.barnaby_field_pump",
        lines: [
          "O tulumba hakkını veriyor doğrusu. Tarlanın suya acıkmasını bekle, sonra tek seferde bütün karığı suya doyursun.",
          "İyi alet adımlardan tasarruf ettirir; ama o adımların ne zaman atılacağına usta çiftçi karar verir."
        ]
      },
      {
        id: "dialogue.barnaby_land_sea_cycle",
        lines: [
          "Döngüyü tamamladın artık: hasat, yem, av, artıklar, toprak. İşe yarar hiçbir şeyin ziyan olmasına gerek yok.",
          "O günlük sayfası bir kupa değil, bir yöntemdir. Tarla zayıf düştüğünde hemen devreye sok."
        ]
      },
      {
        id: "dialogue.barnaby_worn_tools",
        lines: [
          "Kolu fark ettin demek. Çoğu insan o değirmeni bir yıl boyunca kullanır da dönüp bir kez olsun bakmaz.",
          "Bu köydeki her şey, onu en çok kullanan kişinin elinin şeklini almıştır. Tuttuğumuz tek tarih budur."
        ]
      },
      {
        id: "dialogue.barnaby_skilled_processing",
        lines: [
          "Tezgâhta güzel bir ahenk yakaladın artık. Malzemeler dizili, iş yürüyor, eller bir sonraki iş için serbest.",
          "Sadece çalışmak ile işi yönetmek arasındaki fark işte tam olarak budur."
        ]
      },
      {
        id: "dialogue.barnaby_salt_and_shade",
        lines: [
          "Kurutulmuş balık ha... Hem de toprağında suyu bir sabah bile tutamayan Güneşeri'nden.",
          "Fakir bir yerin sırrı buradadır işte. Neyin eksik olduğunu sormayı bırakır, neyin fazlası olduğunu sormaya başlarsın."
        ]
      },
      {
        id: "dialogue.barnaby_open_horizons",
        lines: [
          "Bence artık tezgâha sığmıyorsun. Şikâyet olsun diye söylemiyorum, gurur duyuyorum.",
          "Bu çiftlikte saklamaya değer ne varsa, bir başkası kullanabilsin diye onarıldı. Sen az önce bunu koca bir koy için başardın."
        ]
      }
    ]
  },

  "npc.silas": {
    name: "Silas Amca",
    title: "İhtiyar Deniz Kurdu & Usta Balıkçı",
    district: "Neva Liman İskelesi",
    idleDialogue: [
      "Oltayı savurmadan önce gelgiti ve rüzgârı kolla evlat. Deniz, limandan ayrılan her tekneyi hatırlar.",
      "İyi bir sedir filika ile sağlam bir makara, seni pazardaki tüm altınlardan daha uzağa taşır.",
      "Alabalık kapalı havalarda daha iyi vurur; suya vuran yağmurda ya da sabah sisinde."
    ],
    beckonLines: [
      "Vaktin olunca bir çift lafım var.",
      "İskeleden aşağı doğru gel. Sana söyleyeceklerim var."
    ],
    recognitionDialogue: [
      {
        id: "dialogue.silas_discovery_coast",
        lines: [
          "Deniz feneri kayalıklarında yürüdün demek. Artık limanın geceleri neden saklandığını biliyorsun.",
          "O fener pazardan daha eskidir ve hava durumu hakkında tek bir kez bile yalan söylememiştir."
        ]
      },
      {
        id: "dialogue.silas_discovery_bluff",
        lines: [
          "Kuzey burnu ha... Açık bir havada oradan kıta sahanlığını ve ötesindeki suları görebilirsin.",
          "Artık daha ne kadar uzağa gitmediğini biliyorsun. Bunu bilmek kıymetlidir."
        ]
      },
      {
        id: "dialogue.silas_first_expedition",
        lines: [
          "Tekneyi ve avı sağ salim eve getirdin. Artık her sefer bir dersle değil, bir seçimle başlıyor.",
          "Panoyu oku, suyu oku ve ambarda gerçekten yapmayı planladığın sefer için yer bırak."
        ]
      },
      {
        id: "dialogue.silas_reading_the_water",
        lines: [
          "Nehir, göl, kıyı... Artık doğru aylarda, ben sana söylemeden hepsinde bir şeyler yakaladın.",
          "Bana bir balığın nerede yaşadığını sorarsan yine söylerim. Ama artık sormana gerek kalmadı."
        ]
      },
      {
        id: "dialogue.silas_master_angler",
        lines: [
          "Oltayla ilgili sana gösterebileceğim pek bir şey kalmadı. Bu tevazu değil, hesabın ta kendisi.",
          "Geriye kalan tek şey muhakeme yeteneğidir; o da ancak emin olmadığın bir günde denize açılarak öğrenilir."
        ]
      },
      {
        id: "dialogue.silas_charter",
        lines: [
          "İmzalandı demek. Ben senin yaşındayken o kâğıtta dört isim vardı ve hiçbiri ben değildim.",
          "Bu senin çok iyi olduğun anlamına gelmez. İnsanların seni bekleyeceği anlamına gelir. Onları çok bekletme."
        ]
      },
      {
        id: "dialogue.silas_open_horizons",
        lines: [
          "Berat imzalandı, yani gelgit artık senin derdin. Güzel, olması gereken de buydu.",
          "Orada yine hatalar yapacaksın. Geri gelip bana nasıl olduğunu anlat ki ikimiz de bundan bir ders çıkaralım."
        ]
      }
    ]
  },

  "npc.maeve": {
    name: "Maeve",
    title: "Balık Hali Sorumlusu & Pazar Emircisi",
    district: "Neva Balık Hali",
    idleDialogue: [
      "Taze av daima en iyi altını getirir! Balıklarını güneş pişirmeden getir bana.",
      "Kupa boyutunda bir orkinos panomda derece farkını hak eder, ama yalnızca tazeyken. Buzla onu, yoksa saat o farkı silip süpürür.",
      "Adil terazi ve buz gibi soğuk... Liman ticaretini biz böyle yürütürüz."
    ],
    beckonLines: [
      "Sen! Şöyle gel bakalım, balıklar soğukken.",
      "Tezgâha bir dakika uğra bakalım, rica etsem."
    ],
    recognitionDialogue: [
      {
        id: "dialogue.maeve_discovery_beach",
        lines: [
          "Batı sahiliydi değil mi? Kıyı odunları var ama yanaşacak yer yok. Ticaretin buraya gelmesinin sebebi de buydu zaten.",
          "Her liman, nereye inşa edilmeyeceğine dair verilmiş bir karardır."
        ]
      },
      {
        id: "dialogue.maeve_packing_stamp",
        lines: [
          "Artık paketin nerede başladığını biliyorsun. Neva damgası yükü kimin bağladığını söyler; bu emeğin değerini karşı kıyıdaki tezgâh belirler.",
          "Yola çıkmadan tekliflere bak. Ambarı dolu alıcı, senin tahminine para veremez."
        ]
      },
      {
        id: "dialogue.maeve_contract_kept",
        lines: [
          "Seçtiğin siparişi tamamladın. Bu liman için panodaki en cafcaflı fiyatın peşinden koşmaktan çok daha kıymetli bu.",
          "Bir gözün teslimat vaktinde, diğeri teknenin gerçekte ne kadar taşıyabileceğinde olsun."
        ]
      },
      {
        id: "dialogue.maeve_freight_and_favour",
        lines: [
          "Hacim, tazelik, kalite, mesafe. Yanılmanın dört yolu vardır ve sen hepsini en az bir kez doğru yaptın.",
          "Pano fiyat listesi gibi görünür ama aslında sözler listesidir. Bu sezon bunu o gözle okuyan tek kişi sensin."
        ]
      },
      {
        id: "dialogue.maeve_cured_route",
        lines: [
          "Güneşeri'nden gelen kurutulmuş balık kanalın bu tarafında satıldı ha... Ben o kargoyu imkânsız diye defterden silmiştim.",
          "Mesele hiçbir zaman mesafe değildi. Mesele zamandı ve sen zamanı denklemden çıkardın."
        ]
      },
      {
        id: "dialogue.maeve_charter",
        lines: [
          "Adın berata yazıldı ve masada senin için bir yer daha açıldı.",
          "Orayı geçen sezon geri çevireceğin bir iş için kullan. Fazladan yerin amacı budur."
        ]
      },
      {
        id: "dialogue.maeve_open_horizons",
        lines: [
          "Sen baksan da bakmasan da pano dolmaya devam edecek. Artık işin sırrı da bu zaten.",
          "Tutmaya değer siparişleri al, gerisini bırak. Ne olursa olsun, bana suyun sana verdiğinin hakikatini getir."
        ]
      }
    ]
  },

  "npc.tomas": {
    name: "Tomas",
    title: "Koyun Kayıkçısı",
    district: "Güneşeri Koyu",
    idleDialogue: [
      "Koy durgun olduğunda kanal en sakin halindedir. Dönüş yolu için mutlaka yeterli yakıt bırak.",
      "Şamandıraların içine bağla tekneni. Resif sahanlığı hemen onların ardında başlar.",
      "Güneşeri yavaş büyür ama buradaki neredeyse her şeyin ikinci bir kullanım alanı vardır."
    ],
    beckonLines: [
      "Buraya gel, iskeleye! Sana haberlerim var.",
      "Tekneyi bağla da yanıma gel."
    ],
    recognitionDialogue: [
      {
        id: "dialogue.tomas_discovery_reef",
        lines: [
          "Resif sahanlığında durdun demek. Şamandıraların ardındaki o sular, bizim avımızın asıl geldiği yerdir.",
          "Koy bir sığınaktır, balık yatağı değil. Balık yatağı sahanlıktır."
        ]
      },
      {
        id: "dialogue.tomas_channel_manifest",
        lines: [
          "On yük karaya çıktı; hepsinin koy defterinde bir yeri var.",
          "Ines boş ambarla ne götürebileceğini soracak. Bu, geminin geçişi ne kadar hızlı yaptığı sorusundan iyidir."
        ]
      },
      {
        id: "dialogue.tomas_reef_answer",
        lines: [
          "Burada öğüttüğün yem, burada tuttuğun balık ve henüz soğukken burada yapılan satış... Her şey tek bir koyun içinde.",
          "Küçük bir yer kendini işte böyle doyurur. Büyüyerek değil, birbirine kenetlenerek."
        ]
      },
      {
        id: "dialogue.tomas_southern_shelf",
        lines: [
          "Sahanlığa kadar açıldın demek. Orası dopdolu ve her zaman da öyleydi.",
          "Bütün ömrümüz boyunca tepe sırtından orayı seyrettik. Bir şeyi görmekle onu kullanabilmek çok farklı meselelerdir."
        ]
      },
      {
        id: "dialogue.tomas_cured_route",
        lines: [
          "Bu koydan çıkan kurutulmuş balık kanalın karşı kıyısındaki bir tezgâhta duruyor. Bunun bana ne kadar tuhaf geldiğini anlamanı isterim.",
          "Babam o geçişte sattığından çok daha fazla av kaybetti. Aynı su... Sadece tuzu nasıl kullanacağımızı çözememiştik."
        ]
      },
      {
        id: "dialogue.tomas_open_horizons",
        lines: [
          "Koyun artık ana karaya bağlanan ve bir fırtınayla kopup gitmeyecek bir rotası var. Bunu sen inşa ettin.",
          "Hadi git, ufka açıl. Senden sonra gelecekler için fener şamandıralarını açık bırak."
        ]
      }
    ]
  },

  "npc.ines": {
    name: "Ines",
    title: "Taraça Bahçıvanı",
    district: "Güneşeri Taraçaları",
    idleDialogue: [
      "Bu taraçalar suyu ancak özenle verirsen tutar.",
      "Ayçiçekleri burada çabucak döner. Zeytinler ise sabır ve düzenli bir sarnıç ister.",
      "Kuru dere yatağı sana son yağmurun nereye gittiğini söyler; bir de bir sonrakinin nerede buhar olup uçacağını."
    ],
    beckonLines: [
      "Fırsat bulunca taraçaya çık yanıma.",
      "Burada senin ellerine ihtiyacım var."
    ],
    recognitionDialogue: [
      {
        id: "dialogue.ines_discovery_ridge",
        lines: [
          "Rüzgârlı sırttan bütün kanalı görebilirsin. Burada hissettiğimiz kadar yapayalnız değilmişiz meğer.",
          "Rüzgâr, taş, güneş... Sırt, taraçaların zaten bildiği şeyi fısıldar sana."
        ]
      },
      {
        id: "dialogue.ines_terrace_cycle",
        lines: [
          "Koyun balığını taraça toprağına katmak... Bunu bu tepede büyüyen benden bile daha çabuk çözdün.",
          "Buradaki her şey başka bir şeyi beslemek zorunda. Hiçbir şeyden sadece tek bir işe yetecek kadar yok."
        ]
      },
      {
        id: "dialogue.ines_irrigation",
        lines: [
          "Senin o tulumba, benim iki güğümle bütün bir sabahta yaptığım işi tek geçişte hallediyor.",
          "Gurur yapacak değilim. Sadece buraya bir tulumba getirebilmek için ana karadan birinin gerekmesine hayıflanıyorum."
        ]
      },
      {
        id: "dialogue.ines_dry_season",
        lines: [
          "İnsanlar buraya gelip neyimizin eksik olduğunu sayar durur. Sen ise tam aksine neyimizin bol olduğunu saydın.",
          "Güneş, rüzgâr ve tuz... Böyle yazınca bir hiç gibi duyuluyor. Ama bir ticaret yoludur bu."
        ]
      },
      {
        id: "dialogue.ines_return_cargo",
        lines: [
          "Zeytinimiz senin ambarında Neva’ya vardı. Taraça o pazardan uzak ama artık onun sofrasından uzak değil.",
          "Toprağın burada veremediğini getir. Ben verebildiğini yetiştirmeye devam edeceğim."
        ]
      },
      {
        id: "dialogue.ines_open_horizons",
        lines: [
          "Bu taraçalar bir sezon boyunca sen olmadan da dayanır. Eskiden buna hiç inanmazdım.",
          "İkimizin ömründen de uzun yaşayacak bir şey ek ve ekerken de bunu yürekten iste."
        ]
      }
    ]
  },

  "npc.rowan": {
    name: "Rowan",
    title: "Kereste Ustası & Koy Tüccarı",
    district: "Çamgözü Ormanı",
    idleDialogue: [
      "Orman yolu arabaları her havada taşır. Koy ise su insaflı olduğunda yolu kısaltır.",
      "Fazlasıyla kerestemiz ve kumaşımız var. Un ve taze bir akşam yemeği ise başka mesele."
    ],
    beckonLines: ["Defterini alıp gel. Güvenilir bir rota için her zaman yerimiz vardır."],
    recognitionDialogue: [
      {
        id: "dialogue.rowan_caravan_grain",
        lines: ["Neva tahılı fırının listesinde. Fırınlar sıcakken bizim ketenle elma da yola çıkabilir."]
      },
      {
        id: "dialogue.rowan_trade_route",
        lines: [
          "Tahılın fırında. Yola çıkmadan önce keresteye bir göz at; boş dönülen sefer ziyan edilmiş seferdir."
        ]
      }
    ]
  },

  "npc.mara": {
    name: "Mara",
    title: "Sazlık Bekçisi & İskele Kâhyası",
    district: "Sazlıkköy Bataklığı",
    idleDialogue: [
      "Sazlıkların arasından geçerken yükseltilmiş yoldan ayrılma. Aşağıdaki toprak suya aittir.",
      "Solucan ve artık burada boldur. Ama çiftliklerden tahıla, korulardan meyveye hâlâ ihtiyacımız var."
    ],
    beckonLines: ["Şöyle gel, kuru tahtaların yanına. Bakalım neler yola dayanabilmiş."],
    recognitionDialogue: [
      {
        id: "dialogue.mara_caravan_flax",
        lines: ["Pinewatch keteni kuru ambarda. Yükseltilmiş yol yine işini gördü."]
      },
      {
        id: "dialogue.mara_shared_load",
        lines: ["Domates Neva’dan gelirken ormana giden yükün yanında yol aldı. Tek araba, iki köyün sofrası."]
      },
      {
        id: "dialogue.mara_trade_route",
        lines: [
          "Tezgâha bir av, dönüşe taze yem. Bataklık köyü işte böyle hayata bağlı kalır."
        ]
      }
    ]
  },

  "npc.ada": {
    name: "Ada",
    title: "Yüksektepe Levazımcısı",
    district: "Yüksektepe Yaylası",
    idleDialogue: [
      "Kök sebzeler buralarda pek güzel yetişir. Taze balık ise geçidi kendi başına tırmanamaz.",
      "Yüklü arabayı virajlardan yavaş geçir. Yamacın üzerinden giden kestirme yol hiç yol sayılmaz."
    ],
    beckonLines: ["Gel de ellerini ısıt biraz. Köyün seninle konuşacağı bir siparişi var."],
    recognitionDialogue: [
      {
        id: "dialogue.ada_caravan_corn",
        lines: ["Reedhaven mısırı yüksek rafımızda. Geçit uzundu; yükün kıymeti de oradan geliyor."]
      },
      {
        id: "dialogue.ada_trade_route",
        lines: [
          "Taze balık geçidi yine aştı. Ahali artık akşam yemeklerini senin seferlerine göre planlamaya başladı."
        ]
      }
    ]
  }
};
