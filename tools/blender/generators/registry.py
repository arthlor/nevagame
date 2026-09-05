"""Single generator registry resolved by asset specs."""

from .architecture import farmhouse, fish_market, lighthouse, log_bridge, stone_bridge, village_building, windmill, working_dock
from .boats import fishing_skiff, rowboat
from .characters import fauna_butterfly, fauna_chicken, fauna_cow, fauna_donkey, fauna_gull, fauna_rabbit

from .clouds import faceted_cloud
from .imported import imported_blend
from .crops import olive_crop, potato_crop, pumpkin_crop, sunflower_crop, tomato_crop, turnip_crop, wheat_crop
from .fish import stylized_fish
from .camp import fallen_log, fire_pit, path_stone_round, path_stone_slab, picnic_table, smoke_plume, trail_kiosk, trail_signpost, wood_bench
from .furnishings import floor_plant, wood_bookcase, wood_side_table, wood_sideboard
from .harbor import admiralty_anchor, cargo_crate_large, cargo_sack, dock_lantern_post, dock_platform, driftwood_log, gangplank, hanging_signboard, marker_buoy, mooring_post, pier_railing
from .items import item_apple, item_bread_loaf, item_carrot, item_coin_pouch, item_compass, item_corn_cob, item_pie, treasure_chest
from .reef import coral_pillar, coral_staghorn, coral_table
from .stones import boulder_large, coastal_boulder, reef_small, rock_spire, sea_stack
from .woodland import algae_frond, beach_grass_tuft, broadleaf_oak, cattail_reeds, dead_tree, lily_pad_cluster, maple_tree, mushroom_cluster, round_bush, seagrass_tuft, sunflower_stand, tall_pine, young_pine
from .homestead import apiary_hive, fence_section, firewood_stack, garden_hoe, milk_churn, potting_bench, rustic_watering_can, tilled_soil_tile, vegetable_bed_tile, water_trough, wheelbarrow
from .interiors import cozy_armchair, cozy_bed, cupboard_shelves, dining_table, fireplace_hearth, interior_farmhouse_shell, rustic_chair, woven_rug
from .props import clay_oven, crop_bundle, driftwood_cluster, farm_workbench, fish_drying_rack, fishing_net_rack, fishing_rod, harvest_basket, hay_bale, lamp_post, lobster_trap, produce_crate, produce_stall, pumpkin_patch, seed_pouch, sickle, wagon_cart, water_well, watering_can, wood_barrel, wood_crate, wood_fence, workstation_scoop, worm_compost_bin
from .rocks import faceted_rock, path_slab, pebble_cluster
from .vegetation import apple_tree, bush, flower_drift, grass_clump, kelp_clump, oak_tree, olive_tree, pine_tree, reeds, wildflower_clump


GENERATORS = {
    "imported_blend": imported_blend,
    "oak_tree": oak_tree,
    "olive_tree": olive_tree,
    "pine_tree": pine_tree,
    "apple_tree": apple_tree,
    "bush": bush,
    "reeds": reeds,
    "kelp_clump": kelp_clump,
    "grass_clump": grass_clump,
    "wildflower_clump": wildflower_clump,
    "flower_drift": flower_drift,
    "faceted_rock": faceted_rock,
    "pebble_cluster": pebble_cluster,
    "path_slab": path_slab,
    "farmhouse": farmhouse,
    "village_building": village_building,
    "fish_market": fish_market,
    "lighthouse": lighthouse,
    "windmill": windmill,
    "stone_bridge": stone_bridge,
    "log_bridge": log_bridge,
    "working_dock": working_dock,
    "interior_farmhouse_shell": interior_farmhouse_shell,
    "cozy_bed": cozy_bed,
    "fireplace_hearth": fireplace_hearth,
    "dining_table": dining_table,
    "rustic_chair": rustic_chair,
    "woven_rug": woven_rug,
    "cupboard_shelves": cupboard_shelves,
    "cozy_armchair": cozy_armchair,
    "water_well": water_well,
    "pumpkin_patch": pumpkin_patch,
    "lobster_trap": lobster_trap,
    "fishing_net_rack": fishing_net_rack,
    "fish_drying_rack": fish_drying_rack,
    "wood_crate": wood_crate,
    "wood_barrel": wood_barrel,
    "wood_fence": wood_fence,
    "clay_oven": clay_oven,
    "hay_bale": hay_bale,
    "lamp_post": lamp_post,
    "worm_compost_bin": worm_compost_bin,
    "wagon_cart": wagon_cart,
    "produce_crate": produce_crate,
    "driftwood_cluster": driftwood_cluster,
    "farm_workbench": farm_workbench,
    "produce_stall": produce_stall,
    "seed_pouch": seed_pouch,
    "watering_can": watering_can,
    "sickle": sickle,
    "crop_bundle": crop_bundle,
    "harvest_basket": harvest_basket,
    "workstation_scoop": workstation_scoop,
    "fishing_rod": fishing_rod,
    "rowboat": rowboat,
    "fishing_skiff": fishing_skiff,
    "wheat_crop": wheat_crop,
    "tomato_crop": tomato_crop,
    "sunflower_crop": sunflower_crop,
    "olive_crop": olive_crop,
    "potato_crop": potato_crop,
    "turnip_crop": turnip_crop,
    "pumpkin_crop": pumpkin_crop,
    "stylized_fish": stylized_fish,
    "faceted_cloud": faceted_cloud,
    "fauna_cow": fauna_cow,
    "fauna_donkey": fauna_donkey,
    "fauna_chicken": fauna_chicken,
    "fauna_rabbit": fauna_rabbit,
    "fauna_gull": fauna_gull,
    "fauna_butterfly": fauna_butterfly,
    "apiary_hive": apiary_hive,
    "potting_bench": potting_bench,
    "rustic_watering_can": rustic_watering_can,
    "garden_hoe": garden_hoe,
    "wheelbarrow": wheelbarrow,
    "water_trough": water_trough,
    "firewood_stack": firewood_stack,
    "milk_churn": milk_churn,
    "fence_section": fence_section,
    "vegetable_bed_tile": vegetable_bed_tile,
    "tilled_soil_tile": tilled_soil_tile,
    "admiralty_anchor": admiralty_anchor,
    "cargo_crate_large": cargo_crate_large,
    "cargo_sack": cargo_sack,
    "dock_lantern_post": dock_lantern_post,
    "dock_platform": dock_platform,
    "driftwood_log": driftwood_log,
    "gangplank": gangplank,
    "hanging_signboard": hanging_signboard,
    "marker_buoy": marker_buoy,
    "mooring_post": mooring_post,
    "pier_railing": pier_railing,
    "algae_frond": algae_frond,
    "beach_grass_tuft": beach_grass_tuft,
    "broadleaf_oak": broadleaf_oak,
    "cattail_reeds": cattail_reeds,
    "dead_tree": dead_tree,
    "lily_pad_cluster": lily_pad_cluster,
    "maple_tree": maple_tree,
    "mushroom_cluster": mushroom_cluster,
    "round_bush": round_bush,
    "seagrass_tuft": seagrass_tuft,
    "sunflower_stand": sunflower_stand,
    "tall_pine": tall_pine,
    "young_pine": young_pine,
    "boulder_large": boulder_large,
    "coastal_boulder": coastal_boulder,
    "reef_small": reef_small,
    "rock_spire": rock_spire,
    "sea_stack": sea_stack,
    "fallen_log": fallen_log,
    "fire_pit": fire_pit,
    "path_stone_round": path_stone_round,
    "path_stone_slab": path_stone_slab,
    "picnic_table": picnic_table,
    "smoke_plume": smoke_plume,
    "trail_kiosk": trail_kiosk,
    "trail_signpost": trail_signpost,
    "wood_bench": wood_bench,
    "coral_pillar": coral_pillar,
    "coral_staghorn": coral_staghorn,
    "coral_table": coral_table,
    "floor_plant": floor_plant,
    "wood_bookcase": wood_bookcase,
    "wood_side_table": wood_side_table,
    "wood_sideboard": wood_sideboard,
    "item_apple": item_apple,
    "item_bread_loaf": item_bread_loaf,
    "item_carrot": item_carrot,
    "item_coin_pouch": item_coin_pouch,
    "item_compass": item_compass,
    "item_corn_cob": item_corn_cob,
    "item_pie": item_pie,
    "treasure_chest": treasure_chest,
}


def resolve_generator(name: str):
    try:
        return GENERATORS[name]
    except KeyError as error:
        known = ", ".join(sorted(GENERATORS))
        raise KeyError(f"Unknown generator {name!r}. Known generators: {known}") from error
