
import { Actor, AnimationState, AnimationStateMachine, AssetLoader, BaseActor, attach, inject } from "@hology/core/gameplay";
import { CharacterAnimationComponent, CharacterMovementComponent, CharacterMovementMode, ThirdPartyCameraComponent } from "@hology/core/gameplay/actors";

@Actor()
class Character extends BaseActor {
  private animation = attach(CharacterAnimationComponent)
  public readonly movement = attach(CharacterMovementComponent, {
    maxSpeed: 1.5 * 5,
    maxSpeedSprint: 20,
    maxSpeedBackwards: 1,
    snapToGround: 0.1,
    autoStepMinWidth: 0,
    autoStepMaxHeight: 0.1,
    fallingReorientation: true,
    fallingMovementControl: 0.2,
    colliderHeight: .4,
    colliderRadius: 0.2,
    jumpVelocity: 3.5
  })
  public readonly thirdPartyCamera = attach(ThirdPartyCameraComponent, {
    height: .7,
    offsetX: -0.3,
    offsetZ: 0.2,
    minDistance: 3,
    maxDistance: 3,
    distance: 3,
  })

  private assetLoader = inject(AssetLoader)

  async onInit(): Promise<void> {
    const { scene, animations } = await this.assetLoader.getModelByAssetName('character-orc')

    this.object.add(scene)

    const clips = Object.fromEntries(animations.map(clip => [clip.name, clip]))
  
    const idle = new AnimationState(clips.idle)
    const walk = new AnimationState(clips.walk)
    const sit = new AnimationState(clips.sit)
    const jump = new AnimationState(clips.jump)
    const sprint = new AnimationState(clips.sprint)

    idle.transitionsBetween(walk, () => this.movement.horizontalSpeed > 0)
    walk.transitionsBetween(sprint, () => this.movement.isSprinting)
    idle.transitionsTo(sit, elapsedTime => elapsedTime > 1)
    sit.transitionsTo(walk, () => this.movement.horizontalSpeed > 0)
  
    for (const state of [idle, walk, sit, sprint]) {
      state.transitionsBetween(jump, () => this.movement.mode === CharacterMovementMode.falling)
    }

    const sm = new AnimationStateMachine(idle)

    this.animation.setup(scene)
    this.animation.playStateMachine(sm)
  }

}

export default Character
