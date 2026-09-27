import { TRADE_PACK_NAMES_TR } from "../../tradePackNames";
// src/i18n/locales/tr/recipes.ts

import type { LocalizedRecipeText } from "../../types";

export const TR_RECIPES: Record<string, LocalizedRecipeText> = {
  "recipe.pack_wheat": {
    name: "Buğday Paketi Hazırla",
    description: "Hasat edilen buğdayları ticaret veya teslimat için standart yük paketine sarar."
  },
  "recipe.pack_barley": {
    name: "Arpa Paketi Hazırla",
    description: "Hasat edilen arpaları ticaret veya teslimat için standart yük paketine sarar."
  },
  "recipe.pack_tomato": {
    name: "Domates Paketi Hazırla",
    description: "Taze domatesleri kasalayıp ticaret veya teslimat için hazır paket haline getirir."
  },
  "recipe.pack_potato": {
    name: "Patates Paketi Hazırla",
    description: "Hasat edilen patatesleri çuvallayıp ticaret veya sevkiyat için hazırlar."
  },
  "recipe.pack_carrot": {
    name: "Havuç Paketi Hazırla",
    description: "Taze havuçları demetleyip ticaret veya teslimat için paketler."
  },
  "recipe.pack_corn": {
    name: "Mısır Paketi Hazırla",
    description: "Hasat edilen mısır koçanlarını ticaret veya teslimat için hazırlar."
  },
  "recipe.pack_flax": {
    name: "Keten Paketi Hazırla",
    description: "İşlenmemiş keten liflerini ticaret veya sevkiyat balyası haline getirir."
  },
  "recipe.pack_sunflower": {
    name: "Ayçekirdeği Paketi Hazırla",
    description: "Ayçiçeği hasadını çuvallayıp ticaret veya teslimat paketine dönüştürür."
  },
  "recipe.pack_apple_tree": {
    name: "Elma Paketi Hazırla",
    description: "Bahçe elmalarını kasalayıp pazar veya teslimat için hazır paket yapar."
  },
  "recipe.pack_olive_tree": {
    name: "Zeytin Paketi Hazırla",
    description: "Toplanan zeytinleri kasalayıp ticaret veya teslimat paketine dönüştürür."
  },
  // Milling & Grains
  "recipe.wheat_to_grain": {
    name: "Buğdayı Öğüt",
    description: "Buğday başaklarını el değirmeninde öğüterek balık yemi harcına çevirir."
  },
  "recipe.barley_to_grain": {
    name: "Arpayı Öğüt",
    description: "Arpa tanelerini el değirmeninde öğüterek yoğun tahıl unu elde eder."
  },
  "recipe.sunflower_to_grain": {
    name: "Ayçekirdeğini Öğüt",
    description: "Ayçiçeği çekirdeklerini öğüterek besleyici tahıl ununa dönüştürür."
  },

  // Tackle, Chums & Worms
  "recipe.craft_chum": {
    name: "Yem Kovası Kar",
    description: "Öğütülmüş tahıl ve canlı solucanları kararak balık yemi kovası hazırlar."
  },
  "recipe.craft_chum_rich": {
    name: "Zengin Yem Harmanı Yap",
    description: "Sürüyü daha uzun süre tutan kaliteli bir yem karışımı hazırlar."
  },
  "recipe.craft_chum_deep": {
    name: "Derinsu Dip Yemi Kar",
    description: "Dip balıklarını cezbeden ağırlaştırılmış dip yemi karışımı hazırlar."
  },
  "recipe.craft_lure": {
    name: "Örgü Maket Yem Bağla",
    description: "Keten lifi ve balık kırıntılarından sportif balıkçılık sahtesi bağlar."
  },
  "recipe.craft_lure_simple": {
    name: "Basit Sahte Yem Bük",
    description: "Bitki sapları ve solucanla pratik bir sahte yem büker."
  },
  "recipe.compost_worms": {
    name: "Yem Solucanı Üret",
    description: "Bitki artıkları ve kompost mayasıyla taze toprak solucanı yetiştirir."
  },

  // Fish Processing & Scraps
  "recipe.fish_to_fertilizer": {
    name: "Balıktan Gübre Yap",
    description: "Balık sakatatını işleyip toprağı besleyen organik gübreye dönüştürür."
  },
  "recipe.perch_to_scraps": {
    name: "Levrek Temizle",
    description: "Yakalanan tatlısu levreğini gübrelik ve yemlik sakatata ayırır."
  },
  "recipe.mackerel_to_scraps": {
    name: "Uskumru Temizle",
    description: "Uskumruyu ayıklayıp balık kırıntısına dönüştürür."
  },
  "recipe.carp_to_scraps": {
    name: "Sazan Temizle",
    description: "Pullu sazanı ayıklayıp zengin balık sakatatı elde eder."
  },
  "recipe.cure_sardine": {
    name: "Sardalya Tuzla ve Kurut",
    description: "Taze sardalyaları tuzlayarak uzun süre dayanan kuru balık hazırlar."
  },
  "recipe.sardine_to_scraps": {
    name: "Sardalya Ayıkla",
    description: "Küçük sardalyaları temizleyip taze balık kırıntısı çıkarır."
  },

  // Tailoring & Textiles
  "recipe.linen_roll": {
    name: "Keten Kumaşı Doku",
    description: "Keten saplarından tezgâhta sağlam kumaş topu dokur."
  },
  "recipe.oiled_canvas": {
    name: "Yağlı Branda Hazırla",
    description: "Keten kumaşı balık yağıyla işleyip su geçirmez brandaya dönüştürür."
  },
  "recipe.field_hat": {
    name: "Tarla Şapkası Dik",
    description: "Keten ve deriden geniş siperlikli koruyucu tarla şapkası diker."
  },
  "recipe.furrow_boots": {
    name: "Karık Çizmesi Dik",
    description: "Deri ve ketenden çamur tutmayan dayanıklı tarla çizmesi diker."
  },
  "recipe.tidewatch_cap": {
    name: "Kıyı Kasketi Dik",
    description: "Yağlı branda ve pirinç aksamla rüzgâr geçirmez balıkçı kasketi diker."
  },
  "recipe.harvest_apron": {
    name: "Hasat Önlüğü Dik",
    description: "Keten ve deriden cepli yumuşak hasat önlüğü diker."
  },
  "recipe.deck_boots": {
    name: "Güverte Çizmesi Dik",
    description: "Deri ve pirinç aksamla güvertede kaymayan denizci çizmesi diker."
  },
  "recipe.oilskin_coat": {
    name: "Yağlı Denizci Parkası Dik",
    description: "Yağlı brandadan fırtınaya meydan okuyan denizci parkası diker."
  },

  // Toolmaking & Metalwork
  "recipe.copper_rose_can": {
    name: "Bakır Süzgeçli İbrik Yap",
    description: "Bakır levha ve pirinç parçalarla ince akışlı sulama ibriği yapar."
  },
  "recipe.broad_sickle": {
    name: "Geniş Orak Döv",
    description: "Alet çeliği ve sert ahşaptan geniş ağızlı hasat orağı döver."
  },
  "recipe.long_spout_can": {
    name: "Uzun Ağızlı Sulama Kabı Yap",
    description: "Bakır ve pirinç parçalarla uzak tarhlara erişen sulama kabı yapar."
  },
  "recipe.balanced_sickle": {
    name: "Dengeli Orak Döv",
    description: "Alet çeliği ve pirinç halkalarla yormayan dengeli orak döver."
  },

  // Kitchen Provisions
  "recipe.cook_harvest_bowl": {
    name: "Bereket Çanağı Pişir",
    description: "Patates, havuç ve öğütülmüş tahılla doyurucu bir tarla aşı pişirir."
  },
  "recipe.batch_harvest_bowls": {
    name: "Kazan Dolusu Bereket Aşı",
    description: "Gelişmiş ustalıkla tek seferde iki porsiyon bereket çanağı hazırlar."
  },
  "recipe.cook_fish_stew": {
    name: "Kıyı Balık Güveci Pişir",
    description: "Taze tatlısu levreği ve kök sebzelerle sıcacık bir balık güveci kaynatır."
  },
  "recipe.batch_fish_stews": {
    name: "Büyük Kazan Balık Güveci",
    description: "Tek seferde iki porsiyon kıyı balık güveci pişirir."
  },
  "recipe.cook_orchard_tart": {
    name: "Elmalı Köy Turtası Fırınla",
    description: "Taze bahçe elmaları ve tahıl unuyla nefis bir meyve turtası fırınlar."
  }
};

for (const [id, name] of Object.entries(TRADE_PACK_NAMES_TR)) {
  const recipeId = `recipe.pack_${id.slice('trade.'.length)}`;
  if (!TR_RECIPES[recipeId]) {
    TR_RECIPES[recipeId] = {
      name: `${name} Hazırla`,
      description: `${name} üretip sevkiyat veya ticaret için hazırlar.`
    };
  } else if (!TR_RECIPES[recipeId].description) {
    TR_RECIPES[recipeId].description = `${name} üretip sevkiyat veya ticaret için hazırlar.`;
  }
}
