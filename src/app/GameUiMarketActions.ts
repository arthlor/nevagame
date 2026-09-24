import type { Simulation } from "../simulation/Simulation";
import type { MarketId } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { marketAcceptsFishTradePacks } from "../content/markets";
import type { GameUIProps } from "../ui/GameUI";
import type { NoticeTone } from "../ui/notifications";

interface MarketUiPorts {
  sim: Simulation;
  notify: (text: string, tone: NoticeTone, durationMs?: number) => void;
  setToast: (text: string, durationMs?: number) => void;
  reportSale: (quantity: number, revenue: number) => void;
  requestAutosave: () => void;
}

type MarketUiActions = Pick<GameUIProps,
  | "onBuySeed"
  | "onBuyItem"
  | "onBuyRod"
  | "onEquipRod"
  | "onSellFishCargo"
  | "onSellAllFishCargo"
  | "onDiscardFishCargo"
  | "onReleaseFishCargo"
  | "onDeliverContractItems"
  | "onDeliverFishCargo"
  | "onPassContract"
>;

/** Modal commands stay at the application boundary; the UI receives callbacks only. */
export function createMarketUiActions({ sim, notify, setToast, reportSale, requestAutosave }: MarketUiPorts): MarketUiActions {
  return {
    onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => {
      const result = sim.execute({ type: "market.buy-seed", marketId, itemId, quantity });
      if (!result.success) notify(result.reason ?? "Could not buy that", "danger");
      else if (result.cost != null) notify(`Purchased · ${result.cost} G`, "success");
    },
    onBuyItem: (marketId: MarketId, itemId: string, quantity: number) => {
      const result = sim.execute({ type: "market.buy-item", marketId, itemId, quantity });
      if (!result.success) notify(result.reason ?? "Could not buy that", "danger");
      else if (result.cost != null) notify(`Purchased · ${result.cost} G`, "success");
    },
    onBuyRod: (marketId: MarketId, rodId: string) => {
      const result = sim.execute({ type: "market.buy-rod", marketId, rodId });
      if (!result.success) notify(result.reason ?? "Could not buy that rod", "danger");
      else {
        const rod = ContentRegistry.rods.get(rodId);
        setToast(`${rod?.name ?? "Rod"} purchased and equipped`);
      }
    },
    onEquipRod: (marketId: MarketId, rodId: string) => {
      const result = sim.execute({ type: "market.equip-rod", marketId, rodId });
      if (!result.success) notify(result.reason ?? "Could not equip that rod", "danger");
      else setToast(`${ContentRegistry.rods.get(rodId)?.name ?? "Rod"} equipped`);
    },
    onSellFishCargo: (marketId: MarketId, cargoId: string) => {
      const res = marketAcceptsFishTradePacks(marketId)
        ? sim.execute({ type: "market.sell-trade-pack", marketId, cargoId })
        : sim.execute({ type: "market.sell-fish", marketId, cargoId });
      if (!res.success) notify(res.reason ?? "Could not sell fish", "danger");
      else if (res.revenue != null) reportSale(1, res.revenue);
    },
    onSellAllFishCargo: (marketId: MarketId) => {
      const result = sim.execute({ type: "market.sell-fish-bulk", marketId });
      if (!result.success) notify(result.reason ?? "Could not sell fish", "danger");
      else if (result.revenue != null) reportSale(result.quantity ?? 0, result.revenue);
    },
    onDiscardFishCargo: (marketId: MarketId, cargoId: string) => {
      const res = sim.execute({ type: "cargo.discard", cargoId, marketId });
      if (!res.success) notify(res.reason ?? "Could not discard fish", "danger");
      else if (res.scraps) notify(`Discarded for ${res.scraps} fish scraps`, "info");
      else notify("Discarded spoiled fish", "info");
    },
    onReleaseFishCargo: (marketId: MarketId, cargoId: string) => {
      const res = sim.execute({ type: "cargo.release", cargoId, marketId });
      if (!res.success) notify(res.reason ?? "Could not release fish", "danger");
      else notify("Released back to the water · records kept", "success", 2600);
    },
    onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => {
      const res = sim.execute({ type: "contract.deliver-items", contractId, itemId, quantity });
      if (!res.success) setToast(res.reason ?? "Could not deliver items");
      else if (res.completed) setToast(`Contract complete: +${res.rewardMoney} G`, 3600);
      else setToast(`Delivered ${res.delivered} item`);
    },
    onDeliverFishCargo: (contractId: string, cargoId: string) => {
      const res = sim.execute({ type: "contract.deliver-fish", contractId, cargoId });
      if (!res.success) setToast(res.reason ?? "Could not deliver fish");
      else if (res.completed) setToast(`Contract complete: +${res.rewardMoney} G`, 3600);
      else setToast("Fish delivered to contract");
    },
    onPassContract: (contractId: string) => {
      const res = sim.execute({ type: "contract.pass", contractId });
      if (!res.success) {
        setToast(res.reason ?? "That order stays on the board");
        return;
      }
      setToast("A new order is posted", 2600);
      requestAutosave();
    },
  };
}
