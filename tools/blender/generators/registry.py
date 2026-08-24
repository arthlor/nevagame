"""Single generator registry resolved by asset specs."""

from .architecture import farmhouse, fish_market, lighthouse, stone_bridge, windmill, working_dock
from .boats import fishing_skiff, rowboat
from .characters import coastal_worker
from .clouds import faceted_cloud
from .crops import wheat_crop
from .fish import stylized_fish
from .props import hay_bale, lamp_post, lobster_trap, pumpkin_patch, water_well, wood_barrel, wood_crate, wood_fence
from .rocks import faceted_rock
from .vegetation import apple_tree, bush, oak_tree, pine_tree, reeds


GENERATORS = {
    "oak_tree": oak_tree,
    "pine_tree": pine_tree,
    "apple_tree": apple_tree,
    "bush": bush,
    "reeds": reeds,
    "faceted_rock": faceted_rock,
    "farmhouse": farmhouse,
    "fish_market": fish_market,
    "lighthouse": lighthouse,
    "windmill": windmill,
    "stone_bridge": stone_bridge,
    "working_dock": working_dock,
    "water_well": water_well,
    "pumpkin_patch": pumpkin_patch,
    "lobster_trap": lobster_trap,
    "wood_crate": wood_crate,
    "wood_barrel": wood_barrel,
    "wood_fence": wood_fence,
    "hay_bale": hay_bale,
    "lamp_post": lamp_post,
    "rowboat": rowboat,
    "fishing_skiff": fishing_skiff,
    "wheat_crop": wheat_crop,
    "stylized_fish": stylized_fish,
    "faceted_cloud": faceted_cloud,
    "coastal_worker": coastal_worker,
}


def resolve_generator(name: str):
    try:
        return GENERATORS[name]
    except KeyError as error:
        known = ", ".join(sorted(GENERATORS))
        raise KeyError(f"Unknown generator {name!r}. Known generators: {known}") from error
