import * as THREE from 'three'

export function makeDemo(kind) {
  const g = new THREE.Group()
  const mesh = (geo, mat) => new THREE.Mesh(geo, mat)

  switch (kind) {
    case 'facet': {
      const m = new THREE.MeshStandardMaterial({ color: 0xff5a1f, flatShading: true, metalness: 0.2, roughness: 0.35 })
      g.add(mesh(new THREE.IcosahedronGeometry(1, 1), m))
      break
    }
    case 'orbit': {
      const m = new THREE.MeshStandardMaterial({ color: 0xe8e8ea, metalness: 1, roughness: 0.2 })
      for (let i = 0; i < 4; i++) {
        const r = mesh(new THREE.TorusGeometry(0.5 + i * 0.28, 0.05, 20, 96), m)
        r.rotation.set(i * 0.7, i * 0.5, i * 0.3)
        g.add(r)
      }
      g.add(mesh(new THREE.SphereGeometry(0.28, 48, 48), new THREE.MeshStandardMaterial({ color: 0xc6ff3d, metalness: 0.6, roughness: 0.15 })))
      break
    }
    case 'pillars': {
      const m = new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.55, metalness: 0.05 })
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
        const h = 0.3 + Math.abs(Math.sin(x * 1.7 + z * 2.3)) * 1.6
        const b = mesh(new THREE.BoxGeometry(0.34, h, 0.34), m)
        b.position.set(x * 0.44, h / 2, z * 0.44)
        g.add(b)
      }
      break
    }
    case 'vase': {
      const pts = []
      for (let i = 0; i <= 40; i++) {
        const t = i / 40
        pts.push(new THREE.Vector2(0.35 + Math.sin(t * Math.PI * 1.6) * 0.45 + t * 0.1, t * 2))
      }
      const m = new THREE.MeshPhysicalMaterial({ color: 0x2b6bff, roughness: 0.15, metalness: 0, clearcoat: 1, side: THREE.DoubleSide })
      g.add(mesh(new THREE.LatheGeometry(pts, 96), m))
      break
    }
    case 'gem': {
      const m = new THREE.MeshPhysicalMaterial({ color: 0xff3d8b, flatShading: true, metalness: 0.1, roughness: 0.05, clearcoat: 1, iridescence: 1 })
      const top = mesh(new THREE.OctahedronGeometry(1, 0), m)
      top.scale.set(1, 1.35, 1)
      g.add(top)
      break
    }
    case 'knot':
    default: {
      const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08, clearcoat: 1 })
      g.add(mesh(new THREE.TorusKnotGeometry(0.8, 0.28, 200, 32, 2, 5), m))
    }
  }
  return g
}
