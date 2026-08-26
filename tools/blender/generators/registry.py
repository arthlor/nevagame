"""Single generator registry resolved by asset specs."""

from .architecture import farmhouse, fish_market, lighthouse, stone_bridge, village_building, windmill, working_dock
from .boats import fishing_skiff, rowboat
from .characters import coastal_worker, fauna_chicken, fauna_cow, npc_character

from .clouds import faceted_cloud
from .crops import potato_crop, tomato_crop, wheat_crop
from .fish import stylized_fish
from .interiors import cozy_armchair, cozy_bed, cupboard_shelves, dining_table, fireplace_hearth, interior_farmhouse_shell, rustic_chair, woven_rug
from .polyfork import polyfork_architecture, polyfork_cloud, polyfork_crop, polyfork_prop, polyfork_rock, polyfork_vegetation
from .props import clay_oven, crop_bundle, driftwood_cluster, farm_workbench, fishing_net_rack, fishing_rod, harvest_basket, hay_bale, lamp_post, lobster_trap, produce_crate, produce_stall, pumpkin_patch, seed_pouch, sickle, wagon_cart, water_well, watering_can, wood_barrel, wood_crate, wood_fence, workstation_scoop, worm_compost_bin
from .rocks import faceted_rock, pebble_cluster
from .vegetation import apple_tree, bush, grass_clump, kelp_clump, oak_tree, pine_tree, reeds, wildflower_clump


GENERATORS = {
    "oak_tree": oak_tree,
    "pine_tree": pine_tree,
    "apple_tree": apple_tree,
    "bush": bush,
    "reeds": reeds,
    "kelp_clump": kelp_clump,
    "grass_clump": grass_clump,
    "wildflower_clump": wildflower_clump,
    "faceted_rock": faceted_rock,
    "pebble_cluster": pebble_cluster,
    "farmhouse": farmhouse,
    "village_building": village_building,
    "fish_market": fish_market,
    "lighthouse": lighthouse,
    "windmill": windmill,
    "stone_bridge": stone_bridge,
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
    "potato_crop": potato_crop,
    "stylized_fish": stylized_fish,
    "faceted_cloud": faceted_cloud,
    "coastal_worker": coastal_worker,
    "npc_character": npc_character,
    "fauna_cow": fauna_cow,
    "fauna_chicken": fauna_chicken,
    "polyfork_prop": polyfork_prop,
    "polyfork_vegetation": polyfork_vegetation,
    "polyfork_rock": polyfork_rock,
    "polyfork_architecture": polyfork_architecture,
    "polyfork_crop": polyfork_crop,
    "polyfork_cloud": polyfork_cloud,
}


def resolve_generator(name: str):
    try:
        return GENERATORS[name]
    except KeyError as error:
        known = ", ".join(sorted(GENERATORS))
        raise KeyError(f"Unknown generator {name!r}. Known generators: {known}") from error
