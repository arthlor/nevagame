// tests/unit/i18n.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { localeStore } from "../../src/i18n/localeStore";
import {
  t,
  getLocalizedItem,
  getLocalizedCrop,
  getLocalizedFish,
  getLocalizedEquipment,
  getLocalizedRod,
  getLocalizedBoat,
  getLocalizedRecipe,
  getLocalizedMarket,
  getLocalizedSkill,
  getLocalizedRank,
  getLocalizedShopkeepLine,
  getLocalizedStationTitle,
  getLocalizedCraftingState,
  getLocalizedNpc,
  getLocalizedQuestTrack,
  getLocalizedQuest,
  getLocalizedKnowledge,
  getLocalizedNotice,
  getLocalizedContract,
  getLocalizedHint,
  translateReason,
  getLocalizedMilestone
} from "../../src/i18n/i18n";
import { formatPauseDate, placeLabel } from "../../src/i18n/placesTr";
import { translateStatusChip } from "../../src/i18n/statusChipsTr";
import { translateEffectLine } from "../../src/i18n/equipmentEffectsTr";
import { translateExpeditionText } from "../../src/i18n/expeditionTr";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { TR_ITEMS } from "../../src/i18n/locales/tr/items";
import { TR_CROPS } from "../../src/i18n/locales/tr/crops";
import { TR_FISH } from "../../src/i18n/locales/tr/fish";
import { TR_EQUIPMENT } from "../../src/i18n/locales/tr/equipment";
import { TR_RODS } from "../../src/i18n/locales/tr/rods";
import { TR_BOATS } from "../../src/i18n/locales/tr/boats";
import { TR_RECIPES } from "../../src/i18n/locales/tr/recipes";
import { TR_MARKETS } from "../../src/i18n/locales/tr/markets";
import { TR_PROGRESSION } from "../../src/i18n/locales/tr/progression";
import { TR_NPCS } from "../../src/i18n/locales/tr/npcs";
import { TR_QUEST_TRACKS } from "../../src/i18n/locales/tr/questTracks";
import { TR_QUESTS } from "../../src/i18n/locales/tr/quests";
import { TR_KNOWLEDGE } from "../../src/i18n/locales/tr/knowledge";
import { TR_NOTICES } from "../../src/i18n/locales/tr/notices";
import { TR_CONTRACTS } from "../../src/i18n/locales/tr/contracts";
import { TR_HINTS } from "../../src/i18n/locales/tr/hints";
import { NOTICES } from "../../src/content/villageBulletin";

describe("Neva i18n Localization Engine", () => {
  beforeEach(() => {
    localeStore.set("en");
  });

  it("switches and reports active locale", () => {
    expect(localeStore.current).toBe("en");
    localeStore.set("tr");
    expect(localeStore.current).toBe("tr");
    localeStore.set("en");
    expect(localeStore.current).toBe("en");
  });

  it("resolves English UI keys correctly", () => {
    localeStore.set("en");
    expect(t("common.save")).toBe("Save");
    expect(t("hud.workCapacity")).toBe("Work");
    expect(t("escape.title")).toBe("At Ease");
  });

  it("resolves Turkish UI keys correctly", () => {
    localeStore.set("tr");
    expect(t("common.save")).toBe("Kaydet");
    expect(t("hud.workCapacity")).toBe("Emek");
    expect(t("escape.title")).toBe("Mola Yeri");
    expect(t("hud.satchel")).toBe("Heybe");
  });

  it("interpolates parameters in translation strings", () => {
    localeStore.set("en");
    expect(t("start.savedAt", { date: "yesterday" })).toBe("Saved: yesterday");

    localeStore.set("tr");
    expect(t("start.savedAt", { date: "dün" })).toBe("Kayıt: dün");
    expect(t("common.coinsAmount", { amount: 50 })).toBe("50 akçe");
  });

  it("falls back to English when a Turkish key is not present", () => {
    localeStore.set("tr");
    expect(t("start.brandName")).toBe("Neva Diyarı");
  });

  it("returns key path if key is not found anywhere", () => {
    expect(t("unknown.fake.key")).toBe("unknown.fake.key");
  });

  describe("Phase 2: Content Registry 100% Turkish Coverage", () => {
    it("covers 100% of all 48 canonical items", () => {
      expect(ContentRegistry.items.size).toBe(48);
      for (const [id, item] of ContentRegistry.items) {
        expect(TR_ITEMS[id], `Missing Turkish translation for item: ${id}`).toBeDefined();
        expect(TR_ITEMS[id].name, `Missing Turkish name for item: ${id}`).toBeTruthy();
        expect(TR_ITEMS[id].description, `Missing Turkish description for item: ${id}`).toBeTruthy();

        // Check getLocalizedItem in both locales
        const enRes = getLocalizedItem(item, "en");
        expect(enRes.name).toBe(item.name);

        const trRes = getLocalizedItem(item, "tr");
        expect(trRes.name).toBe(TR_ITEMS[id].name);
        expect(trRes.description).toBe(TR_ITEMS[id].description);
      }
    });

    it("covers 100% of all 10 canonical crops", () => {
      expect(ContentRegistry.crops.size).toBe(10);
      for (const [id, crop] of ContentRegistry.crops) {
        expect(TR_CROPS[id], `Missing Turkish translation for crop: ${id}`).toBeDefined();
        expect(TR_CROPS[id].name, `Missing Turkish name for crop: ${id}`).toBeTruthy();

        const enRes = getLocalizedCrop(crop, "en");
        expect(enRes.name).toBe(crop.name);

        const trRes = getLocalizedCrop(crop, "tr");
        expect(trRes.name).toBe(TR_CROPS[id].name);
      }
    });

    it("covers 100% of all 15 canonical fish species", () => {
      expect(ContentRegistry.fishSpecies.size).toBe(15);
      for (const [id, fish] of ContentRegistry.fishSpecies) {
        expect(TR_FISH[id], `Missing Turkish translation for fish: ${id}`).toBeDefined();
        expect(TR_FISH[id].name, `Missing Turkish name for fish: ${id}`).toBeTruthy();
        expect(TR_FISH[id].description, `Missing Turkish description for fish: ${id}`).toBeTruthy();

        const enRes = getLocalizedFish(fish, "en");
        expect(enRes.name).toBe(fish.name);

        const trRes = getLocalizedFish(fish, "tr");
        expect(trRes.name).toBe(TR_FISH[id].name);
        expect(trRes.description).toBe(TR_FISH[id].description);
      }
    });

    it("covers 100% of all 15 canonical equipment items", () => {
      expect(ContentRegistry.equipment.size).toBe(15);
      for (const [id, eq] of ContentRegistry.equipment) {
        expect(TR_EQUIPMENT[id], `Missing Turkish translation for equipment: ${id}`).toBeDefined();
        expect(TR_EQUIPMENT[id].name, `Missing Turkish name for equipment: ${id}`).toBeTruthy();
        expect(TR_EQUIPMENT[id].description, `Missing Turkish description for equipment: ${id}`).toBeTruthy();

        const enRes = getLocalizedEquipment(eq, "en");
        expect(enRes.name).toBe(eq.name);

        const trRes = getLocalizedEquipment(eq, "tr");
        expect(trRes.name).toBe(TR_EQUIPMENT[id].name);
        expect(trRes.description).toBe(TR_EQUIPMENT[id].description);
      }
    });

    it("covers 100% of all 5 canonical rods", () => {
      expect(ContentRegistry.rods.size).toBe(5);
      for (const [id, rod] of ContentRegistry.rods) {
        expect(TR_RODS[id], `Missing Turkish translation for rod: ${id}`).toBeDefined();
        expect(TR_RODS[id].name, `Missing Turkish name for rod: ${id}`).toBeTruthy();
        expect(TR_RODS[id].description, `Missing Turkish description for rod: ${id}`).toBeTruthy();

        const enRes = getLocalizedRod(rod, "en");
        expect(enRes.name).toBe(rod.name);

        const trRes = getLocalizedRod(rod, "tr");
        expect(trRes.name).toBe(TR_RODS[id].name);
        expect(trRes.description).toBe(TR_RODS[id].description);
      }
    });

    it("covers 100% of all canonical boats", () => {
      expect(ContentRegistry.boats.size).toBe(3);
      for (const [id, boat] of ContentRegistry.boats) {
        expect(TR_BOATS[id], `Missing Turkish translation for boat: ${id}`).toBeDefined();
        expect(TR_BOATS[id].name, `Missing Turkish name for boat: ${id}`).toBeTruthy();
        expect(TR_BOATS[id].description, `Missing Turkish description for boat: ${id}`).toBeTruthy();

        const enRes = getLocalizedBoat(boat, "en");
        expect(enRes.name).toBe(boat.name);

        const trRes = getLocalizedBoat(boat, "tr");
        expect(trRes.name).toBe(TR_BOATS[id].name);
        expect(trRes.description).toBe(TR_BOATS[id].description);
      }
    });

    it("covers 100% of all canonical recipes", () => {
      expect(ContentRegistry.recipes.size).toBe(62);
      for (const [id, recipe] of ContentRegistry.recipes) {
        expect(TR_RECIPES[id], `Missing Turkish translation for recipe: ${id}`).toBeDefined();
        expect(TR_RECIPES[id].name, `Missing Turkish name for recipe: ${id}`).toBeTruthy();
        expect(TR_RECIPES[id].description, `Missing Turkish description for recipe: ${id}`).toBeTruthy();

        const enRes = getLocalizedRecipe(recipe, "en");
        expect(enRes.name).toBe(recipe.name);

        const trRes = getLocalizedRecipe(recipe, "tr");
        expect(trRes.name).toBe(TR_RECIPES[id].name);
        expect(trRes.description).toBe(TR_RECIPES[id].description);
      }
    });

    it("covers 100% of all 6 canonical markets", () => {
      expect(ContentRegistry.markets.size).toBe(6);
      for (const [id, market] of ContentRegistry.markets) {
        expect(TR_MARKETS[id], `Missing Turkish translation for market: ${id}`).toBeDefined();
        expect(TR_MARKETS[id].name, `Missing Turkish name for market: ${id}`).toBeTruthy();
        expect(TR_MARKETS[id].description, `Missing Turkish description for market: ${id}`).toBeTruthy();

        const enRes = getLocalizedMarket(market, "en");
        expect(enRes.name).toBe(market.name);

        const trRes = getLocalizedMarket(market, "tr");
        expect(trRes.name).toBe(TR_MARKETS[id].name);
        expect(trRes.description).toBe(TR_MARKETS[id].description);
      }
    });

    it("covers all skills and proficiency ranks", () => {
      const skills = ["farming", "fishing", "processing", "trading"] as const;
      for (const skill of skills) {
        expect(TR_PROGRESSION.skills[skill]?.name).toBeTruthy();
        const trSkill = getLocalizedSkill(skill, "tr");
        expect(trSkill.name).toBe(TR_PROGRESSION.skills[skill]!.name);
      }

      expect(ContentRegistry.ranks.length).toBe(8);
      for (let i = 0; i < 8; i++) {
        expect(TR_PROGRESSION.ranks[i]?.title).toBeTruthy();
        const trRank = getLocalizedRank(i, "tr");
        expect(trRank.title).toBe(TR_PROGRESSION.ranks[i].title);
      }
    });

    it("deterministically rotates shopkeep lines by day in both languages", () => {
      const lineDay1En = getLocalizedShopkeepLine("market.harbor", 1, "en");
      const lineDay1Tr = getLocalizedShopkeepLine("market.harbor", 1, "tr");
      expect(lineDay1En).toBeTruthy();
      expect(lineDay1Tr).toBeTruthy();
      expect(lineDay1En).not.toBe(lineDay1Tr);

      // Determinism: same day returns same line
      expect(getLocalizedShopkeepLine("market.harbor", 1, "tr")).toBe(lineDay1Tr);
      // Different day can yield another line
      const lineDay2Tr = getLocalizedShopkeepLine("market.harbor", 2, "tr");
      expect(lineDay2Tr).toBeTruthy();
    });

    it("localizes crafting station titles and recipe states", () => {
      expect(getLocalizedStationTitle("hand-mill", "tr")).toBe("El Değirmeni");
      expect(getLocalizedStationTitle("workbench", "tr")).toBe("Çalışma Tezgâhı");
      expect(getLocalizedStationTitle("fish-table", "tr")).toBe("Balık Masası");
      expect(getLocalizedStationTitle("compost-bin", "tr")).toBe("Kompost Sandığı");
      expect(getLocalizedStationTitle("kitchen", "tr")).toBe("Köy Mutfağı");

      expect(getLocalizedCraftingState("craftable", "tr")).toBe("Hazır");
      expect(getLocalizedCraftingState("quest-target", "tr")).toBe("Görev");
      expect(getLocalizedCraftingState("blocked", "tr")).toBe("Eksik");
      expect(getLocalizedCraftingState("locked", "tr")).toBe("Kilitli");
    });
  });

  describe("Phase 3: World Narrative, Quests, NPCs, Knowledge & Village Bulletin", () => {
    it("covers 100% of all 9 canonical NPCs", () => {
      expect(ContentRegistry.npcs.size).toBe(9);
      for (const [id, npc] of ContentRegistry.npcs) {
        const trNpc = TR_NPCS[id];
        expect(trNpc, `Missing Turkish translation for NPC: ${id}`).toBeDefined();
        expect(trNpc!.name, `Missing Turkish name for NPC: ${id}`).toBeTruthy();
        expect(trNpc!.title, `Missing Turkish title for NPC: ${id}`).toBeTruthy();
        expect(trNpc!.district, `Missing Turkish district for NPC: ${id}`).toBeTruthy();
        expect(trNpc!.idleDialogue!.length, `Empty idle dialogue for NPC: ${id}`).toBeGreaterThanOrEqual(1);

        if (npc.beckonLines && npc.beckonLines.length > 0) {
          expect(trNpc!.beckonLines, `Missing beckon lines for NPC: ${id}`).toBeDefined();
          expect(trNpc!.beckonLines!.length).toBe(npc.beckonLines.length);
        }

        if (npc.recognitionDialogue && npc.recognitionDialogue.length > 0) {
          expect(trNpc!.recognitionDialogue, `Missing recognition dialogue for NPC: ${id}`).toBeDefined();
          expect(trNpc!.recognitionDialogue!.length).toBe(npc.recognitionDialogue.length);
        }

        // Test localized getter
        const enRes = getLocalizedNpc(npc, "en");
        expect(enRes.name).toBe(npc.name);
        expect(enRes.title).toBe(npc.title);

        const trRes = getLocalizedNpc(npc, "tr");
        expect(trRes.name).toBe(trNpc!.name);
        expect(trRes.title).toBe(trNpc!.title);
        expect(trRes.district).toBe(trNpc!.district);
      }
    });

    it("covers 100% of all quest tracks", () => {
      const tracks = ["track.main", "track.tides", "track.homestead", "track.tradelanes", "track.caravans"];
      for (const trackId of tracks) {
        expect(TR_QUEST_TRACKS[trackId], `Missing Turkish translation for track: ${trackId}`).toBeDefined();
        expect(TR_QUEST_TRACKS[trackId].title).toBeTruthy();

        const trRes = getLocalizedQuestTrack(trackId, "tr");
        expect(trRes.title).toBe(TR_QUEST_TRACKS[trackId].title);
      }
    });

    it("covers 100% of all canonical quests and objectives", () => {
      expect(ContentRegistry.quests.size).toBe(59);
      for (const [id, quest] of ContentRegistry.quests) {
        const trQuest = TR_QUESTS[id];
        expect(trQuest, `Missing Turkish translation for quest: ${id}`).toBeDefined();
        expect(trQuest!.actTitle, `Missing act title for quest: ${id}`).toBeTruthy();
        expect(trQuest!.questTitle, `Missing quest title for quest: ${id}`).toBeTruthy();
        expect(trQuest!.introDialogue!.length, `Intro dialogue mismatch for quest: ${id}`).toBe(quest.introDialogue.length);
        expect(trQuest!.completionDialogue!.length, `Completion dialogue mismatch for quest: ${id}`).toBe(quest.completionDialogue.length);

        if (quest.herald?.lines && quest.herald.lines.length > 0) {
          expect(trQuest!.heraldLines, `Missing herald lines for quest: ${id}`).toBeDefined();
          expect(trQuest!.heraldLines!.length).toBe(quest.herald.lines.length);
        }

        // Verify every objective step has a Turkish description
        for (const objective of quest.objectives) {
          expect(
            trQuest!.objectives?.[objective.id]?.description,
            `Missing objective description for quest ${id} objective ${objective.id}`
          ).toBeTruthy();
        }

        // Test localized getter
        const enRes = getLocalizedQuest(quest, "en");
        expect(enRes.questTitle).toBe(quest.questTitle);
        expect(enRes.actTitle).toBe(quest.actTitle);

        const trRes = getLocalizedQuest(quest, "tr");
        expect(trRes.questTitle).toBe(TR_QUESTS[id].questTitle);
        expect(trRes.actTitle).toBe(TR_QUESTS[id].actTitle);
      }
    });

    it("covers 100% of all 28 knowledge entries", () => {
      expect(ContentRegistry.knowledge.size).toBe(28);
      for (const [id, entry] of ContentRegistry.knowledge) {
        expect(TR_KNOWLEDGE[id], `Missing Turkish translation for knowledge: ${id}`).toBeDefined();
        expect(TR_KNOWLEDGE[id].title, `Missing Turkish title for knowledge: ${id}`).toBeTruthy();
        expect(TR_KNOWLEDGE[id].summary, `Missing Turkish summary for knowledge: ${id}`).toBeTruthy();

        const enRes = getLocalizedKnowledge(entry, "en");
        expect(enRes.title).toBe(entry.title);

        const trRes = getLocalizedKnowledge(entry, "tr");
        expect(trRes.title).toBe(TR_KNOWLEDGE[id].title);
        expect(trRes.summary).toBe(TR_KNOWLEDGE[id].summary);
      }
    });

    it("covers 100% of all 14 village bulletin notices", () => {
      expect(NOTICES.length).toBe(14);
      for (const notice of NOTICES) {
        expect(TR_NOTICES[notice.id], `Missing Turkish translation for notice: ${notice.id}`).toBeDefined();
        expect(TR_NOTICES[notice.id].source, `Missing Turkish source for notice: ${notice.id}`).toBeTruthy();
        expect(TR_NOTICES[notice.id].title, `Missing Turkish title for notice: ${notice.id}`).toBeTruthy();
        expect(TR_NOTICES[notice.id].body, `Missing Turkish body for notice: ${notice.id}`).toBeTruthy();

        const enRes = getLocalizedNotice(notice, "en");
        expect(enRes.title).toBe(notice.title);

        const trRes = getLocalizedNotice(notice, "tr");
        expect(trRes.title).toBe(TR_NOTICES[notice.id].title);
        expect(trRes.source).toBe(TR_NOTICES[notice.id].source);
        expect(trRes.body).toBe(TR_NOTICES[notice.id].body);
      }
    });

    it("covers 100% of all 34 market delivery contract templates", () => {
      const contractIds = Object.keys(TR_CONTRACTS);
      expect(contractIds.length).toBe(34);
      for (const id of contractIds) {
        const contract = TR_CONTRACTS[id];
        expect(contract.title, `Missing Turkish title for contract: ${id}`).toBeTruthy();
        expect(contract.requesterName, `Missing Turkish requester for contract: ${id}`).toBeTruthy();
        expect(contract.description, `Missing Turkish description for contract: ${id}`).toBeTruthy();

        const trRes = getLocalizedContract(id, "tr");
        expect(trRes.title).toBe(contract.title);
        expect(trRes.requesterName).toBe(contract.requesterName);
        expect(trRes.description).toBe(contract.description);
      }
    });
  });

  describe("Phase 4: Tutorials, Notifications & Typography Polish", () => {
    it("renders HowToPlayGuide in English and Turkish without errors", async () => {
      const { HowToPlayGuide } = await import("../../src/ui/components/HowToPlayGuide");
      const React = await import("react");
      const { renderToString } = await import("react-dom/server");

      localeStore.set("en");
      const htmlEn = renderToString(React.createElement(HowToPlayGuide));
      expect(htmlEn).toContain("Working along the coast");
      expect(htmlEn).toContain("Actions");
      expect(htmlEn).toContain("Field");
      expect(htmlEn).toContain("Waters");
      expect(htmlEn).toContain("Trade");
      expect(htmlEn).toContain("Finding your way");
      expect(htmlEn).toContain("Surveying the Soil");

      localeStore.set("tr");
      const htmlTrActions = renderToString(React.createElement(HowToPlayGuide, { initialPage: "actions" }));
      expect(htmlTrActions).toContain("Kıyı Boyunca Çalışmak");
      expect(htmlTrActions).toContain("Eylemler");
      expect(htmlTrActions).toContain("Tarla");
      expect(htmlTrActions).toContain("Sular");
      expect(htmlTrActions).toContain("Ticaret");
      expect(htmlTrActions).toContain("Yolunu bulmak");
      expect(htmlTrActions).toContain("Toprağı İnceleme");

      const htmlTrField = renderToString(React.createElement(HowToPlayGuide, { initialPage: "field" }));
      expect(htmlTrField).toContain("Tohum Seçimi");
      expect(htmlTrField).toContain("Tarlayı Okumak");

      const htmlTrWaters = renderToString(React.createElement(HowToPlayGuide, { initialPage: "waters" }));
      expect(htmlTrWaters).toContain("Suları Okuma ve Savurma");
      expect(htmlTrWaters).toContain("Yoldaki Tazelik");

      const htmlTrTrade = renderToString(React.createElement(HowToPlayGuide, { initialPage: "trade" }));
      expect(htmlTrTrade).toContain("Köy Pazarı Takası");
      expect(htmlTrTrade).toContain("Ambar ve Lojistik Hazırlığı");
    });

    it("renders ControlsReference in English and Turkish with correct translated bindings", async () => {
      const { ControlsReference } = await import("../../src/ui/components/ControlsReference");
      const React = await import("react");
      const { renderToString } = await import("react-dom/server");

      localeStore.set("en");
      const htmlEn = renderToString(React.createElement(ControlsReference));
      expect(htmlEn).toContain("Moving around");
      expect(htmlEn).toContain("Working the world");
      expect(htmlEn).toContain("Fishing");
      expect(htmlEn).toContain("Menus");
      expect(htmlEn).toContain("Walk, or steer a boat");
      expect(htmlEn).toContain("Sprint");

      localeStore.set("tr");
      const htmlTr = renderToString(React.createElement(ControlsReference));
      expect(htmlTr).toContain("Hareket &amp; Yön");
      expect(htmlTr).toContain("Dünya &amp; Çiftlik");
      expect(htmlTr).toContain("Balıkçılık &amp; Deniz");
      expect(htmlTr).toContain("Menüler &amp; Defter");
      expect(htmlTr).toContain("Yürü veya tekneye yön ver");
      expect(htmlTr).toContain("Depar at");
      expect(htmlTr).toContain("Yürürken dayanıklılık harcar");
      expect(htmlTr).toContain("Seyir Defteri");
      expect(htmlTr).toContain("Sefer Panosu");
    });

    it("localizes weather labels accurately", async () => {
      const { formatWeatherLabel } = await import("../../src/ui/weatherPresentation");

      localeStore.set("en");
      expect(formatWeatherLabel("clear")).toBe("Clear sky");
      expect(formatWeatherLabel("light-rain")).toBe("Light rain");
      expect(formatWeatherLabel("storm")).toBe("Storm");

      localeStore.set("tr");
      expect(formatWeatherLabel("clear")).toBe("Açık Gökyüzü");
      expect(formatWeatherLabel("cloudy")).toBe("Bulutlu");
      expect(formatWeatherLabel("light-rain")).toBe("Çisenti");
      expect(formatWeatherLabel("heavy-rain")).toBe("Sağanak Yağış");
      expect(formatWeatherLabel("windy")).toBe("Rüzgârlı");
      expect(formatWeatherLabel("fog")).toBe("Sisli");
      expect(formatWeatherLabel("storm")).toBe("Fırtına");
      expect(formatWeatherLabel("drought")).toBe("Kuraklık");
    });

    it("localizes contextual tutorial hints", () => {
      const enHint = getLocalizedHint("hint.tide_cycle", "Tide cycle", "The sea rises and falls.", "en");
      expect(enHint.title).toBe("Tides & Moon");
      expect(enHint.message).toContain("moon phase");

      const trHint = getLocalizedHint("hint.tide_cycle", "Tide cycle", "The sea rises and falls.", "tr");
      expect(trHint.title).toBe("Gelgit & Ay");
      expect(trHint.message).toContain("ay döngüsüyle");

      const fallback = getLocalizedHint("hint.unknown", "Fallback Title", "Fallback Msg", "tr");
      expect(fallback.title).toBe("Fallback Title");
      expect(fallback.message).toBe("Fallback Msg");
    });

    it("translates action failure reasons and notifications to Turkish", () => {
      expect(translateReason("Dismount first", "tr")).toBe("Önce binek veya arabadan in");
      expect(translateReason("Dismount first", "en")).toBe("Dismount first");
      expect(translateReason("The satchel is full", "tr")).toBe("Heyben tamamen dolu");
      expect(translateReason("Need 8 Work to plant · 3 available", "tr")).toBe("Ekim için 8 Emek gerekiyor · Elinde 3 var");
      expect(translateReason("Rested until morning · +12 Work", "tr")).toBe("Sabaha kadar dinlenildi · +12 Emek");
      expect(translateReason("Sold 5 items for 100 G", "tr")).toBe("5 parça eşya 100 akçeye satıldı");
    });

    it("localizes standing records and milestones to Turkish", () => {
      const discovery = {
        id: "record.discovery.river",
        tier: "harbor" as const,
        title: "Log every fish in Freshwater river",
        detail: "Catch one of each of the 3 species that range here.",
        achieved: false,
        followable: true,
        progress: 0.33,
        currentLabel: "1 / 3"
      };
      const trDiscovery = getLocalizedMilestone(discovery, "tr");
      expect(trDiscovery.title).toBe("Irmak ve Gölet sularındaki tüm balıkları kaydet");
      expect(trDiscovery.detail).toContain("Bu sularda yaşayan türlerin");

      const weight = {
        id: "record.weight.fish.mirror_carp",
        tier: "harbor" as const,
        title: "Mirror Carp weight record",
        detail: "Land one at 8.5 kg or better.",
        achieved: false,
        followable: true,
        progress: 0.5,
        currentLabel: "4.2 / 8.5 kg"
      };
      const trWeight = getLocalizedMilestone(weight, "tr");
      expect(trWeight.title).toBe("Aynalı Sazan ağırlık rekoru");
      expect(trWeight.detail).toContain("8.5 kg veya daha ağır");

      const sweep = {
        id: "record.sweep.prize_crop",
        tier: "field" as const,
        title: "Show-quality grower",
        detail: "Bring any crop in at prize grade.",
        achieved: true,
        followable: false,
        progress: 1,
        currentLabel: "achieved"
      };
      const trSweep = getLocalizedMilestone(sweep, "tr");
      expect(trSweep.title).toBe("Sergi kalitesinde çiftçi");
    });

    it("verifies zero mojibake and valid Turkish diacritics across all localization dictionaries", () => {
      const allDics = [
        TR_ITEMS,
        TR_CROPS,
        TR_FISH,
        TR_EQUIPMENT,
        TR_RODS,
        TR_BOATS,
        TR_RECIPES,
        TR_MARKETS,
        TR_PROGRESSION,
        TR_NPCS,
        TR_QUEST_TRACKS,
        TR_QUESTS,
        TR_KNOWLEDGE,
        TR_NOTICES,
        TR_CONTRACTS,
        TR_HINTS
      ];

      const serialized = JSON.stringify(allDics);

      // Check for common UTF-8 encoding corruption / mojibake artifacts
      expect(serialized).not.toContain("\uFFFD");
      expect(serialized).not.toContain("Ã§");
      expect(serialized).not.toContain("Ã¶");
      expect(serialized).not.toContain("Ã¼");
      expect(serialized).not.toContain("Ä±");
      expect(serialized).not.toContain("ÅŸ");
      expect(serialized).not.toContain("ÄŸ");

      // Verify authentic Turkish characters are present
      expect(serialized).toMatch(/[çğışöüÇĞİŞÖÜ]/);
    });
  });
});

describe("Turkish display gaps", () => {
  it("translates place labels and the pause date", () => {
    expect(placeLabel("Pinewatch Forest", "en")).toBe("Pinewatch Forest");
    expect(placeLabel("Pinewatch Forest", "tr")).toBe("Çamlıgöz Ormanı");
    expect(placeLabel("Open Waters", "tr")).toBe("Açık Sular");
    expect(placeLabel("Village Produce Market", "tr")).toBe("Köy Ürünleri Pazarı");
    expect(formatPauseDate("Day 3 of Spring · 14:30", "tr")).toBe("3. Gün, İlkbahar · 14:30");
    expect(formatPauseDate("Day 3 of Spring · 14:30", "en")).toBe("Day 3 of Spring · 14:30");
  });

  it("translates status chips", () => {
    expect(translateStatusChip({
      id: "overburdened",
      label: "Overburdened",
      description: "Carrying a fish with both hands. Movement 18% slower."
    }, "tr")).toEqual({
      label: "Ağır Yük",
      description: "Balığı iki elle taşıyorsun. Hareket %18 yavaş."
    });
    expect(translateStatusChip({
      id: "well-rested",
      label: "Well Rested",
      description: "Labor reserves are full. Productive work energy ready."
    }, "tr").label).toBe("Dinç");
  });

  it("translates an equipment effect line", () => {
    expect(translateEffectLine("15% less Work for plant and fertilize; integer rounding may limit small costs", "tr"))
      .toBe("ekim ve gübreleme için %15 daha az Emek; küçük bedellerde tam sayı yuvarlaması sınır koyabilir");
    expect(translateEffectLine("No specialist bonus", "en")).toBe("No specialist bonus");
  });

  it("translates expedition board sentences", () => {
    expect(translateExpeditionText("Crisp Carrot delivery", "tr")).toBe("Körpe Havuç teslimatı");
    expect(translateExpeditionText("From 120 G contract", "tr")).toBe("120 akçelik sözleşme");
    expect(translateExpeditionText("Deadline has passed", "tr")).toBe("Süre doldu");
    expect(translateExpeditionText("2h 15m left", "tr")).toBe("2 sa 15 dk kaldı");
    expect(translateExpeditionText("Unsafe water", "tr")).toBe("Tehlikeli su");
  });

  it("translates a reason that used to fall through", () => {
    expect(translateReason("Rest in the farmhouse", "tr")).toBe("Çiftlik evinde dinlen");
    expect(translateReason("Planting needs 8 Work · 3 available · rest, eat, or work to recover", "tr"))
      .toBe("Ekim için 8 Emek gerek · Elinde 3 var · dinlen, ye ya da çalışarak toparla");
    expect(translateReason("Still unknown to the coast", "tr")).toBe("Still unknown to the coast");
  });
});
