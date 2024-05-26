
import { inject, Service, World, GameInstance, PhysicsSystem, ViewController } from '@hology/core/gameplay';
import { SpawnPoint } from '@hology/core/gameplay/actors';
import { InputService } from '@hology/core/gameplay/input';
import Character from '../actors/character';
import PlayerController from './player-controller';

@Service()
class Game extends GameInstance {
  private world = inject(World)
  private viewController = inject(ViewController)
  private physics = inject(PhysicsSystem)
  private playerController = inject(PlayerController)
  private inputServcie = inject(InputService)

  async onStart() {
    const spawnPoint = this.world.findActorByType(SpawnPoint)
    this.physics.showDebug = false

    const character = await spawnPoint.spawnActor(Character)
    console.log(character.rotation)

    this.playerController.posess(character)
    this.inputServcie.start()
  }
}

export default Game
