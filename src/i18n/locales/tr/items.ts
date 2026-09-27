// src/i18n/locales/tr/items.ts

import type { LocalizedItemText } from "../../types";

export const TR_ITEMS: Record<string, LocalizedItemText> = {
  // --- Seeds ---
  "seed.wheat": {
    name: "Buğday Tohumu",
    description: "Ekim için seçilmiş dolgun buğday taneleri. Değirmende öğütülüp yem tabanı yapmaya elverişli, bereketi yüksek."
  },
  "seed.barley": {
    name: "Arpa Tohumu",
    description: "Kıyı serinliğine dayanıklı tahıl taneleri. Balık yemi ve mayalama için birebir."
  },
  "seed.corn": {
    name: "Mısır Tohumu",
    description: "Sıcak terasları seven altın sarısı mısır tohumları."
  },
  "seed.tomato": {
    name: "Domates Tohumu",
    description: "Güneşte kızaran sulu sırık domatesi tohumları. Yaz aylarında pazarda yüksek rağbet görür."
  },
  "seed.potato": {
    name: "Tohumluk Patates",
    description: "Serin, tavlı toprağa gömülmeye hazır göz vermiş patates yumruları."
  },
  "seed.carrot": {
    name: "Havuç Tohumu",
    description: "Gevşek, serin toprakta düzgün boy atan tatlı havuç tohumları."
  },
  "seed.flax": {
    name: "Keten Tohumu",
    description: "Sağlam misina, ip ve ağ dokumak için ekilen lif bitkisi tohumları."
  },
  "seed.apple_sapling": {
    name: "Elma Fidanı",
    description: "Mevsimler boyu kütür kütür meyve veren körpe meyve bahçesi ağacı."
  },
  "seed.sunflower": {
    name: "Ayçiçeği Tohumu",
    description: "Gündoğumu teraslarının sıcak güneşini seven, boylu ayçiçeği tohumları."
  },
  "seed.olive_sapling": {
    name: "Zeytin Fidanı",
    description: "Güneye bakan taşlı, sıcak ve süzek yamaçları seven gürbüz zeytin fidanı."
  },

  // --- Produce & Harvested Goods ---
  "produce.wheat": {
    name: "Başak Buğday",
    description: "Altın sarısı olgun buğday başakları. Değirmende una ve yem harcına çekilir."
  },
  "produce.barley": {
    name: "Dolgun Arpa",
    description: "Ağır arpa başakları. Balık yemi harmanlamak için en uygun tahıl."
  },
  "produce.corn": {
    name: "Süt Mısır",
    description: "Tarladan yeni toplanmış tatlı, taze koçan mısır."
  },
  "produce.tomato": {
    name: "Tarla Domatesi",
    description: "Dalında kızarmış, kokulu ve dolgun kırmızı domates."
  },
  "produce.potato": {
    name: "Taze Patates",
    description: "Tavlı topraktan sökülmüş doyurucu yumru. Yemeklere ve pazara uygun."
  },
  "produce.carrot": {
    name: "Körpe Havuç",
    description: "Gevrek, tatlı ve canlı turuncu rengiyle sofralık taze havuç."
  },
  "produce.flax": {
    name: "Keten Sapı",
    description: "Halat, ip ve yelken bezi dokumak için tarladan derlenmiş ham bitki lifi."
  },
  "produce.apple": {
    name: "Köy Elması",
    description: "Ağacından özenle toplanmış sulu, çıtır bahçe elması."
  },
  "produce.sunflower_seed": {
    name: "Ayçekirdeği",
    description: "Güneş teraslarından hasat edilmiş, değirmende öğütülebilen dolgun çekirdekler."
  },
  "produce.olive": {
    name: "Kıyı Zeytini",
    description: "Teras bahçelerinin dalından toplanmış etli, diri zeytin."
  },

  // --- Fishing Supplies & Processing Materials ---
  "item.ground_grain": {
    name: "Öğütülmüş Tahıl",
    description: "Taş değirmende ince çekilmiş buğday veya arpa unu. Balık yemi hamurunun ana harcı."
  },
  "item.bait_worms": {
    name: "Canlı Yem Solucanı",
    description: "Nemli komposttan ayıklanmış kıpır kıpır solucanlar. Basit olta avcılığı ve yem karma için temel malzeme."
  },
  "item.chum_bucket": {
    name: "Yem Kovası",
    description: "Öğütülmüş tahıl ve canlı yemle karılmış kokulu yem harcı. Sürüleri hareketlendirmek için suya serpilir."
  },
  "item.chum_rich": {
    name: "Zengin Yem Harmanı",
    description: "Sürüyü iki kat daha uzun süre beslenmede tutan yoğun kıvamlı yem harcı. Suya ilk serpilen koku avı başlatır."
  },
  "item.chum_deep": {
    name: "Derinsu Dip Yemi",
    description: "Dip balıklarını cezbetmek için kırıntılarla ağırlaştırılmış dip yemi. Kokusu dağılmadıkça dip avcıları daha kararlı vurur."
  },
  "item.basic_lure": {
    name: "Örgü Maket Yem",
    description: "Bitki lifleriyle örülmüş, kokulu özü olan parlak sahte yem. Sportif balıkçılık için şarttır; basit atışta vuruşu dengeler."
  },
  "item.salt_cured_fish": {
    name: "Tuzlu Kuru Balık",
    description: "Gündoğumu rüzgârında yarılıp tuzlanarak kurutulmuş balık. Buz istemez, bozulmadan uzak diyarlara taşınır."
  },
  "item.meal_harvest_bowl": {
    name: "Bereket Çanağı",
    description: "Tahıl yatağında demlenmiş taze kök sebzeler. Ağır iş gününde gücü ve Emeği tazeleyen doyurucu bir öğün."
  },
  "item.meal_fish_stew": {
    name: "Kıyı Balık Güveci",
    description: "Taze av balıkları ve tarla kök sebzeleriyle kaynatılmış nefis çorba. Denizdeki uzun mesainin limandaki yakıtı."
  },
  "item.meal_orchard_tart": {
    name: "Elmalı Köy Turtası",
    description: "Öğütülmüş tahıl hamuruna sarılmış fırın elmaları. Tatlı, hafif ve heybede kolay taşınır."
  },
  "item.hardwood_blank": {
    name: "Sert Ahşap Takoz",
    description: "Alet sapları ve sağlam tekne aksamı için damarı düzgün biçilmiş kuru sert kereste."
  },
  "item.tanned_leather": {
    name: "Tabaklanmış Deri",
    description: "Çizme, kayış ve su geçirmez ek yerleri için yumuşatılmış sağlam işlik deri."
  },
  "item.tool_steel": {
    name: "Alet Çeliği",
    description: "Tarla ve zanaat aletlerine keskin ve uzun ömürlü ağız vermek için tavlanmış sert çelik külçe."
  },
  "item.linen_roll": {
    name: "Keten Topu",
    description: "Keten liflerinden dokunmuş, hava alan ama yıpranmaya dirençli dayanıklı kumaş topu."
  },
  "item.copper_sheet": {
    name: "Bakır Levha",
    description: "İbrik, süzgeç ve su sızdırmaz kenarlar dövmek için dövülebilir saf bakır levha."
  },
  "item.brass_fittings": {
    name: "Pirinç Aksam",
    description: "Tuzlu deniz suyuna ve pasa dirençli tokalar, perçinler ve alet halkaları."
  },
  "item.oiled_canvas": {
    name: "Yağlı Branda Bezi",
    description: "Balık yağıyla yoğrulup su geçirmez hale getirilmiş esnek ve dayanıklı keten branda."
  },
  "item.fish_scraps": {
    name: "Balık Sakatatı",
    description: "Temizlenen balıklardan arta kalan kısımlar. Zengin bir organik gübre kaynağıdır."
  },
  "item.basic_fertilizer": {
    name: "Balık Gübresi",
    description: "Balık kırıntılarından fermente edilmiş besin dolu toprak katkısı. Tarlanın verimini tazeler."
  },
  "item.compost_starter": {
    name: "Kompost Mayası",
    description: "Ekin artıklarını ve sapları solucanlı can toprağa çeviren zengin aktif kültür."
  },
  "item.plant_matter": {
    name: "Bitki Artığı",
    description: "Komposta atılacak yaprak, kabuk, saman ve budama artıkları."
  },
  "item.boat_fuel": {
    name: "Motor Yakıtı",
    description: "Motorlu kıyı filikaları için damıtılmış gazyağı yakıtı."
  },
  "item.crushed_ice": {
    name: "Kırık Buz",
    description: "Yalıtımlı buz kalıbı. Tekne ambarlarında ve depolarda balıkların tazeliğini korur."
  },

  // --- Harbor-Tradable Basic Catches (matching ContentRegistry.fishSpecies) ---
  "fish.perch": {
    name: "Tatlısu Levreği",
    description: "Basit bir kargı kamışla ırmaktan yakalanan kılçıklı nehir levreği."
  },
  "fish.mackerel": {
    name: "Kıyı Uskumrusu",
    description: "Kıyı açıklarında sürüler halinde yüzen parlak pullu göçmen balık."
  },
  "fish.carp": {
    name: "Pullu Sazan",
    description: "Tatlı su bentlerinde ve sakin ırmaklarda basit oltaya gelen dayanıklı sazan."
  },
  "fish.sardine": {
    name: "Gündoğumu Sardalyası",
    description: "Koyun berrak sularında parıldayan gümüşi küçük sürü balığı."
  },
  "fish.sea_bream": {
    name: "Altın Çipura",
    description: "Resif kıyısında yaşayan, böğründeki altın parıltısıyla seçilen leziz çipura."
  }
};
