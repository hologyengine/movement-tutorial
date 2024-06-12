import {
    NavMesh,
    NavMeshParams,
    Raw,
    RecastConfig,
    UnsignedCharArray,
    Vector3Tuple,
    recastConfigDefaults,
    statusToReadableString,
} from 'recast-navigation'
import * as THREE from 'three'
import { BuildTileMeshProps, buildConfig } from './build-tile.js'
import { Subject } from 'rxjs'
import DynamicTiledNavMeshWorker from './dynamic-tiled-navmesh.worker?worker'
import {buildTile} from './build-tile';

export type DynamicTiledNavMeshProps = {
    navMeshBounds: THREE.Box3
    recastConfig: Partial<RecastConfig>
    maxTiles: number

    workers: number
}

export class DynamicTiledNavMesh {
    navMesh: NavMesh
    navMeshVersion = 0
    onNavMeshUpdate = new Subject<[version: number, tile: [x: number, y: number]]>()

    navMeshBounds: [min: Vector3Tuple, max: Vector3Tuple]
    navMeshBoundsMin: THREE.Vector3
    navMeshBoundsMax: THREE.Vector3
    navMeshOrigin: THREE.Vector3

    tileWidth: number
    tileHeight: number
    tcs: number

    recastConfig: RecastConfig

    workers: InstanceType<typeof DynamicTiledNavMeshWorker>[]
    workerRoundRobin = 0

    constructor(props: DynamicTiledNavMeshProps) {
        const navMeshBoundsMin = props.navMeshBounds.min
        const navMeshBoundsMax = props.navMeshBounds.max
        const navMeshBounds: [min: Vector3Tuple, max: Vector3Tuple] = [navMeshBoundsMin.toArray(), navMeshBoundsMax.toArray()]
        const navMeshOrigin = props.navMeshBounds.min

        this.navMeshBoundsMin = navMeshBoundsMin
        this.navMeshBoundsMax = navMeshBoundsMax
        this.navMeshBounds = navMeshBounds
        this.navMeshOrigin = navMeshOrigin

        const recastConfig = {
            ...recastConfigDefaults,
            ...props.recastConfig,
        }

        this.recastConfig = recastConfig

        const navMesh = new NavMesh()

        const { tileWidth, tileHeight, tcs, maxPolysPerTile } = buildConfig({ recastConfig, navMeshBounds })
        this.tileWidth = tileWidth
        this.tileHeight = tileHeight
        this.tcs = tcs

        const navMeshParams = NavMeshParams.create({
            orig: navMeshOrigin,
            tileWidth: recastConfig.tileSize * recastConfig.cs,
            tileHeight: recastConfig.tileSize * recastConfig.cs,
            maxTiles: props.maxTiles,
            maxPolys: maxPolysPerTile,
        })

        navMesh.initTiled(navMeshParams)

        this.navMesh = navMesh

        this.workers = []
        for (let i = 0; i < props.workers; i++) {
            const worker = new DynamicTiledNavMeshWorker()

            worker.onmessage = (e) => {
                const {
                    tileX,
                    tileY,
                    navMeshData: serialisedNavMeshData,
                } = e.data as { tileX: number; tileY: number; navMeshData: Uint8Array }

                const navMeshData = new UnsignedCharArray()
                navMeshData.copy(serialisedNavMeshData as ArrayLike<number> as number[])

                navMesh.removeTile(navMesh.getTileRefAt(tileX, tileY, 0))

                const addTileResult = navMesh.addTile(navMeshData, Raw.Module.DT_TILE_FREE_DATA, 0)

                if (Raw.Detour.statusFailed(addTileResult.status)) {
                    console.error(
                        Raw.Module.RC_LOG_WARNING,
                        `Failed to add tile to nav mesh` +
                            '\n\t' +
                            `tx: ${tileX}, ty: ${tileY},` +
                            `status: ${statusToReadableString(addTileResult.status)} (${addTileResult.status})`,
                    )

                    navMeshData.destroy()
                }

                this.navMeshVersion++
                this.onNavMeshUpdate.next([this.navMeshVersion, [tileX, tileY]])
            }

            this.workers.push(worker)
        }
    }

    private onResult(e: {data: { tileX: number; tileY: number; navMeshData: Uint8Array }}) {
        const {
            tileX,
            tileY,
            navMeshData: serialisedNavMeshData,
        } = e.data as { tileX: number; tileY: number; navMeshData: Uint8Array }

        const navMeshData = new UnsignedCharArray()
        navMeshData.copy(serialisedNavMeshData as ArrayLike<number> as number[])

        this.navMesh.removeTile(this.navMesh.getTileRefAt(tileX, tileY, 0))

        const addTileResult = this.navMesh.addTile(navMeshData, Raw.Module.DT_TILE_FREE_DATA, 0)

        if (Raw.Detour.statusFailed(addTileResult.status)) {
            console.error(
                Raw.Module.RC_LOG_WARNING,
                `Failed to add tile to nav mesh` +
                    '\n\t' +
                    `tx: ${tileX}, ty: ${tileY},` +
                    `status: ${statusToReadableString(addTileResult.status)} (${addTileResult.status})`,
            )

            navMeshData.destroy()
        }

        this.navMeshVersion++
        this.onNavMeshUpdate.next([this.navMeshVersion, [tileX, tileY]])
        
    }

    buildTile(positions: Float32Array, indices: Uint32Array, [tileX, tileY]: [x: number, y: number]) {
        const clonedPositions = new Float32Array(positions)
        const clonedIndices = new Uint32Array(indices)

        const tileBoundsMin: Vector3Tuple = [
            this.navMeshBoundsMin.x + tileX * this.tcs,
            this.navMeshBoundsMin.y,
            this.navMeshBoundsMin.z + tileY * this.tcs,
        ]

        const tileBoundsMax: Vector3Tuple = [
            this.navMeshBoundsMax.x + (tileX + 1) * this.tcs,
            this.navMeshBoundsMax.y,
            this.navMeshBoundsMax.z + (tileY + 1) * this.tcs,
        ]

        const job: BuildTileMeshProps = {
            tileX,
            tileY,
            tileBoundsMin: tileBoundsMin,
            tileBoundsMax: tileBoundsMax,
            recastConfig: this.recastConfig,
            navMeshBounds: this.navMeshBounds,
            keepIntermediates: false,
            positions: clonedPositions,
            indices: clonedIndices,
        }

        //const worker = this.workers[this.workerRoundRobin]
        this.workerRoundRobin = (this.workerRoundRobin + 1) % this.workers.length

        // Reduce the amount of this. Transferring the same buffers a lot. 
        //worker.postMessage(job, [clonedPositions.buffer, clonedIndices.buffer])
        // This just delays it. It will make everything run extremely slow for the duration.
        // Will not be acceptable on slower devices. I can add a general worker support later 
       // setTimeout(() => {
        requestIdleCallback(() => {
            const result = buildTile(job)
            if (!result.success || !result.data) return
            const navMeshData = result.data.toTypedArray();
            
            this.onResult({data: { tileX: job.tileX, tileY: job.tileY, navMeshData: navMeshData }})
        })
            
        //}, 1000 * Math.random())
    }

    buildAllTiles(positions: Float32Array, indices: Uint32Array) {
        const { tileWidth, tileHeight } = this

        for (let y = 0; y < tileHeight; y++) {
            for (let x = 0; x < tileWidth; x++) {
                this.buildTile(positions, indices, [x, y])
            }
        }
    }

    getTileForWorldPosition(worldPosition: THREE.Vector3) {
        const x = Math.floor((worldPosition.x - this.navMeshBoundsMin.x) / this.tcs)
        const y = Math.floor((worldPosition.z - this.navMeshBoundsMin.z) / this.tcs)

        return [x, y] as [x: number, y: number]
    }

    getTilesForBounds(bounds: THREE.Box3) {
        const min = this.getTileForWorldPosition(bounds.min)
        const max = this.getTileForWorldPosition(bounds.max)

        const tiles: [x: number, y: number][] = []

        for (let y = min[1]; y <= max[1]; y++) {
            for (let x = min[0]; x <= max[0]; x++) {
                tiles.push([x, y])
            }
        }

        return tiles
    }

    destroy() {
        this.navMesh.destroy()

        for (const worker of this.workers) {
            worker.terminate()
        }
    }
}