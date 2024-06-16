
import { Actor, AnimationState, AnimationStateMachine, AssetLoader, BaseActor, attach, inject } from "@hology/core/gameplay";
import { CharacterAnimationComponent, CharacterMovementComponent, CharacterMovementMode, ThirdPartyCameraComponent } from "@hology/core/gameplay/actors";
import Character from "./character";
import Navigation from "../services/navigation";
import { World } from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";

@Actor()
class AIController extends BaseActor {
  public character: Character
  
  public follow: Character

  private navigation = inject(Navigation)
  private world = inject(World)
  
  private path: Vector3[]
  private pi = 0

  onBeginPlay(): void {
  
  }

  private validPath() {
    if (this.path == null || this.path.length == 0 || this.follow == null) return false
    const end = this.path.at(-1)
    // Path is valid unless the target has moved more than a tiny amount 
    // to avoid calculating new paths every frame
    return end.distanceTo(this.follow.position) > 0.1
  }

  // I should replace this sort of functionality with behaviour tree functionality.
  // There should be reusable tasks. You could create your own move to task
  // You could also just use a default one that will try to get the character movement component
  onUpdate(deltaTime: number): void {
    if (this.character != null && this.follow != null && (this.path == null || !this.validPath())) {
      const { success, path } = this.navigation.findPath(this.character.position, this.follow.position)
      if (success && path.length > 0) {
        this.path = path
      }
    }

    if (this.path != null && this.pi < this.path.length-1) {
      // get direction to the next point
      const nextPoint = this.path[this.pi]

      const direction = vec.subVectors(nextPoint, this.character.position).normalize()

      this.character.movement.directionInput.vector.set(direction.x, direction.z)
      this.character.movement.sprintInput.toggle(true)

      // TODO Need to also set rotate towards direction on movement so it runs towards the given direciton.
    } else {
      this.character.movement.directionInput.vector.set(0, 0)
    }


  }

}


const vec = new Vector3()

export default AIController
