"""Single generator registry resolved by asset specs."""

from .architecture import farmhouse, fish_market, lighthouse, log_bridge, stone_bridge, village_building, windmill, working_dock
from .boats import fishing_skiff, rowboat
from .horse_carriage import draft_horse
from .characters import fauna_cow, fauna_donkey

from .clouds import faceted_cloud
from .imported import imported_blend
from .crops import apple_tree_crop, barley_crop, carrot_crop, corn_crop, flax_crop, olive_crop, potato_crop, pumpkin_crop, sunflower_crop, tomato_crop, turnip_crop, wheat_crop
from .trade_packs import crop_trade_pack
from .equipment import wearable_equipment
from .camp import path_stone_round, path_stone_slab
from .furnishings import floor_plant, wood_bookcase, wood_side_table, wood_sideboard
from .harbor import admiralty_anchor, dock_platform, gangplank, marker_buoy, mooring_post, pier_railing
from .items import item_apple, item_bread_loaf, item_carrot, item_coin_pouch, item_compass, item_corn_cob, item_pie

from .stones import boulder_large, coastal_boulder, reef_small, rock_spire, sea_stack
from .woodland import algae_frond, beach_grass_tuft, broadleaf_oak, cattail_reeds, dead_tree, lily_pad_cluster, maple_tree, mushroom_cluster, round_bush, seagrass_tuft, sunflower_stand, tall_pine, young_pine
from .homestead import fence_section, firewood_stack, tilled_soil_tile, vegetable_bed_tile, wheelbarrow
from .interiors import cupboard_shelves, dining_table, fireplace_hearth, interior_farmhouse_shell, rustic_chair, woven_rug
from .props import fish_drying_rack, produce_crate, wood_barrel, wood_crate
from .rocks import faceted_rock, path_slab, pebble_cluster
from .vegetation import apple_tree, bush, flower_drift, grass_clump, kelp_clump, oak_tree, olive_tree, pine_tree, reeds, wildflower_clump


from .coastal import coastal_palm, coastal_understory, coastal_rock, coastal_hut
from .village_life import dovecote


GENERATORS = {
    "draft_horse": draft_horse,
    "wearable_equipment": wearable_equipment,
    "crop_trade_pack": crop_trade_pack,
    "coastal_palm": coastal_palm,
    "coastal_understory": coastal_understory,
    "coastal_hut": coastal_hut,
    "imported_blend": imported_blend,
    "oak_tree": oak_tree,
    "olive_tree": olive_tree,
    "pine_tree": pine_tree,
    "apple_tree": apple_tree,
    "bush": bush,
    "kelp_clump": kelp_clump,
    "grass_clump": grass_clump,
    "wildflower_clump": wildflower_clump,
    "flower_drift": flower_drift,
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
    "fireplace_hearth": fireplace_hearth,
    "dining_table": dining_table,
    "rustic_chair": rustic_chair,
    "woven_rug": woven_rug,
    "cupboard_shelves": cupboard_shelves,
    "fish_drying_rack": fish_drying_rack,
    "wood_crate": wood_crate,
    "wood_barrel": wood_barrel,
    "produce_crate": produce_crate,
    "rowboat": rowboat,
    "fishing_skiff": fishing_skiff,
    "apple_tree_crop": apple_tree_crop,
    "wheat_crop": wheat_crop,
    "barley_crop": barley_crop,
    "corn_crop": corn_crop,
    "flax_crop": flax_crop,
    "tomato_crop": tomato_crop,
    "sunflower_crop": sunflower_crop,
    "olive_crop": olive_crop,
    "potato_crop": potato_crop,
    "carrot_crop": carrot_crop,
    "turnip_crop": turnip_crop,
    "pumpkin_crop": pumpkin_crop,
    "faceted_cloud": faceted_cloud,
    "fauna_cow": fauna_cow,
    "fauna_donkey": fauna_donkey,
    "dovecote": dovecote,
    "wheelbarrow": wheelbarrow,
    "firewood_stack": firewood_stack,
    "fence_section": fence_section,
    "vegetable_bed_tile": vegetable_bed_tile,
    "tilled_soil_tile": tilled_soil_tile,
    "admiralty_anchor": admiralty_anchor,
    "dock_platform": dock_platform,
    "gangplank": gangplank,
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
    "seagrass_tuft": seagrass_tuft,
    "sunflower_stand": sunflower_stand,
    "tall_pine": tall_pine,
    "young_pine": young_pine,
    "path_stone_round": path_stone_round,
    "path_stone_slab": path_stone_slab,
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
}


def resolve_generator(name: str):
    try:
        return GENERATORS[name]
    except KeyError as error:
        known = ", ".join(sorted(GENERATORS))
        raise KeyError(f"Unknown generator {name!r}. Known generators: {known}") from error
