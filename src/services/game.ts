
import { GameInstance, PhysicsSystem, PointerEvents, Service, ViewController, World, inject } from '@hology/core/gameplay';
import { SpawnPoint } from '@hology/core/gameplay/actors';
import Character from '../actors/character';
import PlayerController from './player-controller';
import { Euler, Quaternion, Vector3 } from 'three';
import { Navigation } from '@hology/core/gameplay';

@Service()
class Game extends GameInstance {
  private world = inject(World)
  private physics = inject(PhysicsSystem)
  private playerController = inject(PlayerController)
  private navigation = inject(Navigation)
  private pointerEvents = inject(PointerEvents)
  private view = inject(ViewController)

  async onStart() {
    window['hology_view'].showStats = true
    this.physics.showDebug = false
    const spawnPoint = this.world.findActorByType(SpawnPoint)
    const character = await spawnPoint.spawnActor(Character)
    this.playerController.setup(character)

    this.view.setCamera(character.thirdPartyCamera.camera.instance)

    
    const spawninterval = setInterval(async () => {
      const enemyStartPosition = this.navigation.findClosestPoint(character.position.clone().addScaledVector(new Vector3(Math.random(), Math.random(), Math.random()), 5))
      console.log(enemyStartPosition)
      if (enemyStartPosition) {
        const enemy = await this.world.spawnActor(Character, enemyStartPosition)
        clearInterval(spawninterval)

        setInterval(() => {
          const {success, path: pathToPlayer} = this.navigation.findPath(enemy.position, character.position)
          if (success && pathToPlayer.length > 1 && enemy.position.distanceTo(character.position) > 1) {
            
            const towardPlayer = pathToPlayer[1].clone().sub(enemy.position).normalize()
            //enemy.movement.directionInput.vector.set(-towardPlayer.x, towardPlayer.z)
            enemy.movement.directionInput.togglePositiveY(true)
            const q = new Quaternion().setFromUnitVectors(enemy.object.getWorldDirection(new Vector3()), towardPlayer)
            const angle = new Euler().setFromQuaternion(q)
            enemy.movement.rotationInput.rotateY(angle.y)

          } else {
            enemy.movement.directionInput.vector.set(0,0)
          }

        }, 100)
      }
    }, 1000)




    this.pointerEvents.onClickObject3D(this.world.scene).subscribe(event => {
      const player = this.world.findActorByType(Character)
      if (!player) {
        console.warn("No player found")
        return
      }

      const path = this.navigation.findPath(event.intersection.point, player.position)
      console.log(path)
    })
  }


}

export default Game

function normalizeAngle(angle: number): number {
  // Normalize the angle to the range 0 to 2π
  let normalizedAngle = angle % (2 * Math.PI);
  if (normalizedAngle < 0) {
      normalizedAngle += 2 * Math.PI;
  }
  
  // Adjust to the range -π to π
  if (normalizedAngle > Math.PI) {
      normalizedAngle -= 2 * Math.PI;
  }
  
  return normalizedAngle;
}