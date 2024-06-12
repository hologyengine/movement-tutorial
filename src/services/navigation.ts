import { Service, World, inject } from "@hology/core/gameplay";
import Navmesh from "../actors/navmesh";
import { NavMeshQuery } from "recast-navigation";
import { Vector3 } from "three";



@Service()
class Navigation {
  private navMeshActor: Navmesh;
  private query?: NavMeshQuery
  private world = inject(World)

  constructor() {
    const actor = this.world.actors.find(a => a instanceof Navmesh) as Navmesh
    if (actor != null) {
      this.navMeshActor = actor
      this.query = new NavMeshQuery(actor.navMesh)
    }
    this.world.actorAdded.subscribe(a => {
      if (a instanceof Navmesh) {
        this.navMeshActor = a
        this.query = new NavMeshQuery(a.navMesh)
      }
    })
    this.world.actorRemoved.subscribe(a => {
      if (a instanceof Navmesh && a.id === this.navMeshActor?.id) {
        this.navMeshActor = null
        this.query = null
      }
    })
  }

  /**
   * Finds a path from a start point to an end point.
   */
  findPath(start: Vector3, end: Vector3): {success: boolean, path: Vector3[]} {
    if (this.query == null) {
      console.warn(`NavMesh has not been generated yet`)
      return failureResult
    }
    const { success, error, path } = this.query.computePath(start, end)
    if (success) {
      return {success: true, path: path.map(v => new Vector3(v.x, v.y, v.z))}
    } else {
      console.warn("Failed to generate path", error)
      return failureResult
    }
  }

  /**
   * Finds the closest point on the navmesh to a given position. 
   * Returns null if it can't be found or if nav mesh has not been generated
   */
  findClosestPoint(position: Vector3): Vector3|null {
    if (this.query == null) {
      console.warn(`NavMesh has not been generated yet`)
      return null
    }
    const {success, point} = this.query.findClosestPoint(position)
    if (success) {
      return new Vector3(point.x, point.y, point.z)
    }
    return null
  }
}

const failureResult = {success: false, path: []}

export default Navigation