
import { Ball, Collider, ConvexPolyhedron, Cuboid, Cylinder, Heightfield, RigidBody, RigidBodySet, ShapeType, TriMesh } from '@dimforge/rapier3d-compat';
import { Actor, BaseActor, Parameter, PhysicsSystem, PointerEvents, ViewController, World, inject } from "@hology/core/gameplay";
import { RecastConfig, init } from '@recast-navigation/core';
import { NavMeshQuery } from 'recast-navigation';
import { generateTiledNavMesh } from 'recast-navigation/generators';
import { DebugDrawer, getPositionsAndIndices } from 'recast-navigation/three';
import * as THREE from 'three';
import { Mesh, } from "three";
import Character from './character';
import { DynamicTiledNavMesh } from './dynamic-tiled-navmesh';


const navMeshBounds = new THREE.Box3(new THREE.Vector3(-5000, -1000, -50000), new THREE.Vector3(70000, 30000, 40000))
const navMeshWorkers = navigator.hardwareConcurrency ?? 3

type VecLike = {x:number, y: number, z: number}
@Actor()
class Navmesh extends BaseActor {

  private physics = inject(PhysicsSystem)
  private world = inject(World)
  private view = inject(ViewController)
  private pointerEvents = inject(PointerEvents)

  @Parameter() debug = true
  @Parameter() refreshMs = 1000

  // Performance 
  @Parameter() tileSize = 500
  @Parameter() cellSize = 0.2

  // Navmesh 
  @Parameter() walkableClimb = 1
  @Parameter() walkableSlopeAngle = 45
  @Parameter() walkableRadius = 0.5
  @Parameter() walkableHeight = 1

  async onInit(): Promise<void> {
    await init()
    setTimeout(() => this.init(), 1000)
  }

  private init() {
    this.object.position.set(0,0,0)
    
    // Using a box like this does help a lot in reducing computation
    // A small box like 50 that is smaller than the tile size, means that it likely
    // will have to recalculate a lot of tiles
    // However, it reduces the amount of meshes that has to be taken into account. 
    const boxRadius = 600

    /**
     * on each iteration
     * find objects that don't previously have been considered or have moved. 
     * only consider them if they are within the player's box (ideally none should be found here and this check should be fast)
     * generate meshes for these if that doesn't exist or looks different
     * store data about the body such as position and rotation to be able to know if they require updates or not
     * figure out what tiles need to be updated if they intersect with these
     * find all meshes that intersect with each tiles
     * generate the positions and indices for meshes relevant for each tile
     * call build tile for each
     * 
     * 
     * 
     */
    const start = performance.now()

    const meshCache = new Map<Collider, {pos: VecLike, mesh: Mesh}>()

    
    const debugDrawer = new DebugDrawer()
    const getTraversableMeshes = () => {
      const playerPos = this.view.getCamera().getWorldPosition(new THREE.Vector3())
      const playerBox = new THREE.Box3(new THREE.Vector3().copy(playerPos).subScalar(boxRadius), new THREE.Vector3().copy(playerPos).addScalar(boxRadius))
 
      
      const meshes: Mesh[] = [];

      const bodies = this.physics['world'].bodies as RigidBodySet
      const meshBox = new THREE.Box3()
      for (const body of bodies.getAll()) {
        for (let i = 0, l = body.numColliders(); i < l; i++) {
          const collider = body.collider(i)
          if (collider.isSensor()) {
            continue
          } 
          const cached = meshCache.get(collider)?.mesh
          const mesh = cached ?? convertColliderToMesh(collider)
          
          // TODO Consider using spheres instead
          if (mesh != null) {
            meshBox.copy(mesh.geometry.boundingBox)
            meshBox.min.add(mesh.position)
            meshBox.max.add(mesh.position)
            const closeEnough = meshBox.intersectsBox(playerBox)

            meshCache.set(collider, {pos: collider.translation(), mesh})
            if(closeEnough) {
              meshes.push(mesh)
            }
          }
          
        }
      }
    
      return meshes
    }

    const tmpBox = new THREE.Box3()
    const lastPos = new WeakMap<Mesh, THREE.Vector3>()

    setInterval(() => {
      console.time('collect meshes')
      const bounds = new THREE.Box3()
  
      console.time('meshes')
      const meshes = getTraversableMeshes()
      console.timeEnd('meshes')
      for (const mesh of meshes) {
        if (lastPos.has(mesh) && lastPos.get(mesh).equals(mesh.position)) {
          continue
        }
        bounds.expandByObject(mesh)
        lastPos.set(mesh, mesh.position.clone())
      }

      console.time('get bounds')
      const tiles = dynamicTiledNavMesh.getTilesForBounds(bounds)
      console.timeEnd('get bounds')
      console.log('tiles to build', tiles.length, bounds)

      if (tiles.length != 0) {
        const intersectingMeshes = []
        for (const mesh of meshes) {
          tmpBox.setFromObject(mesh)
          if (tmpBox.intersect(bounds)) {
            intersectingMeshes.push(mesh)
          }
        }
        console.log("intersecting meshes", intersectingMeshes.length)

        console.time('pos index')
        const [positions, indices] = getPositionsAndIndices(intersectingMeshes)
        console.timeEnd('pos index')

        console.time('build tile call')
        for (const tile of tiles) {
          dynamicTiledNavMesh.buildTile(positions, indices, tile)
        }      
        console.timeEnd('build tile call')
      }
      
      if (this.debug) {
        debugDrawer.clear()
        debugDrawer.drawNavMesh(dynamicTiledNavMesh.navMesh)
      }
      console.timeEnd('collect meshes')
    }, this.refreshMs ?? 1000)

    
    const navMeshConfig = {
      // Greater size reduces the amount of tiles to build 
      tileSize: 500,
      //borderSize: .1,
      walkableClimb: 1,
      walkableSlopeAngle: 60,
      walkableRadius: 0.4,
      walkableHeight: 2,
      detailSampleDist: 6,
      minRegionArea: 8,
      mergeRegionArea: 20,
      //maxSimplificationError: 9,

      // Larger values for these create much faster generation
      // but too large values creates less good navmeshes
      //cs: this.cellSize,
      //ch: this.cellSize,
      cs: 0.2,
      ch: 0.2
      
    } satisfies Partial<RecastConfig>;


    const dynamicTiledNavMesh = new DynamicTiledNavMesh({ navMeshBounds, recastConfig: navMeshConfig, maxTiles: 512, workers: navMeshWorkers })

    const success = true
    const navMesh = dynamicTiledNavMesh.navMesh

    if (success && this.debug) {
      //debugDrawer.clear();
      debugDrawer.drawNavMesh(navMesh);
    } 

    const onResize = () => {
      debugDrawer.resize(window.innerWidth, window.innerHeight);
    };

    onResize();

    window.addEventListener('resize', onResize);

    if (this.debug) {
      console.log("add debug drawer", debugDrawer)
      this.object.parent.add(debugDrawer)
    }

    this.disposed.subscribe(() => {
      navMesh?.destroy()
      this.object.remove(debugDrawer)
      debugDrawer.dispose()
      window.removeEventListener('resize', onResize)
    })

    const end = performance.now()
    console.log(end - start)


    const navMeshQuery = new NavMeshQuery(navMesh);
    console.log('hafl', navMeshQuery.defaultQueryHalfExtents)
    const getPath = (from: THREE.Vector3, to: THREE.Vector3) => {
      const { success, error, path } = navMeshQuery.computePath(from, to, {
        halfExtents: new THREE.Vector3(5.1, 5.1, 5.1)
      });
      console.log({success, error, path})
      if (success) {
        for (const p of path) {
          const obj = new Mesh(new THREE.BoxGeometry(.1,.1,.1), new THREE.MeshStandardMaterial({color: 0x110000}))
          this.world.scene.add(obj)
          obj.position.set(p.x, p.y, p.z)
        }


        const obj = new Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color: 0x111111}))
        this.world.scene.add(obj)
        obj.position.copy(from)
        let i = 0
        const int = setInterval(() => {
          const current = path[i]
          if (current == null) {
            clearInterval(int)
            obj.removeFromParent()
            return
          }
          const c = new THREE.Vector3(current.x, current.y, current.z)
          if (c.distanceTo(obj.position) < .01) {
            i++
          } else {
            const remainingOffset = new THREE.Vector3().subVectors(c, obj.position)
            const direction = remainingOffset.clone().normalize()
            const movementOffset = direction.clone().multiplyScalar(20 / 1000 * 5)
            obj.lookAt(c)
            if (remainingOffset.length() < movementOffset.length()) {
              obj.position.add(remainingOffset)
            } else {
              obj.position.add(movementOffset)
            }
            //obj.position.addScaledVector(direction, 20 / 1000 * 5)
            //obj.position.lerp(c, .3)
          }
        }, 20)
      }
    }

    this.pointerEvents.onClickObject3D(this.world.scene).subscribe(event => {
      const player = this.world.findActorByType(Character)
      if (!player) {
        console.warn("No player found")
        return
      }

      getPath(event.intersection.point, player.position)
    })
  }

  onBeginPlay() {

    

  }

  onEndPlay() {

  }


}

export default Navmesh





function convertHeightFieldToGeometry(collider: Collider): THREE.BufferGeometry {
  const shape = collider.shape;
  if (shape.type !== ShapeType.HeightField) {
      throw new Error('The provided collider is not a height field.');
  }
  let nonZero = false
  const heightFieldShape = shape as Heightfield;
  const heights = heightFieldShape.heights;
  const nrows = heightFieldShape.nrows;
  const ncols = heightFieldShape.ncols;
  const rowScale = heightFieldShape.scale.x;
  const colScale = heightFieldShape.scale.z;
  const heightScale = heightFieldShape.scale.y;

  const n = nrows + 1
  const geometry = new THREE.PlaneGeometry(colScale, rowScale, ncols, nrows);
  geometry.rotateX(-Math.PI/2)

  const vertices = geometry.attributes.position.array as Float32Array;

  // Apply heights to the plane geometry
  let index = 0;
  for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
          vertices[index + 1] = heights[j * n + i] * heightScale; // Y-coordinate for height
          index += 3; // Move to the next vertex position
          if (vertices[index + 1] != 0) {
            nonZero = true
          }
      }
  }

  if (!nonZero) {
    // If all have height 0, then just use a plane instead
    const plane = new THREE.PlaneGeometry(rowScale, colScale, 2, 2)
    plane.rotateX(-Math.PI/2)
    return plane
  }

  return geometry
}

function convertToGeometry(collider: Collider): THREE.BufferGeometry {

  if (collider.shape instanceof Heightfield) {
    return convertHeightFieldToGeometry(collider)
  } else if (collider.shape instanceof Ball) {
    return new THREE.SphereGeometry(collider.shape.radius)
  } else if (collider.shape instanceof Cuboid) {
    const halfExtents = collider.shape.halfExtents;
    return new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2);
  } else if (collider.shape instanceof ConvexPolyhedron || collider.shape instanceof TriMesh
  ) {
    const vertices = collider.shape.vertices;
    const indices = collider.shape.indices;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    if (indices != null) {
      geometry.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
    }
    return geometry
  } else if (collider.shape instanceof Cylinder) {
    const cylHeight = collider.shape.halfHeight;
    const cylRadius = collider.shape.radius;
    return new THREE.CylinderGeometry(cylRadius, cylRadius, cylHeight * 2);
  } else {
    console.warn("Unsupported shape", collider.shape.type, collider)
    return null
  }
}


function convertColliderToMesh(collider: Collider): THREE.Mesh {

  const geometry = convertToGeometry(collider)
  if (geometry == null) {
    return null
  }

  const material = new THREE.MeshBasicMaterial({ wireframe: false, color: 0xff0000 , side: THREE.DoubleSide});
  const mesh = new THREE.Mesh(geometry, material);

  const position = collider.translation();
  const rotation = collider.rotation();

  mesh.position.set(position.x, position.y, position.z);
  mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  //mesh.scale.multiplyScalar(1.1)

  mesh.geometry.computeBoundingBox()

  return mesh;
}