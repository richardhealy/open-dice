/**
 * Every material on a die's meshes: a classic die's face materials, or every material of a
 * model die (its model's meshes and its number labels). Effects and fades use this so they
 * reach model dice too.
 */
export function dieMaterials(die) {
    const out = [];
    if (!die || !die.mesh) return out;
    const collect = (object) => {
        if (object.material) out.push(...(Array.isArray(object.material) ? object.material : [object.material]));
    };
    // A plain { material } object (a hand-built die handed to an effect) still works.
    if (typeof die.mesh.traverse === 'function') die.mesh.traverse(collect);
    else collect(die.mesh);
    return out;
}
