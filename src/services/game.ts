
import { GameInstance, Service, World, inject } from '@hology/core/gameplay';
import { SpawnPoint } from '@hology/core/gameplay/actors';
import Character from '../actors/character';
import PlayerController from './player-controller';

@Service()
class Game extends GameInstance {
  private world = inject(World)
  private playerController = inject(PlayerController)

  async onStart() {
    const spawnPoint = this.world.findActorByType(SpawnPoint)
    const character = await spawnPoint.spawnActor(Character)
    this.playerController.setup(character)
  }
}

export default Game
