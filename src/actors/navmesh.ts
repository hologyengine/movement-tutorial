
import { RigidBody } from '@dimforge/rapier3d-compat';
import { RigidBodySet } from '@dimforge/rapier3d-compat';
import { Collider, Heightfield, Shape, ShapeType, Ball, Cuboid, Capsule, ConvexPolyhedron, TriMesh, Cone, Cylinder } from '@dimforge/rapier3d-compat';
import { Actor, BaseActor, Parameter, PhysicsSystem, World, inject } from "@hology/core/gameplay";
import { RecastConfig, init } from '@recast-navigation/core';
import { generateTiledNavMesh } from 'recast-navigation/generators';
import { DebugDrawer, getPositionsAndIndices } from 'recast-navigation/three';
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from 'three';
import {  Mesh, } from "three";

@Actor()
class Navmesh extends BaseActor {

  private physics = inject(PhysicsSystem)
  private world = inject(World)

  @Parameter() debug = true

  async onInit(): Promise<void> {
    await init()
    setTimeout(() => this.init(), 1000)
  }

  private init() {
    
    const debugDrawer = new DebugDrawer()
    const meshes: Mesh[] = [];

    const bodies = this.physics['world'].bodies as RigidBodySet
    for (const body of bodies.getAll()) {
      for (let i = 0, l = body.numColliders(); i < l; i++) {
        const collider = body.collider(i)
        const mesh = convertColliderToMesh(collider)
        if (mesh != null) {
          meshes.push(mesh)
          //this.object.add(mesh)

        }
      }
    }
    console.log(meshes)


    const start = performance.now()
    const [positions, indices] = getPositionsAndIndices(meshes);
    
    const navMeshConfig = {
      /* ... */
      tileSize: 100,
      
    } satisfies Partial<RecastConfig>;
    
    const result = generateTiledNavMesh(
      positions,
      indices,
      navMeshConfig
    );

    const { success, navMesh } = result
    this.object.position.set(0,0,0)

    console.log({success, navMesh, meshes, positions, indices})

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
    const end  = performance.now()
    console.log(end - start)

    this.disposed.subscribe(() => {
      navMesh?.destroy()
      this.object.remove(debugDrawer)
      debugDrawer.dispose()
      window.removeEventListener('resize', onResize)
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

  return mesh;
}