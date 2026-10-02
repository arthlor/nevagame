import React, { useState } from "react";
import { ControlsReference } from "./ControlsReference";
import { handleTabListKeyDown } from "../useTabListKeyboard";
import { playUiSound } from "../audio/uiAudio";
import { useTranslation } from "../../i18n/useTranslation";
import {
  IconBoat,
  IconCoin,
  IconCompass,
  IconFish,
  IconLedger,
  IconSprout
} from "./HudIcons";

export type GuidePage = "actions" | "field" | "waters" | "trade";

export interface HowToPlayGuideProps {
  initialPage?: GuidePage;
}

export const HowToPlayGuide: React.FC<HowToPlayGuideProps> = ({ initialPage = "actions" }) => {
  const [page, setPage] = useState<GuidePage>(initialPage);
  const { locale } = useTranslation();
  const isTr = locale === "tr";

  const pages: Array<{ id: GuidePage; label: string; icon: React.ReactNode }> = [
    { id: "actions", label: isTr ? "Eylemler" : "Actions", icon: <IconCompass size={14} aria-hidden="true" /> },
    { id: "field", label: isTr ? "Tarla" : "Field", icon: <IconSprout size={14} aria-hidden="true" /> },
    { id: "waters", label: isTr ? "Sular" : "Waters", icon: <IconFish size={14} aria-hidden="true" /> },
    { id: "trade", label: isTr ? "Ticaret" : "Trade", icon: <IconCoin size={14} aria-hidden="true" /> }
  ];

  const selectPage = (next: GuidePage, tab: HTMLElement) => {
    if (next === page) return;
    playUiSound("page-turn");
    setPage(next);
    const pagesContainer = tab.closest<HTMLElement>(".journal-open-pages");
    if (pagesContainer) pagesContainer.scrollTop = 0;
  };

  return (
    <section className="guidebook-container" aria-label={isTr ? "Rehber" : "Guide"}>
      <div className="journal-page-heading">
        <h2>{isTr ? "Kıyı Boyunca Çalışmak" : "Working along the coast"}</h2>
      </div>
      <nav className="guidebook-subtabs" role="tablist" aria-label={isTr ? "Rehber sayfaları" : "Guide pages"} onKeyDown={handleTabListKeyDown}>
        {pages.map((entry) => (
          <button
            key={entry.id}
            type="button"
            id={`guide-tab-${entry.id}`}
            role="tab"
            aria-selected={page === entry.id}
            aria-controls="guide-active-page"
            tabIndex={page === entry.id ? 0 : -1}
            className={`guidebook-subtab-btn ${page === entry.id ? "is-active" : ""}`}
            onClick={(event) => selectPage(entry.id, event.currentTarget)}
          >
            {entry.icon}{entry.label}
          </button>
        ))}
      </nav>

      <div
        id="guide-active-page"
        className="guidebook-content"
        role="tabpanel"
        aria-labelledby={`guide-tab-${page}`}
        tabIndex={0}
      >
        {page === "actions" && <ActionsGuide isTr={isTr} />}
        {page === "field" && <FieldGuide isTr={isTr} />}
        {page === "waters" && <WatersGuide isTr={isTr} />}
        {page === "trade" && <TradeGuide isTr={isTr} />}
      </div>
    </section>
  );
};

const ActionsGuide: React.FC<{ isTr: boolean }> = ({ isTr }) => (
  <div className="guide-chapter">
    <div className="guide-header-card">
      <div className="guide-header-badge">
        <IconCompass size={22} aria-hidden="true" />
      </div>
      <div className="guide-header-text">
        <h3>{isTr ? "Yolunu bulmak" : "Finding your way"}</h3>
        <p className="guide-lead">
          {isTr
            ? "Karakterinin yanındaki eylemi izle. Gereken alet otomatik kuşanılır."
            : "Follow the action beside your character. The tool you need is equipped automatically."}
        </p>
      </div>
    </div>
    <ControlsReference className="guide-controls-reference" />
    <details className="guide-work-notes">
      <summary>{isTr ? "Emek ve depar" : "Work & Sprint"}</summary>
      <p>{isTr
        ? "İşler Emek harcar. Uyumak, yemek ve günlük işler Emek kazandırır; deparın dayanıklılığı ayrıdır."
        : "Tasks use Work. Sleep, meals, and daily chores restore it; Sprint has separate stamina."}</p>
      <p>{isTr
        ? "Günlük işte ibre altın şeride geldiğinde vur."
        : "At a chore station, strike when the needle reaches the gold band."}</p>
    </details>
  </div>
);

const FieldGuide: React.FC<{ isTr: boolean }> = ({ isTr }) => (
  <div className="guide-chapter">
    <div className="guide-header-card">
      <div className="guide-header-badge">
        <IconSprout size={22} aria-hidden="true" />
      </div>
      <div className="guide-header-text">
        <h3>{isTr ? "Tohumdan hasada" : "From seed to harvest"}</h3>
        <p className="guide-lead">
          {isTr
            ? "Mahsulleri sula, olgunlaşınca hasat et."
            : "Keep crops watered and harvest when mature."}
        </p>
      </div>
    </div>
    <div className="guide-flow-track">
      <div className="guide-step-card">
        <div className="guide-step-num"><span>1</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Tohum Seçimi" : "Select Seed Stock"}</h4>
          <p>
            {isTr
              ? "Çiftlikte Ek eylemini seç, ardından ekmek istediğin tohumu seç."
              : "Choose Plant at a farm, then select a seed."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Tohum türünü mevsime göre seç" : "Suit seed varieties to the season"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Dikim Yeri Seçimi" : "Choose a planting spot"}</h4>
          <p>
            {isTr
              ? "Boş toprağa nişan al. Köşe işaretleri mahsulün kaplayacağı alanı gösterir."
              : "Aim at clear ground. The corner markers show the crop footprint."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Mahsuller arasında ve yapıların uzağında yeterli mesafe bırak" : "Leave room between crops and away from buildings"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Bakım ve Can Suyu" : "Tend & Nourish"}</h4>
          <p>
            {isTr
              ? "Mahsulü incele; kuruysa sula. Yağmur da toprağı sular."
              : "Inspect each crop; water it when dry. Rain waters the soil too."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Elle sulama Emek harcamaz; pompa tüm tarlayı bir seferde sular." : "Hand watering is free; the pump waters the field in one go."}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Hasat Zamanı" : "Bring in the harvest"}</h4>
          <p>
            {isTr
              ? "Olgun mahsulü topla. Köyde sat veya bir tezgâhta işle."
              : "Harvest mature crops. Sell them in the village or process them at a station."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Gösterilen yüksek özen yıldızlı ve kaliteli mahsul verir" : "Higher care yields star-quality crops"}
          </span>
        </div>
      </div>
    </div>
  </div>
);

const WatersGuide: React.FC<{ isTr: boolean }> = ({ isTr }) => (
  <div className="guide-chapter">
    <div className="guide-header-card">
      <div className="guide-header-badge">
        <IconFish size={22} aria-hidden="true" />
      </div>
      <div className="guide-header-text">
        <h3>{isTr ? "Suları Okumak" : "Reading the water"}</h3>
        <p className="guide-lead">
          {isTr
            ? "Kıyı boyundan olta savur veya açık denizdeki büyük balıklar için tekneni hazırla."
            : "Cast from the bank, or prepare your boat for larger fish offshore."}
        </p>
      </div>
    </div>
    <div className="guide-flow-track">
      <div className="guide-step-card">
        <div className="guide-step-num"><span>1</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Suları Okuma ve Savurma" : "Read Waters & Cast"}</h4>
          <p>
            {isTr ? (
              <>Balık tutabileceğin suya yaklaş. <span className="guide-inline-key">E</span> tuşuna basılı tut, savurmak için bırak.</>
            ) : (
              <>Approach fishable water. Hold <span className="guide-inline-key">E</span> to charge; release to cast.</>
            )}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Örme Sahte Yem zorunlu değildir ancak balığın iğneye oturmasını kolaylaştırır" : "A Woven Lure is optional here, but makes the hook more reliable"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Balığı kancala" : "Hook the bite"}</h4>
          <p>
            {isTr ? (
              <><span className="guide-inline-key">Space</span> ile kancala. Basılı tutarak yakalama çubuğunu yükselt, bırakıp indir; balığı çubukta tut.</>
            ) : (
              <>Hook with <span className="guide-inline-key">Space</span>. Hold to raise the catch bar; release to lower it. Keep the fish inside.</>
            )}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Kıyı avlarında Örme Sahte Yem isteğe bağlıdır" : "A Woven Lure is optional for basic catches"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Balıkla Mücadele" : "Follow the fish"}</h4>
          <p>
            {isTr ? (
              <>Büyük avda vurgulanan tepkiyi izle: <span className="guide-inline-key">W</span> ile sar, <span className="guide-inline-key">S</span> ile boşluk ver, <span className="guide-inline-key">A / D</span> ile yön ver. Gerilim sözcüklerini ve ibreyi gözden kaçırma.</>
            ) : (
              <>For sport fish, follow the highlighted response: reel with <span className="guide-inline-key">W</span>, give slack with <span className="guide-inline-key">S</span>, and steer with <span className="guide-inline-key">A / D</span>. Watch the tension words and needle.</>
            )}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Büyük avdan önce sürüyü yemle ve R ile sahte yemi tak" : "Before sport fishing, chum the school and arm a lure with R"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Avı Çekme ve İstifleme" : "Land & Pack the Catch"}</h4>
          <p>
            {isTr
              ? "Büyük avı ambarına veya eline al. Teknen yanaşınca yükü topla, köyün yük tezgâhına taşı."
              : "Keep a physical catch in a free hold slot or your hands. Collect it from the docked boat and carry it to a village trade counter."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Tazelik zamanla azalır — değerini korumak için buz kullan" : "Freshness degrades over time — use ice to preserve value"}
          </span>
        </div>
      </div>
    </div>
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconBoat size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>{isTr ? "Yoldaki Tazelik" : "Freshness on the Run"}</strong>
        <p>
          {isTr
            ? "Buz, ambardaki balığı taze tutar. Limandan malzeme al; elindeki balık yükünü köyde sat."
            : "Ice preserves fish in the hold. Buy supplies at the harbor; sell carried fish packs in the village."}
        </p>
      </div>
    </div>
  </div>
);

const TradeGuide: React.FC<{ isTr: boolean }> = ({ isTr }) => (
  <div className="guide-chapter">
    <div className="guide-header-card">
      <div className="guide-header-badge">
        <IconCoin size={22} aria-hidden="true" />
      </div>
      <div className="guide-header-text">
        <h3>{isTr ? "Malları Pazara Çıkarmak" : "Taking goods to market"}</h3>
        <p className="guide-lead">
          {isTr
            ? "Mahsulünü sat, yük taşı veya teslimat siparişlerini tamamla."
            : "Sell produce, carry trade packs, or fill delivery orders."}
        </p>
      </div>
    </div>
    <div className="guide-flow-track">
      <div className="guide-step-card">
        <div className="guide-step-num"><span>1</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Köy Pazarı Takası" : "Inland Exchange"}</h4>
          <p>
            {isTr
              ? "Köy tezgâhından tohum al; mahsul ve erzaklarını sat."
              : "Buy seeds at the village stall; sell produce and provisions."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Fiyat ve talebi tezgahtan kontrol et" : "Check the stall for price and demand"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Sandaldan Köye Taşıma" : "Boat to Village"}</h4>
          <p>
            {isTr
              ? "Yanaşmış teknenden yükü al. Eşekle taşı veya arabaya yükle. Köyde indir, yük tezgâhına elinde taşı."
              : "Collect a pack from your docked boat. Carry it on the donkey or load the carriage. Unload in the village and carry it to the trade counter."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Satacağın yükü elinde taşımalısın" : "Trade packs must be in your hands to sell"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Pazar Talep Değişimleri" : "Market Demand Shifts"}</h4>
          <p>
            {isTr
              ? "Fiyatın yanındaki ok, talebin yönünü gösterir. Sefer panosundan hedef ve güzergâh seç."
              : "The arrow beside a quote shows changing demand. Use the expedition board to choose a destination and route."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Sefere çıkmadan önce pazar fiyatlarını kontrol et" : "Check quotes before packing an expedition"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Lonca Teslimat Siparişleri" : "Guild Delivery Orders"}</h4>
          <p>
            {isTr
              ? "Siparişteki ürünleri süresi dolmadan belirtilen tezgâha teslim et."
              : "Deliver the listed goods to the named counter before the deadline."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Önce yol gereksinimlerini ve taşıma kapasiteni incele" : "Inspect transit requirements and hold capacity first"}
          </span>
        </div>
      </div>
    </div>
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconLedger size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>{isTr ? "Ambar ve Lojistik Hazırlığı" : "Hold & Logistics Preparation"}</strong>
        <p>
          {isTr
            ? "Ambar defterinden yük yerlerini, erzağını ve depolarını kontrol et."
            : "Check Hold & Stores for cargo space, supplies, and storage."}
        </p>
      </div>
    </div>
  </div>
);
