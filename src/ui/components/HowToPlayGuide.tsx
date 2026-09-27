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
  IconSparkle,
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
            ? "Konuşmak, tarlayla ilgilenmek veya olta savurmak için aletlerinin üstündeki yönlendirmeleri izle. Emek yalnızca başarılı işlerde harcanır; dinlenerek, erzak atıştırarak veya amelelik yaparak yenilenir — bir iş tezgâhında E'ye bas ve tam hakkını almak için ibre altın şeride denk geldiğinde vur. Depar atmak ise kendi dayanıklılığını tüketir."
            : "Follow the prompt above your tools to talk, tend crops, or cast. Work is spent on successful tasks and refilled by resting, eating provisions, or working a labor shift — press E at a chore station and strike as the needle crosses the gold band for the full share. Sprinting uses its own stamina."}
        </p>
      </div>
    </div>
    <ControlsReference className="guide-controls-reference" />
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconSparkle size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>{isTr ? "Toprağı İnceleme" : "Surveying the Soil"}</strong>
        <p>
          {isTr ? (
            <>Toprak nemini, bereketini ve mahsul durumunu doğrudan arazide görmek için herhangi bir tarla parselindeyken <span className="guide-inline-key">Alt</span> tuşuna basılı tut.</>
          ) : (
            <>Hold <span className="guide-inline-key">Alt</span> while standing on any farm plot to read soil moisture, fertility, and crop status directly in the world.</>
          )}
        </p>
      </div>
    </div>
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
            ? "Tohum seçiminden hasada dek gösterilen özen ve kıyı mikrokliması, mahsulün olgunlaşmasını ve kalitesini belirler."
            : "From seed selection to harvest, care and local micro-climate govern crop maturity and quality along the coast."}
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
              ? "İşlenmiş toprağın yanında dururken tohumları alet kemerine kuşan ya da Heybenden seç."
              : "Equip seeds in your tool belt or select from your Satchel while standing near tilled soil."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Tohum türünü mevcut toprak nemine göre seç" : "Suit seed varieties to current soil moisture"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Dikim Yeri Seçimi" : "Choose a planting spot"}</h4>
          <p>
            {isTr
              ? "Çiftliğindeki boş toprağa nişan al. Köşe işaretleri tek bir mahsulün kaplayacağı alanı gösterir."
              : "Aim at clear ground inside your farm. The corner markers show the space for one crop."}
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
              ? "Mahsulün nemini ve aşamasını kontrol et. Kıyı yağmurları parselleri doğal yoldan sular; kurak günlerde Sulama İbriğini kullan."
              : "Inspect crops for moisture and stage. Coastal rain quenches plots naturally; use your Watering Can during dry spells."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Sulamak Emek harcar, o yüzden yağmurları iyi değerlendir" : "Watering takes Work, so make use of the rain"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Hasat Zamanı" : "Bring in the harvest"}</h4>
          <p>
            {isTr
              ? "Tam olgunluğa eren kusursuz mahsulleri topla. Ürünleri köy pazarındaki tezgâha taşı veya tezgâhlarda işleyerek kıymetli mallara dönüştür."
              : "Gather prime crops when fully mature. Carry produce to the village market stall or process into artisanal goods."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Gösterilen yüksek özen yıldızlı ve kaliteli mahsul verir" : "Higher care yields star-quality crops"}
          </span>
        </div>
      </div>
    </div>
    <div className="guide-callout-card">
      <div className="guide-callout-icon"><IconSprout size={18} aria-hidden="true" /></div>
      <div className="guide-callout-text">
        <strong>{isTr ? "Tarlayı Okumak" : "Read the field"}</strong>
        <p>
          {isTr ? (
            <>Yağmur, toprak nemi ve hava durumu mahsulün büyümesini adım adım şekillendirir. Mahsulleri yakından incele ve topraktaki besinleri takip etmek için <span className="guide-inline-key">Alt</span> tuşuna basılı tut.</>
          ) : (
            <>Rain, soil moisture, and weather shape crop maturity over time. Inspect crops closely and hold <span className="guide-inline-key">Alt</span> to monitor soil nutrients.</>
          )}
        </p>
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
              <>Balık çıkan sulara yaklaş veya teknenle açıl. <span className="guide-inline-key">E</span> tuşuna basılı tutarak olta yayını ayarla ve hareketli balık halkalarına doğru savur.</>
            ) : (
              <>Approach fishable waters or take your boat offshore. Hold <span className="guide-inline-key">E</span> to charge your cast arc and release into visible feeding ripples.</>
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
          <h4>{isTr ? "Yemleme ve İğneleme" : "Set the Hook"}</h4>
          <p>
            {isTr ? (
              <>Sportif balık sürüsünü yemle, ardından iğneyi oturtmadan önce <span className="guide-inline-key">R</span> ile bir Örme Sahte Yem tak. Yem yalnızca başarılı kancalamada harcanır.</>
            ) : (
              <>Chum a sport-fishing school, then arm a Woven Lure with <span className="guide-inline-key">R</span> before you set the hook. The lure is spent only when the paid hook succeeds.</>
            )}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Sportif balıkçılık her zaman yanında en az bir sahte yem gerektirir" : "Sport fishing always requires one lure within reach"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Balıkla Mücadele" : "Follow the fish"}</h4>
          <p>
            {isTr ? (
              <>Vurgulanan tepkileri takip et: <span className="guide-inline-key">W</span> ile sar, <span className="guide-inline-key">S</span> ile boşluk ver, <span className="guide-inline-key">A / D</span> ile yön ver. Gerilim sözcüklerini ve ibreyi gözden kaçırma.</>
            ) : (
              <>Follow the highlighted response: reel with <span className="guide-inline-key">W</span>, give slack with <span className="guide-inline-key">S</span>, and steer with <span className="guide-inline-key">A / D</span>. Watch the tension words and needle.</>
            )}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Misinayı koparmadan balığı yormaya bak" : "Tire the fish without snapping your line"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>4</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Avı Çekme ve İstifleme" : "Land & Pack the Catch"}</h4>
          <p>
            {isTr
              ? "Sportif balıklar ve iri avlar ticari yüke dönüşür. Balığı teknenin açık ambarında tut, ardından yanaşmış tekneden al. Neva Köyü, Çamgözetleme, Sazlıksığınak veya Yüksekbayır tezgâhlarına taşı."
              : "Sport fish and physical basic catches become trade packs. Keep a catch in an open boat slot, then collect it from the docked boat. Carry it to a counter in Neva Village, Pinewatch, Reedhaven or Highridge."}
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
            ? "Tazelik durumuna dikkat et ve tekne ambarında buz bulundur. Liman Balık Pazarı malzeme ve olta takımı satar; köy tezgâhları ise taşıdığın yükleri satın alır. Uzun seferler daha iyi fiyat getirebilir ancak balık yolda yaşlanır."
            : "Keep an eye on freshness and use ice in the boat hold. The Harbor Fish Market sells tackle and supplies; village counters buy your carried trade packs. Longer trips can find better prices, but the catch keeps ageing."}
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
            ? "Mahsulünü sat, balık yüklerini iç bölgelere taşı ve kasabanın teslimat siparişlerini tamamla."
            : "Sell your harvest, carry fish trade packs inland, and fill the town's delivery orders."}
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
              ? "Taze tohum almak; hasat edilen mahsulü, tahılları ve hazırlanan erzakları satmak için köy tezgâhına uğra."
              : "Visit the village stall to buy fresh seed stock and sell harvested produce, grains, and crafted provisions."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Temel mahsuller köyde istikrarlı fiyatını korur" : "Staple crops maintain steady village prices"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>2</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Sandaldan Köye Taşıma" : "Boat to Village"}</h4>
          <p>
            {isTr
              ? "Demirli teknenden yükü teslim al. Bir tanesini eşeğe yükle veya iki küçük/orta yükü arabaya koy. Neva Köyü, Çamgözetleme, Sazlıksığınak veya Yüksekbayır'da yükü indirip Ticaret Yükleri tezgâhına taşı."
              : "Collect a pack from your docked boat. Carry one on the donkey, or load two small or medium packs into the carriage. At Neva Village, Pinewatch, Reedhaven or Highridge, unload and carry each pack to the Trade packs counter."}
          </p>
          <span className="guide-step-tip">
            {isTr ? "Liman Balık Pazarı ambarındaki bir yükü doğrudan satın almaz" : "The Harbor Fish Market never sells a pack straight from the hold"}
          </span>
        </div>
      </div>
      <div className="guide-step-card">
        <div className="guide-step-num"><span>3</span></div>
        <div className="guide-step-content">
          <h4>{isTr ? "Pazar Talep Değişimleri" : "Market Demand Shifts"}</h4>
          <p>
            {isTr
              ? "Pazar fiyatlarının yanındaki oklar talebin nasıl değiştiğini gösterir. Çamgözetleme tahıl ve balık ister, Sazlıksığınak yem ve buz takası yapar, Yüksekbayır ise geçidin yukarısına taze teslimatlara iyi öder. Sefer panosu varış noktasını ve güzergâhlarını gösterir."
              : "The arrows beside a market quote show how demand is changing. Pinewatch needs grain and fish, Reedhaven trades bait and ice, and Highridge pays for fresh deliveries up the pass. The expedition board names the destination and its routes."}
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
              ? "Altın ve lonca itibarı kazanmak için son teslim tarihinden önce ulaştırılması gereken tüccar sözleşmelerini kabul et."
              : "Accept merchant contracts requiring specific consignments delivered before the deadline for gold and guild standing."}
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
            ? "Ambar & Erzak defteri geminin kapasitesini, yakıtını ve depolama alanını takip eder. Kargo kârını en üst düzeye çıkarmak için ticaret rotalarını dikkatle planla."
            : "The Hold & Stores ledger tracks vessel capacity, fuel, and storage. Plan your trade routes carefully to maximize cargo profits."}
        </p>
      </div>
    </div>
  </div>
);
