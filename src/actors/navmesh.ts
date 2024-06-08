
import { RigidBody } from '@dimforge/rapier3d-compat';
import { RigidBodySet } from '@dimforge/rapier3d-compat';
import { Collider, Heightfield, Shape, ShapeType, Ball, Cuboid, Capsule, ConvexPolyhedron, TriMesh, Cone, Cylinder } from '@dimforge/rapier3d-compat';
import { Actor, BaseActor, Parameter, PhysicsSystem, PointerEvents, ViewController, World, inject } from "@hology/core/gameplay";
import { RecastConfig, init } from '@recast-navigation/core';
import { generateTiledNavMesh } from 'recast-navigation/generators';
import { DebugDrawer, getPositionsAndIndices } from 'recast-navigation/three';
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from 'three';
import {  Mesh, } from "three";
import { NavMeshQuery } from 'recast-navigation';
import Character from './character';

@Actor()
class Navmesh extends BaseActor {

  private physics = inject(PhysicsSystem)
  private world = inject(World)
  private view = inject(ViewController)
  private pointerEvents = inject(PointerEvents)

  @Parameter() debug = true

  async onInit(): Promise<void> {
    await init()
    setTimeout(() => this.init(), 1000)
  }

  private init() {
    this.object.position.set(0,0,0)
    
    // Using a box like this does help a lot in reducing computation
    // However, 
    const boxRadius = 800
    const playerPos = this.view.getCamera().getWorldPosition(new THREE.Vector3())
    const playerBox = new THREE.Box3(new THREE.Vector3().copy(playerPos).subScalar(boxRadius), new THREE.Vector3().copy(playerPos).addScalar(boxRadius))
    /**
     * 
     * It takes about 1 second right now to refresh the nav mesh.
     * This is not acceptable for continuous updates. It is also not promising for lower end devices.
     * 
     * Updating just certain tiles may make updates acceptable.
     * Most games likely will not require any updates at all except for the loading in of new landscapes and in case of level streaming.
     * If we start generating the nav mesh when sort of close, then it may work. 
     * 
     * 
     * Use the code here to get the tiles that needs to be updated 
     * Loop over bodies that likely need to be updated. 
     * Use the static mesh in threejs to know if things have changed
     * Build up the mesh array again. Use cached versions of bodies. 
     * Also try to minimize the meshes to include only those that intersect with the tiles. 
     * https://github.com/isaac-mason/sketches/blob/main/src/sketches/recast-navigation/dynamic-tiled-navmesh/navigation/navigation.tsx
     * 
     * 
     */
    const start = performance.now()
    
    const debugDrawer = new DebugDrawer()
    const meshes: Mesh[] = [];

    const bodies = this.physics['world'].bodies as RigidBodySet
    let ignoredMeshes = 0
    const meshBox = new THREE.Box3()
    for (const body of bodies.getAll()) {
      for (let i = 0, l = body.numColliders(); i < l; i++) {
        const collider = body.collider(i)
        const mesh = convertColliderToMesh(collider)
        
        // TODO Consider using spheres instead
        if (mesh != null) {
          meshBox.copy(mesh.geometry.boundingBox)
          meshBox.min.add(mesh.position)
          meshBox.max.add(mesh.position)
          const closeEnough = meshBox.intersectsBox(playerBox)

          if(closeEnough) meshes.push(mesh)
          //this.object.add(mesh)
          if (!closeEnough) {
            ignoredMeshes++
          }
        }
        
      }
    }
    console.log(meshes)
    console.log({ignoredMeshes, playerBox})

    const [positions, indices] = getPositionsAndIndices(meshes);
    
    const navMeshConfig = {
      /* ... */
      tileSize: 100,
      walkableClimb: 1,
      walkableSlopeAngle: 89,
      walkableRadius: 0.5,
      walkableHeight: 1,
      detailSampleDist: 6,
      mergeRegionArea: 1,


      // Larger values for these create much faster generation
      // but too large values creates less good navmeshes
      cs: 0.2,
      ch: 0.2
      
    } satisfies Partial<RecastConfig>;
    
    const result = generateTiledNavMesh(
      positions,
      indices,
      navMeshConfig
    );

    const { success, navMesh } = result    
    console.log({success, navMesh, meshes, positions, indices})

    console.log("max tiles", navMesh.getMaxTiles())

    if (success && this.debug) {
      //debugDrawer.clear();
      debugDrawer.drawNavMesh(navMesh);
    } else {
      console.log(result)
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
    const getPath = (from: THREE.Vector3, to: THREE.Vector3) => {
      const { success, error, path } = navMeshQuery.computePath(from, to);
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
            obj.position.lerp(c, .3)
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

  onUpdate(deltaTime: number) {

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