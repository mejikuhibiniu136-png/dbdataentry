import type * as THREE from 'three';

// Buang geometri + material semua objek di bawah `root` (texture dibuang pemanggil).
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) x.dispose();
  });
}
